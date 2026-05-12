import {
  fromRawQuat,
  fromRawRVec3,
  fromRawVec3,
  intoRawQuat,
  intoRawRVec3,
  intoRawVec3,
  readRawQuat,
  readRawRVec3,
  readRawVec3
} from "./math.js";
import { type JoltBuild, type JoltModule, JoltRuntime, loadJolt } from "./raw.js";
import {
  buildShape,
  createShapeResource,
  ShapeResource,
  type ShapeInput
} from "./shape.js";
import { createStateRecorder, type NativeByteRecorder } from "./snapshot.js";
import type { NativeScope } from "./native.js";
import type {
  ActivationMode,
  BodyTransformOptions,
  BodyType,
  CreateBodyOptions,
  LayerConfig,
  LayerDefinition,
  MotionQuality,
  Quaternion,
  QuaternionInput,
  Vector3,
  Vector3Input
} from "./types.js";

type RawJolt = JoltModule & Record<string, any>;
type RawBody = Record<string, any>;
type RawBodyID = Record<string, any>;
type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

export interface WorldCreateOptions {
  readonly runtime?: JoltRuntime;
  readonly raw?: JoltModule;
  readonly build?: JoltBuild;
  readonly locateFile?: (path: string, prefix: string) => string;
  readonly wasmUrl?: string | URL;
  readonly module?: Record<string, unknown>;
  readonly gravity?: Vector3Input;
  readonly layers?: LayerConfig;
  readonly maxBodies?: number;
  readonly maxBodyPairs?: number;
  readonly maxContactConstraints?: number;
  readonly maxWorkerThreads?: number;
  readonly deterministic?: boolean | "cross-platform";
}

export type StateRecorderState = "none" | "global" | "bodies" | "contacts" | "constraints" | "all" | number;
export type StateRecorderLike = NativeByteRecorder | Record<string, any>;
export type StateRecorderFilter = Record<string, any>;

export interface SceneSnapshotOptions {
  readonly saveShapes?: boolean;
  readonly saveGroupFilter?: boolean;
}

export interface RestoreSceneSnapshotOptions {
  readonly activate?: ActivationMode;
}

export class BodyDesc {
  #options: Partial<Mutable<CreateBodyOptions>>;

  constructor(type: BodyType = "dynamic") {
    this.#options = { type };
  }

  static dynamic(): BodyDesc {
    return new BodyDesc("dynamic");
  }

  static kinematic(): BodyDesc {
    return new BodyDesc("kinematic");
  }

  static fixed(): BodyDesc {
    return new BodyDesc("static");
  }

  static ["static"](): BodyDesc {
    return new BodyDesc("static");
  }

  shape(shape: ShapeInput): this {
    this.#options.shape = shape;
    return this;
  }

  translation(position: Vector3Input): this;
  translation(x: number, y: number, z: number): this;
  translation(positionOrX: Vector3Input | number, y?: number, z?: number): this {
    this.#options.position = vectorArg(positionOrX, y, z, "translation");
    return this;
  }

  position(position: Vector3Input): this;
  position(x: number, y: number, z: number): this;
  position(positionOrX: Vector3Input | number, y?: number, z?: number): this {
    this.#options.position = vectorArg(positionOrX, y, z, "position");
    return this;
  }

  rotation(rotation: QuaternionInput): this {
    this.#options.rotation = rotation;
    return this;
  }

  layer(layer: string | number): this {
    this.#options.layer = layer;
    return this;
  }

  activate(activate: ActivationMode = true): this {
    this.#options.activate = activate;
    return this;
  }

  userData(userData: unknown): this {
    this.#options.userData = userData;
    return this;
  }

  friction(friction: number): this {
    this.#options.friction = friction;
    return this;
  }

  restitution(restitution: number): this {
    this.#options.restitution = restitution;
    return this;
  }

  linearDamping(damping: number): this {
    this.#options.linearDamping = damping;
    return this;
  }

  angularDamping(damping: number): this {
    this.#options.angularDamping = damping;
    return this;
  }

  linearVelocity(velocity: Vector3Input): this;
  linearVelocity(x: number, y: number, z: number): this;
  linearVelocity(velocityOrX: Vector3Input | number, y?: number, z?: number): this {
    this.#options.linearVelocity = vectorArg(velocityOrX, y, z, "linearVelocity");
    return this;
  }

  angularVelocity(velocity: Vector3Input): this;
  angularVelocity(x: number, y: number, z: number): this;
  angularVelocity(velocityOrX: Vector3Input | number, y?: number, z?: number): this {
    this.#options.angularVelocity = vectorArg(velocityOrX, y, z, "angularVelocity");
    return this;
  }

  gravityFactor(factor: number): this {
    this.#options.gravityFactor = factor;
    return this;
  }

  sensor(sensor = true): this {
    this.#options.sensor = sensor;
    return this;
  }

  motionQuality(quality: MotionQuality): this {
    this.#options.motionQuality = quality;
    return this;
  }

  allowSleeping(allowSleeping: boolean): this {
    this.#options.allowSleeping = allowSleeping;
    return this;
  }

  toOptions(): CreateBodyOptions {
    if (!this.#options.shape) {
      throw new Error("BodyDesc requires a shape before it can create a body.");
    }

    return { ...this.#options, shape: this.#options.shape };
  }
}

export class ShapeStore {
  #runtime: JoltRuntime;
  #byName = new Map<string, ShapeResource>();

  constructor(runtime: JoltRuntime) {
    this.#runtime = runtime;
  }

  create(input: ShapeInput): ShapeResource;
  create(name: string, input: ShapeInput): ShapeResource;
  create(nameOrInput: string | ShapeInput, maybeInput?: ShapeInput): ShapeResource {
    const input = typeof nameOrInput === "string" ? maybeInput : nameOrInput;
    if (!input) {
      throw new Error("ShapeStore.create requires a shape descriptor.");
    }

    const shape = createShapeResource(this.#runtime, input);

    if (typeof nameOrInput === "string") {
      const previous = this.#byName.get(nameOrInput);
      previous?.dispose();
      this.#byName.set(nameOrInput, shape);
    }

    return shape;
  }

  get(name: string): ShapeResource | undefined {
    return this.#byName.get(name);
  }

  dispose(): void {
    for (const shape of this.#byName.values()) {
      shape.dispose();
    }
    this.#byName.clear();
  }
}

export class World {
  readonly runtime: JoltRuntime;
  readonly raw: {
    readonly module: JoltModule;
    readonly joltInterface: Record<string, any>;
    readonly system: Record<string, any>;
    readonly bodyInterface: Record<string, any>;
  };
  readonly shapes: ShapeStore;

  #joltInterface: Record<string, any>;
  #physicsSystem: Record<string, any>;
  #bodyInterface: Record<string, any>;
  #layers: LayerRegistry;
  #bodies = new Map<number, Body>();
  #disposed = false;

  private constructor(runtime: JoltRuntime, joltInterface: Record<string, any>, layers: LayerRegistry) {
    this.runtime = runtime;
    this.#joltInterface = joltInterface;
    this.#physicsSystem = joltInterface.GetPhysicsSystem();
    this.#bodyInterface = this.#physicsSystem.GetBodyInterface();
    this.#layers = layers;
    this.shapes = new ShapeStore(runtime);
    this.raw = {
      module: runtime.raw,
      joltInterface: this.#joltInterface,
      system: this.#physicsSystem,
      bodyInterface: this.#bodyInterface
    };
  }

  static async create(options: WorldCreateOptions = {}): Promise<World> {
    const runtime = await resolveRuntime(options);
    if (options.deterministic === "cross-platform" && runtime.features.crossPlatformDeterministic !== true) {
      throw new Error(
        `Jolt build "${runtime.build}" is not known to be compiled with cross-platform deterministic support.`
      );
    }

    const raw = runtime.raw as RawJolt;
    const settings = new raw.JoltSettings();

    try {
      if (options.maxBodies !== undefined) {
        settings.mMaxBodies = options.maxBodies;
      }
      if (options.maxBodyPairs !== undefined) {
        settings.mMaxBodyPairs = options.maxBodyPairs;
      }
      if (options.maxContactConstraints !== undefined) {
        settings.mMaxContactConstraints = options.maxContactConstraints;
      }
      if (options.maxWorkerThreads !== undefined) {
        settings.mMaxWorkerThreads = options.maxWorkerThreads;
      }

      const layers = LayerRegistry.configure(runtime, settings, options.layers);
      const joltInterface = new raw.JoltInterface(settings);
      const world = new World(runtime, joltInterface, layers);

      if (options.deterministic) {
        world.setDeterministicSimulation(true);
      }

      if (options.gravity) {
        world.setGravity(options.gravity);
      }

      return world;
    } finally {
      runtime.destroyRaw(settings);
    }
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  get bodyCount(): number {
    return this.#bodies.size;
  }

  step(deltaTime: number, collisionSteps = 1): void {
    this.assertAlive();
    this.#joltInterface.Step(deltaTime, collisionSteps);
  }

  setGravity(gravity: Vector3Input): void {
    this.assertAlive();
    this.runtime.withScope((scope) => {
      this.#physicsSystem.SetGravity(intoRawVec3(this.runtime.raw, scope, gravity));
    });
  }

  gravity(): Vector3 {
    this.assertAlive();
    return readRawVec3(this.#physicsSystem.GetGravity());
  }

  deterministicSimulation(): boolean {
    this.assertAlive();
    return this.#physicsSystem.GetPhysicsSettings().mDeterministicSimulation;
  }

  setDeterministicSimulation(enabled: boolean): void {
    this.assertAlive();
    const settings = this.#physicsSystem.GetPhysicsSettings();
    settings.mDeterministicSimulation = enabled;
    this.#physicsSystem.SetPhysicsSettings(settings);
  }

  createStateRecorder(input?: Uint8Array): NativeByteRecorder {
    this.assertAlive();
    return createStateRecorder(this.runtime, input);
  }

  saveState(): Uint8Array;
  saveState(inState: StateRecorderState, inFilter?: StateRecorderFilter): Uint8Array;
  saveState(inStream: StateRecorderLike, inState?: StateRecorderState, inFilter?: StateRecorderFilter): void;
  saveState(
    inStreamOrState?: StateRecorderLike | StateRecorderState,
    inStateOrFilter?: StateRecorderState | StateRecorderFilter,
    inFilter?: StateRecorderFilter
  ): Uint8Array | void {
    this.assertAlive();

    if (isStateRecorderLike(inStreamOrState)) {
      const state = isStateRecorderState(inStateOrFilter) ? inStateOrFilter : "all";
      const filter = isStateRecorderState(inStateOrFilter) ? inFilter : inStateOrFilter;
      this.#saveStateToRecorder(inStreamOrState, state, filter);
      return;
    }

    const recorder = createStateRecorder(this.runtime);
    try {
      this.#saveStateToRecorder(recorder, inStreamOrState ?? "all", inStateOrFilter as StateRecorderFilter | undefined);
      return recorder.bytes();
    } finally {
      recorder.dispose();
    }
  }

  restoreState(inStream: Uint8Array | StateRecorderLike, inFilter?: StateRecorderFilter): boolean {
    this.assertAlive();

    if (!isByteArray(inStream)) {
      return this.#restoreStateFromRecorder(inStream, inFilter);
    }

    const recorder = createStateRecorder(this.runtime, inStream);

    try {
      return this.#restoreStateFromRecorder(recorder, inFilter);
    } finally {
      recorder.dispose();
    }
  }

  #saveStateToRecorder(
    inStream: StateRecorderLike,
    inState: StateRecorderState = "all",
    inFilter?: StateRecorderFilter
  ): void {
    const raw = this.runtime.raw as RawJolt;
    const rawStream = rawStateRecorder(inStream);
    const state = toStateRecorderState(raw, inState);

    if (inFilter) {
      this.#physicsSystem.SaveState(rawStream, state, inFilter);
    } else {
      this.#physicsSystem.SaveState(rawStream, state);
    }
  }

  #restoreStateFromRecorder(inStream: StateRecorderLike, inFilter?: StateRecorderFilter): boolean {
    const rawStream = rawStateRecorder(inStream);
    return inFilter
      ? this.#physicsSystem.RestoreState(rawStream, inFilter)
      : this.#physicsSystem.RestoreState(rawStream);
  }

  takeSceneSnapshot(options: SceneSnapshotOptions = {}): Uint8Array {
    this.assertAlive();
    const raw = this.runtime.raw as RawJolt;
    const scene = raw.JoltPhysicsScene.prototype.sFromPhysicsSystem(this.#physicsSystem);
    const recorder = createStateRecorder(this.runtime);

    try {
      if (!scene.IsValid()) {
        const message = scene.HasError() ? scene.GetError().c_str() : "unknown scene serialization error";
        throw new Error(`Failed to snapshot Jolt physics scene: ${message}`);
      }

      scene.SaveBinaryState(recorder.raw, options.saveShapes ?? true, options.saveGroupFilter ?? true);
      return recorder.bytes();
    } finally {
      recorder.dispose();
      this.runtime.destroyRaw(scene);
    }
  }

  restoreSceneSnapshot(snapshot: Uint8Array, options: RestoreSceneSnapshotOptions = {}): void {
    this.assertAlive();
    const raw = this.runtime.raw as RawJolt;
    const recorder = createStateRecorder(this.runtime, snapshot);
    const scene = raw.JoltPhysicsScene.prototype.sRestoreFromBinaryState(recorder.raw);

    try {
      if (!scene.IsValid()) {
        const message = scene.HasError() ? scene.GetError().c_str() : "unknown scene restore error";
        throw new Error(`Failed to restore Jolt physics scene: ${message}`);
      }

      for (const body of [...this.#bodies.values()]) {
        this.removeBody(body);
      }

      const created = scene.CreateBodies(
        this.#physicsSystem,
        toActivation(raw, options.activate),
        true
      );
      if (!created) {
        throw new Error("Failed to create Jolt bodies from scene snapshot.");
      }

      this.#syncBodiesFromPhysicsSystem();
    } finally {
      this.runtime.destroyRaw(scene);
      recorder.dispose();
    }
  }

  createBody(options: CreateBodyOptions | BodyDesc): Body {
    this.assertAlive();

    const bodyOptions = options instanceof BodyDesc ? options.toOptions() : options;
    const raw = this.runtime.raw as RawJolt;
    const scope = this.runtime.scope();

    try {
      const motionType = toMotionType(raw, bodyOptions.type ?? "dynamic");
      const layer = this.#layers.resolve(bodyOptions.layer, bodyOptions.type ?? "dynamic");
      const shape = buildShape(this.runtime, bodyOptions.shape, scope);
      const position = intoRawRVec3(this.runtime.raw, scope, bodyOptions.position ?? [0, 0, 0]);
      const rotation = intoRawQuat(this.runtime.raw, scope, bodyOptions.rotation);
      const settings = scope.own(new raw.BodyCreationSettings(shape.raw, position, rotation, motionType, layer));

      shape.release();
      applyBodySettings(this.runtime.raw, scope, settings, bodyOptions);

      const rawBody = this.#bodyInterface.CreateBody(settings);
      if (!rawBody) {
        throw new Error("Jolt BodyInterface.CreateBody returned null.");
      }

      const body = Body.fromRaw(this, rawBody, bodyOptions.userData);
      this.#bodyInterface.AddBody(bodyRawId(body), toActivation(raw, bodyOptions.activate));
      this.#bodies.set(body.id, body);
      return body;
    } finally {
      scope.dispose();
    }
  }

  removeBody(body: Body): void {
    this.assertAlive();
    if (body.world !== this || !body.valid) {
      return;
    }

    const rawId = bodyRawId(body);
    if (this.#bodyInterface.IsAdded(rawId)) {
      this.#bodyInterface.RemoveBody(rawId);
    }
    this.#bodyInterface.DestroyBody(rawId);
    this.#bodies.delete(body.id);
    invalidateBody(body);
  }

  getBody(id: number): Body | undefined {
    return this.#bodies.get(id);
  }

  withRawBody<T>(body: Body, callback: (rawBody: RawBody) => T): T {
    this.assertAlive();
    return callback(body.rawUnsafe());
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    for (const body of [...this.#bodies.values()]) {
      this.removeBody(body);
    }

    this.shapes.dispose();
    this.runtime.destroyRaw(this.#joltInterface);
    this.#disposed = true;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  /** @internal */
  assertAlive(): void {
    if (this.#disposed) {
      throw new Error("World is already disposed.");
    }
  }

  #syncBodiesFromPhysicsSystem(): void {
    const raw = this.runtime.raw as RawJolt;
    const bodyIds = new raw.BodyIDVector();

    try {
      this.#bodies.clear();
      this.#physicsSystem.GetBodies(bodyIds);
      const lockInterface = this.#physicsSystem.GetBodyLockInterfaceNoLock();

      for (let index = 0; index < bodyIds.size(); index += 1) {
        const rawBody = lockInterface.TryGetBody(bodyIds.at(index));
        if (!rawBody) {
          continue;
        }

        const body = Body.fromRaw(this, rawBody, rawBody.GetUserData());
        this.#bodies.set(body.id, body);
      }
    } finally {
      this.runtime.destroyRaw(bodyIds);
    }
  }

}

interface BodyInternalAccess {
  readonly rawId: RawBodyID;
  invalidate(): void;
}

export class Body {
  readonly world: World;
  readonly id: number;
  userData: unknown;

  private readonly rawBody: RawBody;
  private readonly rawId: RawBodyID;
  private readonly bodyInterface: Record<string, any>;
  private validBody = true;

  private constructor(
    world: World,
    rawBody: RawBody,
    rawId: RawBodyID,
    id: number,
    userData: unknown,
    bodyInterface: Record<string, any>
  ) {
    this.world = world;
    this.rawBody = rawBody;
    this.rawId = rawId;
    this.id = id;
    this.userData = userData;
    this.bodyInterface = bodyInterface;
  }

  static dynamic(): BodyDesc {
    return BodyDesc.dynamic();
  }

  static kinematic(): BodyDesc {
    return BodyDesc.kinematic();
  }

  static fixed(): BodyDesc {
    return BodyDesc.fixed();
  }

  static ["static"](): BodyDesc {
    return BodyDesc.static();
  }

  /** @internal */
  static fromRaw(world: World, rawBody: RawBody, userData: unknown): Body {
    const raw = world.runtime.raw as RawJolt;
    const idRef = rawBody.GetID();
    const id = idRef.GetIndexAndSequenceNumber();
    const ownedId = new raw.BodyID(id);
    return new Body(world, rawBody, ownedId, id, userData, world.raw.bodyInterface);
  }

  get valid(): boolean {
    return this.validBody;
  }

  translation(): Vector3 {
    this.assertValid();
    return readRawRVec3(this.bodyInterface.GetPosition(this.rawId));
  }

  rotation(): Quaternion {
    this.assertValid();
    return readRawQuat(this.bodyInterface.GetRotation(this.rawId));
  }

  linearVelocity(): Vector3 {
    this.assertValid();
    return readRawVec3(this.bodyInterface.GetLinearVelocity(this.rawId));
  }

  angularVelocity(): Vector3 {
    this.assertValid();
    return readRawVec3(this.bodyInterface.GetAngularVelocity(this.rawId));
  }

  setTranslation(position: Vector3Input, options: BodyTransformOptions = {}): void {
    this.assertValid();
    this.world.runtime.withScope((scope) => {
      this.bodyInterface.SetPosition(
        this.rawId,
        intoRawRVec3(this.world.runtime.raw, scope, position),
        toActivation(this.world.runtime.raw as RawJolt, options.activate)
      );
    });
  }

  setRotation(rotation: QuaternionInput, options: BodyTransformOptions = {}): void {
    this.assertValid();
    this.world.runtime.withScope((scope) => {
      this.bodyInterface.SetRotation(
        this.rawId,
        intoRawQuat(this.world.runtime.raw, scope, rotation),
        toActivation(this.world.runtime.raw as RawJolt, options.activate)
      );
    });
  }

  setTransform(position: Vector3Input, rotation: QuaternionInput, options: BodyTransformOptions = {}): void {
    this.assertValid();
    this.world.runtime.withScope((scope) => {
      this.bodyInterface.SetPositionAndRotation(
        this.rawId,
        intoRawRVec3(this.world.runtime.raw, scope, position),
        intoRawQuat(this.world.runtime.raw, scope, rotation),
        toActivation(this.world.runtime.raw as RawJolt, options.activate)
      );
    });
  }

  setLinearVelocity(velocity: Vector3Input): void {
    this.assertValid();
    this.world.runtime.withScope((scope) => {
      this.bodyInterface.SetLinearVelocity(this.rawId, intoRawVec3(this.world.runtime.raw, scope, velocity));
    });
  }

  setAngularVelocity(velocity: Vector3Input): void {
    this.assertValid();
    this.world.runtime.withScope((scope) => {
      this.bodyInterface.SetAngularVelocity(this.rawId, intoRawVec3(this.world.runtime.raw, scope, velocity));
    });
  }

  applyImpulse(impulse: Vector3Input, point?: Vector3Input): void {
    this.assertValid();
    this.world.runtime.withScope((scope) => {
      const rawImpulse = intoRawVec3(this.world.runtime.raw, scope, impulse);
      if (point) {
        this.bodyInterface.AddImpulse(this.rawId, rawImpulse, intoRawRVec3(this.world.runtime.raw, scope, point));
      } else {
        this.bodyInterface.AddImpulse(this.rawId, rawImpulse);
      }
    });
  }

  applyAngularImpulse(impulse: Vector3Input): void {
    this.assertValid();
    this.world.runtime.withScope((scope) => {
      this.bodyInterface.AddAngularImpulse(this.rawId, intoRawVec3(this.world.runtime.raw, scope, impulse));
    });
  }

  addForce(force: Vector3Input, options: BodyTransformOptions = {}, point?: Vector3Input): void {
    this.assertValid();
    this.world.runtime.withScope((scope) => {
      const rawForce = intoRawVec3(this.world.runtime.raw, scope, force);
      const activation = toActivation(this.world.runtime.raw as RawJolt, options.activate);
      if (point) {
        this.bodyInterface.AddForce(this.rawId, rawForce, intoRawRVec3(this.world.runtime.raw, scope, point), activation);
      } else {
        this.bodyInterface.AddForce(this.rawId, rawForce, activation);
      }
    });
  }

  addTorque(torque: Vector3Input, options: BodyTransformOptions = {}): void {
    this.assertValid();
    this.world.runtime.withScope((scope) => {
      this.bodyInterface.AddTorque(
        this.rawId,
        intoRawVec3(this.world.runtime.raw, scope, torque),
        toActivation(this.world.runtime.raw as RawJolt, options.activate)
      );
    });
  }

  setMotionType(type: BodyType, options: BodyTransformOptions = {}): void {
    this.assertValid();
    const raw = this.world.runtime.raw as RawJolt;
    this.bodyInterface.SetMotionType(this.rawId, toMotionType(raw, type), toActivation(raw, options.activate));
  }

  rawUnsafe(): RawBody {
    this.assertValid();
    return this.rawBody;
  }

  remove(): void {
    this.world.removeBody(this);
  }

  private invalidate(): void {
    if (!this.validBody) {
      return;
    }

    this.validBody = false;
    this.world.runtime.destroyRaw(this.rawId);
  }

  private assertValid(): void {
    this.world.assertAlive();
    if (!this.validBody) {
      throw new Error("Body is no longer valid.");
    }
  }
}

class LayerRegistry {
  #objectLayerByName = new Map<string, number>();
  #defaultStatic: number;
  #defaultDynamic: number;

  private constructor(defaultStatic: number, defaultDynamic: number) {
    this.#defaultStatic = defaultStatic;
    this.#defaultDynamic = defaultDynamic;
  }

  static configure(runtime: JoltRuntime, settings: Record<string, any>, input?: LayerConfig): LayerRegistry {
    const raw = runtime.raw as RawJolt;
    const config = normalizeLayers(input);
    const layerNames = Object.keys(config);
    const broadPhaseNames = [...new Set(layerNames.map((name) => config[name]?.broadPhase ?? name))];
    const objectFilter = new raw.ObjectLayerPairFilterTable(layerNames.length);

    layerNames.forEach((name, index) => {
      const collidesWith = config[name]?.collidesWith ?? "all";
      const targets = collidesWith === "all" ? layerNames : collidesWith;
      for (const target of targets) {
        const targetIndex = layerNames.indexOf(target);
        if (targetIndex < 0) {
          throw new Error(`Layer "${name}" collides with unknown layer "${target}".`);
        }
        objectFilter.EnableCollision(index, targetIndex);
      }
    });

    const bpInterface = new raw.BroadPhaseLayerInterfaceTable(layerNames.length, broadPhaseNames.length);

    layerNames.forEach((name, index) => {
      const broadPhaseName = config[name]?.broadPhase ?? name;
      const broadPhaseIndex = broadPhaseNames.indexOf(broadPhaseName);
      const bpLayer = new raw.BroadPhaseLayer(broadPhaseIndex);
      try {
        bpInterface.MapObjectToBroadPhaseLayer(index, bpLayer);
      } finally {
        runtime.destroyRaw(bpLayer);
      }
    });

    const bpFilter = new raw.ObjectVsBroadPhaseLayerFilterTable(
      bpInterface,
      broadPhaseNames.length,
      objectFilter,
      layerNames.length
    );

    settings.mObjectLayerPairFilter = objectFilter;
    settings.mBroadPhaseLayerInterface = bpInterface;
    settings.mObjectVsBroadPhaseLayerFilter = bpFilter;

    const defaultStatic = layerNames.includes("static") ? layerNames.indexOf("static") : 0;
    const defaultDynamic = layerNames.includes("moving") ? layerNames.indexOf("moving") : defaultStatic;
    const registry = new LayerRegistry(defaultStatic, defaultDynamic);

    layerNames.forEach((name, index) => registry.#objectLayerByName.set(name, index));
    return registry;
  }

  resolve(layer: string | number | undefined, bodyType: BodyType): number {
    if (typeof layer === "number") {
      return layer;
    }

    if (layer) {
      const value = this.#objectLayerByName.get(layer);
      if (value === undefined) {
        throw new Error(`Unknown Jolt object layer "${layer}".`);
      }
      return value;
    }

    return bodyType === "static" ? this.#defaultStatic : this.#defaultDynamic;
  }
}

function normalizeLayers(input?: LayerConfig): LayerConfig {
  return (
    input ?? {
      static: { broadPhase: "static", collidesWith: ["moving"] },
      moving: { broadPhase: "moving", collidesWith: ["static", "moving"] }
    }
  );
}

async function resolveRuntime(options: WorldCreateOptions): Promise<JoltRuntime> {
  if (options.runtime) {
    return options.runtime;
  }

  if (options.raw) {
    return new JoltRuntime(options.raw, options.build ?? "wasm-compat");
  }

  const loadOptions: {
    build?: JoltBuild;
    locateFile?: (path: string, prefix: string) => string;
    wasmUrl?: string | URL;
    module?: Record<string, unknown>;
  } = {};
  if (options.build !== undefined) {
    loadOptions.build = options.build;
  }
  if (options.locateFile !== undefined) {
    loadOptions.locateFile = options.locateFile;
  }
  if (options.wasmUrl !== undefined) {
    loadOptions.wasmUrl = options.wasmUrl;
  }
  if (options.module !== undefined) {
    loadOptions.module = options.module;
  }
  return loadJolt(loadOptions);
}

function applyBodySettings(
  rawModule: JoltModule,
  scope: NativeScope,
  settings: Record<string, any>,
  options: CreateBodyOptions
): void {
  if (options.friction !== undefined) {
    settings.mFriction = options.friction;
  }
  if (options.restitution !== undefined) {
    settings.mRestitution = options.restitution;
  }
  if (options.linearDamping !== undefined) {
    settings.mLinearDamping = options.linearDamping;
  }
  if (options.angularDamping !== undefined) {
    settings.mAngularDamping = options.angularDamping;
  }
  if (options.gravityFactor !== undefined) {
    settings.mGravityFactor = options.gravityFactor;
  }
  if (options.sensor !== undefined) {
    settings.mIsSensor = options.sensor;
  }
  if (options.motionQuality !== undefined) {
    settings.mMotionQuality = toMotionQuality(rawModule as RawJolt, options.motionQuality);
  }
  if (options.allowSleeping !== undefined) {
    settings.mAllowSleeping = options.allowSleeping;
  }
  if (options.linearVelocity) {
    settings.mLinearVelocity = intoRawVec3(rawModule, scope, options.linearVelocity);
  }
  if (options.angularVelocity) {
    settings.mAngularVelocity = intoRawVec3(rawModule, scope, options.angularVelocity);
  }
}

function toMotionType(raw: RawJolt, type: BodyType): number {
  switch (type) {
    case "static":
      return raw.EMotionType_Static;
    case "kinematic":
      return raw.EMotionType_Kinematic;
    case "dynamic":
      return raw.EMotionType_Dynamic;
  }
}

function toMotionQuality(raw: RawJolt, quality: MotionQuality): number {
  switch (quality) {
    case "discrete":
      return raw.EMotionQuality_Discrete;
    case "linearCast":
      return raw.EMotionQuality_LinearCast;
  }
}

function toActivation(raw: RawJolt, mode: ActivationMode | undefined): number {
  return mode === false || mode === "dontActivate" ? raw.EActivation_DontActivate : raw.EActivation_Activate;
}

function toStateRecorderState(raw: RawJolt, state: StateRecorderState): number {
  if (typeof state === "number") {
    return state;
  }

  switch (state) {
    case "none":
      return raw.EStateRecorderState_None;
    case "all":
      return raw.EStateRecorderState_All;
    case "global":
      return raw.EStateRecorderState_Global;
    case "bodies":
      return raw.EStateRecorderState_Bodies;
    case "contacts":
      return raw.EStateRecorderState_Contacts;
    case "constraints":
      return raw.EStateRecorderState_Constraints;
  }
}

function isByteArray(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

function isStateRecorderState(value: unknown): value is StateRecorderState {
  return typeof value === "string" || typeof value === "number";
}

function isStateRecorderLike(value: unknown): value is StateRecorderLike {
  return typeof value === "object" && value !== null && !isByteArray(value);
}

function isNativeByteRecorder(value: StateRecorderLike): value is NativeByteRecorder {
  return "raw" in value && typeof value.bytes === "function";
}

function rawStateRecorder(inStream: StateRecorderLike): Record<string, any> {
  return isNativeByteRecorder(inStream) ? inStream.raw : inStream;
}

function bodyRawId(body: Body): RawBodyID {
  return (body as unknown as BodyInternalAccess).rawId;
}

function invalidateBody(body: Body): void {
  (body as unknown as BodyInternalAccess).invalidate();
}

function vectorArg(valueOrX: Vector3Input | number, y: number | undefined, z: number | undefined, label: string): Vector3Input {
  if (typeof valueOrX !== "number") {
    return valueOrX;
  }

  if (typeof y !== "number" || typeof z !== "number") {
    throw new TypeError(`${label} requires x, y, and z numbers.`);
  }

  return [valueOrX, y, z];
}
