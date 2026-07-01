---
title: Loading & WASM builds
description: Pick a Jolt WASM build, load it with loadJolt, and wire external or multithreaded variants into your bundler.
---

jolt-ts ships every Jolt WASM build inside the package. `World.create()` loads the default for you, but you can choose a build and control how its WASM is located.

## The default: `wasm-compat`

The default build **embeds the WASM binary inside its JavaScript**, so it just works — no asset copying, no `locateFile`, bundler-friendly out of the box:

```ts
const world = await World.create(); // loads wasm-compat
```

This is the right choice for most apps and every static site (it's what powers the demos here).

## Loading a runtime explicitly

`loadJolt()` returns a `JoltRuntime` you can reuse across worlds:

```ts
import { loadJolt, World } from "jolt-ts";

const runtime = await loadJolt({ build: "wasm-compat" });
const world = await World.create({ runtime });
```

## The build variants

| Build | WASM | Notes |
| --- | --- | --- |
| `wasm-compat` | embedded | **Default.** No asset plumbing. |
| `wasm` | external `.wasm` | Smaller JS; serve the `.wasm` file yourself. |
| `debug-wasm-compat` | embedded | Assertions + checks; large. |
| `wasm-compat-multithread` | embedded | Multithreaded; needs cross-origin isolation. |
| `wasm-multithread` | external `.wasm` | Multithreaded + external wasm. |
| `debug-wasm-compat-multithread` | embedded | Multithreaded debug build. |

Every bundled build is compiled with cross-platform determinism, so [deterministic mode](/jolt-ts/guides/determinism/) is available on all of them.

## External WASM builds

The `wasm` and `wasm-multithread` builds keep the `.wasm` in a separate file. Point the loader at it with the `wasmUrl` shortcut:

```ts
const runtime = await loadJolt({
  build: "wasm",
  wasmUrl: "/assets/jolt-physics.wasm.wasm",
});
const world = await World.create({ runtime });
```

Or use upstream-style `locateFile` for full control:

```ts
const runtime = await loadJolt({
  build: "wasm",
  locateFile: (path, prefix) => `/assets/${path}`,
});
```

The generated artifacts live under the package's `./native/jolt/dist/*` export if your bundler needs to reference them directly.

## Multithreaded builds

The multithreaded builds use Web Workers and `SharedArrayBuffer`, which browsers only allow on **cross-origin-isolated** pages. Serve your page with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Then select a multithreaded build and, optionally, cap the worker count:

```ts
const world = await World.create({
  build: "wasm-compat-multithread",
  maxWorkerThreads: 4,
});
```

Without cross-origin isolation, stick with the single-threaded builds.

## Bundling notes

- The embedded `wasm-compat` builds bundle cleanly — jolt-ts patches out the Node-only probes that trip up browser bundlers.
- If you import `jolt-ts` and only use one build, your bundler may still see references to the others through the loader. Tree-shake or externalize the unused variants if bundle size matters (the debug builds are large).
- To bypass the loader entirely, initialize a build's module yourself and pass it as `raw`:

  ```ts
  import initJolt from "jolt-ts/native/jolt/dist/jolt-physics.wasm-compat.js";
  const raw = await initJolt();
  const world = await World.create({ raw }); // assumes this build's features, incl. determinism
  ```

## Next

- [Determinism & networking](/jolt-ts/guides/determinism/) · [Raw escape hatches](/jolt-ts/guides/raw-access/)
