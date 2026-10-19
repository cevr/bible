// Fixture for film/tests-keep-their-strength: each line marked RED fires the
// rule, and nothing else does.

import { describe, setDefaultTimeout, test } from 'bun:test';
import { it } from 'effect-bun-test';
import { Effect } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { SLOW } from './elsewhere.ts';

declare const ready: boolean;

describe.skip('a suite set aside', () => {}); // RED film/tests-keep-their-strength
test.only('one test alone', () => {}); // RED film/tests-keep-their-strength
test.todo('a test not written'); // RED film/tests-keep-their-strength
test.skipIf(!ready)('a test where it can run', () => {}); // RED film/tests-keep-their-strength
it.effect.skip('an effect set aside', () => Effect.void); // RED film/tests-keep-their-strength
it.live.failing('a test that fails', () => Effect.void); // RED film/tests-keep-their-strength

test('a slow test given time', () => {}, 30_000); // RED film/tests-keep-their-strength
const LONG = 20_000;
test('a slow test given a named time', () => {}, { timeout: LONG }); // RED film/tests-keep-their-strength
test('a timeout from elsewhere', () => {}, SLOW); // RED film/tests-keep-their-strength
test('a test run until it passes', () => {}, { retry: 3 }); // RED film/tests-keep-their-strength
setDefaultTimeout(20_000); // RED film/tests-keep-their-strength
setDefaultTimeout(0); // RED film/tests-keep-their-strength
test('a test given no deadline', () => {}, 0); // RED film/tests-keep-their-strength

// bun's own default, and less, raise nothing.
test('a test at the default', () => {}, 5_000);
it.effect('a test held tighter', () => Effect.void, 1_000);

/** A test that starts a process names its spawn budget. */
const SPAWNS_MS = 30_000;
const command = ChildProcess.make('git', ['status']);
test('a spawn in the body', () => void Bun.spawn(['true']), SPAWNS_MS);
it.effect('a spawn through a module const', () => Effect.succeed(command), SPAWNS_MS);
const run = (args: ReadonlyArray<string>) => Bun.spawnSync(['git', ...args]);
const status = () => run(['status']);
test('a spawn two helpers deep', () => void status(), SPAWNS_MS);
describe('a suite whose test spawns', { timeout: SPAWNS_MS }, () => {
  test('spawns', () => void run(['log']));
});

// A test named skip, and a member of another value, are not the runner's.
declare const plan: { readonly skip: () => void };
plan.skip();
