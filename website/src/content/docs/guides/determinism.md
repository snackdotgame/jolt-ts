---
title: Determinism & networking
description: Deterministic stepping, binary scene snapshots, and saveState/restoreState for rollback and lockstep netcode.
---

jolt-ts ships Jolt compiled with **cross-platform determinism** on. Given the same starting state and the same inputs, every machine — regardless of OS or CPU — computes the same result, bit for bit. That's the foundation for rollback and lockstep multiplayer, replays, and reproducible tests. See it in the [Determinism & rewind example](/jolt-ts/examples/determinism/).

## Enabling deterministic stepping

Determinism is explicit — turn it on when creating the world:

```ts
const world = await World.create({ deterministic: "cross-platform" });
```

`"cross-platform"` requires a build known to be compiled for it (all of jolt-ts' bundled builds are), and throws otherwise. Plain `true` enables Jolt's deterministic mode without that cross-platform guarantee.

For identical results across machines, also keep everything else deterministic: a fixed timestep, the same body creation order, and inputs applied in a canonical order.

## What state actually syncs

Keep two things clearly separate — Jolt treats them very differently:

- **Simulation state** — the numbers the engine changes every step: positions, velocities, active flags, contacts. This is *all* that `saveState()` / `restoreState()` move around.
- **Topology** — which bodies exist and how they're configured (shapes, layers, constraints). This is **not** part of `saveState`.

The rule that follows, straight from Jolt's design: **`restoreState()` only restores state into bodies that already exist — it never creates or destroys bodies.** Jolt's docs put it bluntly: *"If you start adding/removing objects (e.g. bodies or constraints) during these frames, the RestoreState function will not work."*

So `restoreState()` requires both peers to already hold the **same bodies with the same ids**. You don't get there by re-serializing the whole world whenever something spawns — you get there by running both sims in lockstep:

- Apply the same inputs, in the same order, on every peer.
- Replicate each body **add/remove as its own event**, applied in the same order everywhere. Jolt assigns body ids in creation order, so matching order keeps ids identical across peers — which is exactly what `saveState` bytes rely on. (Create in different orders and the ids diverge, and the state bytes become incompatible.) If you can't guarantee a matching order, Jolt's `CreateBodyWithID` pins ids explicitly — reach it through [`world.raw.bodyInterface`](/jolt-ts/guides/raw-access/).
- Anything you change *outside* the step (e.g. `body.setFriction(...)`) also isn't in `saveState`; re-apply it yourself when you rewind and replay.

`takeSceneSnapshot()` is a different, heavyweight tool — a whole-world serialization ([below](#full-world-snapshots)), not the per-change network path.

## saveState / restoreState

The simplest form returns and accepts bytes:

```ts
const bytes = world.saveState();      // Uint8Array
const ok = replica.restoreState(bytes); // boolean
```

Both peers must already hold the **same bodies with the same ids** — established by matching creation order (above), not by the state bytes themselves. `restoreState()` returns `false` if the data can't be applied.

To sync only part of the world — say, just the bodies that actually changed this frame — pass a `StateRecorderFilter` (see [Native parameters](#native-parameters)). That, not a fresh whole-world snapshot, is how you send deltas.

### Full-world snapshots

`takeSceneSnapshot()` is the whole-world tool: it serializes **every body's creation settings, shapes, and constraints**, and `restoreSceneSnapshot()` rebuilds them with body ids preserved. It's heavyweight, and it's for **saving/loading a world locally** or bringing a brand-new peer up to the full topology in one shot — not for ongoing changes.

```ts
const scene = server.takeSceneSnapshot(); // Uint8Array — the entire world
const state = server.saveState();

const client = await World.create({ deterministic: "cross-platform" });
client.restoreSceneSnapshot(scene); // recreate every body, ids preserved
client.restoreState(state);          // then apply live simulation state
```

Reach for it sparingly:

- It is **not** how you handle ongoing topology changes — replicate individual add/remove events instead (see [above](#what-state-actually-syncs)).
- Even for an initial join, deterministically building the same world on both peers from shared data (a level definition, a seed) is usually more robust than shipping a binary blob.
- The binary layout is tied to the Jolt build, so don't rely on it as a long-term save format across library versions.

`takeSceneSnapshot({ saveShapes, saveGroupFilter })` and `restoreSceneSnapshot(bytes, { activate })` accept options; the defaults capture shapes and group filters.

## The rollback loop

This is the core of rollback netcode, and exactly what the [example](/jolt-ts/examples/determinism/) shows in miniature:

```ts
const history = new Map<number, Uint8Array>();

function step(frame, inputs) {
  history.set(frame, world.saveState()); // ring buffer of recent frames
  applyInputs(inputs);
  world.step(1 / 60);
}

// A late input for an earlier frame arrives:
function onLateInput(frame, input) {
  world.restoreState(history.get(frame));   // rewind
  for (let f = frame; f <= currentFrame; f++) {
    applyInputs(inputsFor(f, input));        // replay with the correction
    world.step(1 / 60);
  }
}
```

Because stepping is deterministic, the replay reproduces the present exactly — now corrected.

:::caution[Bodies added or removed inside the rollback window]
`restoreState()` won't recreate them. If a body was spawned after the frame you roll back to, **remove it before restoring and re-add it during replay** with the same initial state; likewise re-create anything that was removed. Restoring state into a mismatched set of bodies fails.
:::

## Hot-path recorders

`saveState()` allocates a fresh `Uint8Array` each call. For a busy game loop, reuse a recorder to avoid the churn:

```ts
const recorder = world.createStateRecorder();

recorder.clear();
world.saveState(recorder);      // write into the recorder
sendState(recorder.view());     // zero-copy view — short-lived, valid until the next clear/rewind
```

- `recorder.bytes()` returns an **owned copy** you can keep.
- `recorder.view()` returns a **no-copy view** — treat it as short-lived and don't hold it across `clear()`, `rewind()`, or `dispose()`.
- `recorder.rewind(bytes?)` rewinds for reading (optionally swapping in new input bytes).
- Dispose it (or use `using`) when done.

## Native parameters

The full-power overloads keep Jolt's native parameter shape — an explicit recorder, a state selector, and a filter:

```ts
using recorder = world.createStateRecorder();
world.saveState(recorder, "all", stateFilter);
replica.restoreState(recorder, stateFilter);
```

The state selector is `"none" | "global" | "bodies" | "contacts" | "constraints" | "all"` (or a raw bitmask number). The byte-oriented form takes the same selector and filter without a recorder:

```ts
const bytes = world.saveState("bodies", stateFilter);
```

The `stateFilter` is Jolt's `StateRecorderFilter` — a set of callbacks that decide, per body / constraint / contact, whether it's included. That's how you serialize a **subset**: skip static or sleeping bodies, or send only the handful that changed this frame. It's the delta mechanism, and it must select the same set on save and restore.

## Next

- [Determinism & rewind example](/jolt-ts/examples/determinism/) · [State recorder reference](/jolt-ts/reference/runtime/#state-recorders)
