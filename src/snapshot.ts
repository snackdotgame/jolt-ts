import type { JoltRuntime } from "./raw.js";

type RawJoltWithRecorder = JoltRuntime["raw"] & {
  StateRecorderJS: new () => Record<string, any>;
  HEAPU8: Uint8Array;
};

export interface NativeByteRecorder {
  readonly raw: Record<string, any>;
  bytes(): Uint8Array;
  clear(): void;
  rewind(input?: Uint8Array): void;
  dispose(): void;
  [Symbol.dispose](): void;
}

export function createStateRecorder(runtime: JoltRuntime, input?: Uint8Array): NativeByteRecorder {
  const raw = runtime.raw as RawJoltWithRecorder;
  const recorder = new raw.StateRecorderJS();
  let buffer = input ? Uint8Array.from(input) : new Uint8Array(4096);
  let readPos = 0;
  let writePos = input?.byteLength ?? 0;
  let failed = false;
  let disposed = false;

  recorder.ReadBytes = (outData: number, size: number) => {
    if (readPos + size > writePos) {
      failed = true;
      return;
    }

    raw.HEAPU8.set(buffer.subarray(readPos, readPos + size), outData);
    readPos += size;
  };

  recorder.WriteBytes = (inData: number, size: number) => {
    const required = writePos + size;
    if (required > buffer.byteLength) {
      const next = new Uint8Array(Math.max(required, buffer.byteLength * 2));
      next.set(buffer);
      buffer = next;
    }

    buffer.set(raw.HEAPU8.subarray(inData, inData + size), writePos);
    writePos += size;
  };

  recorder.IsEOF = () => readPos >= writePos;
  recorder.IsFailed = () => failed;

  const dispose = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    runtime.destroyRaw(recorder);
  };

  return {
    raw: recorder,
    bytes: () => {
      assertOpen();
      return buffer.slice(0, writePos);
    },
    clear: () => {
      assertOpen();
      readPos = 0;
      writePos = 0;
      failed = false;
    },
    rewind: (nextInput?: Uint8Array) => {
      assertOpen();
      if (nextInput) {
        buffer = Uint8Array.from(nextInput);
        writePos = nextInput.byteLength;
      }

      readPos = 0;
      failed = false;
    },
    dispose,
    [Symbol.dispose]: dispose
  };

  function assertOpen(): void {
    if (disposed) {
      throw new Error("NativeByteRecorder is already disposed.");
    }
  }
}
