// A small three.js stage that renders a live jolt-ts simulation.
//
// The core idea: `spawn()` creates a physics `Body` and a matching three.js
// mesh in one call, then the render loop copies each body's transform onto its
// mesh every frame. Shapes declared with jolt-ts' `Shape.*` descriptors are
// mapped to three.js geometry, so a demo author only describes the physics and
// gets the visuals for free.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";
import {
  Body,
  BodyDesc,
  Shape,
  World,
  type CreateBodyOptions,
  type JoltRuntime,
  type ShapeInput,
  type Vector3Input,
  type WorldCreateOptions,
} from "jolt-ts";

export interface DemoView {
  /** Camera position in world space. */
  readonly position?: [number, number, number];
  /** Point the camera orbits around and looks at. */
  readonly target?: [number, number, number];
}

export interface DemoModule {
  /** Runs once per world build; may return a cleanup function. */
  default: DemoSetup;
  /** Extra `World.create` options (gravity, layers, maxBodies, …). */
  worldOptions?: Partial<WorldCreateOptions>;
  /** Initial camera framing. */
  view?: DemoView;
}

export type DemoSetup = (harness: Harness) => void | (() => void);

export interface SpawnOptions {
  readonly color?: number | string;
  readonly opacity?: number;
  readonly metalness?: number;
  readonly roughness?: number;
  readonly emissive?: number | string;
  readonly wireframe?: boolean;
  readonly flatShading?: boolean;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly visible?: boolean;
  /** Supply geometry directly when spawning from a reused `ShapeResource`. */
  readonly geometry?: THREE.BufferGeometry;
}

export interface SpawnResult {
  readonly body: Body;
  readonly mesh: THREE.Object3D;
}

export interface GroundOptions {
  readonly size?: number;
  readonly y?: number;
  readonly color?: number;
  readonly grid?: boolean;
  readonly layer?: string | number;
  readonly friction?: number;
  readonly restitution?: number;
}

export interface PointerRay {
  readonly origin: [number, number, number];
  readonly direction: [number, number, number];
}

/** Public surface handed to each demo's `setup(harness)`. */
export interface Harness {
  readonly THREE: typeof THREE;
  readonly runtime: JoltRuntime;
  readonly world: World;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  spawn(desc: CreateBodyOptions | BodyDesc, opts?: SpawnOptions): SpawnResult;
  /** Remove a spawned body and its mesh from the world and scene. */
  remove(target: Body | SpawnResult): void;
  track(body: Body, object: THREE.Object3D): void;
  add(object: THREE.Object3D): void;
  ground(opts?: GroundOptions): Body;
  view(position: [number, number, number], target?: [number, number, number]): void;
  onStep(fn: (dt: number, frame: number) => void): void;
  onFrame(fn: (dt: number) => void): void;
  onPointerDown(fn: (event: PointerEvent) => void): void;
  /** Pick the nearest spawned body under a pointer event. */
  pick(event: PointerEvent): { body: Body; mesh: THREE.Object3D; point: THREE.Vector3 } | null;
  /** A world-space ray from the camera through a pointer event (length = `distance`). */
  pointerRay(event: PointerEvent, distance?: number): PointerRay;
}

const DYNAMIC_PALETTE = [
  0x4f7cff, 0x6ee7f0, 0x8b5cf6, 0xf472b6, 0xfbbf24, 0x34d399, 0xf87171, 0x38bdf8,
];

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;

export interface DemoHandle {
  reset(): Promise<void>;
  setPaused(paused: boolean): void;
  readonly paused: boolean;
  dispose(): void;
}

/**
 * Build a running demo bound to `canvas`. Awaits the shared runtime, wires up
 * three.js, then builds the world and runs the module's `setup`.
 */
export async function createDemo(
  canvas: HTMLCanvasElement,
  runtime: JoltRuntime,
  module: DemoModule,
): Promise<DemoHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a1120, 26, 62);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(...(module.view?.position ?? [7, 5.5, 10]));

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 80;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(...(module.view?.target ?? [0, 1.5, 0]));

  addLights(scene);

  const raycaster = new THREE.Raycaster();
  const scratchP: [number, number, number] = [0, 0, 0];
  const scratchQ: [number, number, number, number] = [0, 0, 0, 1];

  let world: World;
  let paletteIndex = 0;
  let tracked: Array<{ body: Body; object: THREE.Object3D }> = [];
  let owned: THREE.Object3D[] = [];
  let stepCallbacks: Array<(dt: number, frame: number) => void> = [];
  let frameCallbacks: Array<(dt: number) => void> = [];
  let pointerCallbacks: Array<(event: PointerEvent) => void> = [];
  let cleanup: (() => void) | void;
  let frame = 0;

  const facade: Harness = {
    THREE,
    runtime,
    get world() {
      return world;
    },
    scene,
    camera,
    renderer,
    controls,
    spawn(desc, opts = {}) {
      const options: CreateBodyOptions = desc instanceof BodyDesc ? desc.toOptions() : desc;
      const body = world.createBody(options);
      const material = materialFor(options, opts, () => DYNAMIC_PALETTE[paletteIndex++ % DYNAMIC_PALETTE.length]!);
      const object = opts.geometry
        ? new THREE.Mesh(opts.geometry, material)
        : buildObject(options.shape, material);
      const dynamicish = (options.type ?? "dynamic") !== "static";
      object.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = opts.castShadow ?? dynamicish;
          node.receiveShadow = opts.receiveShadow ?? !dynamicish;
        }
      });
      if (opts.visible === false) object.visible = false;
      object.userData.joltBody = body;
      scene.add(object);
      owned.push(object);
      const pair = { body, object };
      tracked.push(pair);
      syncPair(pair);
      return { body, mesh: object };
    },
    remove(target) {
      const body = target instanceof Body ? target : target.body;
      const index = tracked.findIndex((pair) => pair.body === body);
      if (index >= 0) {
        const { object } = tracked[index]!;
        scene.remove(object);
        disposeObject(object);
        const ownedIndex = owned.indexOf(object);
        if (ownedIndex >= 0) owned.splice(ownedIndex, 1);
        tracked.splice(index, 1);
      }
      if (body.valid) world.removeBody(body);
    },
    track(body, object) {
      object.userData.joltBody = body;
      tracked.push({ body, object });
    },
    add(object) {
      scene.add(object);
      owned.push(object);
    },
    ground(opts = {}) {
      return buildGround(facade, opts);
    },
    view(position, target = [0, 1.5, 0]) {
      camera.position.set(...position);
      controls.target.set(...target);
    },
    onStep(fn) {
      stepCallbacks.push(fn);
    },
    onFrame(fn) {
      frameCallbacks.push(fn);
    },
    onPointerDown(fn) {
      pointerCallbacks.push(fn);
    },
    pick(event) {
      setRaycaster(event);
      const meshes: THREE.Object3D[] = [];
      // Only pick visible bodies. three.js raycasts invisible meshes too, so
      // without this the ray can hit an invisible collider (e.g. a containment
      // wall) before the shape you clicked on.
      for (const { object } of tracked) if (object.visible) meshes.push(object);
      const hits = raycaster.intersectObjects(meshes, true);
      for (const hit of hits) {
        let node: THREE.Object3D | null = hit.object;
        while (node) {
          const body = node.userData.joltBody as Body | undefined;
          if (body) return { body, mesh: node, point: hit.point };
          node = node.parent;
        }
      }
      return null;
    },
    pointerRay(event, distance = 100) {
      setRaycaster(event);
      const o = raycaster.ray.origin;
      const d = raycaster.ray.direction;
      return {
        origin: [o.x, o.y, o.z],
        direction: [d.x * distance, d.y * distance, d.z * distance],
      };
    },
  };

  function setRaycaster(event: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
  }

  function syncPair(pair: { body: Body; object: THREE.Object3D }): void {
    if (!pair.body.valid) return;
    pair.body.translationInto(scratchP);
    pair.body.rotationInto(scratchQ);
    pair.object.position.set(scratchP[0], scratchP[1], scratchP[2]);
    pair.object.quaternion.set(scratchQ[0], scratchQ[1], scratchQ[2], scratchQ[3]);
  }

  async function build(): Promise<void> {
    // Pass the shared, preloaded runtime so every world reuses the one WASM
    // instance (and never triggers the library's fallback dynamic loader).
    world = await World.create({
      runtime,
      gravity: [0, -9.81, 0],
      deterministic: "cross-platform",
      ...module.worldOptions,
    });
    frame = 0;
    cleanup = module.default(facade);
  }

  function teardown(): void {
    if (typeof cleanup === "function") {
      try {
        cleanup();
      } catch {
        /* demo cleanup best-effort */
      }
    }
    cleanup = undefined;
    for (const object of owned) {
      scene.remove(object);
      disposeObject(object);
    }
    owned = [];
    tracked = [];
    stepCallbacks = [];
    frameCallbacks = [];
    pointerCallbacks = [];
    paletteIndex = 0;
    world?.dispose();
  }

  const onPointerDown = (event: PointerEvent) => {
    for (const fn of pointerCallbacks) fn(event);
  };
  canvas.addEventListener("pointerdown", onPointerDown);

  // Keep the drawing buffer matched to the element's CSS size.
  const resize = () => {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  let paused = false;
  let disposed = false;
  let raf = 0;
  let last = 0;
  let acc = 0;

  const loop = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;

    if (!paused && world && !world.disposed) {
      acc += dt;
      let steps = 0;
      while (acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
        world.step(FIXED_DT);
        for (const fn of stepCallbacks) fn(FIXED_DT, frame);
        frame += 1;
        acc -= FIXED_DT;
        steps += 1;
      }
      if (steps === MAX_SUBSTEPS) acc = 0;
    }

    for (const pair of tracked) syncPair(pair);
    for (const fn of frameCallbacks) fn(dt);
    controls.update();
    renderer.render(scene, camera);
  };

  await build();
  resize();
  raf = requestAnimationFrame(loop);

  return {
    get paused() {
      return paused;
    },
    setPaused(next) {
      paused = next;
      if (!next) last = 0;
    },
    async reset() {
      const wasPaused = paused;
      paused = true;
      teardown();
      await build();
      acc = 0;
      last = 0;
      paused = wasPaused;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      teardown();
      controls.dispose();
      renderer.dispose();
    },
  };
}

function addLights(scene: THREE.Scene): void {
  // Bright sky/ground hemisphere + ambient so self-shadowed faces in a pile
  // read as shaded rather than black. Only the key light casts shadows.
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x41506f, 2.8);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0x9fb2d8, 1.2);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(8, 14, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  const extent = 22;
  key.shadow.camera.left = -extent;
  key.shadow.camera.right = extent;
  key.shadow.camera.top = extent;
  key.shadow.camera.bottom = -extent;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x7fb0ff, 0.7);
  fill.position.set(-9, 6, -8);
  scene.add(fill);
}

function buildGround(harness: Harness, opts: GroundOptions): Body {
  const size = opts.size ?? 60;
  const y = opts.y ?? 0;
  const color = opts.color ?? 0x0e1730;
  const THREE_ = harness.THREE;

  const body = harness.world.createBody({
    type: "static",
    shape: Shape.box({ halfExtents: [size / 2, 0.5, size / 2] }),
    position: [0, y - 0.5, 0],
    layer: opts.layer ?? "static",
    friction: opts.friction ?? 0.8,
    restitution: opts.restitution ?? 0,
  });

  const plane = new THREE_.Mesh(
    new THREE_.PlaneGeometry(size, size),
    new THREE_.MeshStandardMaterial({ color, roughness: 0.96, metalness: 0.0 }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = y;
  plane.receiveShadow = true;
  harness.add(plane);

  if (opts.grid ?? true) {
    const grid = new THREE_.GridHelper(size, size, 0x36507f, 0x1b2b4d);
    grid.position.y = y + 0.002;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    harness.add(grid);
  }

  return body;
}

function materialFor(
  options: CreateBodyOptions,
  opts: SpawnOptions,
  nextPaletteColor: () => number,
): THREE.MeshStandardMaterial {
  const type = options.type ?? "dynamic";
  const isSensor = options.sensor === true;

  let color: number | string;
  if (opts.color !== undefined) color = opts.color;
  else if (isSensor) color = 0xf5d90a;
  else if (type === "static") color = 0x8a92a6;
  else if (type === "kinematic") color = 0x3a9bdc;
  else color = nextPaletteColor();

  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.05,
    roughness: opts.roughness ?? 0.55,
    flatShading: opts.flatShading ?? false,
    wireframe: opts.wireframe ?? false,
  });
  if (opts.emissive !== undefined) material.emissive = new THREE.Color(opts.emissive);
  const opacity = opts.opacity ?? (isSensor ? 0.32 : 1);
  if (opacity < 1) {
    material.transparent = true;
    material.opacity = opacity;
    material.depthWrite = false;
  }
  return material;
}

/** Map a jolt-ts shape descriptor to a three.js object (Mesh, or Group for compounds). */
function buildObject(shape: ShapeInput, material: THREE.Material): THREE.Object3D {
  if (!isDescriptor(shape)) {
    // A reused ShapeResource: no descriptor to introspect. Fall back to a marker
    // cube so the body is still visible; callers can pass `opts.geometry`.
    return new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
  }

  switch (shape.kind) {
    case "sphere":
      return new THREE.Mesh(new THREE.SphereGeometry(shape.radius, 32, 20), material);
    case "box": {
      const h = readVec3(shape.halfExtents);
      return new THREE.Mesh(new THREE.BoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2), material);
    }
    case "capsule":
      return new THREE.Mesh(
        new THREE.CapsuleGeometry(shape.radius, shape.halfHeight * 2, 12, 24),
        material,
      );
    case "cylinder":
      return new THREE.Mesh(
        new THREE.CylinderGeometry(shape.radius, shape.radius, shape.halfHeight * 2, 32),
        material,
      );
    case "convexHull": {
      const points = readPoints(shape.points).map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const geometry = new ConvexGeometry(points);
      return new THREE.Mesh(geometry, material);
    }
    case "mesh": {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(shape.vertices), 3));
      geometry.setIndex(Array.from(shape.indices, (index) => Number(index)));
      geometry.computeVertexNormals();
      return new THREE.Mesh(geometry, material);
    }
    case "compound": {
      const group = new THREE.Group();
      for (const child of shape.children) {
        const childObject = buildObject(child.shape, material);
        const p = readVec3(child.position ?? [0, 0, 0]);
        childObject.position.set(p[0], p[1], p[2]);
        if (child.rotation) {
          const q = readQuat(child.rotation);
          childObject.quaternion.set(q[0], q[1], q[2], q[3]);
        }
        group.add(childObject);
      }
      return group;
    }
    case "offsetCenterOfMass":
      // The COM offset shifts mass, not geometry; render the inner shape as-is.
      return buildObject(shape.shape, material);
  }
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      const material = node.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  });
}

function isDescriptor(shape: ShapeInput): shape is Extract<ShapeInput, { kind: string }> {
  return typeof shape === "object" && shape !== null && "kind" in shape;
}

function readVec3(input: Vector3Input): [number, number, number] {
  if (Array.isArray(input) || ArrayBuffer.isView(input)) {
    const array = input as ArrayLike<number>;
    return [Number(array[0]), Number(array[1]), Number(array[2])];
  }
  const v = input as { x: number; y: number; z: number };
  return [v.x, v.y, v.z];
}

function readQuat(input: unknown): [number, number, number, number] {
  if (Array.isArray(input) || ArrayBuffer.isView(input)) {
    const array = input as ArrayLike<number>;
    return [Number(array[0]), Number(array[1]), Number(array[2]), Number(array[3])];
  }
  const q = input as { x: number; y: number; z: number; w: number };
  return [q.x, q.y, q.z, q.w];
}

function readPoints(
  points: readonly Vector3Input[] | Float32Array | Float64Array,
): Array<[number, number, number]> {
  if (ArrayBuffer.isView(points)) {
    const flat = points as Float32Array | Float64Array;
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i + 3 <= flat.length; i += 3) {
      out.push([flat[i]!, flat[i + 1]!, flat[i + 2]!]);
    }
    return out;
  }
  return (points as readonly Vector3Input[]).map((point) => readVec3(point));
}
