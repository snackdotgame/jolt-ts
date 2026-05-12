# jolt-ts native build

This directory vendors the Emscripten binding/build layer that `jolt-ts`
customizes for its own raw Jolt WASM modules. The package does not depend on the
published `jolt-physics` npm package.

The build fetches Jolt C++ directly from `jrouwe/JoltPhysics` at `v5.5.0` and
sets `CROSS_PLATFORM_DETERMINISTIC=ON` by default. Runtime deterministic
stepping still needs to be enabled through the wrapper API.

Build all package variants from the repository root:

```sh
pnpm run build:native
```

Pass CMake options after the build type when needed:

```sh
pnpm run build:native -- Distribution -DDOUBLE_PRECISION=ON
```
