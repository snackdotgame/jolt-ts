import { access, readdir, readFile } from "node:fs/promises";

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

const dist = new URL("../native/jolt/dist/", import.meta.url);
const patchIssues = [];

for (const file of await readdir(dist)) {
  if (!file.endsWith(".js") && !file.endsWith(".d.ts")) {
    continue;
  }

  const source = await readFile(new URL(file, dist), "utf8");
  if (file.endsWith(".js")) {
    if (source.includes('await import("module")')) {
      patchIssues.push(`${file}: contains unpatched await import("module")`);
    }
    if (source.includes("/native/jolt/")) {
      patchIssues.push(`${file}: contains local native/jolt include path`);
    }
  } else {
    if (source.includes('from "./types"')) {
      patchIssues.push(`${file}: contains extensionless ./types import`);
    }
    if (source.includes("declare module Jolt {")) {
      patchIssues.push(`${file}: contains legacy declare module Jolt namespace`);
    }
  }
}

if (patchIssues.length > 0) {
  console.error("Unpatched native Jolt artifacts:");
  for (const issue of patchIssues) {
    console.error(`  - ${issue}`);
  }
  console.error("Run pnpm run patch:native before testing or packing.");
  process.exitCode = 1;
}
