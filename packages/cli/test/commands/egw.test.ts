import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { egwWithSubcommands } from '../../src/commands/egw.js';
import { runCli } from '../lib/run-cli.js';

describe('egw commands', () => {
  const test = it.effect;

  describe('egw command', () => {
    test('should show help when no query provided', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, []);

        expect(result.success).toBe(true);
      }));

    test('should parse single paragraph reference', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, ['PP', '351.1']);

        expect(result.success).toBe(true);
      }));

    test('should parse paragraph range reference', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, ['PP', '351.1-5']);

        expect(result.success).toBe(true);
      }));

    test('should parse page reference', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, ['PP', '351']);

        expect(result.success).toBe(true);
      }));

    test('should parse page range reference', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, ['PP', '351-355']);

        expect(result.success).toBe(true);
      }));

    test('should parse book reference', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, ['PP']);

        expect(result.success).toBe(true);
      }));

    test('should handle numbered book codes', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, ['1BC', '1111.2']);

        expect(result.success).toBe(true);
      }));

    test('should handle search queries', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, ['great', 'controversy']);

        expect(result.success).toBe(true);
      }));

    test('should handle quoted reference', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, ['PP 351.1']);

        expect(result.success).toBe(true);
      }));
  });

  describe('egwWithSubcommands', () => {
    test('should show help when no args', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, []);

        expect(result.success).toBe(true);
      }));

    test('should handle lookup at top level', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, ['PP', '351.1']);

        expect(result.success).toBe(true);
      }));

    test('should handle search at top level', () =>
      Effect.gen(function* () {
        const result = yield* runCli(egwWithSubcommands, ['faith', 'and', 'works']);

        expect(result.success).toBe(true);
      }));
  });
});
