import type { JoltRuntime } from "./raw.js";

type RawJoltWithRecorder = JoltRuntime["raw"] & {
  StateRecorderJS: new () => Record<string, any>;
  HEAPU8: Uint8Array;
};

export interface NativeByteRecorder {
  readonly raw: Record<string, any>;
  bytes(): Uint8Array;
  view(): Uint8Array;
  clear(): void;
  rewind(input?: Uint8Array): void;
  dispose(): void;
  [Symbol.dispose](): void;
}

export function createStateRecorder(runtime: JoltRuntime, input?: Uint8Array): NativeByteRecorder {
  const raw = runtime.raw as RawJoltWithRecorder;
  const recorder = new raw.StateRecorderJS();
  let buffer = input ?? new Uint8Array(4096);
  let ownsBuffer = input === undefined;
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
    ensureWritableCapacity(required);

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
    view: () => {
      assertOpen();
      return buffer.subarray(0, writePos);
    },
    clear: () => {
      assertOpen();
      if (!ownsBuffer) {
        buffer = new Uint8Array(4096);
        ownsBuffer = true;
      }

      readPos = 0;
      writePos = 0;
      failed = false;
    },
    rewind: (nextInput?: Uint8Array) => {
      assertOpen();
      if (nextInput) {
        buffer = nextInput;
        ownsBuffer = false;
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

  function ensureWritableCapacity(required: number): void {
    if (ownsBuffer && required <= buffer.byteLength) {
      return;
    }

    const nextLength = Math.max(required, ownsBuffer ? buffer.byteLength * 2 : Math.max(4096, buffer.byteLength));
    const next = new Uint8Array(nextLength);
    next.set(buffer.subarray(0, writePos));
    buffer = next;
    ownsBuffer = true;
  }
}
