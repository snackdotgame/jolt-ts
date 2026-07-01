---
title: Core concepts
description: How worlds, runtimes, bodies, shapes, and layers fit together — and the conventions jolt-ts follows.
---

A quick mental model of the pieces you'll use and the conventions they follow.

## The object graph

```
JoltRuntime         the loaded WASM module + its build features
  └─ World          one simulation; owns everything below
       ├─ Body      a rigid body (static / kinematic / dynamic)
       ├─ Shape     collider geometry (a descriptor or a reusable resource)
       └─ ShapeStore  world.shapes — named, reusable shapes
```

### JoltRuntime

The runtime wraps an initialized Jolt WASM module and remembers which [build](/jolt-ts/guides/loading/) it is and what features it has (multithreading, determinism, …). `World.create()` loads one for you, but you can load it once with `loadJolt()` and share it across many worlds:

```ts
import { loadJolt, World } from "jolt-ts";

const runtime = await loadJolt();
const a = await World.create({ runtime });
const b = await World.create({ runtime }); // shares the same WASM instance
```

### World

The [`World`](/jolt-ts/reference/world/) is the simulation. You `step()` it, create and remove bodies through it, run queries against it, and `dispose()` it when done. Disposing a world releases **every** native object it created.

### Body

A [`Body`](/jolt-ts/reference/body/) is a semantic handle to a rigid body. It has a stable numeric `id`, a `userData` slot for your own metadata, and methods to read and drive its transform, velocity, and forces. There are three motion types:

- **static** — never moves (floors, walls). Cheapest.
- **kinematic** — moved by you, not by forces; pushes dynamic bodies. See [`moveKinematic`](/jolt-ts/examples/kinematic-platform/).
- **dynamic** — fully simulated under gravity, forces, and collisions.

### Shape

A [`Shape`](/jolt-ts/reference/shape/) is collider geometry. `Shape.box(...)`, `Shape.sphere(...)`, etc. return plain **descriptor** objects you pass to `createBody`. To reuse one collider across many bodies without rebuilding it, register it in the world's `ShapeStore`:

```ts
const crate = world.shapes.create("crate", Shape.box({ halfExtents: [0.5, 0.5, 0.5] }));
world.createBody({ type: "dynamic", shape: crate, position: [0, 4, 0] });
world.createBody({ type: "dynamic", shape: crate, position: [2, 4, 0] });
```

### Layers

Collision [layers](/jolt-ts/guides/layers/) decide what collides with what. jolt-ts defaults to a `static` + `moving` table; you can define your own.

## Conventions

### Units and axes

Jolt is **SI**: meters, kilograms, seconds. Earth gravity is `[0, -9.81, 0]`. The coordinate system is **right-handed, Y-up**; capsules and cylinders are aligned to the **Y axis**. Rotations are quaternions in `{ x, y, z, w }` order (identity is `{ x: 0, y: 0, z: 0, w: 1 }`).

### Plain JS in, plain JS out

Anywhere a vector is expected you can pass an array, a typed array, or an object:

```ts
world.setGravity([0, -9.81, 0]);
world.setGravity({ x: 0, y: -9.81, z: 0 });
world.setGravity(new Float32Array([0, -9.81, 0]));
```

Getters return plain objects:

```ts
body.translation(); // { x, y, z }
body.rotation();    // { x, y, z, w }
```

For hot loops, the `…Into()` variants write into a buffer you own — no allocation:

```ts
const p = new Float32Array(3);
body.translationInto(p); // fills p, returns p
```

### Fixed timestep

Always advance the world with a **fixed** `deltaTime` (typically `1 / 60`). Feeding a variable frame delta makes the simulation jittery and non-reproducible. Accumulate real time and step in fixed chunks:

```ts
let acc = 0;
const STEP = 1 / 60;
function frame(dtSeconds) {
  acc += dtSeconds;
  while (acc >= STEP) {
    world.step(STEP);
    acc -= STEP;
  }
}
```

### Disposal

The rule is simple: **`world.dispose()` releases everything the world owns.** You don't call `destroy()`, `AddRef()`, or `Release()` by hand. The exceptions you *can* dispose individually are things you explicitly own — a `ShapeStore` entry, a state recorder, or a `NativeScope`. `World`, `NativeByteRecorder`, and `NativeScope` also implement `Symbol.dispose` for `using`.

## Next

- [Shapes](/jolt-ts/guides/shapes/) · [Bodies & motion](/jolt-ts/guides/bodies/) · [Collision layers](/jolt-ts/guides/layers/)
