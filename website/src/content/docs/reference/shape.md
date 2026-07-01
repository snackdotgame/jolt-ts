---
title: Shape & ShapeStore
description: The Shape builders, shape descriptors, reusable ShapeResources, and the world's ShapeStore.
sidebar:
  order: 3
---

Shapes are collider geometry. Build one with a `Shape.*` helper (returns a plain descriptor) and pass it to `createBody`. For the guide, see [Shapes](/jolt-ts/guides/shapes/).

## Builders

```ts
import { Shape } from "jolt-ts";

Shape.sphere(radius);                          // or ({ radius })
Shape.box(halfExtents);                         // or ({ halfExtents, convexRadius? })
Shape.capsule({ halfHeight, radius });          // Y-aligned
Shape.cylinder({ halfHeight, radius, convexRadius? }); // Y-aligned
Shape.convexHull({ points, maxConvexRadius? });
Shape.mesh({ vertices, indices });              // static triangle mesh
Shape.compound(children, { mutable? });
Shape.offsetCenterOfMass(shape, offset);
```

### Descriptor fields

| Kind | Fields |
| --- | --- |
| `sphere` | `radius` |
| `box` | `halfExtents`, `convexRadius?` (default 0.05) |
| `capsule` | `halfHeight`, `radius` |
| `cylinder` | `halfHeight`, `radius`, `convexRadius?` |
| `convexHull` | `points` (`Vector3[]` or flat `Float32Array`), `maxConvexRadius?` |
| `mesh` | `vertices` (flat `[x,y,z,…]`), `indices` (triangle list) |
| `compound` | `children: { shape, position?, rotation?, userData? }[]`, `mutable?` |
| `offsetCenterOfMass` | `shape`, `offset` |

A `ShapeInput` — accepted anywhere a shape is — is either one of these descriptors or a `ShapeResource`.

## ShapeResource

A built, reference-counted collider you can reuse across bodies. Created through the store (below) or implicitly retained when you pass the same resource to multiple bodies.

```ts
resource.raw;       // the raw Jolt shape
resource.disposed;  // boolean
resource.dispose(); // release (also done by world/store disposal)
```

## ShapeStore

`world.shapes` is a `ShapeStore` — build a shape once and reuse it, optionally under a name.

```ts
// Named: retained by the store, retrievable, replaced if the name is reused.
const crate = world.shapes.create("crate", Shape.box({ halfExtents: [0.5, 0.5, 0.5] }));
world.shapes.get("crate"); // ShapeResource | undefined

// Unnamed: returns a resource you own.
const gem = world.shapes.create(Shape.convexHull({ points }));

world.shapes.dispose(); // release all named shapes (also called by world.dispose())
```

Reusing a resource across many bodies avoids rebuilding the collider each time — worthwhile for shapes used in bulk (crates, projectiles, tiles).
