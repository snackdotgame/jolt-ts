// Locking rotational degrees of freedom keeps a body upright — the usual setup
// for a character capsule that must never tip over. Both capsules get the same
// off-centre shove on a loop: the left one rotates freely and topples, the
// right one has its rotations locked and only slides.
import { Body, Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [0, 3.5, 11], target: [0, 1, 0] };

const HALF_HEIGHT = 0.5;
const RADIUS = 0.35;
const REST_Y = HALF_HEIGHT + RADIUS;

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 26, friction: 0.9 });

  // Left: a normal dynamic capsule — free to rotate.
  const free = h.spawn(
    Body.dynamic()
      .shape(Shape.capsule({ halfHeight: HALF_HEIGHT, radius: RADIUS }))
      .translation(-2, REST_Y, 0)
      .layer("moving")
      .friction(0.8),
    { color: 0xf0894f },
  ).body;

  // Right: rotations locked — translates freely but never tips.
  const locked = h.spawn(
    Body.dynamic()
      .shape(Shape.capsule({ halfHeight: HALF_HEIGHT, radius: RADIUS }))
      .translation(2, REST_Y, 0)
      .layer("moving")
      .friction(0.8)
      .lockRotations(),
    { color: 0x39d98a },
  ).body;

  const resetUpright = (body: Body, x: number) => {
    body.setTransform([x, REST_Y, 0], [0, 0, 0, 1]);
    body.setLinearVelocity(0, 0, 0);
    body.setAngularVelocity(0, 0, 0);
    body.wakeUp();
  };

  h.onStep((_dt, frame) => {
    const phase = frame % 200;
    if (phase === 0) {
      resetUpright(free, -2);
      resetUpright(locked, 2);
    }
    if (phase === 30) {
      // Shove both high and off-centre — enough to topple a free capsule.
      free.applyImpulse({ x: 3.2, y: 0, z: 0.6 }, { x: -2, y: REST_Y + 0.6, z: 0 });
      locked.applyImpulse({ x: 3.2, y: 0, z: 0.6 }, { x: 2, y: REST_Y + 0.6, z: 0 });
    }
  });
};

export default setup;
