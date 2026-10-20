// The transport's rates as commands: the rate chip offers every rate but the
// one it plays at, K plays at 1× again, J and L step a rate slower or faster
// and are not offered past either end.

import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { BY_BUTTON, type Command } from '../command/command.ts';
import { contextAt } from '../command/context.ts';
import { chipRows } from '../command/menu.ts';
import { rateCommands, rateId, rateText } from './transport.ts';

const ctx = contextAt('player', '/films/f/studio');

/** A transport at `start` among the lab's rates, and the commands over it. */
const transport = (start: number) => {
  const rates = { at: start };
  const commands = rateCommands({
    all: [0.25, 0.5, 1],
    now: () => rates.at,
    choose: (r) => {
      rates.at = r;
    },
  });
  const byId = (id: string): Command => {
    const found = commands.find((c) => c.id === id);
    if (found === undefined) throw new Error(`no command ${id}`);
    return found;
  };
  const run = (id: string) => Effect.runSync(byId(id).run(ctx, { ...BY_BUTTON, input: 'pointer' }));
  return { rates, commands, byId, run };
};

describe('the rate chip', () => {
  test('offers every rate but the one it plays at, each said as a chip says it', () => {
    const t = transport(1);
    const ids = [0.25, 0.5, 1].map(rateId);
    const available = t.commands.filter((c) => c.when(ctx));
    expect(chipRows(available, ctx, ids).map((r) => r.label)).toEqual(['Play at ¼×', 'Play at ½×']);
    expect(rateText(0.5)).toBe('½×');
    expect(rateText(2)).toBe('2×');
  });

  test('J and L step a rate slower or faster, and stop at either end; K plays at 1×', () => {
    const t = transport(0.5);
    t.run('play.slower');
    expect(t.rates.at).toBe(0.25);
    expect(t.byId('play.slower').when(ctx)).toBe(false);
    t.run('play.faster');
    t.run('play.faster');
    expect(t.rates.at).toBe(1);
    expect(t.byId('play.faster').when(ctx)).toBe(false);
    t.rates.at = 0.25;
    expect(t.byId(rateId(1)).keys).toEqual(['k']);
    t.run(rateId(1));
    expect(t.rates.at).toBe(1);
  });
});
