# TypeScript API Direction for Jolt Physics

## What the upstream binding optimizes for

`JoltPhysics.js` exposes almost the same API as Jolt's C++ interface through
Emscripten WebIDL. That preserves power, but it also leaks C++ usage rules into
JavaScript:

- Every `new Jolt.X()` allocation needs `Jolt.destroy(...)` unless ownership is
  transferred.
- Ref-counted types such as `Shape`, `ShapeSettings`, `Constraint`, materials,
  characters, vehicles, ragdolls, and filters require `AddRef()` / `Release()`
  in some flows.
- `Body` is a special case: it is destroyed with
  `BodyInterface.DestroyBody(body.GetID())`.
- Values returned by methods can themselves be heap allocations.
- Common input types are mutable WASM objects (`Vec3`, `RVec3`, `Quat`) instead
  of plain JS objects.
- Error paths from `ShapeSettings.Create()` are awkward because callers have to
  inspect `ShapeResult`, get the shape, clear the result, and handle references.
- Callbacks/listeners are raw JS implementation classes that need lifetime
  management.

Rapier's JS API is a useful comparison point. It still requires `World.free()`,
but it gives users semantic handles, descriptor builders, plain JS vector
objects, set-owned resources, `World.createRigidBody(...)`, `World.remove...`,
query helpers, debug render buffers, and a single high-level `World` object.

## Recommendation

Use a package-owned fork of the JoltPhysics.js binding layer plus an ergonomic
TypeScript wrapper.

Reasons:

- Jolt's WebIDL binding shape already exposes broad engine coverage and multiple
  builds.
- Owning the build lets this package enable cross-platform deterministic
  compilation, add missing IDL entries, and ship package-specific native helper
  functions without waiting on upstream.
- The wrapper can make the 80% path ergonomic without blocking the 20% path.
- Keeping raw access available preserves full engine power.

## Core design principles

1. Own native lifetimes inside TypeScript classes.
2. Accept plain JS inputs everywhere: arrays, typed arrays, `{ x, y, z }`, and
   optional interop with Three.js vectors/quaternions.
3. Return plain JS outputs by default; expose raw views only when explicitly
   requested for performance.
4. Use handles and wrapper objects instead of exposing raw Jolt pointers as the
   normal workflow.
5. Keep an escape hatch: every wrapper should expose `.raw` or `world.raw`
   for advanced Jolt calls.
6. Make disposal explicit but simple: `world.dispose()` should release the whole
   world and everything owned by it. Smaller `dispose()` methods should exist
   for manually owned shapes, listeners, and temporary builders.
7. Offer debug leak checks in development builds by comparing
   `JoltInterface.sGetFreeMemory()` before and after a scope.

## Proposed package layers

### 1. Raw loader

Thin initialization around package-owned native variants:

```ts
const jolt = await loadJolt({
  build: "wasm-compat",
});
```

All upstream WASM variants should be supported:

```ts
await loadJolt({ build: "wasm-compat" });
await loadJolt({ build: "wasm", wasmUrl: "/assets/jolt-physics.wasm.wasm" });
await loadJolt({ build: "debug-wasm-compat" });
await loadJolt({ build: "wasm-compat-multithread" });
await loadJolt({
  build: "wasm-multithread",
  wasmUrl: "/assets/jolt-physics.multithread.wasm.wasm",
});
await loadJolt({ build: "debug-wasm-compat-multithread" });
```

This layer should also expose the original module:

```ts
jolt.raw.Vec3;
jolt.destroyRaw(value);
```

### 2. Disposable ownership helpers

A tiny internal ownership layer should track WASM objects created by wrapper
code:

```ts
using scope = jolt.scope();
const vec = scope.vec3([1, 2, 3]);
const quat = scope.quatIdentity();
```

For runtimes without `using`, expose:

```ts
jolt.withScope(scope => {
  const size = scope.vec3({ x: 1, y: 1, z: 1 });
  return world.createBody({ shape: Shape.box(size), motion: "dynamic" });
});
```

Internally, this can call `Jolt.destroy`, `Release`, `ShapeResult.Clear`, or
`BodyInterface.DestroyBody` as appropriate. `FinalizationRegistry` can be a
development safety net, but it should not be the primary lifetime mechanism.

### 3. World facade

The common path should look like JavaScript:

```ts
const world = await World.create({
  gravity: [0, -9.81, 0],
  layers: {
    static: { broadPhase: "static" },
    moving: { broadPhase: "moving", collidesWith: ["static", "moving"] },
  },
  maxBodies: 20_000,
});

const floor = world.createBody({
  type: "static",
  shape: Shape.box({ halfExtents: [50, 0.5, 50] }),
  position: [0, -0.5, 0],
  layer: "static",
});

const ball = world.createBody({
  type: "dynamic",
  shape: Shape.sphere({ radius: 0.5 }),
  position: [0, 5, 0],
  layer: "moving",
  restitution: 0.4,
});

world.step(1 / 60);
ball.translation(); // { x, y, z }
world.dispose();
```

### 4. Descriptor API

Support a Rapier-style builder for codebases that prefer fluent composition:

```ts
const body = world.createBody(
  Body.dynamic()
    .shape(Shape.capsule({ halfHeight: 0.7, radius: 0.3 }))
    .translation(0, 2, 0)
    .rotation({ x: 0, y: 0, z: 0, w: 1 })
    .layer("moving")
    .friction(0.8)
    .sleepingAllowed(true)
);
```

Also support object literals because they are easier to serialize, validate, and
generate from tools:

```ts
world.createBody({
  type: "dynamic",
  shape: { kind: "box", halfExtents: [1, 1, 1] },
  position: [0, 10, 0],
});
```

### 5. Shapes and retained resources

Shapes should be reusable without exposing ref-counting:

```ts
const crateShape = world.shapes.create("crate", Shape.box({ halfExtents: [0.5, 0.5, 0.5] }));

world.createBody({ type: "dynamic", shape: crateShape, position: [0, 4, 0] });
world.createBody({ type: "dynamic", shape: crateShape, position: [2, 4, 0] });
```

Implementation:

- Shape builders create the right `ShapeSettings` or direct `Shape`.
- `ShapeResult` is checked and cleared internally.
- Wrapper-owned shapes call `AddRef` when retained and `Release` on dispose.
- Temporary `Vec3`, `Quat`, arrays, and settings are destroyed immediately.

### 6. Body wrappers

Bodies should be set-owned. A `Body` wrapper stores:

- `id`: stable `BodyID` value copied into JS.
- `raw`: getter that resolves through `BodyLockInterface` or cached raw body
  only when safe.
- `userData`: arbitrary JS metadata held in a side map instead of trying to pack
  JS references into Jolt's integer `mUserData`.

Example:

```ts
body.setTranslation([1, 2, 3], { activate: true });
body.applyImpulse([0, 10, 0]);
body.setMotionType("kinematic", { activate: true });
world.removeBody(body);
```

`world.removeBody(body)` should remove and destroy the native body and invalidate
the wrapper.

### 7. Queries

Wrap `BroadPhaseQuery` and `NarrowPhaseQuery` into semantic helpers:

```ts
const hit = world.castRay({
  origin: [0, 10, 0],
  direction: [0, -1, 0],
  maxDistance: 100,
  layers: ["static", "moving"],
});

world.intersectionsWithAabb(bounds, hit => {
  console.log(hit.body, hit.fraction);
  return true;
});
```

Collectors should be wrapper-owned so users never need to subclass raw collector
classes unless they explicitly opt in.

### 8. Events and listeners

Expose idiomatic event registration while retaining the raw listener fallback:

```ts
world.contacts.on("added", event => {
  event.bodyA;
  event.bodyB;
  event.manifold.normal;
  event.settings.friction = 0.7;
});

world.contacts.on("validate", event => {
  return event.bodyA.userData.team === event.bodyB.userData.team
    ? "reject"
    : "accept";
});
```

Implementation should hold the raw `ContactListenerJS` instance for as long as
the world lives and dispose it with the world.

### 9. Debug rendering

Return typed arrays or line segments that are easy to feed to Three.js/Babylon:

```ts
const debug = world.debugRender();
debug.positions; // Float32Array
debug.colors;    // Float32Array
```

For deep use, expose the raw debug renderer if the debug Jolt build is loaded.

### 10. Snapshots

Wrap `StateRecorder` into byte snapshots:

```ts
const bytes = world.takeSnapshot();
world.restoreSnapshot(bytes);
```

This likely needs custom JS stream wrappers around `StateRecorderJS`.

## Full-power escape hatches

The wrapper should not try to model every Jolt feature up front. Keep these
escape hatches documented and typed:

```ts
world.raw.system;
world.raw.bodyInterface;
world.raw.joltInterface;
world.raw.module;
body.rawUnsafe();
shape.raw;
world.runtime.raw; // generated native module
```

Also provide helpers to safely pass wrapper-owned objects into raw calls:

```ts
world.withRawBody(body, rawBody => {
  rawBody.SetEnhancedInternalEdgeRemoval(true);
});
```

## First implementation slice

1. Package skeleton: TypeScript, tests, ESM output, package-owned native build.
2. Loader and raw module typing re-export.
3. `NativeScope` / `OwnedNative` disposal primitives.
4. Plain value conversion for `Vec3`, `RVec3`, `Quat`, arrays, and typed arrays.
5. `World.create`, `World.step`, `World.dispose`.
6. Collision layer builder for the common table-based setup.
7. Shape builders for sphere, box, capsule, cylinder, convex hull, mesh, and
   compound.
8. `World.createBody`, `World.removeBody`, body transform/velocity/force APIs.
9. A leak test based on upstream debug memory counters.
10. One Three.js demo that mirrors Jolt's `falling_shapes.html` but without any
    user-visible `Jolt.destroy`, `AddRef`, or `Release`.

## Native fork triggers

Patch the vendored native layer when one of these becomes true:

- A Jolt class or method needed by the wrapper is missing from `JoltJS.idl`.
- Generated `.d.ts` output is too imprecise for safe wrapper implementation.
- Performance requires native helper functions to batch data conversion.
- A lifecycle edge cannot be made safe from TypeScript because the binding lacks
  ownership visibility.

Until then, a wrapper gives the best balance: semantic JS for most users, raw
Jolt for advanced users, and no long-term burden of maintaining a full physics
engine fork.
