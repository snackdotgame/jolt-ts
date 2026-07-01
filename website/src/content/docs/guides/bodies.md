---
title: Bodies & motion
description: Create bodies, read and drive their transform and velocity, apply forces and impulses, set mass, and control sleeping and degrees of freedom.
---

A [`Body`](/jolt-ts/reference/body/) is a rigid body in the world. This guide covers creating them and everything you can do with one.

## Body types

- **`static`** — never moves. Floors, walls, terrain. Cheapest; doesn't wake for collisions.
- **`kinematic`** — moved by you, unaffected by forces, but pushes dynamic bodies. Drive it with [`moveKinematic`](/jolt-ts/examples/kinematic-platform/).
- **`dynamic`** — fully simulated under gravity, forces, and collisions.

## Creating a body

Two equivalent styles. Object literals are easy to serialize and generate:

```ts
const box = world.createBody({
  type: "dynamic",
  shape: Shape.box({ halfExtents: [0.5, 0.5, 0.5] }),
  position: [0, 4, 0],
  layer: "moving",
  restitution: 0.3,
  friction: 0.6,
});
```

The fluent `Body` builder is nice for handwritten code:

```ts
import { Body, Shape } from "jolt-ts";

const ball = world.createBody(
  Body.dynamic()
    .shape(Shape.sphere(0.5))
    .translation(0, 8, 0)
    .layer("moving")
    .restitution(0.4)
    .linearVelocity(2, 0, 0),
);
```

`Body.dynamic()`, `Body.kinematic()`, `Body.fixed()` (alias `Body.static()`) start a builder.

### Options

| Option | Meaning |
| --- | --- |
| `type` | `"static"` \| `"kinematic"` \| `"dynamic"` (default `dynamic`). |
| `shape` | The collider (required). |
| `position`, `rotation` | Initial transform. Rotation is `{ x, y, z, w }` or `[x, y, z, w]`. |
| `layer` | Collision layer name or index. |
| `friction`, `restitution` | Surface material (0…1-ish). |
| `linearVelocity`, `angularVelocity` | Initial velocities. |
| `linearDamping`, `angularDamping` | Velocity decay per second. |
| `gravityFactor` | Scale gravity for this body (`0` = weightless). |
| `density` / `mass` / `massProperties` | Override mass — see [below](#mass). |
| `motionQuality` | `"discrete"` (default) or `"linearCast"` for [CCD](/jolt-ts/examples/ccd/). |
| `sensor` | `true` makes it a [sensor](/jolt-ts/examples/sensors/). |
| `allowSleeping` | Let the body sleep when it comes to rest (default `true`). |
| `allowedDofs` | Restrict degrees of freedom — see [below](#allowed-degrees-of-freedom). |
| `activate` | Whether the body starts awake (default `true`). |
| `userData` | Any JS value; stored on `body.userData`. |

## Reading state

All getters return plain objects; every vector getter has a zero-allocation `…Into()` twin.

```ts
body.translation();          // { x, y, z }
body.rotation();             // { x, y, z, w }
body.linearVelocity();       // { x, y, z }
body.angularVelocity();      // { x, y, z }
body.centerOfMassPosition(); // { x, y, z }
body.pointVelocity([1, 0, 0]); // velocity of a world-space point on the body

body.mass();       // number (Infinity for static/kinematic)
body.motionType(); // "static" | "kinematic" | "dynamic"
body.isActive();   // awake?
body.isSensor();
body.friction();
body.gravityFactor();
body.allowSleeping();

const p = new Float32Array(3);
body.translationInto(p); // no allocation
```

## Moving a body

```ts
body.setTranslation([1, 2, 3]);           // teleport position
body.setRotation([0, 0, 0, 1]);           // teleport rotation
body.setTransform([1, 2, 3], [0, 0, 0, 1]);

// Kinematic move: derives velocity so the body arrives next step and pushes others.
body.moveKinematic([x, 0.5, 0], [0, 0, 0, 1], 1 / 60);
```

Teleporting with `setTransform` does **not** carry other bodies along; `moveKinematic` does. Optional `{ activate }` on the setters controls whether the body wakes.

## Forces and impulses

```ts
// Instant kick (change in momentum). Optional world-space application point adds spin.
body.applyImpulse([0, 10, 0]);
body.applyImpulse([0, 10, 0], [0.2, 0, 0]);
body.applyAngularImpulse([0, 1, 0]);

// Continuous push, applied until the next step. Call it every frame for sustained force.
body.addForce([0, 20, 0]);
body.addTorque([0, 0.5, 0]);

// Set velocity directly.
body.setLinearVelocity(1, 0, 0);
body.setAngularVelocity(0, 2, 0);
```

See the interactive [Forces](/jolt-ts/examples/forces/) example.

## Mass

A dynamic body's mass comes from its shape and a default density (1000 kg/m³). Override per body:

```ts
world.createBody({ type: "dynamic", shape, density: 200 });          // scale the computed mass
world.createBody({ type: "dynamic", shape, mass: 42 });              // exact mass, inertia from shape
world.createBody({
  type: "dynamic",
  shape,
  massProperties: { mass: 24, inertia: [10, 0, 0, 0, 12, 0, 0, 0, 14] }, // full control
});
```

`density` and `mass`/`massProperties` are mutually exclusive.

## Allowed degrees of freedom

Restrict which axes a body may translate or rotate along. The classic use is an upright character capsule — see [Locked rotations](/jolt-ts/examples/locked-rotations/).

```ts
// Shorthand: translation on all axes, no rotation.
Body.dynamic().shape(capsule).lockRotations();

// Explicit — any subset of the six DOFs.
world.createBody({
  type: "dynamic",
  shape: capsule,
  allowedDofs: ["translation-x", "translation-y", "translation-z"],
});
```

The six values are `translation-x/y/z` and `rotation-x/y/z`.

:::tip[Character controllers]
Locking rotations is just the first step toward a playable character. For a full imperative character (and vehicle) controller — hover, slopes, jumping, moving platforms, animation state — use the **[jolt-ts-character-controller](/jolt-ts/guides/character-controller/)** companion.
:::

## Sleeping

Resting dynamic bodies go to **sleep** to save CPU and wake on contact. Control it:

```ts
body.allowSleeping();        // is sleeping allowed?
body.setAllowSleeping(false); // keep it always awake (also wakes it now)
body.isActive();             // awake right now?
body.wakeUp();
body.sleep();
```

## Removing a body

```ts
body.remove();          // or: world.removeBody(body)
```

This destroys the native body and invalidates the wrapper; calling methods on it afterward throws. Everything is also cleaned up automatically by `world.dispose()`.

## Next

- [Collision layers](/jolt-ts/guides/layers/) · [Queries](/jolt-ts/guides/queries/)
