// Upstream: packages/utils/src/useTimeout.ts, packages/utils/src/useAnimationFrame.ts
//
// A restartable timeout and animation frame: starting one clears the pending
// one. The `use*` forms clear themselves when the owning component unmounts.
import { onCleanup } from 'solid-js';

export class Timeout {
  static create(): Timeout {
    return new Timeout();
  }

  currentId: ReturnType<typeof setTimeout> | 0 = 0;

  start(delay: number, fn: () => void): void {
    this.clear();
    this.currentId = setTimeout(() => {
      this.currentId = 0;
      fn();
    }, delay);
  }

  isStarted(): boolean {
    return this.currentId !== 0;
  }

  clear = (): void => {
    if (this.currentId !== 0) {
      clearTimeout(this.currentId);
      this.currentId = 0;
    }
  };
}

/** A `Timeout` cleared when the current owner is disposed. */
export function useTimeout(): Timeout {
  const timeout = new Timeout();
  onCleanup(timeout.clear);
  return timeout;
}

export class AnimationFrame {
  currentId: number | null = null;

  request(fn: () => void): void {
    this.cancel();
    this.currentId = requestAnimationFrame(() => {
      this.currentId = null;
      fn();
    });
  }

  cancel = (): void => {
    if (this.currentId !== null) {
      cancelAnimationFrame(this.currentId);
      this.currentId = null;
    }
  };
}

/** An `AnimationFrame` cancelled when the current owner is disposed. */
export function useAnimationFrame(): AnimationFrame {
  const frame = new AnimationFrame();
  onCleanup(frame.cancel);
  return frame;
}
