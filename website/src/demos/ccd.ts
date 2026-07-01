// Continuous collision detection. Two spheres are fired at a thin wall at the
// same high speed. The red one uses the default "discrete" motion quality and
// tunnels straight through; the green one uses "linearCast" and is caught by
// the wall. Fired on a loop so you can watch it happen again and again.
import { Shape } from "jolt-ts";
import type { Body } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

// No gravity: keep the projectiles on a flat, readable path.
export const worldOptions = { gravity: [0, 0, 0] as [number, number, number] };
export const view: DemoView = { position: [0, 4.5, 12], target: [0, 1, 0] };

const START_X = -4.5;
const SPEED = 40;

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 24, y: -0.5 });

  // A thin static wall in the middle.
  h.spawn({
    type: "static",
    shape: Shape.box({ halfExtents: [0.05, 1.6, 2.4] }),
    position: [0, 1.1, 0],
    layer: "static",
  });

  const fast = (z: number, quality: "discrete" | "linearCast", color: number): Body => {
    const { body } = h.spawn(
      {
        type: "dynamic",
        shape: Shape.sphere(0.22),
        position: [START_X, 1.1, z],
        layer: "moving",
        motionQuality: quality,
        linearVelocity: [SPEED, 0, 0],
        gravityFactor: 0,
      },
      { color },
    );
    return body;
  };

  const discrete = fast(-1, "discrete", 0xf0554f);
  const linearCast = fast(1, "linearCast", 0x39d98a);

  const fire = (body: Body, z: number) => {
    body.setTransform([START_X, 1.1, z], [0, 0, 0, 1]);
    body.setLinearVelocity(SPEED, 0, 0);
    body.wakeUp();
  };

  h.onStep((_dt, frame) => {
    // Park anything that made it to the far side so it stays in view.
    if (discrete.translation().x > 3.2) discrete.setLinearVelocity(0, 0, 0);
    if (linearCast.translation().x > 3.2) linearCast.setLinearVelocity(0, 0, 0);
    if (frame % 120 === 0) {
      fire(discrete, -1);
      fire(linearCast, 1);
    }
  });
};

export default setup;
