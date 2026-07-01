// Collision layers decide what collides with what. Here "red" and "blue" bodies
// each pass through their own colour but collide with the other. They rain into
// a shared bin and are bouncy, so cross-colour collisions happen constantly:
// reds pile on blues and vice-versa, while each colour ghosts through its own.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness, SpawnResult } from "../lib/harness";

export const view: DemoView = { position: [8, 5.5, 12], target: [0, 1.5, 0] };

// A custom layer table: `ground` collides with everything; `red`/`blue` collide
// with the ground and with each other, but never with their own colour.
export const worldOptions = {
  layers: {
    ground: { collidesWith: ["red", "blue"] as string[] },
    red: { collidesWith: ["ground", "blue"] as string[] },
    blue: { collidesWith: ["ground", "red"] as string[] },
  },
};

const RED = 0xf05a6a;
const BLUE = 0x4f8bff;

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 18, layer: "ground", restitution: 0.55 });

  // Invisible bin (on the ground layer, so both colours hit it) keeps the bouncy
  // bodies together in the collision zone instead of scattering off the floor.
  const wall = (x: number, z: number, hx: number, hz: number) =>
    h.spawn(
      { type: "static", shape: Shape.box({ halfExtents: [hx, 3, hz] }), position: [x, 3, z], layer: "ground" },
      { visible: false },
    );
  wall(0, 3.2, 3.2, 0.2);
  wall(0, -3.2, 3.2, 0.2);
  wall(3.2, 0, 0.2, 3.2);
  wall(-3.2, 0, 0.2, 3.2);

  const live: SpawnResult[] = [];
  const drop = (team: "red" | "blue") => {
    // Both colours rain across the *same* central area so they intermix.
    const result = h.spawn(
      {
        type: "dynamic",
        shape: team === "red" ? Shape.box({ halfExtents: [0.4, 0.4, 0.4] }) : Shape.sphere(0.45),
        position: [(Math.random() - 0.5) * 4, 7, (Math.random() - 0.5) * 4],
        layer: team,
        restitution: 0.8, // bouncy → lots of visible cross-colour collisions
        friction: 0.3,
      },
      { color: team === "red" ? RED : BLUE },
    );
    live.push(result);
    if (live.length > 64) h.remove(live.shift()!);
  };

  h.onStep((_dt, frame) => {
    if (frame % 14 === 0) drop("red");
    if (frame % 14 === 7) drop("blue");
  });
};

export default setup;
