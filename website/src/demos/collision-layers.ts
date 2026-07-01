// Collision layers decide what collides with what. Here "red" and "blue" bodies
// each pass through their own colour but collide with the other — so the two
// streams interleave on the way down but shove each other on contact.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness, SpawnResult } from "../lib/harness";

export const view: DemoView = { position: [8, 5, 12], target: [0, 2, 0] };

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
  h.ground({ size: 22, layer: "ground" });

  const live: SpawnResult[] = [];
  const drop = (team: "red" | "blue") => {
    const x = team === "red" ? -1.4 : 1.4;
    const result = h.spawn(
      {
        type: "dynamic",
        shape: team === "red" ? Shape.box({ halfExtents: [0.4, 0.4, 0.4] }) : Shape.sphere(0.45),
        position: [x + (Math.random() - 0.5), 8, (Math.random() - 0.5) * 1.5],
        layer: team,
        restitution: 0.2,
      },
      { color: team === "red" ? RED : BLUE },
    );
    live.push(result);
    if (live.length > 80) h.remove(live.shift()!);
  };

  h.onStep((_dt, frame) => {
    if (frame % 18 === 0) drop("red");
    if (frame % 18 === 9) drop("blue");
  });
};

export default setup;
