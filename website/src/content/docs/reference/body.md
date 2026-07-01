---
title: Body & BodyDesc
description: The Body handle and the fluent BodyDesc builder — transforms, velocities, forces, and lifecycle.
sidebar:
  order: 2
---

A `Body` is a semantic handle to a rigid body. Create bodies with [`world.createBody`](/jolt-ts/reference/world/#createbodyoptions--bodydesc); never construct one directly. For the conceptual overview see [Bodies & motion](/jolt-ts/guides/bodies/).

## Properties

| Member | Type | Notes |
| --- | --- | --- |
| `id` | `number` | Stable id; look up with `world.getBody(id)`. |
| `world` | `World` | The owning world. |
| `userData` | `unknown` | Your metadata (read/write). |
| `valid` | `boolean` | `false` after removal. |

## Reading state

All return plain objects; `…Into(out)` twins write into a caller-owned `[x,y,z]`/`{x,y,z}` (or `[x,y,z,w]`) and return it.

```ts
body.translation();  body.translationInto(out);
body.rotation();     body.rotationInto(out);
body.linearVelocity();   body.linearVelocityInto(out);
body.angularVelocity();  body.angularVelocityInto(out);
body.centerOfMassPosition(); body.centerOfMassPositionInto(out);
body.pointVelocity(point);   body.pointVelocityInto(point, out);
```

Scalar/enum reads:

```ts
body.mass();          // number (Infinity for static/kinematic)
body.motionType();    // "static" | "kinematic" | "dynamic"
body.isActive();  body.isSensor();  body.allowSleeping();
body.friction();  body.gravityFactor();
```

## Setting transforms

```ts
body.setTranslation(position, options?);
body.setRotation(rotation, options?);
body.setTransform(position, rotation, options?);
body.moveKinematic(position, rotation, deltaTime); // velocity-deriving move
```

`options` is `{ activate?: boolean | "activate" | "dontActivate" }`.

## Velocities, forces, impulses

```ts
body.setLinearVelocity(x, y, z);   // or (vector)
body.setAngularVelocity(x, y, z);
body.applyImpulse(impulse, point?);
body.applyAngularImpulse(impulse);
body.addForce(force, options?, point?);
body.addTorque(torque, options?);
```

## Material & flags

```ts
body.setFriction(f);
body.setGravityFactor(g);
body.setAllowSleeping(allow); // false also wakes it
body.setMotionType(type, options?);
body.wakeUp();  body.sleep();
```

## Lifecycle

```ts
body.remove();       // = world.removeBody(body); invalidates the wrapper
body.rawUnsafe();    // the raw Jolt body — see the raw-access guide
```

## BodyDesc

A fluent builder passed to `createBody`. Start one with `Body.dynamic()`, `Body.kinematic()`, `Body.fixed()` (alias `Body.static()`).

```ts
Body.dynamic()
  .shape(Shape.sphere(0.5))
  .translation(0, 8, 0)     // (x, y, z) or (vector)
  .rotation([0, 0, 0, 1])
  .layer("moving")
  .friction(0.6)
  .restitution(0.4)
  .density(500)             // or .mass(n) / .massProperties({...})
  .linearVelocity(1, 0, 0)
  .angularVelocity(0, 2, 0)
  .linearDamping(0.05)
  .angularDamping(0.05)
  .gravityFactor(1)
  .motionQuality("linearCast")
  .allowSleeping(true)
  .sensor()
  .allowedDofs("translation-x", "translation-y", "translation-z")
  .lockRotations()          // shorthand for translation-only
  .userData({ team: "red" });
```

Every method maps to a [`CreateBodyOptions`](/jolt-ts/guides/bodies/#options) field, so the builder and the object form are interchangeable.
