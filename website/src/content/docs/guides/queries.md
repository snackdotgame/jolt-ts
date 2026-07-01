---
title: Queries
description: Cast rays and shapes against the world to find hits, contact points, and surface normals.
---

Queries ask the world "what's there?" without stepping the simulation. jolt-ts wraps Jolt's narrow-phase queries into a couple of ergonomic calls. See them live in [Raycasting](/jolt-ts/examples/raycast/) and [Shape casting](/jolt-ts/examples/shapecast/).

## Raycasts

A ray goes from `origin` to `origin + direction` — **`direction` carries the length**.

```ts
// Closest hit, or null.
const hit = world.castRay([0, 10, 0], [0, -20, 0]);
if (hit) {
  hit.body;     // Body | undefined  (undefined for a raw body this World didn't create)
  hit.bodyId;   // number
  hit.point;    // { x, y, z }  contact point in world space
  hit.normal;   // { x, y, z }  surface normal, flipped to face the ray
  hit.fraction; // 0…1 along the ray
}

// Every hit, sorted nearest to farthest.
const hits = world.castRayAll([0, 10, 0], [0, -20, 0]);
```

## Shape casts

Sweep an entire shape and get the first contact — a "fat raycast" that won't slip through cracks, ideal for character ground checks.

```ts
// castShape(shape, position, rotation, direction, options?)
const hit = world.castShape(Shape.sphere(0.4), [x, 4, 0], undefined, [0, -6, 0]);
if (hit) {
  hit.fraction;             // 0…1 along the sweep
  hit.point;                // contact point
  hit.normal;               // surface normal
  hit.contactPointOnCaster; // on the cast shape
  hit.contactPointOnBody;   // on the body that was hit
  hit.penetrationDepth;     // overlap if it started intersecting
}
```

## Filtering

Every query takes optional `QueryOptions`:

```ts
world.castRay(origin, direction, {
  excludeBody: player,       // ignore this body
  includeSensors: false,     // sensors are skipped by default
  filter: ({ body, bodyId }) => (body?.userData as { solid?: boolean })?.solid === true, // custom predicate
});
```

The `filter` predicate runs for each candidate hit; return `true` to keep it. For `castRayAll`, filtering is applied to every hit.

## Mouse picking

Picking an object under the cursor is just a raycast from the camera. Unproject the pointer to a world-space ray and cast it — the [Forces](/jolt-ts/examples/forces/) example does exactly this to launch whatever you click.

```ts
const hit = world.castRay(rayOrigin, rayDirection, { includeSensors: false });
const picked = hit?.body;
```

## Beyond these

The wrapper covers the common ray and shape casts. For overlap tests, collide-point, or broad-phase AABB queries, reach through the [raw escape hatch](/jolt-ts/guides/raw-access/) via `world.raw.system.GetNarrowPhaseQuery()`.

## Next

- [Raycasting](/jolt-ts/examples/raycast/) · [Shape casting](/jolt-ts/examples/shapecast/)
