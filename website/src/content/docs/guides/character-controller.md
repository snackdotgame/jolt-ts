---
title: Character & vehicle controllers
description: jolt-ts-character-controller — imperative, Ecctrl-style character and vehicle controllers built on jolt-ts.
---

jolt-ts gives you rigid bodies and queries. **[jolt-ts-character-controller](https://github.com/snackdotgame/jolt-ts-character-controller)** builds a ready-made **character controller** (and a vehicle controller) on top of them — so you don't have to assemble capsule movement, ground detection, jumping, and slope handling from `CharacterVirtual` yourself.

> Imperative, Ecctrl-style character and vehicle controllers for the `jolt-ts` wrapper.

It's modeled on [Ecctrl](https://github.com/pmndrs/ecctrl) (the popular React Three Fiber controller) but **imperative and framework-agnostic**: you own the world, the render loop, and networking — it just drives the character each step.

:::note[Companion package]
This is a separate library that depends on jolt-ts, not part of the core package. See its [repository](https://github.com/snackdotgame/jolt-ts-character-controller) for installation and the full API.
:::

## Why use it

A production character controller is a lot more than a dynamic capsule — you need floating/hover suspension, ground and slope detection, stable jumping, movement relative to the camera, and the ability to ride moving platforms. This library packages all of that against jolt-ts:

- Ecctrl-style **floating** capsule, friction, **jump**, movement, and turning.
- **Camera-relative** or custom forward-axis movement.
- **Kinematic platform** support — ride moving platforms correctly.
- Continuous collision via Jolt's `motionQuality: "linearCast"`.
- A low-allocation `step(dt)`, or a snapshot-returning `update(dt)` for rendering/netcode.
- Decoupled **animation state** management, with optional three.js `AnimationMixer` integration.
- A **vehicle controller** with configurable wheels and drive settings.

Everything is rendering-free and caller-owned, so it drops into any loop and pairs naturally with jolt-ts' [deterministic stepping](/jolt-ts/guides/determinism/).

## A minimal character

```ts
import { World } from "jolt-ts";
import { EcctrlJoltController } from "jolt-ts-character-controller";

const world = await World.create({ gravity: [0, -9.81, 0] });

const controller = new EcctrlJoltController({
  world,
  position: [0, 1, 0],
  motionQuality: "linearCast",
});

// Each frame: point it, feed input, advance the controller, then step the world.
controller.setForwardDirection({ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 });
controller.setMovement({ forward: true, run: true });
controller.step(1 / 60);
world.step(1 / 60);
```

## What's in the box

| Export | Role |
| --- | --- |
| `EcctrlJoltController` | The character controller — `setForwardDirection()`, `setMovement()`, `step(dt)` / `update(dt)`. |
| `EcctrlJoltVehicle` | Vehicle controller — `addWheel()`, `setMovement()`, `update(dt)`. |
| `EcctrlAnimationStateController` | Framework-free animation state machine. |
| `createEcctrlJoltAnimationStateController()` | Factory for the animation state controller. |
| `EcctrlThreeAnimationController` | Wires the animation state to a three.js `AnimationMixer`. |

## Requirements

- **jolt-ts** — the physics (required).
- **three.js** — only for `EcctrlThreeAnimationController`; the core controller doesn't need it.

## Related

- [Locked rotations](/jolt-ts/examples/locked-rotations/) — the upright-capsule behavior a character needs, shown at the jolt-ts level.
- [Bodies & motion](/jolt-ts/guides/bodies/) — the body and kinematic APIs the controller is built on.
- [Raw escape hatches](/jolt-ts/guides/raw-access/) — if you'd rather build on `CharacterVirtual` yourself.
