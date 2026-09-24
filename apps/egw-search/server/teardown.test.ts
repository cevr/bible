import { describe, expect, test } from 'bun:test';
import { Exit } from 'effect';

import { teardown } from './teardown.js';

const codeOf = (exit: Exit.Exit<unknown, unknown>): number => {
  let code = -1;
  teardown(exit, (value) => {
    code = value;
  });
  return code;
};

describe('teardown', () => {
  test('a stop the host asks for exits 0, so Railway does not restart the old container', () => {
    expect(codeOf(Exit.interrupt(1))).toBe(0);
  });

  test('a success exits 0 and a failure still exits 1', () => {
    expect(codeOf(Exit.void)).toBe(0);
    expect(codeOf(Exit.fail('boom'))).toBe(1);
  });
});
