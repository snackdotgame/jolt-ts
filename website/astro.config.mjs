import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// The demos only ever use the embedded single-thread `wasm-compat` build. But
// jolt-ts' loader references every variant through `new URL(.., import.meta.url)`,
// which makes Vite emit all of them (the debug builds alone are ~25 MB each).
// That loader path is never executed here — the demos share one preloaded
// runtime — so strip the unused variants from the final bundle.
function stripUnusedJoltBuilds() {
  const keep = /(^|\/)jolt-physics\.wasm-compat\.[\w-]+\.(js|mjs)$/;
  const drop = /(^|\/)(jolt-physics[.\w-]*\.(js|mjs|wasm)|types\.d\.[\w-]+\.ts)$/;
  return {
    name: "jolt-strip-unused-native-builds",
    apply: "build",
    generateBundle(_options, bundle) {
      let removed = 0;
      let bytes = 0;
      for (const fileName of Object.keys(bundle)) {
        if (keep.test(fileName) || !drop.test(fileName)) continue;
        const chunk = bundle[fileName];
        const source = chunk.type === "asset" ? chunk.source : chunk.code;
        bytes += typeof source === "string" ? source.length : source?.byteLength ?? 0;
        delete bundle[fileName];
        removed += 1;
      }
      if (removed > 0) {
        this.info(`stripped ${removed} unused Jolt build artifact(s), ~${Math.round(bytes / 1e6)} MB`);
      }
    },
  };
}

// GitHub Pages project site: https://snackdotgame.github.io/jolt-ts/
// `site` + `base` must match the repository name so internal links and assets
// resolve under the /jolt-ts/ path prefix.
export default defineConfig({
  site: "https://snackdotgame.github.io",
  base: "/jolt-ts/",
  trailingSlash: "ignore",
  integrations: [
    starlight({
      title: "jolt-ts",
      description:
        "TypeScript-first ergonomic bindings for Jolt Physics WASM: a semantic World/Body/Shape API, deterministic stepping, and networking-ready snapshots.",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "jolt-ts",
        replacesTitle: false,
      },
      favicon: "/favicon.svg",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/snackdotgame/jolt-ts",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/snackdotgame/jolt-ts/edit/main/website/",
      },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Introduction", slug: "index" },
            { label: "Getting started", slug: "guides/getting-started" },
            { label: "Core concepts", slug: "guides/concepts" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Shapes", slug: "guides/shapes" },
            { label: "Bodies & motion", slug: "guides/bodies" },
            { label: "Collision layers", slug: "guides/layers" },
            { label: "Queries", slug: "guides/queries" },
            { label: "Debug rendering", slug: "guides/debug-rendering" },
            { label: "Determinism & networking", slug: "guides/determinism" },
            { label: "Loading & WASM builds", slug: "guides/loading" },
            { label: "Raw escape hatches", slug: "guides/raw-access" },
          ],
        },
        {
          label: "Examples",
          autogenerate: { directory: "examples" },
        },
        {
          label: "API reference",
          autogenerate: { directory: "reference" },
        },
      ],
    }),
  ],
  vite: {
    plugins: [stripUnusedJoltBuilds()],
  },
});
