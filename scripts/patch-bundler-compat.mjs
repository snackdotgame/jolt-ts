// Emscripten's glue probes for Node with `await import("module")`, which
// breaks bundlers targeting non-node platforms (esbuild platform=browser
// errors; rollup warns) even though the branch never executes there. Rewrite
// the specifier into a non-statically-analyzable expression so bundlers leave
// the dynamic import alone. Node still resolves it fine at runtime.
//
// Runs after build:native; idempotent.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../native/jolt/dist/", import.meta.url).pathname;
let patched = 0;
for (const file of readdirSync(dist)) {
  if (!file.endsWith(".js") && !file.endsWith(".d.ts")) {
    continue;
  }

  const path = join(dist, file);
  const source = readFileSync(path, "utf8");
  let next = source;
  if (file.endsWith(".js")) {
    next = next.replaceAll('await import("module")', 'await import("module".slice())');
    next = stripNativeIncludePaths(next);
  } else if (file.endsWith(".d.ts")) {
    // NodeNext consumers need explicit extensions on relative imports, and
    // tsgo (TypeScript 7) rejects the legacy `declare module X {}` namespace
    // form that webidl-dts-gen emits.
    next = next.replaceAll('from "./types"', 'from "./types.js"');
    next = next.replaceAll("declare module Jolt {", "declare namespace Jolt {");
  }
  if (next !== source) {
    writeFileSync(path, next);
    patched++;
    console.log(`patched ${file}`);
  }
}
console.log(patched > 0 ? `${patched} file(s) patched` : "nothing to patch (already clean)");

function stripNativeIncludePaths(source) {
  const markers = ["helpers.js", "multi-threaded.js"].map((file) => ({
    marker: `/native/jolt/${file}`,
    replacement: `native/jolt/${file}`
  }));
  let next = source;

  for (const { marker, replacement } of markers) {
    let index = next.indexOf(marker);
    while (index >= 0) {
      const pathStart = next.lastIndexOf(" ", index) + 1;
      next = `${next.slice(0, pathStart)}${replacement}${next.slice(index + marker.length)}`;
      index = next.indexOf(marker, pathStart + replacement.length);
    }
  }

  return next;
}
