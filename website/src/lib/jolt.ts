// Shared Jolt runtime for every demo on a page.
//
// We import the embedded-WASM (`wasm-compat`) initializer *statically* so the
// bundler (Vite/Rollup) can see it and inline the module. This sidesteps
// `loadJolt()`'s runtime-computed dynamic import, which a browser bundle can't
// resolve. The `wasm-compat` build carries the WASM as base64 inside the JS, so
// there is no separate `.wasm` asset to serve — ideal for a static site.
//
// The module is initialized once and wrapped in a single `JoltRuntime`. Many
// `World`s can share one runtime (jolt-ts' own deterministic tests do exactly
// this), so we pay the ~3.5 MB download + decode a single time per page.
import initJoltModule from "jolt-ts/native/jolt/dist/jolt-physics.wasm-compat.js";
import { JoltRuntime, featuresForBuild, type JoltModule } from "jolt-ts";

// The generated `.d.ts` types the default export as the Jolt namespace, but the
// runtime value is the Emscripten initializer function. Re-type it accurately.
const initJolt = initJoltModule as unknown as (
  moduleArg?: Record<string, unknown>,
) => Promise<JoltModule>;

let runtimePromise: Promise<JoltRuntime> | undefined;

/** Resolve the shared, lazily-initialized Jolt runtime for this page. */
export function getRuntime(): Promise<JoltRuntime> {
  return (runtimePromise ??= initJolt().then(
    (raw) => new JoltRuntime(raw, "wasm-compat", featuresForBuild("wasm-compat")),
  ));
}
