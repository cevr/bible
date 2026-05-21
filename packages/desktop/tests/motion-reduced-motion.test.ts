/* Install a minimal `window` global BEFORE any import — motion-dom captures
   `typeof window !== "undefined"` at module load, so this has to come first. */
const installWindow = (matches: boolean): void => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  (globalThis as unknown as { window: unknown }).window = {
    matchMedia: (_q: string) => ({
      matches,
      addEventListener: () => {
        /* noop */
      },
      removeEventListener: () => {
        /* noop */
      },
    }),
  };
};

installWindow(false);

/* eslint-disable import/first */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* Stub motion-dom's startWaapiAnimation so we can observe the transition
   arg without needing a real Element.animate (would require jsdom). */
type WaapiArgs = [
  el: HTMLElement,
  valueName: string,
  keyframes: ReadonlyArray<string>,
  transition: { duration: number; ease?: ReadonlyArray<number> } | undefined,
];
type WaapiReturn = { finished: Promise<void>; cancel: () => void };
const startWaapiAnimation = vi.fn<(...args: WaapiArgs) => WaapiReturn>(() => ({
  finished: Promise.resolve(),
  cancel: () => {
    /* noop */
  },
}));

vi.mock('motion-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('motion-dom');
  return {
    ...actual,
    startWaapiAnimation,
  };
});

const stubElement = (): { el: HTMLElement; read: (k: string) => string | undefined } => {
  const style: Record<string, string> = {};
  const styleObj = {
    setProperty: (k: string, v: string): void => {
      style[k] = v;
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const el = { style: styleObj } as unknown as HTMLElement;
  return { el, read: (k) => style[k] };
};

describe('reduced-motion / driver', () => {
  beforeEach(() => {
    startWaapiAnimation.mockClear();
    /* Reset modules so motion-dom re-evaluates its `prefersReducedMotion`
       ref against the freshly-installed window for each case. */
    vi.resetModules();
  });

  afterEach(() => {
    installWindow(false);
  });

  it('animateProperty forwards the caller transition when reduced-motion is off', async () => {
    installWindow(false);

    const { animateProperty } = await import('../src/motion/internals/driver.js');
    const { el } = stubElement();
    animateProperty(el, 'opacity', 1, { duration: 0.22 });

    expect(startWaapiAnimation).toHaveBeenCalledOnce();
    const [, property, keyframes, transition] = startWaapiAnimation.mock.calls[0] ?? [];
    expect(property).toBe('opacity');
    expect(keyframes).toEqual(['1']);
    expect(transition).toEqual({ duration: 0.22 });
  });

  it('animateProperty short-circuits to duration 0 when reduced-motion is on', async () => {
    installWindow(true);

    const { animateProperty } = await import('../src/motion/internals/driver.js');
    const { el, read } = stubElement();
    animateProperty(el, 'opacity', 0, { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] });

    /* End-state must be written synchronously so visible state still matches. */
    expect(read('opacity')).toBe('0');

    expect(startWaapiAnimation).toHaveBeenCalledOnce();
    const transition = startWaapiAnimation.mock.calls[0]?.[3];
    expect(transition).toEqual({ duration: 0 });
  });

  it('isReducedMotion tracks the matchMedia value', async () => {
    installWindow(true);

    const { isReducedMotion } = await import('../src/motion/reduced-motion.js');
    expect(isReducedMotion()).toBe(true);
  });
});
