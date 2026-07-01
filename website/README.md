# jolt-ts docs site

The documentation site for **jolt-ts**, built with [Astro](https://astro.build) +
[Starlight](https://starlight.astro.build). It runs the library live in the
browser: every example is a real jolt-ts world wired to three.js.

Deployed to <https://snackdotgame.github.io/jolt-ts/>.

## Develop

From the repository root (the site is a pnpm workspace package):

```sh
pnpm install
pnpm run docs:dev      # builds the library, then starts the Astro dev server
```

Or from this directory, once the library has been built (`pnpm --filter jolt-ts build`):

```sh
pnpm dev
```

## Build

```sh
pnpm run docs:build    # from the repo root: builds jolt-ts, then the site → website/dist
pnpm run docs:preview  # serve the production build locally
```

## How the live demos work

- `src/lib/jolt.ts` loads the embedded `wasm-compat` build **once** and shares one
  `JoltRuntime` across every demo on a page.
- `src/lib/harness.ts` is a small three.js stage: `spawn()` creates a physics body
  and a matching mesh together, then a fixed-timestep loop syncs transforms each
  frame. It maps every `Shape.*` descriptor to three.js geometry.
- `src/demos/*.ts` are the individual scenes. Each exports a `setup(harness)` and
  is code-split and lazy-loaded when its `<PhysicsDemo>` scrolls into view.
- `src/components/PhysicsDemo.astro` embeds a demo in any `.mdx` page:
  `<PhysicsDemo demo="falling-shapes" />`.

`astro.config.mjs` strips the unused Jolt build variants (debug/multithread/asm)
from the bundle — only the embedded `wasm-compat` build is shipped.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy-docs.yml`, which builds the
site and publishes it to GitHub Pages. **One-time setup:** in the repository's
**Settings → Pages**, set **Source** to **GitHub Actions**.

The site is served under the `/jolt-ts/` base path (`base` in `astro.config.mjs`);
update `site`/`base` there if the repository or owner changes.
