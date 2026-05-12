import type { NativeScope } from "./native.js";
import type { JoltModule } from "./raw.js";
import type { Quaternion, QuaternionInput, Vector3, Vector3Input } from "./types.js";

type RawJolt = JoltModule & Record<string, any>;
type RawValue = Record<string, any>;
type NumberArrayInput = ReadonlyArray<number> | Float32Array | Float64Array;

export function vec3(input: Vector3Input, label = "vector"): Vector3 {
  if (isVector3Object(input)) {
    return assertFiniteVector({ x: input.x, y: input.y, z: input.z }, label);
  }
  if (!isNumberArray(input)) {
    throw new TypeError(`${label} must be a vector object or array.`);
  }

  const array = input;
  return assertFiniteVector(
    {
      x: numberAt(array, 0, label),
      y: numberAt(array, 1, label),
      z: numberAt(array, 2, label)
    },
    label
  );
}

export function quat(input?: QuaternionInput, label = "quaternion"): Quaternion {
  if (!input) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }

  if (isQuaternionObject(input)) {
    return assertFiniteQuaternion({ x: input.x, y: input.y, z: input.z, w: input.w }, label);
  }
  if (!isNumberArray(input)) {
    throw new TypeError(`${label} must be a quaternion object or array.`);
  }

  const array = input;
  return assertFiniteQuaternion(
    {
      x: numberAt(array, 0, label),
      y: numberAt(array, 1, label),
      z: numberAt(array, 2, label),
      w: numberAt(array, 3, label)
    },
    label
  );
}

export function intoRawVec3(raw: JoltModule, scope: NativeScope, input: Vector3Input): RawValue {
  const value = vec3(input);
  return scope.own(new (raw as RawJolt).Vec3(value.x, value.y, value.z));
}

export function intoRawRVec3(raw: JoltModule, scope: NativeScope, input: Vector3Input): RawValue {
  const value = vec3(input);
  return scope.own(new (raw as RawJolt).RVec3(value.x, value.y, value.z));
}

export function intoRawQuat(raw: JoltModule, scope: NativeScope, input?: QuaternionInput): RawValue {
  const value = quat(input);
  return scope.own(new (raw as RawJolt).Quat(value.x, value.y, value.z, value.w));
}

export function fromRawVec3(value: RawValue): Vector3 {
  return {
    x: value.GetX(),
    y: value.GetY(),
    z: value.GetZ()
  };
}

export const fromRawRVec3 = fromRawVec3;

export function fromRawQuat(value: RawValue): Quaternion {
  return {
    x: value.GetX(),
    y: value.GetY(),
    z: value.GetZ(),
    w: value.GetW()
  };
}

// Emscripten WebIDL [Value] returns are static borrowed temporaries, not heap allocations.
export function readRawVec3(value: RawValue): Vector3 {
  return fromRawVec3(value);
}

export function readRawRVec3(value: RawValue): Vector3 {
  return fromRawRVec3(value);
}

export function readRawQuat(value: RawValue): Quaternion {
  return fromRawQuat(value);
}

function isVector3Object(input: Vector3Input): input is { x: number; y: number; z: number } {
  return !isNumberArray(input) && "x" in input && "y" in input && "z" in input;
}

function isQuaternionObject(input: QuaternionInput): input is { x: number; y: number; z: number; w: number } {
  return !isNumberArray(input) && "x" in input && "y" in input && "z" in input && "w" in input;
}

function isNumberArray(input: Vector3Input | QuaternionInput): input is NumberArrayInput {
  return Array.isArray(input) || ArrayBuffer.isView(input);
}

function numberAt(input: ArrayLike<number>, index: number, label: string): number {
  const value = input[index];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must contain a finite number at index ${index}.`);
  }
  return value;
}

function assertFiniteVector(value: Vector3, label: string): Vector3 {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    throw new TypeError(`${label} components must be finite numbers.`);
  }
  return value;
}

function assertFiniteQuaternion(value: Quaternion, label: string): Quaternion {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z) ||
    !Number.isFinite(value.w)
  ) {
    throw new TypeError(`${label} components must be finite numbers.`);
  }
  return value;
}
