---
title: Debug rendering
description: Turn every collider into wireframe line buffers with world.debugRender() and feed them to any line renderer.
---

`world.debugRender()` walks every body and returns flat line-segment buffers you can hand straight to a GPU line primitive — a Rapier-style way to see your colliders. See it in the [Debug rendering example](/jolt-ts/examples/debug-render/).

## The buffers

```ts
const buffers = world.debugRender();
buffers.vertices; // Float32Array — line endpoints, [ax,ay,az, bx,by,bz, …], two points per segment
buffers.colors;   // Float32Array — one RGBA per vertex, [r,g,b,a, …], parallel to vertices
```

Convex primitives (box, sphere, capsule, cylinder) draw as clean wireframe outlines. Every other shape — mesh, convex hull, compound, height field — falls back to the edges of its triangle mesh, extracted with Jolt's own `ShapeGetTriangles`, so any collider can be drawn.

## Colors

Bodies are colored by category, following Jolt/Rapier conventions:

| Category | Default |
| --- | --- |
| `static` | grey |
| `kinematic` | blue |
| `dynamic` (active) | green |
| `sleeping` | olive |
| `sensor` | yellow |

Override any of them, and tune how finely circles are tessellated:

```ts
const buffers = world.debugRender({
  colors: { dynamic: [1, 0.4, 0.2] }, // RGB, 0…1
  ringSegments: 32,                    // default 24
});
```

## Feeding three.js

`LineBasicMaterial` vertex colors are RGB, so drop the alpha:

```ts
import * as THREE from "three";

const geometry = new THREE.BufferGeometry();
const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
lines.frustumCulled = false;
scene.add(lines);

function frame() {
  world.step(1 / 60);
  const { vertices, colors } = world.debugRender();

  const rgb = new Float32Array((vertices.length / 3) * 3);
  for (let i = 0; i < rgb.length / 3; i++) {
    rgb[i * 3] = colors[i * 4];
    rgb[i * 3 + 1] = colors[i * 4 + 1];
    rgb[i * 3 + 2] = colors[i * 4 + 2];
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(rgb, 3));

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
```

The same buffers work anywhere you can draw colored line segments — Babylon's `LinesMesh`, a custom WebGL/WebGPU pass, or a 2D overlay.

## Lower-level building blocks

The pieces `debugRender()` uses are exported too — `DebugLineSink`, `emitBox`, `emitSphere`, `emitCapsule`, `emitCylinder`, and `DEFAULT_DEBUG_COLORS` — if you want to build custom debug geometry.

## Next

- [Debug rendering example](/jolt-ts/examples/debug-render/)
