import type { JoltRuntime } from "./raw.js";

type Disposer = () => void;

export interface Disposable {
  dispose(): void;
}

export class NativeScope implements Disposable {
  readonly runtime: JoltRuntime;
  #disposers: Disposer[] = [];
  #disposed = false;

  constructor(runtime: JoltRuntime) {
    this.runtime = runtime;
  }

  own<T>(value: T, disposer?: (value: T) => void): T {
    this.assertOpen();
    this.#disposers.push(() => {
      if (disposer) {
        disposer(value);
      } else {
        this.runtime.destroyRaw(value);
      }
    });
    return value;
  }

  defer(disposer: Disposer): void {
    this.assertOpen();
    this.#disposers.push(disposer);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }

    this.#disposed = true;
    let firstError: unknown;

    for (let i = this.#disposers.length - 1; i >= 0; i -= 1) {
      const disposer = this.#disposers[i];
      if (!disposer) {
        continue;
      }

      try {
        disposer();
      } catch (error) {
        firstError ??= error;
      }
    }

    this.#disposers = [];

    if (firstError) {
      throw firstError;
    }
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  private assertOpen(): void {
    if (this.#disposed) {
      throw new Error("NativeScope is already disposed.");
    }
  }
}
