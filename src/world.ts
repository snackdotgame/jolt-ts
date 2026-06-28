import {
  fromRawQuat,
  fromRawRVec3,
  fromRawVec3,
  intoRawQuat,
  intoRawRVec3,
  intoRawVec3,
  readRawQuat,
  readRawQuatInto,
  readRawRVec3,
  readRawRVec3Into,
  readRawVec3,
  readRawVec3Into,
  readQuaternionComponents,
  readVector3Components
} from "./math.js";
import {
  featuresForBuild,
  type UrlLike,
  type JoltBuild,
  type JoltModule,
  JoltRuntime,
  type JoltRuntimeFeatures,
  loadJolt,
} from "./raw.js";
import {
  buildShape,
  createShapeResource,
  ShapeResource,
  type ShapeInput
} from "./shape.js";
import {
  type DebugColor,
  type DebugRenderBuffers,
  type DebugRenderColors,
  type DebugRenderOptions,
  DEFAULT_DEBUG_COLORS,
  DebugLineSink,
  emitBox,
  emitCapsule,
  emitCylinder,
  emitSphere
} from "./debug.js";
import { createStateRecorder, type NativeByteRecorder } from "./snapshot.js";
import type { NativeScope } from "./native.js";
import type {
  ActivationMode,
  AllowedDof,
  BodyTransformOptions,
  BodyType,
  CreateBodyOptions,
  LayerConfig,
  LayerDefinition,
  MassPropertiesInput,
  Matrix3Input,
  MotionQuality,
  Quaternion,
  QuaternionInput,
  QuaternionOutput,
  Vector3,
  Vector3Input,
  Vector3Output
} from "./types.js";

type RawJolt = JoltModule & Record<string, any>;
type RawValue = Record<string, any>;
type RawBody = Record<string, any>;
type RawBodyID = Record<string, any>;
type RawShape = Record<string, any>;
type Matrix3Components = {
  xx: number;
  xy: number;
  xz: number;
  yx: number;
  yy: number;
  yz: number;
  zx: number;
  zy: number;
  zz: number;
};
type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

const scratchVectorA = { x: 0, y: 0, z: 0 };
const scratchVectorB = { x: 0, y: 0, z: 0 };
const scratchQuaternion = { x: 0, y: 0, z: 0, w: 1 };

export interface WorldCreateOptions {
  readonly runtime?: JoltRuntime;
  // A pre-initialized module from this package's own `build` artifact. It is
  // assumed to have that build's features (including cross-platform
  // determinism); pass `features` to override when wrapping a module from
  // somewhere else.
  readonly raw?: JoltModule;
  readonly features?: Partial<JoltRuntimeFeatures>;
  readonly build?: JoltBuild;
  readonly locateFile?: (path: string, prefix: string) => string;
  readonly wasmUrl?: string | UrlLike;
  readonly module?: Record<string, unknown>;
  readonly gravity?: Vector3Input;
  readonly layers?: LayerConfig;
  readonly maxBodies?: number;
  readonly maxBodyPairs?: number;
  readonly maxContactConstraints?: number;
  readonly maxWorkerThreads?: number;
  readonly deterministic?: boolean | "cross-platform";
}

export interface RayHit {
  readonly bodyId: number;
  readonly body: Body | undefined;
  readonly fraction: number;
  readonly point: Vector3;
  readonly normal: Vector3;
}

export interface QueryHitFilterContext {
  readonly bodyId: number;
  readonly body: Body | undefined;
}

export interface QueryOptions {
  readonly excludeBody?: Body;
  readonly includeSensors?: boolean;
  readonly filter?: (hit: QueryHitFilterContext) => boolean;
}

export interface ShapeCastHit {
  readonly bodyId: number;
  readonly body: Body | undefined;
  readonly fraction: number;
  readonly point: Vector3;
  readonly normal: Vector3;
  readonly contactPointOnCaster: Vector3;
  readonly contactPointOnBody: Vector3;
  readonly penetrationDepth: number;
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

  density(density: number): this {
    this.#options.density = density;
    return this;
  }

  mass(mass: number): this {
    this.#options.mass = mass;
    return this;
  }

  massProperties(massProperties: MassPropertiesInput): this {
    this.#options.massProperties = massProperties;
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

  allowedDofs(...dofs: AllowedDof[]): this {
    this.#options.allowedDofs = dofs;
    return this;
  }

  // A body that translates freely but never rotates — the usual setup for a
  // character capsule that must stay upright.
  lockRotations(): this {
    return this.allowedDofs("translation-x", "translation-y", "translation-z");
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
  #rayQuery: Record<string, any> | null = null;
  #shapeCastQuery: Record<string, any> | null = null;

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

  gravityInto<T extends Vector3Output>(out: T): T {
    this.assertAlive();
    return readRawVec3Into(this.#physicsSystem.GetGravity(), out);
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

  // Closest-hit raycast against everything in the world. `direction` carries
  // the ray length (cast from origin to origin + direction). Returns null on
  // miss. The hit `body` is undefined for raw bodies this World didn't create.
  castRay(origin: Vector3Input, direction: Vector3Input, options: QueryOptions = {}): RayHit | null {
    return this.#visitRayHits(origin, direction, options, (hit) => hit) ?? null;
  }

  // Sorted all-hit raycast. This uses the same collector and filtering rules
  // as castRay, but returns every accepted hit from nearest to farthest.
  castRayAll(origin: Vector3Input, direction: Vector3Input, options: QueryOptions = {}): RayHit[] {
    const results: RayHit[] = [];
    this.#visitRayHits(origin, direction, options, (hit) => {
      results.push(hit);
      return undefined;
    });
    return results;
  }

  #visitRayHits<T>(
    origin: Vector3Input,
    direction: Vector3Input,
    options: QueryOptions,
    visitor: (hit: RayHit) => T | undefined
  ): T | undefined {
    this.assertAlive();
    const raw = this.runtime.raw as RawJolt;
    if (!this.#rayQuery) {
      this.#rayQuery = {
        settings: new raw.RayCastSettings(),
        collector: new raw.CastRayAllHitCollisionCollector(),
        bpFilter: new raw.BroadPhaseLayerFilter(),
        objFilter: new raw.ObjectLayerFilter(),
        bodyFilter: new raw.BodyFilter(),
        shapeFilter: new raw.ShapeFilter()
      };
    }
    const q = this.#rayQuery;
    const o = readVector3Components(origin, "origin", scratchVectorA);
    const d = readVector3Components(direction, "direction", scratchVectorB);
    return this.runtime.withScope((scope) => {
      const ray = scope.own(new raw.RRayCast());
      ray.set_mOrigin(scope.own(new raw.RVec3(o.x, o.y, o.z)));
      ray.set_mDirection(scope.own(new raw.Vec3(d.x, d.y, d.z)));
      q.collector.Reset();
      this.#physicsSystem
        .GetNarrowPhaseQuery()
        .CastRay(ray, q.settings, q.collector, q.bpFilter, q.objFilter, q.bodyFilter, q.shapeFilter);
      if (!q.collector.HadHit()) {
        return undefined;
      }
      q.collector.Sort();
      const hits = q.collector.get_mHits();
      for (let index = 0; index < hits.size(); index += 1) {
        const hit = hits.at(index);
        const bodyId = hit.get_mBodyID().GetIndexAndSequenceNumber();
        const body = this.#bodies.get(bodyId);
        if (!queryHitAllowed(bodyId, body, options)) {
          continue;
        }
        const fraction = hit.get_mFraction();
        const point = { x: o.x + d.x * fraction, y: o.y + d.y * fraction, z: o.z + d.z * fraction };
        const result = visitor({
          bodyId,
          body,
          fraction,
          point,
          normal: readRayHitNormal(body, hit, point, d)
        });
        if (result !== undefined) {
          return result;
        }
      }
      return undefined;
    });
  }

  // Closest shape cast against the world. `direction` carries the cast length,
  // matching Jolt's RShapeCast and this wrapper's raycast convention.
  castShape(
    shapeInput: ShapeInput,
    position: Vector3Input,
    rotation: QuaternionInput | undefined,
    direction: Vector3Input,
    options: QueryOptions = {}
  ): ShapeCastHit | null {
    this.assertAlive();
    const raw = this.runtime.raw as RawJolt;
    if (!this.#shapeCastQuery) {
      this.#shapeCastQuery = {
        settings: new raw.ShapeCastSettings(),
        collector: new raw.CastShapeAllHitCollisionCollector(),
        bpFilter: new raw.BroadPhaseLayerFilter(),
        objFilter: new raw.ObjectLayerFilter(),
        bodyFilter: new raw.BodyFilter(),
        shapeFilter: new raw.ShapeFilter()
      };
    }

    const q = this.#shapeCastQuery;
    const d = readVector3Components(direction, "direction", scratchVectorB);
    const scope = this.runtime.scope();
    try {
      const shape = buildShape(this.runtime, shapeInput, scope);
      const scale = scope.own(new raw.Vec3(1, 1, 1));
      const start = scope.own(
        raw.RMat44.prototype.sRotationTranslation(
          intoRawQuat(this.runtime.raw, scope, rotation),
          intoRawRVec3(this.runtime.raw, scope, position)
        )
      );
      const cast = scope.own(new raw.RShapeCast(shape.raw, scale, start, scope.own(new raw.Vec3(d.x, d.y, d.z))));
      const baseOffset = scope.own(new raw.RVec3(0, 0, 0));
      scope.defer(() => shape.release());

      q.collector.Reset();
      this.#physicsSystem
        .GetNarrowPhaseQuery()
        .CastShape(cast, q.settings, baseOffset, q.collector, q.bpFilter, q.objFilter, q.bodyFilter, q.shapeFilter);
      if (!q.collector.HadHit()) {
        return null;
      }

      q.collector.Sort();
      const hits = q.collector.get_mHits();
      for (let index = 0; index < hits.size(); index += 1) {
        const hit = hits.at(index);
        const bodyId = hit.get_mBodyID2().GetIndexAndSequenceNumber();
        const body = this.#bodies.get(bodyId);
        if (!queryHitAllowed(bodyId, body, options)) {
          continue;
        }
        const fraction = hit.get_mFraction();
        const contactPointOnBody = readRawVec3(hit.get_mContactPointOn2());
        return {
          bodyId,
          body,
          fraction,
          point: readRawRVec3(cast.GetPointOnRay(fraction)),
          normal: readShapeHitNormal(body, hit, contactPointOnBody, d),
          contactPointOnCaster: readRawVec3(hit.get_mContactPointOn1()),
          contactPointOnBody,
          penetrationDepth: hit.get_mPenetrationDepth()
        };
      }
      return null;
    } finally {
      scope.dispose();
    }
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

      applyBodySettings(this.runtime.raw, scope, settings, bodyOptions, shape.raw);
      shape.release();

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

  // Rapier-style debug rendering: walk every body and emit a flat line-segment
  // buffer (vertices + per-vertex RGBA colors) outlining its collider in world
  // space. Convex primitives draw as clean wireframes; any other shape falls
  // back to the edges of its triangle mesh. Feed the result to a line renderer
  // (e.g. three.js `LineSegments`). See `DebugRenderBuffers`.
  debugRender(options: DebugRenderOptions = {}): DebugRenderBuffers {
    this.assertAlive();
    const raw = this.runtime.raw as RawJolt;
    const colors: DebugRenderColors = { ...DEFAULT_DEBUG_COLORS, ...options.colors };
    const segments = options.ringSegments ?? 24;
    const sink = new DebugLineSink();

    for (const body of this.#bodies.values()) {
      if (!body.valid) {
        continue;
      }
      const shape = body.rawUnsafe().GetShape();
      sink.setTransform(body.translation(), body.rotation());
      sink.setColor(debugColorFor(body, colors));

      switch (shape.GetSubType()) {
        case raw.EShapeSubType_Box: {
          const he = readRawVec3(raw.castObject(shape, raw.BoxShape).GetHalfExtent());
          emitBox(sink, he.x, he.y, he.z);
          break;
        }
        case raw.EShapeSubType_Sphere:
          emitSphere(sink, raw.castObject(shape, raw.SphereShape).GetRadius(), segments);
          break;
        case raw.EShapeSubType_Capsule: {
          const capsule = raw.castObject(shape, raw.CapsuleShape);
          emitCapsule(sink, capsule.GetRadius(), capsule.GetHalfHeightOfCylinder(), segments);
          break;
        }
        case raw.EShapeSubType_Cylinder: {
          const cylinder = raw.castObject(shape, raw.CylinderShape);
          emitCylinder(sink, cylinder.GetRadius(), cylinder.GetHalfHeight(), segments);
          break;
        }
        default:
          this.#emitShapeTriangleEdges(sink, shape, body);
          break;
      }
    }

    return sink.toBuffers();
  }

  // Fallback for non-primitive shapes (mesh, convex hull, compound, height
  // field): extract the collider's triangles in world space via Jolt's own
  // `ShapeGetTriangles` and emit each triangle's three edges. Colors/transform
  // are taken from the sink's current state; the geometry is already world-space.
  #emitShapeTriangleEdges(sink: DebugLineSink, shape: RawShape, body: Body): void {
    const raw = this.runtime.raw as RawJolt;
    const scope = this.runtime.scope();
    try {
      const com = body.centerOfMassPosition();
      const rotation = body.rotation();
      const scale = scope.own(new raw.Vec3(1, 1, 1));
      const comVec = scope.own(new raw.Vec3(com.x, com.y, com.z));
      const rotQuat = scope.own(new raw.Quat(rotation.x, rotation.y, rotation.z, rotation.w));
      const box = scope.own(raw.AABox.prototype.sBiggest());
      const tris = scope.own(new raw.ShapeGetTriangles(shape, box, comVec, rotQuat, scale));

      const byteSize = tris.GetVerticesSize();
      if (byteSize > 0) {
        const floatCount = (byteSize / Float32Array.BYTES_PER_ELEMENT) | 0;
        const view = new Float32Array(raw.HEAPF32.buffer, tris.GetVerticesData(), floatCount);
        for (let i = 0; i + 9 <= floatCount; i += 9) {
          const ax = view[i]!;
          const ay = view[i + 1]!;
          const az = view[i + 2]!;
          const bx = view[i + 3]!;
          const by = view[i + 4]!;
          const bz = view[i + 5]!;
          const cx = view[i + 6]!;
          const cy = view[i + 7]!;
          const cz = view[i + 8]!;
          sink.world(ax, ay, az, bx, by, bz);
          sink.world(bx, by, bz, cx, cy, cz);
          sink.world(cx, cy, cz, ax, ay, az);
        }
      }
    } finally {
      scope.dispose();
    }
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

    if (this.#rayQuery) {
      for (const value of Object.values(this.#rayQuery)) {
        this.runtime.destroyRaw(value);
      }
      this.#rayQuery = null;
    }

    if (this.#shapeCastQuery) {
      for (const value of Object.values(this.#shapeCastQuery)) {
        this.runtime.destroyRaw(value);
      }
      this.#shapeCastQuery = null;
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
  private readonly bodyHelpers: Record<string, any>;
  private validBody = true;

  private constructor(
    world: World,
    rawBody: RawBody,
    rawId: RawBodyID,
    id: number,
    userData: unknown,
    bodyInterface: Record<string, any>,
    bodyHelpers: Record<string, any>
  ) {
    this.world = world;
    this.rawBody = rawBody;
    this.rawId = rawId;
    this.id = id;
    this.userData = userData;
    this.bodyInterface = bodyInterface;
    this.bodyHelpers = bodyHelpers;
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
    return new Body(world, rawBody, ownedId, id, userData, world.raw.bodyInterface, raw.JoltBodyInterfaceHelpers.prototype);
  }

  get valid(): boolean {
    return this.validBody;
  }

  translation(): Vector3 {
    this.assertValid();
    return readRawRVec3(this.bodyInterface.GetPosition(this.rawId));
  }

  translationInto<T extends Vector3Output>(out: T): T {
    this.assertValid();
    return readRawRVec3Into(this.bodyInterface.GetPosition(this.rawId), out);
  }

  centerOfMassPosition(): Vector3 {
    this.assertValid();
    return readRawRVec3(this.rawBody.GetCenterOfMassPosition());
  }

  centerOfMassPositionInto<T extends Vector3Output>(out: T): T {
    this.assertValid();
    return readRawRVec3Into(this.rawBody.GetCenterOfMassPosition(), out);
  }

  rotation(): Quaternion {
    this.assertValid();
    return readRawQuat(this.bodyInterface.GetRotation(this.rawId));
  }

  rotationInto<T extends QuaternionOutput>(out: T): T {
    this.assertValid();
    return readRawQuatInto(this.bodyInterface.GetRotation(this.rawId), out);
  }

  linearVelocity(): Vector3 {
    this.assertValid();
    return readRawVec3(this.bodyInterface.GetLinearVelocity(this.rawId));
  }

  linearVelocityInto<T extends Vector3Output>(out: T): T {
    this.assertValid();
    return readRawVec3Into(this.bodyInterface.GetLinearVelocity(this.rawId), out);
  }

  angularVelocity(): Vector3 {
    this.assertValid();
    return readRawVec3(this.bodyInterface.GetAngularVelocity(this.rawId));
  }

  angularVelocityInto<T extends Vector3Output>(out: T): T {
    this.assertValid();
    return readRawVec3Into(this.bodyInterface.GetAngularVelocity(this.rawId), out);
  }

  pointVelocity(point: Vector3Input): Vector3 {
    this.assertValid();
    const raw = this.world.runtime.raw as RawJolt;
    return this.world.runtime.withScope((scope) => {
      return readRawVec3(this.bodyInterface.GetPointVelocity(this.rawId, intoRawRVec3(raw, scope, point)));
    });
  }

  pointVelocityInto<T extends Vector3Output>(point: Vector3Input, out: T): T {
    this.assertValid();
    const raw = this.world.runtime.raw as RawJolt;
    return this.world.runtime.withScope((scope) => {
      return readRawVec3Into(this.bodyInterface.GetPointVelocity(this.rawId, intoRawRVec3(raw, scope, point)), out);
    });
  }

  mass(): number {
    this.assertValid();
    const motionProperties = this.rawBody.GetMotionProperties?.();
    if (!motionProperties) {
      return Infinity;
    }
    const inverseMass = motionProperties.GetInverseMass();
    return inverseMass > 0 ? 1 / inverseMass : Infinity;
  }

  motionType(): BodyType {
    this.assertValid();
    return fromMotionType(this.world.runtime.raw as RawJolt, this.bodyInterface.GetMotionType(this.rawId));
  }

  friction(): number {
    this.assertValid();
    return this.bodyInterface.GetFriction(this.rawId);
  }

  setFriction(friction: number): void {
    this.assertValid();
    this.bodyInterface.SetFriction(this.rawId, friction);
  }

  gravityFactor(): number {
    this.assertValid();
    return this.bodyInterface.GetGravityFactor(this.rawId);
  }

  setGravityFactor(factor: number): void {
    this.assertValid();
    this.bodyInterface.SetGravityFactor(this.rawId, factor);
  }

  allowSleeping(): boolean {
    this.assertValid();
    return this.rawBody.GetAllowSleeping();
  }

  setAllowSleeping(allow: boolean): void {
    this.assertValid();
    this.rawBody.SetAllowSleeping(allow);
    if (!allow) this.wakeUp();
  }

  isSensor(): boolean {
    this.assertValid();
    return this.bodyInterface.IsSensor(this.rawId);
  }

  isActive(): boolean {
    this.assertValid();
    return this.bodyInterface.IsActive(this.rawId);
  }

  wakeUp(): void {
    this.assertValid();
    this.bodyInterface.ActivateBody(this.rawId);
  }

  sleep(): void {
    this.assertValid();
    this.bodyInterface.DeactivateBody(this.rawId);
  }

  setTranslation(position: Vector3Input, options: BodyTransformOptions = {}): void {
    this.assertValid();
    const value = readVector3Components(position, "position", scratchVectorA);
    this.bodyHelpers.SetPosition(
      this.bodyInterface,
      this.rawId,
      value.x,
      value.y,
      value.z,
      toActivation(this.world.runtime.raw as RawJolt, options.activate)
    );
  }

  setRotation(rotation: QuaternionInput, options: BodyTransformOptions = {}): void {
    this.assertValid();
    const value = readQuaternionComponents(rotation, "rotation", scratchQuaternion);
    this.bodyHelpers.SetRotation(
      this.bodyInterface,
      this.rawId,
      value.x,
      value.y,
      value.z,
      value.w,
      toActivation(this.world.runtime.raw as RawJolt, options.activate)
    );
  }

  setTransform(position: Vector3Input, rotation: QuaternionInput, options: BodyTransformOptions = {}): void {
    this.assertValid();
    const positionValue = readVector3Components(position, "position", scratchVectorA);
    const rotationValue = readQuaternionComponents(rotation, "rotation", scratchQuaternion);
    this.bodyHelpers.SetPositionAndRotation(
      this.bodyInterface,
      this.rawId,
      positionValue.x,
      positionValue.y,
      positionValue.z,
      rotationValue.x,
      rotationValue.y,
      rotationValue.z,
      rotationValue.w,
      toActivation(this.world.runtime.raw as RawJolt, options.activate)
    );
  }

  // Kinematic move: velocity is derived so the body arrives at the target
  // transform after deltaTime, pushing dynamic bodies properly on the way —
  // unlike setTransform, which teleports. The standard way to drive moving
  // platforms and sweepers.
  moveKinematic(position: Vector3Input, rotation: QuaternionInput, deltaTime: number): void {
    this.assertValid();
    const raw = this.world.runtime.raw;
    this.world.runtime.withScope((scope) => {
      this.bodyInterface.MoveKinematic(
        this.rawId,
        intoRawRVec3(raw, scope, position),
        intoRawQuat(raw, scope, rotation),
        deltaTime
      );
    });
  }

  setLinearVelocity(velocity: Vector3Input): void;
  setLinearVelocity(x: number, y: number, z: number): void;
  setLinearVelocity(velocityOrX: Vector3Input | number, y?: number, z?: number): void {
    this.assertValid();
    const value = readVectorArgComponents(velocityOrX, y, z, "linearVelocity", scratchVectorA);
    this.bodyHelpers.SetLinearVelocity(this.bodyInterface, this.rawId, value.x, value.y, value.z);
  }

  setAngularVelocity(velocity: Vector3Input): void;
  setAngularVelocity(x: number, y: number, z: number): void;
  setAngularVelocity(velocityOrX: Vector3Input | number, y?: number, z?: number): void {
    this.assertValid();
    const value = readVectorArgComponents(velocityOrX, y, z, "angularVelocity", scratchVectorA);
    this.bodyHelpers.SetAngularVelocity(this.bodyInterface, this.rawId, value.x, value.y, value.z);
  }

  applyImpulse(x: number, y: number, z: number): void;
  applyImpulse(impulse: Vector3Input, point?: Vector3Input): void;
  applyImpulse(impulseOrX: Vector3Input | number, pointOrY?: Vector3Input | number, z?: number): void {
    this.assertValid();
    if (typeof impulseOrX !== "number" && typeof pointOrY === "number") {
      throw new TypeError("point must be a vector object or array.");
    }

    const y = typeof pointOrY === "number" ? pointOrY : undefined;
    let point: Vector3Input | undefined;
    if (typeof impulseOrX !== "number") {
      point = pointOrY as Vector3Input | undefined;
    }

    const value = readVectorArgComponents(impulseOrX, y, z, "impulse", scratchVectorA);
    if (point) {
      const pointValue = readVector3Components(point, "point", scratchVectorB);
      this.bodyHelpers.AddImpulseAtPoint(
        this.bodyInterface,
        this.rawId,
        value.x,
        value.y,
        value.z,
        pointValue.x,
        pointValue.y,
        pointValue.z
      );
    } else {
      this.bodyHelpers.AddImpulse(this.bodyInterface, this.rawId, value.x, value.y, value.z);
    }
  }

  applyAngularImpulse(impulse: Vector3Input): void;
  applyAngularImpulse(x: number, y: number, z: number): void;
  applyAngularImpulse(impulseOrX: Vector3Input | number, y?: number, z?: number): void {
    this.assertValid();
    const value = readVectorArgComponents(impulseOrX, y, z, "angularImpulse", scratchVectorA);
    this.bodyHelpers.AddAngularImpulse(this.bodyInterface, this.rawId, value.x, value.y, value.z);
  }

  addForce(force: Vector3Input, options?: BodyTransformOptions, point?: Vector3Input): void;
  addForce(x: number, y: number, z: number, options?: BodyTransformOptions): void;
  addForce(
    forceOrX: Vector3Input | number,
    optionsOrY: BodyTransformOptions | number = {},
    pointOrZ?: Vector3Input | number,
    maybeOptions: BodyTransformOptions = {}
  ): void {
    this.assertValid();
    const y = typeof optionsOrY === "number" ? optionsOrY : undefined;
    const z = typeof pointOrZ === "number" ? pointOrZ : undefined;
    const options = typeof forceOrX === "number" || typeof optionsOrY === "number" ? maybeOptions : optionsOrY;
    const point = typeof forceOrX === "number" || typeof pointOrZ === "number" ? undefined : pointOrZ;
    const value = readVectorArgComponents(forceOrX, y, z, "force", scratchVectorA);
    const activation = toActivation(this.world.runtime.raw as RawJolt, options.activate);

    if (point) {
      const pointValue = readVector3Components(point, "point", scratchVectorB);
      this.bodyHelpers.AddForceAtPoint(
        this.bodyInterface,
        this.rawId,
        value.x,
        value.y,
        value.z,
        pointValue.x,
        pointValue.y,
        pointValue.z,
        activation
      );
    } else {
      this.bodyHelpers.AddForce(this.bodyInterface, this.rawId, value.x, value.y, value.z, activation);
    }
  }

  addTorque(torque: Vector3Input, options?: BodyTransformOptions): void;
  addTorque(x: number, y: number, z: number, options?: BodyTransformOptions): void;
  addTorque(
    torqueOrX: Vector3Input | number,
    yOrOptions?: number | BodyTransformOptions,
    z?: number,
    maybeOptions: BodyTransformOptions = {}
  ): void {
    this.assertValid();
    const options = typeof torqueOrX === "number" ? maybeOptions : (yOrOptions as BodyTransformOptions | undefined) ?? {};
    const y = typeof yOrOptions === "number" ? yOrOptions : undefined;
    const value = readVectorArgComponents(torqueOrX, y, z, "torque", scratchVectorA);
    this.bodyHelpers.AddTorque(
      this.bodyInterface,
      this.rawId,
      value.x,
      value.y,
      value.z,
      toActivation(this.world.runtime.raw as RawJolt, options.activate)
    );
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
    const build = options.build ?? "wasm-compat";
    return new JoltRuntime(options.raw, build, { ...featuresForBuild(build), ...options.features });
  }

  const loadOptions: {
    build?: JoltBuild;
    locateFile?: (path: string, prefix: string) => string;
    wasmUrl?: string | UrlLike;
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
  options: CreateBodyOptions,
  rawShape: RawShape
): void {
  if (options.friction !== undefined) {
    settings.mFriction = options.friction;
  }
  if (options.restitution !== undefined) {
    settings.mRestitution = options.restitution;
  }
  if (options.massProperties !== undefined && (options.mass !== undefined || options.density !== undefined)) {
    throw new TypeError("body massProperties cannot be combined with mass or density.");
  }
  if (options.massProperties !== undefined) {
    applyMassPropertiesOverride(rawModule as RawJolt, scope, settings, options.massProperties);
  } else if (options.mass !== undefined || options.density !== undefined) {
    const mass = options.mass ?? massForDensity(rawShape, options.density ?? 1000);
    if (!Number.isFinite(mass) || mass <= 0) {
      throw new TypeError("body mass must be a positive finite number.");
    }
    settings.mOverrideMassProperties = (rawModule as RawJolt).EOverrideMassProperties_CalculateInertia;
    settings.mMassPropertiesOverride.mMass = mass;
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
  if (options.allowedDofs) {
    settings.mAllowedDOFs = toAllowedDofs(rawModule as RawJolt, options.allowedDofs);
  }
}

function massForDensity(rawShape: RawShape, density: number): number {
  if (!Number.isFinite(density) || density <= 0) {
    throw new TypeError("body density must be a positive finite number.");
  }
  const massProperties = rawShape.GetMassProperties?.();
  const defaultMass = massProperties?.mMass;
  if (typeof defaultMass !== "number" || !Number.isFinite(defaultMass) || defaultMass <= 0) {
    throw new Error("Shape does not provide mass properties; pass an explicit body mass instead.");
  }
  return defaultMass * (density / 1000);
}

function applyMassPropertiesOverride(
  raw: RawJolt,
  scope: NativeScope,
  settings: Record<string, any>,
  massProperties: MassPropertiesInput
): void {
  if (!Number.isFinite(massProperties.mass) || massProperties.mass <= 0) {
    throw new TypeError("body massProperties.mass must be a positive finite number.");
  }

  const inertia = readMatrix3Components(massProperties.inertia, "massProperties.inertia");
  settings.mOverrideMassProperties = raw.EOverrideMassProperties_MassAndInertiaProvided;
  settings.mMassPropertiesOverride.mMass = massProperties.mass;

  const inertiaMatrix = scope.own(new raw.Mat44());
  inertiaMatrix.SetColumn3(0, scope.own(new raw.Vec3(inertia.xx, inertia.yx, inertia.zx)));
  inertiaMatrix.SetColumn3(1, scope.own(new raw.Vec3(inertia.xy, inertia.yy, inertia.zy)));
  inertiaMatrix.SetColumn3(2, scope.own(new raw.Vec3(inertia.xz, inertia.yz, inertia.zz)));
  settings.mMassPropertiesOverride.mInertia = inertiaMatrix;
}

function readMatrix3Components(input: Matrix3Input, label: string): Matrix3Components {
  const components: Matrix3Components = Array.isArray(input) || ArrayBuffer.isView(input)
    ? (() => {
      const values = input as ArrayLike<number>;
      return {
        xx: numberAt(values, 0, label),
        xy: numberAt(values, 1, label),
        xz: numberAt(values, 2, label),
        yx: numberAt(values, 3, label),
        yy: numberAt(values, 4, label),
        yz: numberAt(values, 5, label),
        zx: numberAt(values, 6, label),
        zy: numberAt(values, 7, label),
        zz: numberAt(values, 8, label)
      };
    })()
    : input as Matrix3Components;

  for (const [key, value] of Object.entries(components)) {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${label}.${key} must be a finite number.`);
    }
  }
  return components;
}

function toAllowedDofs(raw: RawJolt, dofs: readonly AllowedDof[]): number {
  let mask = 0;
  for (const dof of dofs) {
    switch (dof) {
      case "translation-x":
        mask |= raw.EAllowedDOFs_TranslationX as number;
        break;
      case "translation-y":
        mask |= raw.EAllowedDOFs_TranslationY as number;
        break;
      case "translation-z":
        mask |= raw.EAllowedDOFs_TranslationZ as number;
        break;
      case "rotation-x":
        mask |= raw.EAllowedDOFs_RotationX as number;
        break;
      case "rotation-y":
        mask |= raw.EAllowedDOFs_RotationY as number;
        break;
      case "rotation-z":
        mask |= raw.EAllowedDOFs_RotationZ as number;
        break;
    }
  }
  return mask;
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

function fromMotionType(raw: RawJolt, type: number): BodyType {
  if (type === raw.EMotionType_Static) {
    return "static";
  }
  if (type === raw.EMotionType_Kinematic) {
    return "kinematic";
  }
  return "dynamic";
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

function debugColorFor(body: Body, colors: DebugRenderColors): DebugColor {
  if (body.isSensor()) {
    return colors.sensor;
  }
  switch (body.motionType()) {
    case "static":
      return colors.static;
    case "kinematic":
      return colors.kinematic;
    default:
      return body.isActive() ? colors.dynamic : colors.sleeping;
  }
}

function queryHitAllowed(bodyId: number, body: Body | undefined, options: QueryOptions): boolean {
  if (options.excludeBody && body === options.excludeBody) {
    return false;
  }
  if (!options.includeSensors && body?.isSensor()) {
    return false;
  }
  return options.filter?.({ bodyId, body }) ?? true;
}

function readRayHitNormal(body: Body | undefined, hit: RawValue, point: Vector3, direction: Vector3): Vector3 {
  if (!body) {
    return { x: 0, y: 0, z: 0 };
  }

  const normal = body.world.runtime.withScope((scope) => {
    return readRawVec3(
      body.rawUnsafe().GetWorldSpaceSurfaceNormal(
        hit.get_mSubShapeID2(),
        scope.own(new (body.world.runtime.raw as RawJolt).RVec3(point.x, point.y, point.z))
      )
    );
  });
  return faceAgainstDirection(normalizeVector(normal), direction);
}

function readShapeHitNormal(body: Body | undefined, hit: RawValue, point: Vector3, direction: Vector3): Vector3 {
  if (body) {
    const normal = body.world.runtime.withScope((scope) => {
      return readRawVec3(
        body.rawUnsafe().GetWorldSpaceSurfaceNormal(
          hit.get_mSubShapeID2(),
          scope.own(new (body.world.runtime.raw as RawJolt).RVec3(point.x, point.y, point.z))
        )
      );
    });
    return faceAgainstDirection(normalizeVector(normal), direction);
  }

  const normal = normalizeVector(readRawVec3(hit.get_mPenetrationAxis()));
  normal.x = -normal.x;
  normal.y = -normal.y;
  normal.z = -normal.z;
  return faceAgainstDirection(normal, direction);
}

function faceAgainstDirection(normal: Vector3, direction: Vector3): Vector3 {
  if (dot(normal, direction) > 0) {
    normal.x = -normal.x;
    normal.y = -normal.y;
    normal.z = -normal.z;
  }
  return normal;
}

function normalizeVector(vector: Vector3): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length <= 1e-12) {
    return { x: 0, y: 0, z: 0 };
  }
  vector.x /= length;
  vector.y /= length;
  vector.z /= length;
  return vector;
}

function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
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

function numberAt(input: ArrayLike<number>, index: number, label: string): number {
  const value = input[index];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label}[${index}] must be a finite number.`);
  }
  return value;
}

function readVectorArgComponents<T extends { x: number; y: number; z: number }>(
  valueOrX: Vector3Input | number,
  y: number | undefined,
  z: number | undefined,
  label: string,
  out: T
): T {
  if (typeof valueOrX !== "number") {
    return readVector3Components(valueOrX, label, out);
  }

  if (!Number.isFinite(valueOrX) || typeof y !== "number" || !Number.isFinite(y) || typeof z !== "number" || !Number.isFinite(z)) {
    throw new TypeError(`${label} requires finite x, y, and z numbers.`);
  }

  out.x = valueOrX;
  out.y = y;
  out.z = z;
  return out;
}
