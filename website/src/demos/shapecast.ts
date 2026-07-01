// Shape casting sweeps a whole shape along a direction and reports the first
// contact — the swept-volume version of a raycast. Here a sphere is cast
// straight down from a moving point, exactly like a character controller
// probing for the ground below its feet.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [0, 5, 12], target: [0, 1.5, 0] };

const PROBE_RADIUS = 0.4;
const CAST: [number, number, number] = [0, -6, 0];

const setup: DemoSetup = (h: Harness) => {
  const T = h.THREE;
  h.ground({ size: 26 });

  // A staircase for the probe to step across.
  for (let i = 0; i < 6; i += 1) {
    const height = 0.35 * (i + 1);
    h.spawn({
      type: "static",
      shape: Shape.box({ halfExtents: [0.7, height, 3] }),
      position: [-3.5 + i * 1.4, height, 0],
      layer: "static",
    });
  }

  const probeShape = Shape.sphere(PROBE_RADIUS);

  // Ghost sphere at the cast origin, solid sphere at the contact, a drop line.
  const ghost = new T.Mesh(
    new T.SphereGeometry(PROBE_RADIUS, 20, 14),
    new T.MeshBasicMaterial({ color: 0x6ee7f0, wireframe: true, transparent: true, opacity: 0.5 }),
  );
  h.add(ghost);
  const landed = new T.Mesh(
    new T.SphereGeometry(PROBE_RADIUS, 24, 16),
    new T.MeshStandardMaterial({ color: 0x6ee7f0, emissive: 0x0a3a44, roughness: 0.4 }),
  );
  h.add(landed);
  const dropGeom = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
  const dropLine = new T.Line(dropGeom, new T.LineDashedMaterial({ color: 0x6ee7f0, dashSize: 0.2, gapSize: 0.15 }));
  h.add(dropLine);

  let t = 0;
  h.onFrame((dt) => {
    t += dt;
    const x = Math.sin(t * 0.6) * 3.6;
    const start: [number, number, number] = [x, 4.5, 0];
    ghost.position.set(...start);

    const hit = h.world.castShape(probeShape, start, undefined, CAST);
    const endY = hit ? start[1] + CAST[1] * hit.fraction : start[1] + CAST[1];
    landed.position.set(x, endY, 0);
    landed.visible = !!hit;
    dropGeom.setFromPoints([new T.Vector3(...start), new T.Vector3(x, endY, 0)]);
    dropGeom.attributes.position.needsUpdate = true;
    dropLine.computeLineDistances();
  });
};

export default setup;
