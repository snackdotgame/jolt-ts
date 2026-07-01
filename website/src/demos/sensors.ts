// A sensor is a body that registers overlaps but never pushes anything. Here
// shapes fall through a translucent yellow sensor slab (no collision response)
// while an identical solid slab beside it stops them — the difference is a
// single `sensor: true` flag.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness, SpawnResult } from "../lib/harness";

export const view: DemoView = { position: [0, 4.5, 13], target: [0, 2, 0] };

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 26 });

  // Left: a sensor slab — things pass straight through it.
  h.spawn({
    type: "static",
    shape: Shape.box({ halfExtents: [1.8, 0.2, 1.8] }),
    position: [-2.6, 2, 0],
    layer: "moving",
    sensor: true,
  });

  // Right: an identical *solid* slab — things land on it.
  h.spawn(
    {
      type: "static",
      shape: Shape.box({ halfExtents: [1.8, 0.2, 1.8] }),
      position: [2.6, 2, 0],
      layer: "static",
    },
    { color: 0x8a92a6 },
  );

  const live: SpawnResult[] = [];
  const drop = (x: number) => {
    const result = h.spawn({
      type: "dynamic",
      shape: Math.random() < 0.5 ? Shape.sphere(0.28) : Shape.box({ halfExtents: [0.26, 0.26, 0.26] }),
      position: [x + (Math.random() - 0.5) * 2, 6, (Math.random() - 0.5) * 2],
      layer: "moving",
      restitution: 0.2,
    });
    live.push(result);
    if (live.length > 60) h.remove(live.shift()!);
  };

  h.onStep((_dt, frame) => {
    if (frame % 22 === 0) drop(-2.6); // rain onto the sensor
    if (frame % 22 === 11) drop(2.6); // rain onto the solid slab
  });
};

export default setup;
