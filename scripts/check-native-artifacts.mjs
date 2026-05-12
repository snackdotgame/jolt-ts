import { access } from "node:fs/promises";

const requiredArtifacts = [
  "native/jolt/dist/jolt-physics.js",
  "native/jolt/dist/jolt-physics.wasm-compat.js",
  "native/jolt/dist/jolt-physics.wasm.js",
  "native/jolt/dist/jolt-physics.wasm.wasm",
  "native/jolt/dist/jolt-physics.debug.wasm-compat.js",
  "native/jolt/dist/jolt-physics.multithread.wasm-compat.js",
  "native/jolt/dist/jolt-physics.multithread.wasm.js",
  "native/jolt/dist/jolt-physics.multithread.wasm.wasm",
  "native/jolt/dist/jolt-physics.debug.multithread.wasm-compat.js",
  "native/jolt/dist/types.d.ts"
];

const missing = [];

for (const artifact of requiredArtifacts) {
  try {
    await access(new URL(`../${artifact}`, import.meta.url));
  } catch {
    missing.push(artifact);
  }
}

if (missing.length > 0) {
  console.error("Missing native Jolt artifacts:");
  for (const artifact of missing) {
    console.error(`  - ${artifact}`);
  }
  console.error("Run pnpm run build:native before testing or packing from a clean checkout.");
  process.exitCode = 1;
}
