// Determinism, made visible. We snapshot the world's simulation state with
// `saveState()`, let it run for a few seconds, then `restoreState()` back to the
// snapshot and let it run again. Because the build steps deterministically, every
// replay is byte-for-byte identical — the exact property rollback netcode relies
// on. Watch the shapes retrace the same path on every loop.
import { Body, Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [8, 5.5, 12], target: [0, 1.5, 0] };

const CYCLE = 260; // ~4.3s at 60 Hz

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 24, restitution: 0.2 });

  // A couple of static ramps to make the trajectories interesting.
  h.spawn({
    type: "static",
    shape: Shape.box({ halfExtents: [1.6, 0.15, 1.6] }),
    position: [-2, 1, 0],
    rotation: axisAngle(0, 0, 1, -0.5),
    layer: "static",
  }, { color: 0x4a5a80 });
  h.spawn({
    type: "static",
    shape: Shape.box({ halfExtents: [1.6, 0.15, 1.6] }),
    position: [2.2, 1.4, 0.4],
    rotation: axisAngle(0, 0, 1, 0.6),
    layer: "static",
  }, { color: 0x4a5a80 });

  // Dynamic bodies with deterministic initial velocity + spin.
  const specs: Array<[x: number, vx: number, spin: number]> = [
    [-3, 2.5, 3],
    [-1.5, 1.5, -2],
    [0, -1, 4],
    [1.5, -2, -3],
    [3, -2.5, 2],
  ];
  for (const [x, vx, spin] of specs) {
    h.spawn(
      Body.dynamic()
        .shape(Shape.sphere(0.4))
        .translation(x, 5.5, 0)
        .layer("moving")
        .restitution(0.4)
        .linearVelocity(vx, 0, 0)
        .angularVelocity(0, spin, 0),
    );
  }

  // Snapshot the initial simulation state, then loop back to it forever.
  const snapshot = h.world.saveState();

  h.onStep((_dt, frame) => {
    if (frame > 0 && frame % CYCLE === 0) {
      h.world.restoreState(snapshot);
    }
  });
};

// Small quaternion helper for tilted ramps.
function axisAngle(x: number, y: number, z: number, radians: number): [number, number, number, number] {
  const s = Math.sin(radians / 2);
  return [x * s, y * s, z * s, Math.cos(radians / 2)];
}

export default setup;
