// Hear version n: `1`…`9` on a stack's first nine versions, each offered
// while it can be heard and is not heard already, saying its number and label.

import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import { BY_BUTTON, labelOf } from '../../command/command.ts';
import { contextAt } from '../../command/context.ts';
import { hearVersionCommands } from './hear.ts';

const ctx = contextAt('review', '/review/f/s');

describe('hear version n', () => {
  test('keys the first nine versions, offered while hearable and not heard', () => {
    const versions = Array.from({ length: 11 }, (_, i) => ({
      id: `v${i + 1}`,
      label: `take ${i}`,
    }));
    let heard = 'v1';
    const commands = hearVersionCommands({
      versions,
      heard: () => heard,
      hearable: (id) => id !== 'v3',
      hear: (id) => {
        heard = id;
      },
    });
    expect(commands.map((c) => c.keys)).toEqual(
      Array.from({ length: 9 }, (_, i) => [String(i + 1)]),
    );
    const at = (i: number) => Option.getOrThrow(Option.fromUndefinedOr(commands[i]));
    const [one, two, three] = [at(0), at(1), at(2)];
    expect(one.when(ctx)).toBe(false);
    expect(three.when(ctx)).toBe(false);
    expect(labelOf(two, ctx)).toBe('Hear version 2 · take 1');
    Effect.runSync(two.run(ctx, BY_BUTTON));
    expect(heard).toBe('v2');
    expect(two.when(ctx)).toBe(false);
    expect(one.when(ctx)).toBe(true);
  });
});
