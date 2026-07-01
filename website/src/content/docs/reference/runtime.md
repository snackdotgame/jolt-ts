---
title: Runtime & recorders
description: loadJolt, the JoltRuntime, NativeScope ownership, and the NativeByteRecorder for state serialization.
sidebar:
  order: 4
---

The low-level pieces beneath `World`: loading the module, the runtime handle, native-object ownership, and state recorders.

## loadJolt

```ts
loadJolt(options?: LoadJoltOptions): Promise<JoltRuntime>
```

Loads a Jolt WASM build and returns a reusable runtime. See [Loading & WASM builds](/jolt-ts/guides/loading/).

`LoadJoltOptions`: `build?`, `locateFile?`, `wasmUrl?`, `module?`. Defaults to the embedded `wasm-compat` build.

```ts
const runtime = await loadJolt({ build: "wasm", wasmUrl: "/assets/jolt-physics.wasm.wasm" });
```

## JoltRuntime

Wraps an initialized module and its build features. Share one across many worlds.

| Member | Notes |
| --- | --- |
| `raw` | The generated Jolt module (all classes/enums). |
| `build` | The build id (e.g. `"wasm-compat"`). |
| `features` | `JoltRuntimeFeatures` — see below. |
| `scope()` | New [`NativeScope`](#nativescope). |
| `withScope(fn)` | Run `fn(scope)`, dispose the scope after. |
| `destroyRaw(value)` | Destroy a raw native object (null-safe). |
| `freeMemory()` | Jolt's free-memory counter, if available (leak checks). |

### JoltRuntimeFeatures

`native`, `wasm`, `embeddedWasm`, `externalWasm`, `multithreaded`, `simd`, `debug`, and `crossPlatformDeterministic?`. `featuresForBuild(build)` returns the feature set for one of the package's builds.

```ts
if (!runtime.features.crossPlatformDeterministic) {
  throw new Error("this build isn't cross-platform deterministic");
}
```

## NativeScope

A disposal scope for raw native objects — the safe way to allocate Jolt temporaries. See [Raw escape hatches](/jolt-ts/guides/raw-access/).

```ts
using scope = runtime.scope();
const v = scope.own(new runtime.raw.Vec3(0, 1, 0)); // freed when the scope closes
scope.defer(() => cleanup());                        // arbitrary cleanup
```

| Method | Notes |
| --- | --- |
| `own(value, disposer?)` | Take ownership; free on dispose (custom `disposer` optional). |
| `defer(fn)` | Run `fn` on dispose. |
| `dispose()` / `[Symbol.dispose]` | Run all cleanups in reverse order. |

## State recorders

A `NativeByteRecorder` is a reusable buffer for [state serialization](/jolt-ts/guides/determinism/). Get one from `world.createStateRecorder(input?)`.

```ts
const recorder = world.createStateRecorder();

recorder.clear();
world.saveState(recorder);   // write state into it
recorder.bytes();            // owned copy (Uint8Array)
recorder.view();             // no-copy view — short-lived
recorder.rewind(inputBytes?); // rewind for reading, optionally swap in bytes
recorder.dispose();          // or `using`
```

| Method | Notes |
| --- | --- |
| `bytes()` | Owned copy of the written bytes. |
| `view()` | No-copy view; invalid after `clear`/`rewind`/`dispose`. |
| `clear()` | Reset to empty for reuse. |
| `rewind(input?)` | Reset the read cursor; optionally load new bytes. |
| `raw` | The underlying Jolt `StateRecorder`. |
| `dispose()` / `[Symbol.dispose]` | Free it. |

Prefer `bytes()` when you need to keep the data; `view()` when you'll hash or send it immediately.
