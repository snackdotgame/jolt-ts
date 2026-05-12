# jolt-ts

Exploration repo for a TypeScript-first API on top of
Jolt Physics WASM.

Reference checkouts used for the initial API review:

- `references/JoltPhysics.js` at `ba5cc91`
- `references/rapier.js` at `0fd32c1`

The package owns its raw WASM build instead of depending on the published
`jolt-physics` npm package. The vendored binding layer lives in `native/jolt`
and fetches Jolt C++ directly during `pnpm run build:native`.

## WASM Builds

The wrapper supports every generated WASM variant:

- `wasm-compat`
- `wasm`
- `debug-wasm-compat`
- `wasm-compat-multithread`
- `wasm-multithread`
- `debug-wasm-compat-multithread`

`wasm-compat` is the default because the WASM binary is embedded in the JS
bundle and works without asset plumbing:

```ts
const world = await World.create();
```

Bodies can be created with object literals or fluent descriptors:

```ts
const box = world.createBody({
  type: "dynamic",
  shape: Shape.box({ halfExtents: [0.5, 0.5, 0.5] }),
  position: [0, 4, 0],
  layer: "moving"
});

const ball = world.createBody(
  Body.dynamic()
    .shape(Shape.sphere(0.5))
    .translation(0, 8, 0)
    .layer("moving")
);
```

External WASM builds can use either upstream-style `locateFile` or the wrapper's
`wasmUrl` shortcut:

```ts
const runtime = await loadJolt({
  build: "wasm",
  wasmUrl: "/assets/jolt-physics.wasm.wasm"
});

const world = await World.create({ runtime });
```

Multithreaded builds are selectable the same way, but the host page/runtime must
support Jolt's thread requirements.

## Native Build

Build the raw Jolt artifacts before running tests or packing from a clean clone:

```sh
pnpm run build:native
```

The native build requires Emscripten, CMake, Python, and Node. It compiles Jolt
with `CROSS_PLATFORM_DETERMINISTIC=ON` by default. Runtime deterministic stepping
is still explicit:

```ts
const world = await World.create({ deterministic: "cross-platform" });
```

Initial network synchronization uses two binary payloads:

```ts
const scene = serverWorld.takeSceneSnapshot();
const state = serverWorld.saveState();

const clientWorld = await World.create({ deterministic: "cross-platform" });
clientWorld.restoreSceneSnapshot(scene);
clientWorld.restoreState(state);
```

The state APIs keep Jolt's native parameter order after the recorder argument:

```ts
using recorder = serverWorld.createStateRecorder();
serverWorld.saveState(recorder, "all", stateFilter);
clientWorld.restoreState(recorder, stateFilter);
```

For the common byte-oriented path, omit the recorder and `saveState()` returns a
`Uint8Array`:

```ts
const state = serverWorld.saveState("all", stateFilter);
clientWorld.restoreState(state, stateFilter);
```

The scene snapshot captures the compatible world layout, including bodies,
configuration, shapes, constraints, and preserved Jolt body IDs. `saveState()`
is the native Jolt `SaveState` payload for positions, velocities, active state,
contacts, and other simulation-owned state. For rollback, keep a ring buffer of
`saveState()` bytes and replay inputs after `restoreState()`. When topology or
body configuration changes, send a new scene snapshot before applying later
state bytes.

See [docs/api-directions.md](docs/api-directions.md) for the proposed API shape.
