// Every shape kind jolt-ts can build, dropping onto a static triangle-mesh
// mound: primitives (sphere/box/capsule/cylinder), a convex hull, a compound
// "table", and an offset-center-of-mass "weeble".
import { Shape, type CompoundShapeChild, type ShapeInput } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [10, 6, 12], target: [0, 1.2, 0] };

// A simple 4-sided pyramid mound as a static triangle mesh collider.
function pyramid(size: number, height: number) {
  const s = size;
  const vertices = [-s, 0, -s, s, 0, -s, s, 0, s, -s, 0, s, 0, height, 0];
  const indices = [0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0, 0, 1, 2, 0, 2, 3];
  return { vertices, indices };
}

// A little table: a flat top on four legs, as a compound shape.
function table(): CompoundShapeChild[] {
  const leg = (x: number, z: number): CompoundShapeChild => ({
    shape: Shape.box({ halfExtents: [0.08, 0.3, 0.08] }),
    position: [x, -0.3, z],
  });
  return [
    { shape: Shape.box({ halfExtents: [0.5, 0.06, 0.4] }), position: [0, 0, 0] },
    leg(0.4, 0.3),
    leg(-0.4, 0.3),
    leg(0.4, -0.3),
    leg(-0.4, -0.3),
  ];
}

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 24 });

  const mound = pyramid(2.4, 1.6);
  h.spawn(
    { type: "static", shape: Shape.mesh(mound), position: [0, 0, 0], layer: "static" },
    { color: 0x35507a, roughness: 0.9 },
  );

  // One of each dynamic shape, dropped in a ring so they tumble off the mound.
  const drops: Array<[shape: ShapeInput, angle: number]> = [
    [Shape.sphere(0.45), 0],
    [Shape.box({ halfExtents: [0.4, 0.4, 0.4] }), Math.PI / 4],
    [Shape.capsule({ halfHeight: 0.4, radius: 0.3 }), Math.PI / 2],
    [Shape.cylinder({ halfHeight: 0.4, radius: 0.4 }), (3 * Math.PI) / 4],
    [Shape.convexHull({ points: gemPoints() }), Math.PI],
    [Shape.compound(table()), (5 * Math.PI) / 4],
    [Shape.offsetCenterOfMass(Shape.capsule({ halfHeight: 0.45, radius: 0.4 }), [0, -0.45, 0]), (3 * Math.PI) / 2],
  ];

  drops.forEach(([shape, angle], i) => {
    const radius = 3.2;
    h.spawn({
      type: "dynamic",
      shape,
      position: [Math.cos(angle) * radius, 4 + i * 0.15, Math.sin(angle) * radius],
      layer: "moving",
      restitution: 0.15,
    });
  });
};

// An irregular convex hull — jolt-ts computes the hull from the point cloud.
function gemPoints(): Array<[number, number, number]> {
  return [
    [0, 0.6, 0],
    [0.5, 0.1, 0.3],
    [0.4, 0.05, -0.45],
    [-0.45, 0.12, -0.35],
    [-0.5, 0.08, 0.4],
    [0.15, -0.5, 0.15],
    [-0.2, -0.45, -0.2],
  ];
}

export default setup;
