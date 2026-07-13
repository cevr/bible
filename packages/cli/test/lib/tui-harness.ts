/**
 * TUI Test Harness
 *
 * Wrapper around @opentui/solid's testRender for easier E2E testing.
 * Provides helper methods for keyboard input and screen assertions.
 */

import type { MockInput, MockMouse } from '@opentui/core/testing';
import { testRender } from '@opentui/solid';
import type { JSX } from '@opentui/solid';
import { expect } from 'vitest';

import { getPlainLines, stripAnsi } from './strip-ansi.js';

/** Small delay to allow async operations to settle */
const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

export interface TUITestHarness {
  // Raw access to mock input
  mockInput: MockInput;
  mockMouse: MockMouse;

  // Render control
  renderOnce(): Promise<void>;
  resize(width: number, height: number): void;

  /**
   * Wait for async operations to settle, then render.
   * Useful when component loads data on mount.
   */
  settle(ms?: number): Promise<void>;

  /**
   * Wait until screen contains specific text or timeout.
   * Useful for waiting for async data to load.
   */
  waitForText(text: string, timeout?: number): Promise<boolean>;

  // Screen capture
  captureFrame(): string;
  getPlainText(): string;
  getScreenLines(): string[];

  // Keyboard helpers
  pressKey(key: string): Promise<void>;
  pressKeys(keys: string[]): Promise<void>;
  pressCtrlP(): Promise<void>;
  pressCtrlF(): Promise<void>;
  pressCtrlS(): Promise<void>;
  pressCtrlT(): Promise<void>;
  pressCtrlC(): Promise<void>;
  pressEscape(): Promise<void>;
  pressEnter(): Promise<void>;
  pressSpace(): Promise<void>;
  pressArrow(direction: 'up' | 'down' | 'left' | 'right'): Promise<void>;
  pressShiftArrow(direction: 'up' | 'down' | 'left' | 'right'): Promise<void>;
  typeText(text: string): Promise<void>;

  // Assertion helpers
  expectScreenContains(text: string): void;
  expectScreenMatches(pattern: RegExp): void;
  expectScreenNotContains(text: string): void;
}

export interface TUITestOptions {
  width?: number;
  height?: number;
}

/**
 * Create a TUI test harness for E2E testing.
 *
 * @example
 * ```typescript
 * const tui = await createTUITest(() => <App runtime={runtime} />, { width: 80, height: 24 });
 * await tui.renderOnce();
 * await tui.pressCtrlP();
 * await tui.renderOnce();
 * tui.expectScreenContains('Genesis');
 * ```
 */
export async function createTUITest(
  component: () => JSX.Element,
  options: TUITestOptions = {},
): Promise<TUITestHarness> {
  const { width = 80, height = 24 } = options;

  const { mockInput, mockMouse, renderOnce, captureCharFrame, resize } = await testRender(
    component,
    {
      width,
      height,
    },
  );

  const harness: TUITestHarness = {
    mockInput,
    mockMouse,

    renderOnce,
    resize,

    settle: async (ms = 50) => {
      await tick(ms);
      await renderOnce();
    },

    /* eslint-disable no-await-in-loop -- Polling loop requires sequential awaits */
    waitForText: async (text: string, timeout = 1000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        await renderOnce();
        const screen = stripAnsi(captureCharFrame());
        if (screen.includes(text)) {
          return true;
        }
        await tick(20);
      }
      return false;
    },
    /* eslint-enable no-await-in-loop */

    captureFrame: () => captureCharFrame(),

    getPlainText: () => stripAnsi(captureCharFrame()),

    getScreenLines: () => getPlainLines(captureCharFrame()),

    pressKey: async (key: string) => {
      mockInput.pressKey(key);
      await renderOnce();
    },

    pressKeys: async (keys: string[]) => {
      for (const key of keys) {
        mockInput.pressKey(key);
      }
      await renderOnce();
    },

    pressCtrlP: async () => {
      mockInput.pressKey('p', { ctrl: true });
      await renderOnce();
    },

    pressCtrlF: async () => {
      mockInput.pressKey('f', { ctrl: true });
      await renderOnce();
    },

    pressCtrlS: async () => {
      mockInput.pressKey('s', { ctrl: true });
      await renderOnce();
    },

    pressCtrlT: async () => {
      mockInput.pressKey('t', { ctrl: true });
      await renderOnce();
    },

    pressCtrlC: async () => {
      mockInput.pressCtrlC();
      await renderOnce();
    },

    pressEscape: async () => {
      mockInput.pressEscape();
      await renderOnce();
    },

    pressEnter: async () => {
      mockInput.pressEnter();
      await renderOnce();
    },

    pressSpace: async () => {
      mockInput.pressKey(' ');
      await renderOnce();
    },

    pressArrow: async (direction) => {
      mockInput.pressArrow(direction);
      await renderOnce();
    },

    pressShiftArrow: async (direction) => {
      mockInput.pressArrow(direction, { shift: true });
      await renderOnce();
    },

    typeText: async (text: string) => {
      await mockInput.typeText(text);
      await renderOnce();
    },

    expectScreenContains: (text: string) => {
      const screen = stripAnsi(captureCharFrame());
      expect(screen).toContain(text);
    },

    expectScreenMatches: (pattern: RegExp) => {
      const screen = stripAnsi(captureCharFrame());
      expect(screen).toMatch(pattern);
    },

    expectScreenNotContains: (text: string) => {
      const screen = stripAnsi(captureCharFrame());
      expect(screen).not.toContain(text);
    },
  };

  return harness;
}
