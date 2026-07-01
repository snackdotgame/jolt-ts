// Restitution = bounciness. A row of identical balls dropped from the same
// height, each with a higher restitution, so they bounce back to different
// heights. Re-dropped on a timer so the difference stays visible.
import { Shape } from "jolt-ts";
import type { Body } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [0, 4, 13], target: [0, 2.5, 0] };

const COUNT = 6;
const DROP_HEIGHT = 6;

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 30, restitution: 1 });

  const balls: Body[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    const restitution = i / (COUNT - 1); // 0 … 1
    const x = (i - (COUNT - 1) / 2) * 1.8;
    const { body } = h.spawn({
      type: "dynamic",
      shape: Shape.sphere(0.5),
      position: [x, DROP_HEIGHT, 0],
      layer: "moving",
      restitution,
      // Kill damping so bounce height is governed purely by restitution.
      linearDamping: 0,
      angularDamping: 0,
    });
    balls.push(body);
  }

  // Every couple of seconds, lift each ball back to the start so the staircase
  // of bounce heights keeps repeating.
  h.onStep((_dt, frame) => {
    if (frame % 150 !== 0) return;
    balls.forEach((body, i) => {
      const x = (i - (COUNT - 1) / 2) * 1.8;
      body.setTransform([x, DROP_HEIGHT, 0], [0, 0, 0, 1]);
      body.setLinearVelocity(0, 0, 0);
      body.setAngularVelocity(0, 0, 0);
      body.wakeUp();
    });
  });
};

export default setup;
