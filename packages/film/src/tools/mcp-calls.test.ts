// An MCP tool call's one log line: its tool, its ids, how it ended, never
// its words.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Logger } from 'effect';
import { logged } from './mcp-calls.ts';

/** A logger that keeps each line logged into `lines`. */
const keptIn = (lines: Array<string>) =>
  Logger.layer([
    Logger.make(({ message }) => {
      lines.push([message].flat().join(' '));
    }),
  ]);

describe('an MCP call', () => {
  it.effect('is logged once as it ends: its tool, its ids and its outcome, not its words', () => {
    const lines: Array<string> = [];
    return Effect.gen(function* () {
      const reply = logged('reply', (params: { film: string; note: string; text: string }) =>
        Effect.succeed(params.note),
      );
      const refused = logged('set', (_: { set: string; wait: number }) => Effect.fail('no set'));
      expect(
        yield* reply({ film: 'f', note: 'n1', text: 'the judge looks away too soon' }, {}),
      ).toBe('n1');
      expect(Exit.isFailure(yield* Effect.exit(refused({ set: 'spare/x', wait: 5 }, {})))).toBe(
        true,
      );
      expect(lines.map((line) => line.replace(/ms=\d+$/, 'ms=n'))).toEqual([
        '[mcp] tool=reply film=f note=n1 outcome=ok ms=n',
        '[mcp] tool=set set=spare/x wait=5 outcome=failed ms=n',
      ]);
    }).pipe(Effect.provide(keptIn(lines)));
  });
});
