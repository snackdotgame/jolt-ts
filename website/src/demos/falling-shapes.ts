// The canonical physics "hello world": a fountain of random primitives raining
// onto the ground, oldest recycled so it runs forever. Mirrors Jolt's own
// falling_shapes sample and Rapier's testbed intro scene.
import { Shape, type ShapeDescriptor } from "jolt-ts";
import type { DemoSetup, DemoView, Harness, SpawnResult } from "../lib/harness";

export const view: DemoView = { position: [9, 6.5, 12], target: [0, 2, 0] };

const MAX_BODIES = 90;

function randomShape(): ShapeDescriptor {
  const r = Math.random();
  if (r < 0.3) return Shape.sphere(0.35 + Math.random() * 0.3);
  if (r < 0.6) {
    const s = 0.3 + Math.random() * 0.25;
    return Shape.box({ halfExtents: [s, s, s] });
  }
  if (r < 0.8) return Shape.capsule({ halfHeight: 0.3, radius: 0.25 });
  return Shape.cylinder({ halfHeight: 0.35, radius: 0.35 });
}

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 26, restitution: 0.15 });

  // Four invisible walls so shapes pile up instead of sliding away. Physics
  // only — kept invisible so they never occlude the pile from the camera.
  const wall = (x: number, z: number, hx: number, hz: number) =>
    h.spawn(
      { type: "static", shape: Shape.box({ halfExtents: [hx, 1, hz] }), position: [x, 1, z], layer: "static" },
      { visible: false },
    );
  wall(0, 6, 6, 0.2);
  wall(0, -6, 6, 0.2);
  wall(6, 0, 0.2, 6);
  wall(-6, 0, 0.2, 6);

  const live: SpawnResult[] = [];

  const drop = () => {
    const result = h.spawn({
      type: "dynamic",
      shape: randomShape(),
      position: [(Math.random() - 0.5) * 6, 9 + Math.random() * 2, (Math.random() - 0.5) * 6],
      rotation: randomRotation(),
      restitution: 0.2,
      angularVelocity: [Math.random(), Math.random(), Math.random()],
    });
    live.push(result);
    if (live.length > MAX_BODIES) h.remove(live.shift()!);
  };

  // Seed a first batch, then keep dropping a few per second.
  for (let i = 0; i < 20; i += 1) drop();

  h.onStep((_dt, frame) => {
    if (frame % 9 === 0) drop();
  });
};

function randomRotation(): [number, number, number, number] {
  // Uniform random quaternion (Ken Shoemake's method).
  const u1 = Math.random();
  const u2 = Math.random();
  const u3 = Math.random();
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return [
    a * Math.sin(2 * Math.PI * u2),
    a * Math.cos(2 * Math.PI * u2),
    b * Math.sin(2 * Math.PI * u3),
    b * Math.cos(2 * Math.PI * u3),
  ];
}

export default setup;
