// Collision layers decide what collides with what. Side-by-side test: the SAME
// red bodies rain onto two shelves that differ only in their layer. The blue
// shelf is a *different* layer, so red bodies land on it; the red shelf is the
// *same* layer, so red bodies fall straight through it to the floor.
import { Shape } from "jolt-ts";
import type { Body } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [0, 4, 14], target: [0, 1.6, 0] };

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
  h.ground({ size: 24, layer: "ground" });

  // Two wide shelves, same size and height — only the layer (and colour) differ.
  const shelf = (x: number, layer: "red" | "blue", color: number) =>
    h.spawn(
      { type: "static", shape: Shape.box({ halfExtents: [1.9, 0.2, 1.7] }), position: [x, 2, 0], layer },
      { color, roughness: 0.5 },
    );
  shelf(-3, "blue", BLUE); // different layer from the red drops → catches them
  shelf(3, "red", RED); //    same layer as the red drops → they pass through

  // Rain RED bodies squarely onto the middle of each shelf.
  const live: Array<{ body: Body; side: "blue" | "red" }> = [];
  const drop = (x: number, side: "blue" | "red") => {
    const { body } = h.spawn(
      {
        type: "dynamic",
        shape: Math.random() < 0.5 ? Shape.box({ halfExtents: [0.26, 0.26, 0.26] }) : Shape.sphere(0.28),
        position: [x + (Math.random() - 0.5) * 1.4, 6, (Math.random() - 0.5) * 1.4],
        layer: "red",
        restitution: 0.1,
        friction: 0.9,
      },
      { color: RED },
    );
    live.push({ body, side });
    if (live.length > 70) {
      const oldest = live.shift()!;
      h.remove(oldest.body);
    }
  };

  h.onStep((_dt, frame) => {
    if (frame % 10 === 0) drop(-3, "blue"); // onto the blue shelf → lands on it
    if (frame % 10 === 5) drop(3, "red"); //   onto the red shelf → falls through
  });
};

export default setup;
