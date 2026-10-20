/* oxlint-disable effect/noGlobals -- the test runs a Bun script in a process of its own, so React Native's stand-in never reaches the other tests. */

import { expect, test } from 'bun:test';

test('the phone colours load on Android, where DynamicColorIOS throws', () => {
  const run = Bun.spawnSync(['bun', Bun.resolveSync('./test/android.ts', import.meta.dir)], {
    stderr: 'pipe',
  });
  expect(run.stderr.toString()).toBe('');
  expect(run.stdout.toString()).toBe('ground ink muted line soft');
});
