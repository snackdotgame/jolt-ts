import { describe, expect, it } from "vitest";
import { access } from "node:fs/promises";
import {
  type JoltBuild,
  isEmbeddedWasmBuild,
  isExternalWasmBuild,
  isWasmBuild,
  joltWasmBuilds,
  loadJolt,
  wasmBinaryFileName
} from "../src/index.js";

const nativeArtifactFiles = [
  "jolt-physics.js",
  "jolt-physics.wasm-compat.js",
  "jolt-physics.wasm.js",
  "jolt-physics.wasm.wasm",
  "jolt-physics.debug.wasm-compat.js",
  "jolt-physics.multithread.wasm-compat.js",
  "jolt-physics.multithread.wasm.js",
  "jolt-physics.multithread.wasm.wasm",
  "jolt-physics.debug.multithread.wasm-compat.js",
  "types.d.ts"
] as const;

describe("raw Jolt loader variants", () => {
  it("lists all upstream wasm variants", () => {
    expect(joltWasmBuilds).toEqual([
      "wasm-compat",
      "wasm",
      "debug-wasm-compat",
      "wasm-compat-multithread",
      "wasm-multithread",
      "debug-wasm-compat-multithread"
    ]);
  });

  it("classifies embedded and external wasm builds", () => {
    expect(isWasmBuild("wasm-compat")).toBe(true);
    expect(isWasmBuild("asm")).toBe(false);

    expect(isExternalWasmBuild("wasm")).toBe(true);
    expect(isExternalWasmBuild("wasm-multithread")).toBe(true);
    expect(isExternalWasmBuild("wasm-compat")).toBe(false);

    expect(isEmbeddedWasmBuild("wasm-compat")).toBe(true);
    expect(isEmbeddedWasmBuild("debug-wasm-compat")).toBe(true);
    expect(isEmbeddedWasmBuild("wasm")).toBe(false);
  });

  it("knows which wasm binary each external wasm build needs", () => {
    expect(wasmBinaryFileName("wasm")).toBe("jolt-physics.wasm.wasm");
    expect(wasmBinaryFileName("wasm-multithread")).toBe("jolt-physics.multithread.wasm.wasm");
    expect(wasmBinaryFileName("wasm-compat")).toBeUndefined();
  });

  it("ships generated native artifacts for every selectable build", async () => {
    await Promise.all(
      nativeArtifactFiles.map((fileName) => access(new URL(`../native/jolt/dist/${fileName}`, import.meta.url)))
    );
  });

  it.each([
    ["wasm-compat", { wasm: true, embeddedWasm: true, externalWasm: false, debug: false }],
    ["wasm", { wasm: true, embeddedWasm: false, externalWasm: true, debug: false }],
    ["debug-wasm-compat", { wasm: true, embeddedWasm: true, externalWasm: false, debug: true }],
    ["asm", { wasm: false, embeddedWasm: false, externalWasm: false, debug: false }]
  ] satisfies readonly [JoltBuild, Record<string, boolean>][])(
    "initializes the %s native build",
    async (build, expectedFeatures) => {
      const runtime = await loadJolt({ build });

      expect(runtime.build).toBe(build);
      expect(runtime.features).toMatchObject({
        native: true,
        multithreaded: false,
        simd: false,
        crossPlatformDeterministic: true,
        ...expectedFeatures
      });
      expect(runtime.raw.JoltSettings).toBeTypeOf("function");
    }
  );

  it("covers multithreaded build selection without requiring the host to start workers", async () => {
    const runtime = await loadJolt({ build: "wasm-compat" });

    expect(runtime.features.crossPlatformDeterministic).toBe(true);
    expect(isEmbeddedWasmBuild("wasm-compat-multithread")).toBe(true);
    expect(isExternalWasmBuild("wasm-multithread")).toBe(true);
  });
});
