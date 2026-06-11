import { NativeScope } from "./native.js";

export type JoltModule = Record<string, any> & {
  destroy(value: unknown): void;
};

export const joltWasmBuilds = [
  "wasm-compat",
  "wasm",
  "debug-wasm-compat",
  "wasm-compat-multithread",
  "wasm-multithread",
  "debug-wasm-compat-multithread"
] as const;

export type JoltWasmBuild = (typeof joltWasmBuilds)[number];

export type JoltBuild =
  | JoltWasmBuild
  | "asm";

export type ExternalWasmBuild =
  | "wasm"
  | "wasm-multithread";

export type EmbeddedWasmBuild =
  | "wasm-compat"
  | "debug-wasm-compat"
  | "wasm-compat-multithread"
  | "debug-wasm-compat-multithread";

// Structural stand-in for URL, so consumers without the DOM lib typecheck.
export type UrlLike = { toString(): string; readonly href: string };

export interface LoadJoltOptions {
  readonly build?: JoltBuild;
  readonly locateFile?: (path: string, prefix: string) => string;
  readonly wasmUrl?: string | UrlLike;
  readonly module?: Record<string, unknown>;
}

export interface JoltRuntimeFeatures {
  readonly native: boolean;
  readonly wasm: boolean;
  readonly embeddedWasm: boolean;
  readonly externalWasm: boolean;
  readonly multithreaded: boolean;
  readonly simd: boolean;
  readonly debug: boolean;
  readonly crossPlatformDeterministic?: boolean;
}

type JoltInitializer = (module?: Record<string, unknown>) => Promise<JoltModule>;

const nativeModuleFiles: Record<JoltBuild, string> = {
  "wasm-compat": "jolt-physics.wasm-compat.js",
  wasm: "jolt-physics.wasm.js",
  "debug-wasm-compat": "jolt-physics.debug.wasm-compat.js",
  asm: "jolt-physics.js",
  "wasm-compat-multithread": "jolt-physics.multithread.wasm-compat.js",
  "wasm-multithread": "jolt-physics.multithread.wasm.js",
  "debug-wasm-compat-multithread": "jolt-physics.debug.multithread.wasm-compat.js"
};

const nativeBuildFeatures: Record<JoltBuild, JoltRuntimeFeatures> = {
  "wasm-compat": buildFeatures({ embeddedWasm: true }),
  wasm: buildFeatures({ externalWasm: true }),
  "debug-wasm-compat": buildFeatures({ embeddedWasm: true, debug: true }),
  asm: buildFeatures({ wasm: false }),
  "wasm-compat-multithread": buildFeatures({ embeddedWasm: true, multithreaded: true, simd: true }),
  "wasm-multithread": buildFeatures({ externalWasm: true, multithreaded: true, simd: true }),
  "debug-wasm-compat-multithread": buildFeatures({
    embeddedWasm: true,
    multithreaded: true,
    simd: true,
    debug: true
  })
};

const externalWasmFiles: Record<ExternalWasmBuild, string> = {
  wasm: "jolt-physics.wasm.wasm",
  "wasm-multithread": "jolt-physics.multithread.wasm.wasm"
};

// The feature set of this package's own artifact for `build` — including
// cross-platform determinism, which the native build enables by default.
// Only valid as a description of the package's artifacts: a module obtained
// elsewhere (e.g. the upstream jolt-physics npm package) should not assume it.
export function featuresForBuild(build: JoltBuild): JoltRuntimeFeatures {
  return nativeBuildFeatures[build];
}

export function isWasmBuild(build: JoltBuild): build is JoltWasmBuild {
  return (joltWasmBuilds as readonly string[]).includes(build);
}

export function isExternalWasmBuild(build: JoltBuild): build is ExternalWasmBuild {
  return build === "wasm" || build === "wasm-multithread";
}

export function isEmbeddedWasmBuild(build: JoltBuild): build is EmbeddedWasmBuild {
  return isWasmBuild(build) && !isExternalWasmBuild(build);
}

export function wasmBinaryFileName(build: JoltBuild): string | undefined {
  return isExternalWasmBuild(build) ? externalWasmFiles[build] : undefined;
}

export class JoltRuntime {
  readonly raw: JoltModule;
  readonly build: JoltBuild;
  readonly features: JoltRuntimeFeatures;

  constructor(raw: JoltModule, build: JoltBuild, features: Partial<JoltRuntimeFeatures> = {}) {
    this.raw = raw;
    this.build = build;
    this.features = {
      native: false,
      wasm: isWasmBuild(build),
      embeddedWasm: isEmbeddedWasmBuild(build),
      externalWasm: isExternalWasmBuild(build),
      multithreaded: build.includes("multithread"),
      simd: build.includes("multithread"),
      debug: build.includes("debug"),
      ...features
    };
  }

  scope(): NativeScope {
    return new NativeScope(this);
  }

  withScope<T>(callback: (scope: NativeScope) => T): T {
    const scope = this.scope();
    try {
      return callback(scope);
    } finally {
      scope.dispose();
    }
  }

  destroyRaw(value: unknown): void {
    if (value != null) {
      this.raw.destroy(value);
    }
  }

  freeMemory(): number | undefined {
    const raw = this.raw as JoltModule & {
      JoltInterface?: { prototype?: { sGetFreeMemory?: () => number } };
    };

    return raw.JoltInterface?.prototype?.sGetFreeMemory?.();
  }
}

export async function loadJolt(options: LoadJoltOptions = {}): Promise<JoltRuntime> {
  const build = options.build ?? "wasm-compat";
  const init = await importNativeBuild(build);
  const moduleOptions: Record<string, unknown> = { ...(options.module ?? {}) };

  if (options.locateFile) {
    moduleOptions.locateFile = options.locateFile;
  } else if (options.wasmUrl && isExternalWasmBuild(build)) {
    const wasmUrl = String(options.wasmUrl);
    const wasmFile = wasmBinaryFileName(build);
    moduleOptions.locateFile = (path: string, prefix: string) => {
      return path === wasmFile ? wasmUrl : `${prefix}${path}`;
    };
  }

  const raw = await init(moduleOptions);
  return new JoltRuntime(raw, build, nativeBuildFeatures[build]);
}

function buildFeatures(input: {
  embeddedWasm?: boolean;
  externalWasm?: boolean;
  wasm?: boolean;
  multithreaded?: boolean;
  simd?: boolean;
  debug?: boolean;
}): JoltRuntimeFeatures {
  const wasm = input.wasm ?? true;
  const externalWasm = input.externalWasm ?? false;
  const embeddedWasm = input.embeddedWasm ?? (wasm && !externalWasm);

  return {
    native: true,
    wasm,
    embeddedWasm,
    externalWasm,
    multithreaded: input.multithreaded ?? false,
    simd: input.simd ?? false,
    debug: input.debug ?? false,
    crossPlatformDeterministic: true
  };
}

async function importNativeBuild(build: JoltBuild): Promise<JoltInitializer> {
  const fileName = nativeModuleFiles[build];
  const moduleUrl = new URL(`../native/jolt/dist/${fileName}`, import.meta.url).href;

  try {
    const imported = (await import(moduleUrl)) as { default?: JoltInitializer };
    if (typeof imported.default !== "function") {
      throw new TypeError(`Native Jolt build "${build}" did not export an initializer.`);
    }
    return imported.default;
  } catch (error) {
    throw new Error(
      `Native Jolt build "${build}" is missing or invalid at ${moduleUrl}. Run pnpm run build:native first.`,
      { cause: error }
    );
  }
}
