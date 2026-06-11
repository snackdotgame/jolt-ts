import type { ShapeInput } from "./shape.js";

export type NumberArray3 = readonly [number, number, number] | ReadonlyArray<number> | Float32Array | Float64Array;
export type NumberArray4 = readonly [number, number, number, number] | ReadonlyArray<number> | Float32Array | Float64Array;
export type NumberArray9 =
  | readonly [number, number, number, number, number, number, number, number, number]
  | ReadonlyArray<number>
  | Float32Array
  | Float64Array;

export interface Vector3Object {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface QuaternionObject {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type Vector3Input = Vector3Object | NumberArray3;
export type QuaternionInput = QuaternionObject | NumberArray4;
export type Matrix3Input = Matrix3Object | NumberArray9;
export type MutableNumberArray3 = [number, number, number] | number[] | Float32Array | Float64Array;
export type MutableNumberArray4 = [number, number, number, number] | number[] | Float32Array | Float64Array;
export type Vector3Output = Vector3 | MutableNumberArray3;
export type QuaternionOutput = Quaternion | MutableNumberArray4;

export interface Matrix3Object {
  readonly xx: number;
  readonly xy: number;
  readonly xz: number;
  readonly yx: number;
  readonly yy: number;
  readonly yz: number;
  readonly zx: number;
  readonly zy: number;
  readonly zz: number;
}

export interface MassPropertiesInput {
  readonly mass: number;
  // Row-major 3x3 inertia tensor around the shape's center of mass.
  readonly inertia: Matrix3Input;
}

export type BodyType = "static" | "kinematic" | "dynamic";
export type ActivationMode = boolean | "activate" | "dontActivate";
export type MotionQuality = "discrete" | "linearCast";

export type AllowedDof =
  | "translation-x"
  | "translation-y"
  | "translation-z"
  | "rotation-x"
  | "rotation-y"
  | "rotation-z";

export interface LayerDefinition {
  readonly broadPhase?: string;
  readonly collidesWith?: readonly string[] | "all";
}

export type LayerConfig = Record<string, LayerDefinition>;

export interface CreateBodyOptions {
  readonly type?: BodyType;
  readonly shape: ShapeInput;
  readonly position?: Vector3Input;
  readonly rotation?: QuaternionInput;
  readonly layer?: string | number;
  readonly activate?: ActivationMode;
  readonly userData?: unknown;
  readonly friction?: number;
  readonly restitution?: number;
  readonly density?: number;
  readonly mass?: number;
  readonly massProperties?: MassPropertiesInput;
  readonly linearDamping?: number;
  readonly angularDamping?: number;
  readonly linearVelocity?: Vector3Input;
  readonly angularVelocity?: Vector3Input;
  readonly gravityFactor?: number;
  readonly sensor?: boolean;
  readonly motionQuality?: MotionQuality;
  readonly allowSleeping?: boolean;
  // Restrict which degrees of freedom the body may move in. A character
  // capsule that must never tip over is `["translation-x", "translation-y",
  // "translation-z"]` (see BodyDesc.lockRotations()).
  readonly allowedDofs?: readonly AllowedDof[];
}

export interface BodyTransformOptions {
  readonly activate?: ActivationMode;
}
