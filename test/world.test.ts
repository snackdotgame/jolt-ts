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

  it("replays the same deterministic simulation exactly", async () => {
    const runtime = await loadJolt();

    const firstRun = await runDeterministicScenario(runtime);
    const secondRun = await runDeterministicScenario(runtime);

    expect(secondRun).toEqual(firstRun);
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
