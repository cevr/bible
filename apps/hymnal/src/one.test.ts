/**
 * The One the app runs is the One its package.json pins. The test setup
 * stands `src/test/one.tsx` in for the module `one`, not for its subpaths,
 * so `one/package.json` is the installed package's own.
 */

import { expect, test } from 'bun:test';
import installed from 'one/package.json';

import app from '../package.json';

test('the installed One is the exact version the app pins', () => {
  const pin = app.dependencies.one;
  expect(pin).toMatch(/^\d+\.\d+\.\d+$/);
  expect(installed.version).toBe(pin);
});
