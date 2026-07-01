---
title: Shapes
description: Every collider jolt-ts can build — primitives, convex hulls, triangle meshes, compounds — plus reusable shape resources.
---

A shape is collider geometry. Build one with a `Shape.*` helper and pass it to `createBody({ shape })`. Every helper returns a plain descriptor object, so shapes are easy to store, serialize, and generate. See them all in the [Shapes gallery](/jolt-ts/examples/shapes-gallery/).

```ts
import { Shape } from "jolt-ts";
```

## Primitives

### Sphere

```ts
Shape.sphere(0.5);
Shape.sphere({ radius: 0.5 });
```

### Box

`halfExtents` is half the size on each axis, so `[0.5, 0.5, 0.5]` is a 1×1×1 cube. `convexRadius` (default `0.05`) rounds the edges slightly for stable, fast collision.

```ts
Shape.box([0.5, 0.5, 0.5]);
Shape.box({ halfExtents: [1, 0.5, 2], convexRadius: 0.05 });
```

### Capsule

A cylinder with hemispherical caps, aligned to the **Y axis**. `halfHeight` is half the length of the cylindrical mid-section (excluding the caps).

```ts
Shape.capsule({ halfHeight: 0.5, radius: 0.3 });
```

### Cylinder

Aligned to the **Y axis**.

```ts
Shape.cylinder({ halfHeight: 0.5, radius: 0.4, convexRadius: 0.05 });
```

## Convex hull

The convex wrap of a point cloud — great for rocks, gems, and low-poly props. Points may be an array of vectors or a flat `Float32Array`.

```ts
Shape.convexHull({
  points: [
    [0, 0.6, 0],
    [0.5, 0.1, 0.3],
    [-0.45, 0.12, -0.35],
    // …
  ],
  maxConvexRadius: 0.05, // optional
});
```

## Triangle mesh

Arbitrary (concave) triangle geometry from `vertices` (flat `[x, y, z, …]`) and `indices` (triangle list, length a multiple of 3). Meshes are for **static** colliders — floors, terrain, level geometry.

```ts
Shape.mesh({
  vertices: [-1, 0, -1, 1, 0, -1, 0, 1, 0 /* … */],
  indices: [0, 1, 2 /* … */],
});
```

:::note
For a *moving* concave object, approximate it with a `convexHull` or a `compound` of convex pieces — dynamic triangle meshes aren't supported by the engine.
:::

## Compound

Glue several child shapes into one rigid body, each with its own local `position` and `rotation`:

```ts
Shape.compound([
  { shape: Shape.box({ halfExtents: [0.5, 0.06, 0.4] }) },                 // table top
  { shape: Shape.box({ halfExtents: [0.08, 0.3, 0.08] }), position: [0.4, -0.3, 0.3] }, // a leg
  // …more legs…
]);

// Pass { mutable: true } if you need to change children after creation.
Shape.compound(children, { mutable: true });
```

## Offset center of mass

Wrap a shape to move its center of mass — a bottom-heavy body that self-rights like a weeble:

```ts
Shape.offsetCenterOfMass(Shape.capsule({ halfHeight: 0.45, radius: 0.4 }), [0, -0.45, 0]);
```

The body's `translation()` still reports the shape origin; `centerOfMassPosition()` reports the shifted center.

## Reusing shapes

Passing a descriptor to `createBody` builds a fresh collider each time. To share one collider across many bodies, create a **shape resource** via the world's store. It's built once and reference-counted for you:

```ts
const crate = world.shapes.create("crate", Shape.box({ halfExtents: [0.5, 0.5, 0.5] }));

world.createBody({ type: "dynamic", shape: crate, position: [0, 4, 0] });
world.createBody({ type: "dynamic", shape: crate, position: [2, 4, 0] });

world.shapes.get("crate"); // retrieve by name later
```

Named shapes live until `world.shapes.dispose()` or `world.dispose()`. You never call `AddRef`/`Release` yourself.

## Mass from shapes

By default a dynamic body's mass is computed from its shape and a default density. Override it per body with `density`, `mass`, or full `massProperties` — see [Bodies & motion](/jolt-ts/guides/bodies/#mass).

## Next

- [Bodies & motion](/jolt-ts/guides/bodies/) · [Shapes gallery](/jolt-ts/examples/shapes-gallery/)
