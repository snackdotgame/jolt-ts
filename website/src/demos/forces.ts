// Interactive impulses. Click any shape to launch it: we ray-pick the body
// under the cursor and call `applyImpulse` at the contact point, so an
// off-centre hit adds spin just like a real poke. Drag empty space to orbit.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [7, 5.5, 10], target: [0, 1, 0] };

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 20 });

  // Invisible bin so the pile stays centred and clickable.
  const wall = (x: number, z: number, hx: number, hz: number) =>
    h.spawn(
      { type: "static", shape: Shape.box({ halfExtents: [hx, 1.5, hz] }), position: [x, 1.5, z], layer: "static" },
      { visible: false },
    );
  wall(0, 4.5, 4.5, 0.2);
  wall(0, -4.5, 4.5, 0.2);
  wall(4.5, 0, 0.2, 4.5);
  wall(-4.5, 0, 0.2, 4.5);

  // A tidy pile to knock around.
  let i = 0;
  for (let x = -2; x <= 2; x += 1) {
    for (let z = -2; z <= 2; z += 1) {
      const useSphere = (i += 1) % 2 === 0;
      h.spawn({
        type: "dynamic",
        shape: useSphere ? Shape.sphere(0.35) : Shape.box({ halfExtents: [0.32, 0.32, 0.32] }),
        position: [x, 0.4, z],
        layer: "moving",
        restitution: 0.3,
      });
    }
  }

  h.onPointerDown((event) => {
    const hit = h.pick(event);
    if (!hit) return;
    const body = hit.body;
    // Impulse = change in momentum, so Δv = impulse / mass. Scale by the body's
    // actual mass (~hundreds of kg at the default density) to get a consistent,
    // punchy launch velocity regardless of shape.
    const strength = body.mass() * 8;
    // Mostly up, with a small outward kick and spin from the contact point.
    const impulse: [number, number, number] = [
      (Math.random() - 0.5) * strength * 0.5,
      strength * 1.1,
      (Math.random() - 0.5) * strength * 0.5,
    ];
    body.applyImpulse(impulse, [hit.point.x, hit.point.y, hit.point.z]);
    body.wakeUp();
  });
};

export default setup;
