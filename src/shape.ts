import { intoRawQuat, intoRawVec3, vec3 } from "./math.js";
import type { NativeScope } from "./native.js";
import type { JoltModule, JoltRuntime } from "./raw.js";
import type { QuaternionInput, Vector3Input } from "./types.js";

type RawJolt = JoltModule & Record<string, any>;
type RawShape = Record<string, any>;
type RawShapeSettings = Record<string, any>;

export interface SphereShapeDescriptor {
  readonly kind: "sphere";
  readonly radius: number;
}

export interface BoxShapeDescriptor {
  readonly kind: "box";
  readonly halfExtents: Vector3Input;
  readonly convexRadius?: number;
}

export interface CapsuleShapeDescriptor {
  readonly kind: "capsule";
  readonly halfHeight: number;
  readonly radius: number;
}

export interface CylinderShapeDescriptor {
  readonly kind: "cylinder";
  readonly halfHeight: number;
  readonly radius: number;
  readonly convexRadius?: number;
}

export interface ConvexHullShapeDescriptor {
  readonly kind: "convexHull";
  readonly points: readonly Vector3Input[] | Float32Array | Float64Array;
  readonly maxConvexRadius?: number;
}

export interface MeshShapeDescriptor {
  readonly kind: "mesh";
  readonly vertices: Float32Array | Float64Array | ReadonlyArray<number>;
  readonly indices: Uint16Array | Uint32Array | ReadonlyArray<number>;
}

export interface CompoundShapeChild {
  readonly shape: ShapeInput;
  readonly position?: Vector3Input;
  readonly rotation?: QuaternionInput;
  readonly userData?: number;
}

export interface CompoundShapeDescriptor {
  readonly kind: "compound";
  readonly children: readonly CompoundShapeChild[];
  readonly mutable?: boolean;
}

export type ShapeDescriptor =
  | SphereShapeDescriptor
  | BoxShapeDescriptor
  | CapsuleShapeDescriptor
  | CylinderShapeDescriptor
  | ConvexHullShapeDescriptor
  | MeshShapeDescriptor
  | CompoundShapeDescriptor;

export type ShapeInput = ShapeDescriptor | ShapeResource;

export interface BuiltShape {
  readonly raw: RawShape;
  release(): void;
}

export interface ShapeResource {
  readonly raw: RawShape;
  readonly disposed: boolean;
  dispose(): void;
}

interface ShapeResourceState {
  runtime: JoltRuntime;
  raw: RawShape;
  disposed: boolean;
}

const shapeResourceStates = new WeakMap<ShapeResource, ShapeResourceState>();

class OwnedShapeResource implements ShapeResource {
  constructor(runtime: JoltRuntime, raw: RawShape) {
    shapeResourceStates.set(this, {
      runtime,
      raw,
      disposed: false
    });
  }

  get raw(): RawShape {
    return shapeResourceState(this).raw;
  }

  get disposed(): boolean {
    return shapeResourceState(this).disposed;
  }

  dispose(): void {
    const state = shapeResourceState(this);
    if (state.disposed) {
      return;
    }

    state.disposed = true;
    state.raw.Release();
  }
}

export const Shape = {
  sphere(options: number | Omit<SphereShapeDescriptor, "kind">): SphereShapeDescriptor {
    return typeof options === "number" ? { kind: "sphere", radius: options } : { kind: "sphere", ...options };
  },

  box(options: Vector3Input | Omit<BoxShapeDescriptor, "kind">): BoxShapeDescriptor {
    if (isVectorInput(options)) {
      return { kind: "box", halfExtents: options };
    }

    return { kind: "box", ...options };
  },

  capsule(options: Omit<CapsuleShapeDescriptor, "kind">): CapsuleShapeDescriptor {
    return { kind: "capsule", ...options };
  },

  cylinder(options: Omit<CylinderShapeDescriptor, "kind">): CylinderShapeDescriptor {
    return { kind: "cylinder", ...options };
  },

  convexHull(options: Omit<ConvexHullShapeDescriptor, "kind">): ConvexHullShapeDescriptor {
    return { kind: "convexHull", ...options };
  },

  mesh(options: Omit<MeshShapeDescriptor, "kind">): MeshShapeDescriptor {
    return { kind: "mesh", ...options };
  },

  compound(children: readonly CompoundShapeChild[], options: { mutable?: boolean } = {}): CompoundShapeDescriptor {
    return options.mutable === undefined
      ? { kind: "compound", children }
      : { kind: "compound", children, mutable: options.mutable };
  }
};

export function createShapeResource(runtime: JoltRuntime, input: ShapeInput): ShapeResource {
  if (isShapeResource(input)) {
    const state = shapeResourceState(input);
    assertShapeResourceUsable(state, runtime);
    state.raw.AddRef();
    return new OwnedShapeResource(runtime, state.raw);
  }

  const scope = runtime.scope();
  try {
    const built = buildShape(runtime, input, scope);
    return new OwnedShapeResource(runtime, built.raw);
  } finally {
    scope.dispose();
  }
}

export function buildShape(runtime: JoltRuntime, input: ShapeInput, scope: NativeScope): BuiltShape {
  if (isShapeResource(input)) {
    const state = shapeResourceState(input);
    assertShapeResourceUsable(state, runtime);
    return {
      raw: state.raw,
      release() {
        // ShapeResource keeps ownership; BodyCreationSettings takes its own ref.
      }
    };
  }

  const raw = runtime.raw as RawJolt;

  switch (input.kind) {
    case "sphere":
      assertPositive(input.radius, "sphere radius");
      return retainShape(new raw.SphereShape(input.radius, null));

    case "box": {
      const halfExtents = intoRawVec3(runtime.raw, scope, input.halfExtents);
      return retainShape(new raw.BoxShape(halfExtents, input.convexRadius ?? 0.05, null));
    }

    case "capsule":
      assertPositive(input.halfHeight, "capsule halfHeight");
      assertPositive(input.radius, "capsule radius");
      return retainShape(new raw.CapsuleShape(input.halfHeight, input.radius, null));

    case "cylinder":
      assertPositive(input.halfHeight, "cylinder halfHeight");
      assertPositive(input.radius, "cylinder radius");
      return retainShape(new raw.CylinderShape(input.halfHeight, input.radius, input.convexRadius ?? 0.05, null));

    case "convexHull":
      return createConvexHullShape(runtime, input, scope);

    case "mesh":
      return createMeshShape(runtime, input, scope);

    case "compound":
      return createCompoundShape(runtime, input, scope);
  }
}

function retainShape(rawShape: RawShape): BuiltShape {
  rawShape.AddRef();
  return {
    raw: rawShape,
    release() {
      rawShape.Release();
    }
  };
}

function createConvexHullShape(runtime: JoltRuntime, input: ConvexHullShapeDescriptor, scope: NativeScope): BuiltShape {
  const raw = runtime.raw as RawJolt;
  const settings = scope.own(new raw.ConvexHullShapeSettings());

  if (input.maxConvexRadius !== undefined) {
    settings.mMaxConvexRadius = input.maxConvexRadius;
  }

  const point = scope.own(new raw.Vec3());
  forEachPoint(input.points, "convexHull points", (x, y, z) => {
    point.Set(x, y, z);
    settings.mPoints.push_back(point);
  });

  return retainShapeFromSettings(runtime, settings);
}

function createMeshShape(runtime: JoltRuntime, input: MeshShapeDescriptor, scope: NativeScope): BuiltShape {
  const raw = runtime.raw as RawJolt;
  const indexCount = input.indices.length;

  if (indexCount === 0 || indexCount % 3 !== 0) {
    throw new Error("mesh indices length must be a non-zero multiple of 3.");
  }

  const triangles = scope.own(new raw.TriangleList());
  triangles.resize(indexCount / 3);

  for (let triangleIndex = 0; triangleIndex < indexCount / 3; triangleIndex += 1) {
    const triangle = triangles.at(triangleIndex);
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = numberAt(input.indices, triangleIndex * 3 + corner, "mesh index");
      const offset = vertexIndex * 3;
      const vertex = triangle.get_mV(corner);
      vertex.x = numberAt(input.vertices, offset, "mesh vertex");
      vertex.y = numberAt(input.vertices, offset + 1, "mesh vertex");
      vertex.z = numberAt(input.vertices, offset + 2, "mesh vertex");
    }
  }

  const materials = scope.own(new raw.PhysicsMaterialList());
  const settings = scope.own(new raw.MeshShapeSettings(triangles, materials));
  return retainShapeFromSettings(runtime, settings);
}

function createCompoundShape(runtime: JoltRuntime, input: CompoundShapeDescriptor, scope: NativeScope): BuiltShape {
  if (input.children.length === 0) {
    throw new Error("compound shape requires at least one child.");
  }

  const raw = runtime.raw as RawJolt;
  const settings = scope.own(input.mutable ? new raw.MutableCompoundShapeSettings() : new raw.StaticCompoundShapeSettings());

  for (const child of input.children) {
    const childShape = buildShape(runtime, child.shape, scope);
    const position = intoRawVec3(runtime.raw, scope, child.position ?? [0, 0, 0]);
    const rotation = intoRawQuat(runtime.raw, scope, child.rotation);

    try {
      settings.AddShapeShape(position, rotation, childShape.raw, child.userData ?? 0);
    } finally {
      childShape.release();
    }
  }

  return retainShapeFromSettings(runtime, settings);
}

function retainShapeFromSettings(runtime: JoltRuntime, settings: RawShapeSettings): BuiltShape {
  const result = settings.Create();

  try {
    if (!result.IsValid()) {
      const message = result.HasError() ? result.GetError().c_str() : "unknown shape creation error";
      throw new Error(`Failed to create Jolt shape: ${message}`);
    }

    return retainShape(result.Get());
  } finally {
    result.Clear();
  }
}

function forEachPoint(
  points: readonly Vector3Input[] | Float32Array | Float64Array,
  label: string,
  callback: (x: number, y: number, z: number) => void
): void {
  if (ArrayBuffer.isView(points)) {
    if (points.length === 0 || points.length % 3 !== 0) {
      throw new Error(`${label} must contain a non-zero multiple of 3 numbers.`);
    }

    for (let i = 0; i < points.length; i += 3) {
      callback(numberAt(points, i, label), numberAt(points, i + 1, label), numberAt(points, i + 2, label));
    }
    return;
  }

  if (points.length === 0) {
    throw new Error(`${label} must contain at least one point.`);
  }

  for (const point of points) {
    const value = vec3(point, label);
    callback(value.x, value.y, value.z);
  }
}

function isVectorInput(value: unknown): value is Vector3Input {
  return Array.isArray(value) || ArrayBuffer.isView(value) || (typeof value === "object" && value !== null && "x" in value);
}

function numberAt(input: ArrayLike<number>, index: number, label: string): number {
  const value = input[index];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must contain a finite number at index ${index}.`);
  }
  return value;
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number.`);
  }
}

function isShapeResource(input: unknown): input is ShapeResource {
  return typeof input === "object" && input !== null && shapeResourceStates.has(input as ShapeResource);
}

function shapeResourceState(resource: ShapeResource): ShapeResourceState {
  const state = shapeResourceStates.get(resource);
  if (!state) {
    throw new TypeError("Invalid ShapeResource.");
  }
  return state;
}

function assertShapeResourceUsable(state: ShapeResourceState, runtime: JoltRuntime): void {
  if (state.disposed) {
    throw new Error("ShapeResource is already disposed.");
  }
  if (state.runtime !== runtime) {
    throw new Error("ShapeResource belongs to a different Jolt runtime.");
  }
}
