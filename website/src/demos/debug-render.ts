// `world.debugRender()` returns flat line-segment buffers (vertices + per-vertex
// RGBA colours) for every body — convex primitives as clean wireframes, other
// shapes as their triangle edges, colour-coded by body state. Here we skip solid
// meshes entirely and feed those buffers straight into a three.js LineSegments.
import { Shape, type ShapeDescriptor } from "jolt-ts";
import type { DemoSetup, DemoView, Harness, SpawnResult } from "../lib/harness";

export const view: DemoView = { position: [9, 6, 12], target: [0, 1.5, 0] };

const MAX = 60;

function randomShape(): ShapeDescriptor {
  const r = Math.random();
  if (r < 0.25) return Shape.sphere(0.4);
  if (r < 0.5) return Shape.box({ halfExtents: [0.4, 0.4, 0.4] });
  if (r < 0.7) return Shape.capsule({ halfHeight: 0.35, radius: 0.3 });
  if (r < 0.85) return Shape.cylinder({ halfHeight: 0.4, radius: 0.4 });
  return Shape.convexHull({
    points: [
      [0.5, 0, 0],
      [-0.5, 0, 0],
      [0, 0.5, 0],
      [0, -0.5, 0],
      [0, 0, 0.5],
      [0, 0, -0.5],
    ],
  });
}

const setup: DemoSetup = (h: Harness) => {
  const T = h.THREE;

  // Floor + a mesh mound, both invisible: they show up only as debug wireframe.
  h.spawn({ type: "static", shape: Shape.box({ halfExtents: [7, 0.5, 7] }), position: [0, -0.5, 0], layer: "static" }, { visible: false });

  // One LineSegments fed by the debug buffers each frame.
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.BufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("color", new T.BufferAttribute(new Float32Array(0), 3));
  const lines = new T.LineSegments(geometry, new T.LineBasicMaterial({ vertexColors: true }));
  lines.frustumCulled = false;
  h.add(lines);

  const live: SpawnResult[] = [];
  const drop = () => {
    const result = h.spawn(
      {
        type: "dynamic",
        shape: randomShape(),
        position: [(Math.random() - 0.5) * 5, 8, (Math.random() - 0.5) * 5],
        layer: "moving",
        restitution: 0.2,
      },
      { visible: false },
    );
    live.push(result);
    if (live.length > MAX) h.remove(live.shift()!);
  };
  for (let i = 0; i < 14; i += 1) drop();

  h.onStep((_dt, frame) => {
    if (frame % 12 === 0) drop();
  });

  // Rebuild the line geometry from the debug buffers every rendered frame.
  h.onFrame(() => {
    const buffers = h.world.debugRender();
    const vertexCount = buffers.vertices.length / 3;
    const rgb = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i += 1) {
      rgb[i * 3] = buffers.colors[i * 4]!;
      rgb[i * 3 + 1] = buffers.colors[i * 4 + 1]!;
      rgb[i * 3 + 2] = buffers.colors[i * 4 + 2]!;
    }
    geometry.setAttribute("position", new T.BufferAttribute(buffers.vertices, 3));
    geometry.setAttribute("color", new T.BufferAttribute(rgb, 3));
    geometry.computeBoundingSphere();
  });
};

export default setup;
