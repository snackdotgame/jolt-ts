---
title: Getting started
description: Install jolt-ts, create a world, add bodies, run the simulation loop, and render it with three.js.
---

This guide takes you from an empty project to a bouncing ball rendered on screen.

## Install

```sh
pnpm add jolt-ts
# or: npm install jolt-ts / yarn add jolt-ts
```

jolt-ts ships the compiled Jolt WASM builds inside the package, so there is nothing else to download. The default `wasm-compat` build embeds the WASM binary directly in its JavaScript, which means it works without any asset copying or `locateFile` configuration — ideal for bundlers and static sites. See [Loading & WASM builds](/jolt-ts/guides/loading/) for the other variants.

:::note[Requirements]
jolt-ts is ESM-only and targets modern runtimes (Node 18+, current browsers). It uses `Symbol.dispose`, so with TypeScript enable `"lib": ["ES2022", "ESNext.Disposable"]` or newer if you want `using` declarations.
:::

## Create a world

Everything starts with a [`World`](/jolt-ts/reference/world/). Creating one is asynchronous because it initializes the WASM runtime the first time.

```ts
import { World, Body, Shape } from "jolt-ts";

const world = await World.create({
  gravity: [0, -9.81, 0],
});
```

`World.create()` loads the default `wasm-compat` build for you. To reuse one runtime across many worlds (recommended if you create more than one), load it once and pass it in:

```ts
import { loadJolt, World } from "jolt-ts";

const runtime = await loadJolt(); // wasm-compat by default
const world = await World.create({ runtime });
```

## Add bodies

A [`Body`](/jolt-ts/reference/body/) is a rigid body with a [`Shape`](/jolt-ts/reference/shape/). Create bodies from a plain options object…

```ts
const floor = world.createBody({
  type: "static",
  shape: Shape.box({ halfExtents: [50, 0.5, 50] }),
  position: [0, -0.5, 0],
  layer: "static",
});
```

…or with the fluent [`Body`](/jolt-ts/reference/body/) descriptor builder, whichever reads better:

```ts
const ball = world.createBody(
  Body.dynamic()
    .shape(Shape.sphere(0.5))
    .translation(0, 8, 0)
    .layer("moving")
    .restitution(0.5),
);
```

Both styles accept the same fields. Object literals are easy to serialize and generate; the builder is nice for handwritten code. See [Bodies & motion](/jolt-ts/guides/bodies/).

## Step the simulation

Advance the world by a fixed timestep. A real app runs this from a fixed-timestep loop; for a quick test, just call it:

```ts
for (let i = 0; i < 120; i++) {
  world.step(1 / 60);
}

console.log(ball.translation()); // → { x, y, z }, now resting on the floor
```

`step(deltaTime, collisionSteps?)` runs Jolt's update. Use a **fixed** `deltaTime` (e.g. `1/60`) for stable, reproducible physics — don't feed it a variable frame delta directly.

## Read transforms back

Bodies expose plain-JS getters, plus zero-allocation `…Into()` variants for hot loops:

```ts
const p = ball.translation();          // { x, y, z }
const r = ball.rotation();             // { x, y, z, w }

// Hot-loop friendly: write into a buffer you own.
const position = new Float32Array(3);
ball.translationInto(position);
```

## Render with three.js

jolt-ts is renderer-agnostic — it only computes physics. To draw a frame, copy each body's transform onto a mesh. Here is the essence of what every demo on this site does:

```ts
import * as THREE from "three";
import { World, Shape } from "jolt-ts";

const world = await World.create({ gravity: [0, -9.81, 0] });
world.createBody({ type: "static", shape: Shape.box({ halfExtents: [25, 0.5, 25] }), position: [0, -0.5, 0], layer: "static" });
const ball = world.createBody({ type: "dynamic", shape: Shape.sphere(0.5), position: [0, 6, 0], layer: "moving" });

const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshStandardMaterial());
scene.add(mesh);

const position: [number, number, number] = [0, 0, 0];
const rotation: [number, number, number, number] = [0, 0, 0, 1];

function frame() {
  world.step(1 / 60);
  ball.translationInto(position);
  ball.rotationInto(rotation);
  mesh.position.set(...position);
  mesh.quaternion.set(...rotation);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
```

:::tip
Every example in the [Examples](/jolt-ts/examples/falling-shapes/) section is a real jolt-ts world wired to three.js exactly like this. The shared harness maps each `Shape.*` descriptor to matching three.js geometry automatically.
:::

## Clean up

When you're done with a world, dispose it. That releases every native object it owns — bodies, shapes, query collectors, and the Jolt interface itself.

```ts
world.dispose();
```

There is no per-body or per-shape bookkeeping to remember: `world.dispose()` cleans up everything the world created. If you use `using`, `World` also implements `Symbol.dispose`:

```ts
{
  using world = await World.create();
  // …
} // world.dispose() runs automatically here
```

## Next steps

- [Core concepts](/jolt-ts/guides/concepts/) — how worlds, bodies, shapes, and layers fit together.
- [Shapes](/jolt-ts/guides/shapes/) — spheres, boxes, capsules, hulls, meshes, and compounds.
- [Queries](/jolt-ts/guides/queries/) — raycasts and shape casts.
- [Determinism & networking](/jolt-ts/guides/determinism/) — snapshots and rollback.
