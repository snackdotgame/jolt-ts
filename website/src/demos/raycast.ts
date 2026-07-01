// A ray sweeps in a circle from a point above the scene. Each frame we call
// `world.castRay`, then draw the ray, mark the hit point, and draw the surface
// normal jolt-ts returns — the exact data you'd use for bullets, line-of-sight,
// or mouse picking.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [9, 7, 11], target: [0, 1.5, 0] };

const ORIGIN: [number, number, number] = [0, 5.5, 0];
const RAY_LENGTH = 14;

const setup: DemoSetup = (h: Harness) => {
  const T = h.THREE;
  h.ground({ size: 24 });

  // A ring of static pillars of varying heights for the ray to sweep across.
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2;
    const r = 4.2;
    const height = 0.6 + (i % 4) * 0.55;
    h.spawn({
      type: "static",
      shape: Shape.box({ halfExtents: [0.5, height, 0.5] }),
      position: [Math.cos(angle) * r, height, Math.sin(angle) * r],
      layer: "static",
    });
  }

  // Ray line.
  const rayGeom = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]);
  const rayLine = new T.Line(rayGeom, new T.LineBasicMaterial({ color: 0x6ee7f0 }));
  h.add(rayLine);

  // Origin marker + hit marker + normal arrow.
  const originDot = new T.Mesh(new T.SphereGeometry(0.12, 16, 12), new T.MeshBasicMaterial({ color: 0x6ee7f0 }));
  originDot.position.set(...ORIGIN);
  h.add(originDot);

  const hitDot = new T.Mesh(new T.SphereGeometry(0.16, 20, 14), new T.MeshBasicMaterial({ color: 0xffd54a }));
  h.add(hitDot);

  const normalArrow = new T.ArrowHelper(new T.Vector3(0, 1, 0), new T.Vector3(), 1.2, 0xff5e8a, 0.35, 0.2);
  h.add(normalArrow);

  let angle = 0;
  const dir: [number, number, number] = [0, 0, 0];
  const origin = new T.Vector3(...ORIGIN);

  h.onFrame((dt) => {
    angle += dt * 0.6;
    // Sweep a ray that fans outward and downward.
    const tilt = -0.75;
    dir[0] = Math.cos(angle) * RAY_LENGTH;
    dir[1] = tilt * RAY_LENGTH;
    dir[2] = Math.sin(angle) * RAY_LENGTH;

    const hit = h.world.castRay(ORIGIN, dir);
    if (hit) {
      hitDot.visible = true;
      normalArrow.visible = true;
      hitDot.position.set(hit.point.x, hit.point.y, hit.point.z);
      normalArrow.position.set(hit.point.x, hit.point.y, hit.point.z);
      normalArrow.setDirection(new T.Vector3(hit.normal.x, hit.normal.y, hit.normal.z));
      rayGeom.setFromPoints([origin, new T.Vector3(hit.point.x, hit.point.y, hit.point.z)]);
    } else {
      hitDot.visible = false;
      normalArrow.visible = false;
      rayGeom.setFromPoints([
        origin,
        new T.Vector3(ORIGIN[0] + dir[0], ORIGIN[1] + dir[1], ORIGIN[2] + dir[2]),
      ]);
    }
    rayGeom.attributes.position.needsUpdate = true;
  });
};

export default setup;
