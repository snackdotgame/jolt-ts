---
title: World
description: The World class — create it, step it, add bodies, run queries, snapshot state, and dispose it.
sidebar:
  order: 1
---

`World` is the top-level handle. It owns the Jolt interface, the body set, the shape store, and every native object created through it. Disposing the world releases all of them.

## Creating

### `World.create(options?)`

```ts
static create(options?: WorldCreateOptions): Promise<World>
```

Asynchronously builds a world. Loads the default `wasm-compat` runtime unless you pass `runtime`, `raw`, or `build`.

Key `WorldCreateOptions`:

| Option | Type | Notes |
| --- | --- | --- |
| `gravity` | `Vector3Input` | Default `[0, -9.81, 0]` is **not** applied automatically — pass it explicitly. |
| `layers` | `LayerConfig` | Collision layer table. Defaults to `static` + `moving`. See [Collision layers](/jolt-ts/guides/layers/). |
| `deterministic` | `boolean \| "cross-platform"` | Enable deterministic stepping. `"cross-platform"` requires a build compiled for it (jolt-ts' builds are). |
| `maxBodies` | `number` | Body capacity hint. |
| `maxBodyPairs`, `maxContactConstraints` | `number` | Broad/narrow-phase capacity hints. |
| `runtime` | `JoltRuntime` | Reuse a runtime from `loadJolt()` across worlds. |
| `build` | `JoltBuild` | Pick a WASM variant. See [Loading](/jolt-ts/guides/loading/). |

## Simulation

### `step(deltaTime, collisionSteps?)`

Advance the simulation. Use a **fixed** `deltaTime` (e.g. `1 / 60`). `collisionSteps` (default `1`) subdivides collision detection for fast bodies.

### `setGravity(gravity)` · `gravity()` · `gravityInto(out)`

Get or set world gravity. `gravityInto` writes into a caller-owned `[x, y, z]` or `{ x, y, z }`.

### `deterministicSimulation()` · `setDeterministicSimulation(enabled)`

Read or toggle deterministic stepping at runtime.

## Bodies

### `createBody(options | BodyDesc)`

Create and add a [`Body`](/jolt-ts/reference/body/). Accepts a `CreateBodyOptions` object or a fluent `BodyDesc`. Returns the wrapper.

### `removeBody(body)`

Remove and destroy a body, invalidating its wrapper.

### `getBody(id)` · `bodyCount`

Look a body up by its numeric id, or read how many bodies the world tracks.

## Queries

### `castRay(origin, direction, options?)` → `RayHit | null`

Closest-hit raycast. `direction` carries the ray length. See [Queries](/jolt-ts/guides/queries/).

### `castRayAll(origin, direction, options?)` → `RayHit[]`

All hits, sorted nearest to farthest.

### `castShape(shape, position, rotation, direction, options?)` → `ShapeCastHit | null`

Sweep a shape through the world and return the first contact.

`QueryOptions`: `excludeBody`, `includeSensors`, and a `filter(hit)` predicate.

## State & snapshots

### `saveState(state?, filter?)` → `Uint8Array`

Serialize simulation state (positions, velocities, contacts…) to bytes. Overloads accept a reusable recorder for the hot path. See [Determinism & networking](/jolt-ts/guides/determinism/).

### `restoreState(bytes | recorder, filter?)` → `boolean`

Restore state previously saved.

### `takeSceneSnapshot(options?)` → `Uint8Array` · `restoreSceneSnapshot(bytes, options?)`

Serialize/restore the full world topology (bodies, shapes, config, preserved ids).

### `createStateRecorder(input?)` → `NativeByteRecorder`

A reusable byte recorder for repeated save/restore without per-call allocation.

## Debug & escape hatches

### `debugRender(options?)` → `DebugRenderBuffers`

Rapier-style wireframe line buffers (`vertices` + `colors`) for every body. See [Debug rendering](/jolt-ts/guides/debug-rendering/).

### `raw`

Direct access to `{ module, joltInterface, system, bodyInterface }` for calls the wrapper doesn't cover. See [Raw escape hatches](/jolt-ts/guides/raw-access/).

### `runtime` · `shapes`

The backing [`JoltRuntime`](/jolt-ts/reference/runtime/) and the world's [`ShapeStore`](/jolt-ts/reference/shape/#shapestore).

## Lifetime

### `dispose()` · `[Symbol.dispose]()`

Release the world and everything it owns. Also runs automatically at the end of a `using` block.

```ts
using world = await World.create();
// …used here, disposed at block exit
```

### `disposed`

`true` once disposed. Calling most methods afterward throws.
