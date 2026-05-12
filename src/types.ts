import type { ShapeInput } from "./shape.js";

export type NumberArray3 = readonly [number, number, number] | ReadonlyArray<number> | Float32Array | Float64Array;
export type NumberArray4 = readonly [number, number, number, number] | ReadonlyArray<number> | Float32Array | Float64Array;

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

export type BodyType = "static" | "kinematic" | "dynamic";
export type ActivationMode = boolean | "activate" | "dontActivate";
export type MotionQuality = "discrete" | "linearCast";

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
  readonly linearDamping?: number;
  readonly angularDamping?: number;
  readonly linearVelocity?: Vector3Input;
  readonly angularVelocity?: Vector3Input;
  readonly gravityFactor?: number;
  readonly sensor?: boolean;
  readonly motionQuality?: MotionQuality;
  readonly allowSleeping?: boolean;
}

export interface BodyTransformOptions {
  readonly activate?: ActivationMode;
}
