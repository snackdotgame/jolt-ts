---
title: Character & vehicle controllers
description: jolt-ts-character-controller — imperative, Ecctrl-style character and vehicle controllers built on jolt-ts.
---

jolt-ts gives you rigid bodies and queries. **[jolt-ts-character-controller](https://github.com/snackdotgame/jolt-ts-character-controller)** builds a ready-made **character controller** (and a vehicle controller) on top of them — so you don't have to assemble capsule movement, ground detection, jumping, and slope handling from `CharacterVirtual` yourself.

> Imperative, Ecctrl-style character and vehicle controllers for the `jolt-ts` wrapper.

It's modeled on [Ecctrl](https://github.com/pmndrs/ecctrl) (the popular React Three Fiber controller) but **imperative and framework-agnostic**: you own the world, the render loop, and networking — it just drives the character each step.

:::note[Companion package]
This is a separate library that depends on jolt-ts, not part of the core package.
:::

## Why use it

A production character controller is a lot more than a dynamic capsule — you need floating/hover suspension, ground and slope detection, stable jumping, movement relative to the camera, and the ability to ride moving platforms. This library packages all of that against jolt-ts:

- Ecctrl-style **floating** capsule, friction, **jump**, movement, and turning.
- **Camera-relative** or custom forward-axis movement.
- **Kinematic platform** support — ride moving platforms correctly.
- Continuous collision via Jolt's `motionQuality: "linearCast"`.
- A separate **vehicle controller** with configurable wheels and drive settings.
- Decoupled **animation state** management, with optional three.js `AnimationMixer` integration.

Everything is rendering-free and caller-owned, so it drops into any loop and pairs naturally with jolt-ts' [deterministic stepping](/jolt-ts/guides/determinism/). It needs jolt-ts for physics; three.js is only required for the animation integration.

## Learn more

Installation, usage, and the full API live in the project's repository:

**→ [Learn more at github.com/snackdotgame/jolt-ts-character-controller](https://github.com/snackdotgame/jolt-ts-character-controller)**

## Related

- [Locked rotations](/jolt-ts/examples/locked-rotations/) — the upright-capsule behavior a character needs, shown at the jolt-ts level.
- [Bodies & motion](/jolt-ts/guides/bodies/) — the body and kinematic APIs the controller is built on.
- [Raw escape hatches](/jolt-ts/guides/raw-access/) — if you'd rather build on `CharacterVirtual` yourself.
