import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as api from "../src/index.js";
import { Body, JoltRuntime, loadJolt, Shape, World } from "../src/index.js";

describe("World", () => {
  it("creates and steps a basic dynamic body without raw lifetime calls", async () => {
    const world = await World.create({ gravity: [0, -9.81, 0] });

    try {
      world.createBody({
        type: "static",
        shape: Shape.box({ halfExtents: [10, 0.5, 10] }),
        position: [0, -0.5, 0],
        layer: "static"
      });

      const ball = world.createBody({
        type: "dynamic",
        shape: Shape.sphere({ radius: 0.5 }),
        position: [0, 5, 0],
        layer: "moving"
      });

      const before = ball.translation();
      world.step(1 / 60);
      const after = ball.translation();

      expect(before.y).toBeGreaterThan(after.y);
      expect(world.bodyCount).toBe(2);
    } finally {
      world.dispose();
    }
  });

  it("creates bodies from fluent descriptors", async () => {
    const world = await World.create();

    try {
      const body = world.createBody(
        Body.dynamic()
          .shape(Shape.sphere(0.5))
          .translation(0, 3, 0)
          .layer("moving")
          .restitution(0.25)
          .linearVelocity(0, 0, 0)
      );

      expect(body.translation()).toEqual({ x: 0, y: 3, z: 0 });
      expect(body.userData).toBeUndefined();
    } finally {
      world.dispose();
    }
  });

  it("can read transforms and velocities into caller-owned arrays", async () => {
    const world = await World.create();

    try {
      const body = world.createBody(
        Body.dynamic()
          .shape(Shape.sphere(0.5))
          .translation(1, 2, 3)
          .layer("moving")
          .linearVelocity(0.25, -0.5, 0.75)
          .angularVelocity(0.1, 0.2, 0.3)
      );

      const position = new Float32Array(3);
      const rotation = new Float32Array(4);
      const gravity = new Float32Array(3);
      const linearVelocity = [0, 0, 0] as [number, number, number];
      const angularVelocity = { x: 0, y: 0, z: 0 };
      const pointVelocity = { x: 0, y: 0, z: 0 };

      expect(world.gravityInto(gravity)).toBe(gravity);
      expect(gravity[0]).toBe(0);
      expect(gravity[1]).toBeCloseTo(-9.81);
      expect(gravity[2]).toBe(0);
      expect(body.translationInto(position)).toBe(position);
      expect(Array.from(position)).toEqual([1, 2, 3]);
      expect(body.rotationInto(rotation)).toBe(rotation);
      expect(rotation[3]).toBe(1);
      expect(body.linearVelocityInto(linearVelocity)).toBe(linearVelocity);
      expect(linearVelocity[0]).toBeCloseTo(0.25);
      expect(linearVelocity[1]).toBeCloseTo(-0.5);
      expect(linearVelocity[2]).toBeCloseTo(0.75);
      expect(body.angularVelocityInto(angularVelocity)).toBe(angularVelocity);
      expect(angularVelocity.x).toBeCloseTo(0.1);
      expect(angularVelocity.y).toBeCloseTo(0.2);
      expect(angularVelocity.z).toBeCloseTo(0.3);
      const pointVelocityValue = body.pointVelocity([2, 2, 3]);
      expect(pointVelocityValue.x).toBeCloseTo(0.25);
      expect(pointVelocityValue.y).toBeCloseTo(-0.2);
      expect(pointVelocityValue.z).toBeCloseTo(0.55);
      expect(body.pointVelocityInto([2, 2, 3], pointVelocity)).toBe(pointVelocity);
      expect(pointVelocity.x).toBeCloseTo(0.25);
      expect(pointVelocity.y).toBeCloseTo(-0.2);
      expect(pointVelocity.z).toBeCloseTo(0.55);
    } finally {
      world.dispose();
    }
  });

  it("uses numeric hot-path body operations without JS-owned native vector temporaries", async () => {
    const world = await World.create();

    try {
      const body = world.createBody(
        Body.dynamic()
          .shape(Shape.sphere(0.5))
          .translation(0, 2, 0)
          .layer("moving")
      );

      body.setLinearVelocity(1, 2, 3);
      body.setAngularVelocity(0.1, 0.2, 0.3);
      body.applyImpulse(0.05, 0, 0);
      body.applyAngularImpulse(0.4, 0.5, 0.6);
      body.addForce(0, 1, 0);
      body.addTorque(0.7, 0.8, 0.9);

      expect(body.linearVelocity().x).toBeGreaterThan(1);
      expect(body.linearVelocity().y).toBe(2);
      expect(body.linearVelocity().z).toBe(3);
      expect(body.angularVelocity().x).toBeGreaterThan(0.1);
    } finally {
      world.dispose();
    }
  });

  it("uses linear-cast motion quality to stop fast projectiles at thin colliders", async () => {
    const world = await World.create({ gravity: [0, 0, 0], deterministic: "cross-platform" });

    try {
      world.createBody({
        type: "static",
        shape: Shape.box({ halfExtents: [0.025, 2, 2] }),
        position: [0, 0, 0],
        layer: "static"
      });
      const projectile = world.createBody(
        Body.dynamic()
          .shape(Shape.sphere(0.05))
          .translation(-2, 0, 0)
          .linearVelocity(200, 0, 0)
          .motionQuality("linearCast")
          .layer("moving")
      );

      world.step(1 / 60);

      expect(projectile.translation().x).toBeLessThan(0);
      expect(projectile.translation().x).toBeGreaterThan(-0.2);
    } finally {
      world.dispose();
    }
  });

  it("returns normals and filtered hits from world queries", async () => {
    const world = await World.create({ gravity: [0, -9.81, 0] });

    try {
      const floor = world.createBody({
        type: "static",
        shape: Shape.box({ halfExtents: [10, 0.5, 10] }),
        position: [0, -0.5, 0],
        friction: 0.75,
        layer: "static"
      });
      const ignored = world.createBody({
        type: "dynamic",
        shape: Shape.sphere(0.25),
        position: [0, 1, 0],
        layer: "moving"
      });

      const rayHit = world.castRay([0, 2, 0], [0, -5, 0], { excludeBody: ignored });
      expect(rayHit?.body).toBe(floor);
      expect(rayHit?.point.y).toBeCloseTo(0);
      expect(rayHit?.normal).toEqual({ x: 0, y: 1, z: 0 });

      const shapeHit = world.castShape(Shape.sphere(0.25), [0, 2, 0], undefined, [0, -3, 0], {
        excludeBody: ignored
      });
      expect(shapeHit?.body).toBe(floor);
      expect(shapeHit?.contactPointOnBody.y).toBeCloseTo(0);
      expect(shapeHit?.normal.y).toBeGreaterThan(0.99);
      expect(shapeHit?.fraction).toBeCloseTo(1.75 / 3, 3);
    } finally {
      world.dispose();
    }
  });

  it("exposes body metadata needed by controller code", async () => {
    const world = await World.create();

    try {
      const body = world.createBody(
        Body.dynamic()
          .shape(Shape.sphere(0.5))
          .translation(0, 2, 0)
          .layer("moving")
          .friction(0.35)
          .gravityFactor(0.5)
      );

      expect(body.mass()).toBeGreaterThan(0);
      expect(body.motionType()).toBe("dynamic");
      expect(body.friction()).toBeCloseTo(0.35);
      expect(body.gravityFactor()).toBeCloseTo(0.5);
      expect(body.allowSleeping()).toBe(true);

      body.setGravityFactor(0);
      body.setFriction(0.8);
      body.setAllowSleeping(false);
      expect(body.gravityFactor()).toBe(0);
      expect(body.friction()).toBeCloseTo(0.8);
      expect(body.allowSleeping()).toBe(false);

      body.setAllowSleeping(true);
      expect(body.allowSleeping()).toBe(true);
    } finally {
      world.dispose();
    }
  });

  it("can override dynamic body mass through density or explicit mass", async () => {
    const world = await World.create();

    try {
      const defaultBody = world.createBody({
        type: "dynamic",
        shape: Shape.box([1, 0.5, 2])
      });
      const densityBody = world.createBody({
        type: "dynamic",
        shape: Shape.box([1, 0.5, 2]),
        density: 200
      });
      const massBody = world.createBody({
        type: "dynamic",
        shape: Shape.box([1, 0.5, 2]),
        mass: 42
      });
      const massPropertiesBody = world.createBody({
        type: "dynamic",
        shape: Shape.box([1, 0.5, 2]),
        massProperties: {
          mass: 24,
          inertia: [10, 0, 0, 0, 12, 0, 0, 0, 14]
        }
      });
      const offsetComBody = world.createBody({
        type: "static",
        shape: Shape.offsetCenterOfMass(Shape.box([1, 1, 1]), [0, 1, 0]),
        position: [0, 0, 0]
      });

      expect(densityBody.mass()).toBeCloseTo(defaultBody.mass() * 0.2, 2);
      expect(massBody.mass()).toBeCloseTo(42, 4);
      expect(massPropertiesBody.mass()).toBeCloseTo(24, 4);
      expect(offsetComBody.translation()).toEqual({ x: 0, y: 0, z: 0 });
      expect(offsetComBody.centerOfMassPosition()).toEqual({ x: 0, y: 1, z: 0 });
      expect(offsetComBody.centerOfMassPositionInto({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 1, z: 0 });
      expect(world.withRawBody(offsetComBody, (rawBody) => rawBody.GetCenterOfMassPosition().GetY())).toBeCloseTo(1);

      const offsetComHit = world.castRay([0, 3, 0], [0, -6, 0], { filter: ({ body }) => body === offsetComBody });
      expect(offsetComHit?.point.y).toBeCloseTo(1);
    } finally {
      world.dispose();
    }
  });

  it("supports static body descriptors", async () => {
    const world = await World.create();

    try {
      const body = world.createBody(
        Body.static()
          .shape(Shape.box([1, 1, 1]))
          .position([0, -1, 0])
          .layer("static")
      );

      expect(body.translation()).toEqual({ x: 0, y: -1, z: 0 });
    } finally {
      world.dispose();
    }
  });

  it("can enable deterministic stepping on a cross-platform deterministic build", async () => {
    const world = await World.create({ deterministic: "cross-platform" });

    try {
      expect(world.runtime.features.crossPlatformDeterministic).toBe(true);
      expect(world.deterministicSimulation()).toBe(true);
    } finally {
      world.dispose();
    }
  });

  it("rejects cross-platform deterministic mode for runtimes without deterministic build metadata", async () => {
    const runtime = await loadJolt();
    const unmarkedRuntime = new JoltRuntime(runtime.raw, runtime.build);

    await expect(World.create({ runtime: unmarkedRuntime, deterministic: "cross-platform" })).rejects.toThrow(
      /not known to be compiled with cross-platform deterministic support/
    );
  });

  it("assumes the package's build features for a pre-initialized raw module", async () => {
    const runtime = await loadJolt();
    const world = await World.create({ raw: runtime.raw, deterministic: "cross-platform" });

    try {
      expect(world.runtime.features.crossPlatformDeterministic).toBe(true);
      expect(world.deterministicSimulation()).toBe(true);
    } finally {
      world.dispose();
    }
  });

  it("lets features override the assumed build metadata for foreign raw modules", async () => {
    const runtime = await loadJolt();

    await expect(
      World.create({
        raw: runtime.raw,
        features: { crossPlatformDeterministic: false },
        deterministic: "cross-platform"
      })
    ).rejects.toThrow(/not known to be compiled with cross-platform deterministic support/);
  });

  it("replays the same deterministic simulation exactly", async () => {
    const runtime = await loadJolt();

    const firstRun = await runDeterministicScenario(runtime);
    const secondRun = await runDeterministicScenario(runtime);

    expect(secondRun).toEqual(firstRun);
  });

  it("produces identical per-frame state hashes for independent deterministic worlds", async () => {
    const runtime = await loadJolt();
    const first = await createSnapshotWorld(runtime);
    const second = await createSnapshotWorld(runtime);

    try {
      const firstTrace = runFrameRange(first, 0, 72);
      const secondTrace = runFrameRange(second, 0, 72);

      expect(secondTrace).toEqual(firstTrace);
      expect(new Set(firstTrace).size).toBeGreaterThan(1);
    } finally {
      first.world.dispose();
      second.world.dispose();
    }
  });

  it("continues deterministically after restoring saved state bytes", async () => {
    const runtime = await loadJolt();
    const source = await createSnapshotWorld(runtime);
    const replica = await createSnapshotWorld(runtime);

    try {
      runFrameRange(source, 0, 36);

      const state = source.world.saveState();
      expect(replica.world.restoreState(state)).toBe(true);
      expect(stateHash(replica.world)).toBe(stateHash(source.world));

      const sourceTrace = runFrameRange(source, 36, 84);
      const replicaTrace = runFrameRange(replica, 36, 84);

      expect(replicaTrace).toEqual(sourceTrace);
      expect(sampleSnapshotBodies(replica)).toEqual(sampleSnapshotBodies(source));
    } finally {
      source.world.dispose();
      replica.world.dispose();
    }
  });

  it("requires canonical ordering for order-sensitive deterministic inputs", async () => {
    const runtime = await loadJolt();
    const canonicalA = await createSnapshotWorld(runtime);
    const canonicalB = await createSnapshotWorld(runtime);
    const reversed = await createSnapshotWorld(runtime);

    try {
      runFrameRange(canonicalA, 0, 12, { order: "canonical" });
      runFrameRange(canonicalB, 0, 12, { order: "canonical" });
      runFrameRange(reversed, 0, 12, { order: "reversed" });

      expect(stateHash(canonicalB.world)).toBe(stateHash(canonicalA.world));
      expect(stateHash(reversed.world)).not.toBe(stateHash(canonicalA.world));
    } finally {
      canonicalA.world.dispose();
      canonicalB.world.dispose();
      reversed.world.dispose();
    }
  });

  it("late-joins from scene and state, replays in-flight inputs, then leads by half the RTT", async () => {
    const runtime = await loadJolt();
    const server = await createSnapshotWorld(runtime, { churnBodyIds: true });
    const clientWorld = await World.create({
      runtime,
      deterministic: "cross-platform",
      gravity: [0, -9.81, 0]
    });

    try {
      const syncFrame = 24;
      const deliveryFrame = 42;
      const halfRttFrames = 4;

      runFrameRange(server, 0, syncFrame);

      const ids = bodyIds(server);
      const scene = server.world.takeSceneSnapshot();
      const state = server.world.saveState();

      const serverInFlightTrace = runFrameRange(server, syncFrame, deliveryFrame);

      clientWorld.restoreSceneSnapshot(scene);
      expect(clientWorld.restoreState(state)).toBe(true);

      const client = bindSnapshotWorld(clientWorld, ids);
      const clientReplayTrace = runFrameRange(client, syncFrame, deliveryFrame);

      expect(clientReplayTrace).toEqual(serverInFlightTrace);
      expect(stateHash(client.world)).toBe(stateHash(server.world));

      const clientLeadTrace = runFrameRange(client, deliveryFrame, deliveryFrame + halfRttFrames);
      const serverLeadTrace = runFrameRange(server, deliveryFrame, deliveryFrame + halfRttFrames);

      expect(clientLeadTrace).toEqual(serverLeadTrace);
      expect(stateHash(client.world)).toBe(stateHash(server.world));
    } finally {
      server.world.dispose();
      clientWorld.dispose();
    }
  });

  it("rolls back and replays when a delayed remote input arrives", async () => {
    const runtime = await loadJolt();
    const server = await createSnapshotWorld(runtime);
    const client = await createSnapshotWorld(runtime);
    const savedClientStates = new Map<number, Uint8Array>();

    try {
      const rollbackFrame = DELAYED_REMOTE_INPUT_FRAME;
      const currentFrame = 58;

      for (let frame = 0; frame < currentFrame; frame += 1) {
        savedClientStates.set(frame, client.world.saveState());
        advanceFrame(server, frame, { includeDelayedRemoteInput: true });
        advanceFrame(client, frame, { includeDelayedRemoteInput: false });
      }

      expect(stateHash(client.world)).not.toBe(stateHash(server.world));

      const rollbackState = savedClientStates.get(rollbackFrame);
      expect(rollbackState).toBeDefined();
      expect(client.world.restoreState(rollbackState!)).toBe(true);

      for (let frame = rollbackFrame; frame < currentFrame; frame += 1) {
        advanceFrame(client, frame, { includeDelayedRemoteInput: true });
      }

      expect(stateHash(client.world)).toBe(stateHash(server.world));
      expect(sampleSnapshotBodies(client)).toEqual(sampleSnapshotBodies(server));
    } finally {
      server.world.dispose();
      client.world.dispose();
    }
  });

  it("uses authoritative SaveState bytes to correct a diverged client and replay later inputs", async () => {
    const runtime = await loadJolt();
    const server = await createSnapshotWorld(runtime);
    const client = await createSnapshotWorld(runtime);

    try {
      const correctionFrame = 30;
      const currentFrame = 62;

      for (let frame = 0; frame < correctionFrame; frame += 1) {
        advanceFrame(server, frame);
        advanceFrame(client, frame, { injectPredictionError: frame === 14 });
      }

      const authoritativeState = server.world.saveState();
      expect(stateHash(client.world)).not.toBe(stateHash(server.world));

      runFrameRange(server, correctionFrame, currentFrame);

      expect(client.world.restoreState(authoritativeState)).toBe(true);
      runFrameRange(client, correctionFrame, currentFrame);

      expect(stateHash(client.world)).toBe(stateHash(server.world));
      expect(sampleSnapshotBodies(client)).toEqual(sampleSnapshotBodies(server));
    } finally {
      server.world.dispose();
      client.world.dispose();
    }
  });

  it("resynchronizes topology changes with a scene snapshot before applying later state bytes", async () => {
    const runtime = await loadJolt();
    const server = await createSnapshotWorld(runtime);
    const clientWorld = await World.create({
      runtime,
      deterministic: "cross-platform",
      gravity: [0, -9.81, 0]
    });

    try {
      runFrameRange(server, 0, 18);

      const extra = server.world.createBody(
        Body.dynamic()
          .shape(Shape.box([0.3, 0.35, 0.25]))
          .translation(0.25, 7.25, 0.65)
          .layer("moving")
          .friction(0.55)
          .restitution(0.15)
          .linearVelocity(-0.15, 0.05, -0.2)
      );
      const ids = { ...bodyIds(server), extra: extra.id };

      runFrameRange(server, 18, 32);

      const scene = server.world.takeSceneSnapshot();
      const state = server.world.saveState();

      clientWorld.restoreSceneSnapshot(scene);
      expect(clientWorld.bodyCount).toBe(server.world.bodyCount);
      expect(clientWorld.getBody(ids.ball)).toBeDefined();
      expect(clientWorld.getBody(ids.box)).toBeDefined();
      expect(clientWorld.getBody(ids.extra)).toBeDefined();
      expect(clientWorld.restoreState(state)).toBe(true);
      expect(stateHash(clientWorld)).toBe(stateHash(server.world));
    } finally {
      server.world.dispose();
      clientWorld.dispose();
    }
  });

  it("restores SaveState bytes into an identical baseline world exactly", async () => {
    const runtime = await loadJolt();
    const source = await createSnapshotWorld(runtime);
    const replica = await createSnapshotWorld(runtime);

    try {
      const initialState = source.world.saveState();
      expect(replica.world.restoreState(initialState)).toBe(true);
      expect(bytesEqual(replica.world.saveState(), initialState)).toBe(true);

      for (let step = 0; step < 90; step += 1) {
        if (step === 10) {
          source.ball.applyImpulse([0.4, 1.2, -0.25]);
        }
        if (step === 22) {
          source.box.setLinearVelocity([-0.8, 0.1, 0.35]);
        }
        if (step === 38) {
          source.ball.setAngularVelocity([0.1, 0.8, -0.2]);
        }
        if (step % 17 === 0) {
          source.box.addForce([0.25, 0.15, -0.1]);
          source.ball.addTorque([0.02, -0.03, 0.01]);
        }
        source.world.step(1 / 60, 2);
      }

      source.ball.addForce([0.15, 0.2, -0.05]);
      source.box.addTorque([-0.02, 0.04, 0.03]);

      const sourceState = source.world.saveState();
      expect(replica.world.restoreState(sourceState)).toBe(true);

      expect(bytesEqual(replica.world.saveState(), sourceState)).toBe(true);
      expect(sampleSnapshotBodies(replica)).toEqual(sampleSnapshotBodies(source));

      source.world.step(1 / 60, 2);
      replica.world.step(1 / 60, 2);

      expect(bytesEqual(replica.world.saveState(), source.world.saveState())).toBe(true);
      expect(sampleSnapshotBodies(replica)).toEqual(sampleSnapshotBodies(source));
    } finally {
      source.world.dispose();
      replica.world.dispose();
    }
  });

  it("accepts native SaveState and RestoreState recorder, state, and filter parameters", async () => {
    const runtime = await loadJolt();
    const source = await createSnapshotWorld(runtime);
    const replica = await createSnapshotWorld(runtime);
    const recorder = source.world.createStateRecorder();
    const raw = runtime.raw as any;
    const filter = new raw.StateRecorderFilterJS();
    let shouldSaveBodyCalls = 0;

    filter.ShouldSaveBody = () => {
      shouldSaveBodyCalls += 1;
      return true;
    };
    filter.ShouldSaveConstraint = () => true;
    filter.ShouldSaveContact = () => true;
    filter.ShouldRestoreContact = () => true;

    try {
      source.world.saveState(recorder, "all", filter);

      expect(recorder.bytes().byteLength).toBeGreaterThan(0);
      expect(shouldSaveBodyCalls).toBeGreaterThan(0);
      expect(replica.world.restoreState(recorder, filter)).toBe(true);
      expect(bytesEqual(replica.world.saveState("all", filter), recorder.bytes())).toBe(true);
    } finally {
      runtime.destroyRaw(filter);
      recorder.dispose();
      source.world.dispose();
      replica.world.dispose();
    }
  });

  it("exposes Symbol.dispose for state recorders", async () => {
    const runtime = await loadJolt();
    const source = await createSnapshotWorld(runtime);
    const recorder = source.world.createStateRecorder();

    try {
      source.world.saveState(recorder);

      expect(recorder.bytes().byteLength).toBeGreaterThan(0);
      recorder[Symbol.dispose]();
      expect(() => recorder.bytes()).toThrow(/already disposed/);
    } finally {
      recorder.dispose();
      source.world.dispose();
    }
  });

  it("exposes no-copy recorder views for immediate hashing or transfer", async () => {
    const runtime = await loadJolt();
    const source = await createSnapshotWorld(runtime);
    const recorder = source.world.createStateRecorder();

    try {
      source.world.saveState(recorder);
      const view = recorder.view();
      const bytes = recorder.bytes();

      expect(view.byteLength).toBe(bytes.byteLength);
      expect(bytesEqual(view, bytes)).toBe(true);
      expect(view.buffer).not.toBe(bytes.buffer);

      const input = new Uint8Array(bytes);
      const inputRecorder = source.world.createStateRecorder(input);
      try {
        expect(inputRecorder.view().buffer).toBe(input.buffer);
      } finally {
        inputRecorder.dispose();
      }
    } finally {
      recorder.dispose();
      source.world.dispose();
    }
  });

  it("restores binary scene snapshots with preserved body IDs", async () => {
    const runtime = await loadJolt();
    const source = await createSnapshotWorld(runtime, { churnBodyIds: true });
    const replica = await World.create({
      runtime,
      deterministic: "cross-platform",
      gravity: [0, -9.81, 0]
    });

    try {
      const sceneState = source.world.takeSceneSnapshot();

      for (let step = 0; step < 45; step += 1) {
        if (step === 5) {
          source.ball.applyImpulse([0.3, 0.5, 0.1]);
        }
        if (step === 12) {
          source.box.addForce([-0.1, 0.25, 0.2]);
        }
        source.world.step(1 / 60, 2);
      }

      const joltState = source.world.saveState();

      replica.restoreSceneSnapshot(sceneState);
      expect(replica.bodyCount).toBe(source.world.bodyCount);
      expect(replica.getBody(source.ball.id)).toBeDefined();
      expect(replica.getBody(source.box.id)).toBeDefined();
      expect(replica.restoreState(joltState)).toBe(true);
      expect(bytesEqual(replica.saveState(), joltState)).toBe(true);

      source.world.step(1 / 60, 2);
      replica.step(1 / 60, 2);

      expect(bytesEqual(replica.saveState(), source.world.saveState())).toBe(true);
    } finally {
      source.world.dispose();
      replica.dispose();
    }
  });

  it("does not export a raw ShapeResource constructor", () => {
    expect("ShapeResource" in api).toBe(false);
    expect("intoRawVec3" in api).toBe(false);
  });

  it("releases world-owned native memory after disposal", async () => {
    const runtime = await loadJolt();
    const before = runtime.freeMemory();
    const world = await World.create({ runtime });

    const shape = world.shapes.create("box", Shape.box([1, 1, 1]));
    world.createBody({
      type: "dynamic",
      shape,
      position: [0, 1, 0]
    });
    world.step(1 / 60);
    world.dispose();

    expect(runtime.freeMemory()).toBe(before);
  });

  it("locks rotations via allowedDofs so a capsule cannot tip over", async () => {
    const world = await World.create({ gravity: [0, -20, 0] });

    try {
      world.createBody({
        type: "static",
        shape: Shape.box({ halfExtents: [10, 0.5, 10] }),
        position: [0, -0.5, 0],
        layer: "static"
      });
      const capsule = world.createBody(
        Body.dynamic()
          .shape(Shape.capsule({ halfHeight: 0.3, radius: 0.3 }))
          .translation(0, 0.6, 0)
          .lockRotations()
          .layer("moving")
      );

      // Shove it sideways off-center: an unlocked capsule would topple.
      capsule.applyImpulse({ x: 4, y: 0, z: 1 }, { x: 0, y: 1.1, z: 0 });
      for (let i = 0; i < 120; i++) world.step(1 / 60);

      const rot = capsule.rotation();
      expect(Math.abs(rot.x)).toBeLessThan(1e-6);
      expect(Math.abs(rot.z)).toBeLessThan(1e-6);
      expect(Math.abs(rot.w)).toBeCloseTo(1, 5);
    } finally {
      world.dispose();
    }
  });

  it("casts rays and reports the hit body, fraction, and point", async () => {
    const world = await World.create();

    try {
      const floor = world.createBody({
        type: "static",
        shape: Shape.box({ halfExtents: [10, 0.5, 10] }),
        position: [0, -0.5, 0],
        layer: "static"
      });
      const ledge = world.createBody({
        type: "static",
        shape: Shape.box({ halfExtents: [10, 0.25, 10] }),
        position: [0, 1.5, 0],
        layer: "static"
      });

      const hit = world.castRay([0.5, 2, 0.5], [0, -5, 0]);
      expect(hit).not.toBeNull();
      expect(hit!.body).toBe(ledge);
      expect(hit!.fraction).toBeCloseTo(0.05, 4); // 0.25m down out of 5m
      expect(hit!.point.y).toBeCloseTo(1.75, 4);

      const allHits = world.castRayAll([0.5, 2, 0.5], [0, -5, 0]);
      expect(allHits.map((rayHit) => rayHit.body)).toEqual([ledge, floor]);
      expect(allHits[0]!.point.y).toBeCloseTo(1.75, 4);
      expect(allHits[1]!.point.y).toBeCloseTo(0, 4);

      const filteredHits = world.castRayAll([0.5, 2, 0.5], [0, -5, 0], { excludeBody: ledge });
      expect(filteredHits.map((rayHit) => rayHit.body)).toEqual([floor]);

      expect(world.castRay([0.5, 2, 0.5], [0, 5, 0])).toBeNull();
      expect(world.castRayAll([0.5, 2, 0.5], [0, 5, 0])).toEqual([]);
      expect(world.castRay([50, 2, 50], [0, -5, 0])).toBeNull();
    } finally {
      world.dispose();
    }
  });

  it("moves kinematic bodies with moveKinematic, deriving their velocity", async () => {
    const world = await World.create();

    try {
      const platform = world.createBody({
        type: "kinematic",
        shape: Shape.box({ halfExtents: [1, 0.2, 1] }),
        position: [0, 0, 0],
        layer: "moving"
      });

      platform.moveKinematic([0.5, 0, 0], { x: 0, y: 0, z: 0, w: 1 }, 1 / 60);
      const vel = platform.linearVelocity();
      expect(vel.x).toBeCloseTo(0.5 * 60, 3);
      world.step(1 / 60);
      expect(platform.translation().x).toBeCloseTo(0.5, 3);
    } finally {
      world.dispose();
    }
  });
});

async function runDeterministicScenario(runtime: JoltRuntime) {
  const world = await World.create({
    runtime,
    deterministic: "cross-platform",
    gravity: [0, -9.81, 0]
  });

  try {
    world.createBody({
      type: "static",
      shape: Shape.box({ halfExtents: [8, 0.5, 8] }),
      position: [0, -0.5, 0],
      layer: "static"
    });

    const ball = world.createBody(
      Body.dynamic()
        .shape(Shape.sphere(0.5))
        .translation(-1, 4, 0)
        .layer("moving")
        .restitution(0.2)
        .linearVelocity(1.25, 0, 0.5)
        .angularVelocity(0, 0.2, 0)
    );

    const box = world.createBody(
      Body.dynamic()
        .shape(Shape.box([0.4, 0.4, 0.4]))
        .translation(1, 6, 0)
        .layer("moving")
        .linearVelocity(-0.75, 0, 0)
    );

    for (let step = 0; step < 120; step += 1) {
      world.step(1 / 60, 2);
    }

    return {
      ball: {
        translation: ball.translation(),
        rotation: ball.rotation(),
        linearVelocity: ball.linearVelocity(),
        angularVelocity: ball.angularVelocity()
      },
      box: {
        translation: box.translation(),
        rotation: box.rotation(),
        linearVelocity: box.linearVelocity(),
        angularVelocity: box.angularVelocity()
      }
    };
  } finally {
    world.dispose();
  }
}

async function createSnapshotWorld(runtime: JoltRuntime, options: { churnBodyIds?: boolean } = {}) {
  const world = await World.create({
    runtime,
    deterministic: "cross-platform",
    gravity: [0, -9.81, 0]
  });

  world.createBody({
    type: "static",
    shape: Shape.box({ halfExtents: [8, 0.5, 8] }),
    position: [0, -0.5, 0],
    layer: "static",
    friction: 0.9,
    restitution: 0.1
  });

  if (options.churnBodyIds) {
    const discarded = world.createBody(
      Body.dynamic()
        .shape(Shape.sphere(0.25))
        .translation(0, 2, 0)
        .layer("moving")
    );
    discarded.remove();
  }

  const ball = world.createBody(
    Body.dynamic()
      .shape(Shape.sphere(0.5))
      .translation(-1.25, 4, 0.2)
      .layer("moving")
      .friction(0.4)
      .restitution(0.35)
      .linearVelocity(1.1, 0.2, 0.35)
      .angularVelocity(0.15, 0.3, -0.1)
  );

  const box = world.createBody(
    Body.dynamic()
      .shape(Shape.box([0.45, 0.45, 0.45]))
      .translation(1.1, 5.5, -0.15)
      .layer("moving")
      .friction(0.7)
      .restitution(0.05)
      .linearVelocity(-0.65, 0, 0.2)
  );

  return { world, ball, box };
}

type SnapshotWorld = Awaited<ReturnType<typeof createSnapshotWorld>>;
type SnapshotBodyIds = ReturnType<typeof bodyIds>;
type ScriptedFrameOptions = {
  readonly includeDelayedRemoteInput?: boolean;
  readonly injectPredictionError?: boolean;
  readonly order?: "canonical" | "reversed";
};

const DELAYED_REMOTE_INPUT_FRAME = 21;

function sampleSnapshotBodies(snapshot: SnapshotWorld) {
  return {
    ball: sampleBody(snapshot.ball),
    box: sampleBody(snapshot.box)
  };
}

function sampleBody(body: Body) {
  return {
    translation: body.translation(),
    rotation: body.rotation(),
    linearVelocity: body.linearVelocity(),
    angularVelocity: body.angularVelocity()
  };
}

function runFrameRange(
  snapshot: SnapshotWorld,
  startFrame: number,
  endFrame: number,
  options: ScriptedFrameOptions = {}
): string[] {
  const hashes: string[] = [];

  for (let frame = startFrame; frame < endFrame; frame += 1) {
    advanceFrame(snapshot, frame, options);
    hashes.push(stateHash(snapshot.world));
  }

  return hashes;
}

function advanceFrame(snapshot: SnapshotWorld, frame: number, options: ScriptedFrameOptions = {}): void {
  applyScriptedFrameInputs(snapshot, frame, options);
  snapshot.world.step(1 / 60, 2);
}

function applyScriptedFrameInputs(snapshot: SnapshotWorld, frame: number, options: ScriptedFrameOptions): void {
  const actions: Array<() => void> = [];

  if (frame === 3) {
    actions.push(() => snapshot.ball.applyImpulse([0.2, 0.55, -0.12]));
  }
  if (frame === 7) {
    actions.push(() => snapshot.box.addTorque([0.015, -0.02, 0.01]));
  }
  if (frame === 11) {
    actions.push(() => snapshot.ball.setLinearVelocity([0.9, 0.35, 0.2]));
    actions.push(() => snapshot.ball.applyImpulse([0.35, -0.05, 0.12]));
  }
  if (frame === 17) {
    actions.push(() => snapshot.box.setAngularVelocity([-0.08, 0.18, 0.06]));
  }
  if (frame % 13 === 0) {
    actions.push(() => snapshot.ball.addForce([0.12, 0.04, -0.05]));
  }
  if (frame % 17 === 5) {
    actions.push(() => snapshot.box.addForce([-0.08, 0.09, 0.04]));
  }
  if (options.includeDelayedRemoteInput !== false && frame === DELAYED_REMOTE_INPUT_FRAME) {
    actions.push(() => snapshot.box.applyImpulse([-0.42, 0.7, 0.21]));
  }
  if (options.injectPredictionError) {
    actions.push(() => snapshot.ball.applyAngularImpulse([0.08, -0.04, 0.02]));
  }

  const orderedActions = options.order === "reversed" && frame === 11
    ? [...actions].reverse()
    : actions;

  for (const action of orderedActions) {
    action();
  }
}

function stateHash(world: World): string {
  return hashBytes(world.saveState());
}

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bodyIds(snapshot: SnapshotWorld) {
  return {
    ball: snapshot.ball.id,
    box: snapshot.box.id
  };
}

function bindSnapshotWorld(world: World, ids: SnapshotBodyIds): SnapshotWorld {
  const ball = world.getBody(ids.ball);
  const box = world.getBody(ids.box);

  if (!ball || !box) {
    throw new Error("Restored scene is missing expected deterministic test bodies.");
  }

  return { world, ball, box };
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}
