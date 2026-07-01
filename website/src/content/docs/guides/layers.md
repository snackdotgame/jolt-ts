---
title: Collision layers
description: Configure which bodies collide with which using an object-layer table and broad-phase layers.
---

Collision layers decide **what collides with what**. You define a table of named layers when creating the world, then assign each body to one. See it in action in [Collision layers](/jolt-ts/examples/collision-layers/).

## The default table

If you don't pass `layers`, jolt-ts uses a two-layer table that covers most scenes:

```ts
{
  static: { broadPhase: "static", collidesWith: ["moving"] },
  moving: { broadPhase: "moving", collidesWith: ["static", "moving"] },
}
```

So static bodies collide with moving bodies (but not other static bodies), and moving bodies collide with everything. New `static`-type bodies default to the `static` layer and dynamic/kinematic bodies to `moving`.

## Defining your own

Pass a `layers` table to `World.create`. Each entry lists which layers it `collidesWith`:

```ts
const world = await World.create({
  layers: {
    ground:      { collidesWith: "all" },
    player:      { collidesWith: ["ground", "enemy", "pickup"] },
    enemy:       { collidesWith: ["ground", "player"] },
    pickup:      { collidesWith: ["player"] }, // sensor-style: only the player
    playerBullet:{ collidesWith: ["ground", "enemy"] }, // won't hit the player who fired it
  },
});
```

- `collidesWith` may be an array of layer names or the string `"all"`.
- Omitting `collidesWith` means `"all"`.
- The table is symmetric: if `player` collides with `enemy`, `enemy` collides with `player`.
- A layer that doesn't list itself won't self-collide (that's how the [demo](/jolt-ts/examples/collision-layers/) makes each color pass through its own kind).

## Assigning bodies

By layer name, or by raw numeric index:

```ts
world.createBody({ type: "dynamic", shape, layer: "enemy" });
world.createBody({ type: "dynamic", shape, layer: 2 }); // index into the table
```

## Broad-phase layers

Jolt has a two-level system. **Object layers** (above) give fine-grained pair filtering. **Broad-phase layers** group object layers for the coarse acceleration structure — bodies are bucketed by broad-phase layer so the broad phase can skip whole groups quickly.

By default each object layer gets its own broad-phase layer (`broadPhase` defaults to the layer's name). For performance, group many object layers that never need separate broad-phase treatment — especially static geometry — under a shared broad-phase layer:

```ts
const world = await World.create({
  layers: {
    terrain:   { broadPhase: "static", collidesWith: "all" },
    props:     { broadPhase: "static", collidesWith: "all" },
    player:    { broadPhase: "moving", collidesWith: "all" },
    enemy:     { broadPhase: "moving", collidesWith: ["player", "terrain", "props"] },
  },
});
```

A good rule: a handful of broad-phase layers (often just `static` and `moving`), and as many object layers as you need for gameplay filtering.

## Filtering queries

Layers filter simulation contacts. To filter a specific [raycast or shape cast](/jolt-ts/guides/queries/), use `QueryOptions` — exclude a body, include sensors, or run a predicate:

```ts
world.castRay(origin, direction, {
  excludeBody: player,
  filter: ({ body }) => (body?.userData as { team?: string })?.team !== "friendly",
});
```

## Next

- [Queries](/jolt-ts/guides/queries/) · [Collision layers example](/jolt-ts/examples/collision-layers/)
