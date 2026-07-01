---
title: Raw escape hatches
description: Reach the underlying Jolt module for features the wrapper doesn't cover yet — safely.
---

jolt-ts deliberately doesn't model every Jolt feature. When you need something beyond the wrapper — a constraint, a character controller, a contact listener, an exotic query — the full engine is always one property away.

## What's exposed

```ts
world.raw.module;         // the generated Jolt module (all classes/enums)
world.raw.joltInterface;  // Jolt's JoltInterface
world.raw.system;         // PhysicsSystem
world.raw.bodyInterface;  // BodyInterface
world.runtime.raw;        // same module, via the runtime

body.rawUnsafe();         // the raw Jolt Body
shape.raw;                // the raw Jolt Shape (from a ShapeResource)
```

`world.raw.module` is the object you'd get from `JoltPhysics.js` — every class, enum, and helper Jolt exposes.

## Working with raw objects

The most important rule carries over from C++: **anything you `new` from the raw module, you must destroy.** Use the runtime helper, or a scope that cleans up for you:

```ts
const raw = world.runtime.raw;

// One-off: destroy it yourself.
const v = new raw.Vec3(1, 2, 3);
try {
  world.raw.bodyInterface.SetLinearVelocity(bodyId, v);
} finally {
  world.runtime.destroyRaw(v);
}

// Or let a scope own temporaries and free them all at the end.
world.runtime.withScope((scope) => {
  const vec = scope.own(new raw.Vec3(0, 5, 0));
  const quat = scope.own(new raw.Quat(0, 0, 0, 1));
  // …use vec/quat…
}); // both destroyed here
```

`scope.own(x)` frees `x` when the scope closes; `scope.defer(fn)` runs arbitrary cleanup. Scopes also implement `Symbol.dispose`, so `using scope = world.runtime.scope()` works.

## Passing wrapper objects into raw calls

`world.withRawBody` hands you the raw body for a wrapper safely:

```ts
world.withRawBody(body, (rawBody) => {
  rawBody.SetEnhancedInternalEdgeRemoval(true);
});
```

## Examples of what lives here (for now)

- **Constraints / joints** — build them from `world.raw` and the raw shapes/bodies.
- **Character & vehicle controllers** — Jolt's `CharacterVirtual` via the raw module, or skip the boilerplate with [**jolt-ts-character-controller**](https://github.com/snackdotgame/jolt-ts-character-controller): ready-made imperative, Ecctrl-style character and vehicle controllers built on jolt-ts.
- **Contact events** — attach a `ContactListenerJS` to `world.raw.system`; keep it alive for the world's lifetime.
- **Ragdolls, soft bodies** — all present in `world.raw.module`.

These are candidates for first-class wrappers over time; until then, the escape hatch keeps them fully available.

## A word of caution

Raw objects sidestep the wrapper's lifetime tracking. Mixing raw body creation with `world.createBody` is fine, but the wrapper only knows about bodies it created — `world.getBody(id)` and query `.body` fields return `undefined` for bodies you made directly through `bodyInterface`. Prefer the wrapper for anything it already covers.

## Next

- [Loading & WASM builds](/jolt-ts/guides/loading/) · [API reference](/jolt-ts/reference/world/)
