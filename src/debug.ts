// Rapier-style physics debug rendering.
//
// `World.debugRender()` returns flat line-segment buffers — `vertices` (3 floats
// per point, two points per segment) and per-vertex `colors` (RGBA) — ready to
// feed a renderer's line primitive (e.g. a three.js `LineSegments` with
// `vertexColors: true`). Convex primitives (box / sphere / capsule / cylinder)
// are drawn as clean wireframe outlines; every other shape (mesh, convex hull,
// compound, height field, …) falls back to the edges of its triangle mesh,
// extracted with Jolt's own `ShapeGetTriangles` so any collider can be drawn.
//
// This mirrors how Rapier exposes `world.debugRender()`: the engine walks its
// bodies and emits a vertex/color buffer the host just uploads to the GPU.

export interface DebugRenderBuffers {
  /** Line endpoints, flat: `[ax,ay,az, bx,by,bz, …]`, two points per segment. */
  readonly vertices: Float32Array;
  /** One RGBA color per vertex (4 floats each), parallel to `vertices`. */
  readonly colors: Float32Array;
}

export type DebugColor = readonly [number, number, number];

/** Per-body-category colors. Defaults follow Jolt/Rapier debug conventions. */
export interface DebugRenderColors {
  readonly static: DebugColor;
  readonly kinematic: DebugColor;
  readonly dynamic: DebugColor;
  readonly sleeping: DebugColor;
  readonly sensor: DebugColor;
}

export const DEFAULT_DEBUG_COLORS: DebugRenderColors = {
  static: [0.55, 0.55, 0.62],
  kinematic: [0.3, 0.62, 1.0],
  dynamic: [0.4, 0.92, 0.45],
  sleeping: [0.52, 0.52, 0.34],
  sensor: [0.96, 0.84, 0.26]
};

export interface DebugRenderOptions {
  /** Override any of the per-category colors. */
  readonly colors?: Partial<DebugRenderColors>;
  /** Segments used to tessellate a full circle (arcs use a proportional count). Default 24. */
  readonly ringSegments?: number;
}

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
interface QuatLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

// Accumulates colored line segments. A current transform (the body's world
// position + rotation) and color are set once per body, then `local()` emits
// segments expressed in that body's local frame; `world()` emits segments that
// are already in world space (the triangle fallback).
export class DebugLineSink {
  readonly vertices: number[] = [];
  readonly colors: number[] = [];
  #r = 1;
  #g = 1;
  #b = 1;
  #a = 1;
  #px = 0;
  #py = 0;
  #pz = 0;
  #qx = 0;
  #qy = 0;
  #qz = 0;
  #qw = 1;

  setColor(color: DebugColor, alpha = 1): void {
    this.#r = color[0];
    this.#g = color[1];
    this.#b = color[2];
    this.#a = alpha;
  }

  setTransform(position: Vec3Like, rotation: QuatLike): void {
    this.#px = position.x;
    this.#py = position.y;
    this.#pz = position.z;
    this.#qx = rotation.x;
    this.#qy = rotation.y;
    this.#qz = rotation.z;
    this.#qw = rotation.w;
  }

  local(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    this.#pushLocal(ax, ay, az);
    this.#pushLocal(bx, by, bz);
  }

  world(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    this.#pushWorld(ax, ay, az);
    this.#pushWorld(bx, by, bz);
  }

  #pushLocal(x: number, y: number, z: number): void {
    // v' = v + 2*qv × (qv × v + w*v), the standard quaternion-vector rotation.
    const qx = this.#qx;
    const qy = this.#qy;
    const qz = this.#qz;
    const qw = this.#qw;
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    const rx = x + qw * tx + (qy * tz - qz * ty);
    const ry = y + qw * ty + (qz * tx - qx * tz);
    const rz = z + qw * tz + (qx * ty - qy * tx);
    this.#pushWorld(rx + this.#px, ry + this.#py, rz + this.#pz);
  }

  #pushWorld(x: number, y: number, z: number): void {
    this.vertices.push(x, y, z);
    this.colors.push(this.#r, this.#g, this.#b, this.#a);
  }

  toBuffers(): DebugRenderBuffers {
    return {
      vertices: Float32Array.from(this.vertices),
      colors: Float32Array.from(this.colors)
    };
  }
}

// Walk a parametric curve and emit it as a polyline of `segments` local segments.
function arc(
  sink: DebugLineSink,
  segments: number,
  from: number,
  to: number,
  point: (t: number) => readonly [number, number, number]
): void {
  let [px, py, pz] = point(from);
  for (let i = 1; i <= segments; i += 1) {
    const t = from + (to - from) * (i / segments);
    const [x, y, z] = point(t);
    sink.local(px, py, pz, x, y, z);
    px = x;
    py = y;
    pz = z;
  }
}

const TAU = Math.PI * 2;

export function emitBox(sink: DebugLineSink, hx: number, hy: number, hz: number): void {
  const c: ReadonlyArray<readonly [number, number, number]> = [
    [-hx, -hy, -hz],
    [hx, -hy, -hz],
    [hx, hy, -hz],
    [-hx, hy, -hz],
    [-hx, -hy, hz],
    [hx, -hy, hz],
    [hx, hy, hz],
    [-hx, hy, hz]
  ];
  const edges: ReadonlyArray<readonly [number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7]
  ];
  for (const [i, j] of edges) {
    const a = c[i]!;
    const b = c[j]!;
    sink.local(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
}

export function emitSphere(sink: DebugLineSink, radius: number, segments: number): void {
  arc(sink, segments, 0, TAU, (t) => [radius * Math.cos(t), 0, radius * Math.sin(t)]);
  arc(sink, segments, 0, TAU, (t) => [radius * Math.cos(t), radius * Math.sin(t), 0]);
  arc(sink, segments, 0, TAU, (t) => [0, radius * Math.cos(t), radius * Math.sin(t)]);
}

// Capsule aligned along Y (Jolt's convention): `halfHeight` is the half-height of
// the cylindrical mid-section; hemispherical caps of `radius` sit above/below it.
export function emitCapsule(sink: DebugLineSink, radius: number, halfHeight: number, segments: number): void {
  const cap = Math.max(2, Math.round(segments / 2));
  arc(sink, segments, 0, TAU, (t) => [radius * Math.cos(t), halfHeight, radius * Math.sin(t)]);
  arc(sink, segments, 0, TAU, (t) => [radius * Math.cos(t), -halfHeight, radius * Math.sin(t)]);
  sink.local(radius, -halfHeight, 0, radius, halfHeight, 0);
  sink.local(-radius, -halfHeight, 0, -radius, halfHeight, 0);
  sink.local(0, -halfHeight, radius, 0, halfHeight, radius);
  sink.local(0, -halfHeight, -radius, 0, halfHeight, -radius);
  arc(sink, cap, 0, Math.PI, (p) => [radius * Math.cos(p), halfHeight + radius * Math.sin(p), 0]);
  arc(sink, cap, 0, Math.PI, (p) => [0, halfHeight + radius * Math.sin(p), radius * Math.cos(p)]);
  arc(sink, cap, 0, Math.PI, (p) => [radius * Math.cos(p), -halfHeight - radius * Math.sin(p), 0]);
  arc(sink, cap, 0, Math.PI, (p) => [0, -halfHeight - radius * Math.sin(p), radius * Math.cos(p)]);
}

// Cylinder aligned along Y (Jolt's convention).
export function emitCylinder(sink: DebugLineSink, radius: number, halfHeight: number, segments: number): void {
  arc(sink, segments, 0, TAU, (t) => [radius * Math.cos(t), halfHeight, radius * Math.sin(t)]);
  arc(sink, segments, 0, TAU, (t) => [radius * Math.cos(t), -halfHeight, radius * Math.sin(t)]);
  sink.local(radius, -halfHeight, 0, radius, halfHeight, 0);
  sink.local(-radius, -halfHeight, 0, -radius, halfHeight, 0);
  sink.local(0, -halfHeight, radius, 0, halfHeight, radius);
  sink.local(0, -halfHeight, -radius, 0, halfHeight, -radius);
}
