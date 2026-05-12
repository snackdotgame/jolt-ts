#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if [ $# -eq 0 ]; then
	BUILD_TYPE=Distribution
else
	BUILD_TYPE=$1
	shift
fi

if [ -z "${EMSCRIPTEN_ROOT:-}" ]; then
	EMCC_PATH=$(command -v emcc)
	EMCC_REAL=$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$EMCC_PATH")
	EMCC_DIR=$(dirname "$EMCC_REAL")
	if [ -f "$EMCC_DIR/tools/webidl_binder.py" ]; then
		export EMSCRIPTEN_ROOT="$EMCC_DIR"
	elif [ -f "$EMCC_DIR/../libexec/tools/webidl_binder.py" ]; then
		export EMSCRIPTEN_ROOT=$(CDPATH= cd -- "$EMCC_DIR/../libexec" && pwd)
	elif [ -n "${EMSDK:-}" ] && [ -f "$EMSDK/upstream/emscripten/tools/webidl_binder.py" ]; then
		export EMSCRIPTEN_ROOT="$EMSDK/upstream/emscripten"
	else
		echo "Unable to locate Emscripten's webidl_binder.py. Set EMSCRIPTEN_ROOT." >&2
		exit 1
	fi
fi

if [ -z "${JOLT_BUILD_JOBS:-}" ]; then
	if command -v getconf >/dev/null 2>&1; then
		JOLT_BUILD_JOBS=$(getconf _NPROCESSORS_ONLN 2>/dev/null || true)
	fi
	if [ -z "${JOLT_BUILD_JOBS:-}" ] && command -v sysctl >/dev/null 2>&1; then
		JOLT_BUILD_JOBS=$(sysctl -n hw.ncpu 2>/dev/null || true)
	fi
	if [ -z "${JOLT_BUILD_JOBS:-}" ]; then
		JOLT_BUILD_JOBS=4
	fi
fi

cmake_configure() {
	emcmake cmake -S . -B "$@"
}

cmake_build() {
	cmake --build "$1" -j"$JOLT_BUILD_JOBS"
}

rm -rf ./dist
mkdir -p dist

if [ "$BUILD_TYPE" != "Debug" ]; then
	cmake_configure Build/Debug/ST -DCMAKE_BUILD_TYPE=Debug -DBUILD_WASM_COMPAT_ONLY=ON "$@"
	cmake_build Build/Debug/ST

	cmake_configure Build/Debug/MT -DENABLE_MULTI_THREADING=ON -DENABLE_SIMD=ON -DCMAKE_BUILD_TYPE=Debug -DBUILD_WASM_COMPAT_ONLY=ON "$@"
	cmake_build Build/Debug/MT

	mv ./dist/jolt-physics.wasm-compat.js ./dist/jolt-physics.debug.wasm-compat.js
	mv ./dist/jolt-physics.multithread.wasm-compat.js ./dist/jolt-physics.debug.multithread.wasm-compat.js
fi

cmake_configure "Build/$BUILD_TYPE/ST" -DCMAKE_BUILD_TYPE="$BUILD_TYPE" "$@"
cmake_build "Build/$BUILD_TYPE/ST"

cmake_configure "Build/$BUILD_TYPE/MT" -DENABLE_MULTI_THREADING=ON -DENABLE_SIMD=ON -DCMAKE_BUILD_TYPE="$BUILD_TYPE" "$@"
cmake_build "Build/$BUILD_TYPE/MT"

if [ "$BUILD_TYPE" = "Debug" ]; then
	cp ./dist/jolt-physics.wasm-compat.js ./dist/jolt-physics.debug.wasm-compat.js
	cp ./dist/jolt-physics.multithread.wasm-compat.js ./dist/jolt-physics.debug.multithread.wasm-compat.js
fi

python3 ./replace_text.py \
	"jolt-physics.multithread.wasm-compat.js" \
	"jolt-physics.debug.multithread.wasm-compat.js" \
	./dist/jolt-physics.debug.multithread.wasm-compat.js

cat > ./dist/jolt-physics.d.ts << EOF
import Jolt from "./types";

export default Jolt;
export * from "./types";

EOF

cp ./dist/jolt-physics.d.ts ./dist/jolt-physics.wasm.d.ts
cp ./dist/jolt-physics.d.ts ./dist/jolt-physics.wasm-compat.d.ts
cp ./dist/jolt-physics.d.ts ./dist/jolt-physics.debug.wasm-compat.d.ts
cp ./dist/jolt-physics.d.ts ./dist/jolt-physics.multithread.d.ts
cp ./dist/jolt-physics.d.ts ./dist/jolt-physics.multithread.wasm.d.ts
cp ./dist/jolt-physics.d.ts ./dist/jolt-physics.multithread.wasm-compat.d.ts
cp ./dist/jolt-physics.d.ts ./dist/jolt-physics.debug.multithread.wasm-compat.d.ts
