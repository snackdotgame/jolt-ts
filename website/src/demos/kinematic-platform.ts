// A kinematic platform driven with `moveKinematic`. Unlike teleporting with
// setTransform, moveKinematic derives the platform's velocity so it carries
// resting cargo along and shoves dynamic bodies it runs into — the standard
// way to build moving platforms and sweepers.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [0, 6, 13], target: [0, 1, 0] };

const SPAN = 3.2;

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 26 });

  const platformY = 0.5;
  const { body: platform } = h.spawn(
    {
      type: "kinematic",
      shape: Shape.box({ halfExtents: [1.4, 0.15, 1.4] }),
      position: [-SPAN, platformY, 0],
      layer: "moving",
    },
    { color: 0x3a9bdc, metalness: 0.2, roughness: 0.4 },
  );

  // Cargo riding on the platform.
  for (let i = 0; i < 4; i += 1) {
    h.spawn({
      type: "dynamic",
      shape: Shape.box({ halfExtents: [0.3, 0.3, 0.3] }),
      position: [-SPAN + (i % 2) * 0.7 - 0.35, platformY + 0.5 + Math.floor(i / 2) * 0.7, (i % 2) * 0.7 - 0.35],
      layer: "moving",
    });
  }

  // Loose boxes on the floor for the platform to plow into at the right end.
  for (let i = 0; i < 5; i += 1) {
    h.spawn({
      type: "dynamic",
      shape: Shape.box({ halfExtents: [0.28, 0.28, 0.28] }),
      position: [SPAN + 0.2, 0.3 + i * 0.6, (i - 2) * 0.35],
      layer: "moving",
    });
  }

  let time = 0;
  h.onStep((dt) => {
    time += dt;
    const x = Math.sin(time * 0.7) * SPAN;
    // Drive the platform toward its next pose; Jolt figures out the velocity.
    platform.moveKinematic([x, platformY, 0], [0, 0, 0, 1], dt);
  });
};

export default setup;
