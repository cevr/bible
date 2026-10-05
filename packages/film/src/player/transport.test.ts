// The transport's rates and legend as commands: the rate chip offers every
// rate but the one it plays at, K plays at 1× again, J and L step a rate
// slower or faster and are not offered past either end; the legend's `?` is
// the player page's alone (the lab's `?` opens the keys sheet).

import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { BY_BUTTON, type Command, labelOf } from '../command/command.ts';
import { contextAt } from '../command/context.ts';
import { chipRows, contextRows } from '../command/menu.ts';
import { legendCommand, rateCommands, rateId, rateText, transportCommands } from './transport.ts';

const ctx = contextAt('lab', '/films/f/lab');

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
  const run = (id: string) => Effect.runSync(byId(id).run(ctx, BY_BUTTON));
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

describe('the steps, a finger away (AA-8)', () => {
  test("a press on the picture's nothing lists the frame and scene steps, the frames' also ×10", () => {
    const moved: Array<string> = [];
    const commands = transportCommands({
      toggle: () => moved.push('toggle'),
      stepFrames: (n) => moved.push(`frames ${n}`),
      nextScene: () => moved.push('next scene'),
      previousScene: () => moved.push('previous scene'),
      toggleCaptions: () => moved.push('captions'),
    });
    const rows = contextRows(commands, ctx).flatMap(([, r]) => r);
    expect(rows.map((r) => r.label)).toEqual([
      'Next frame',
      'Next frame ×10',
      'Previous frame',
      'Previous frame ×10',
      'Next scene',
      'Scene start, or the scene before',
    ]);
    for (const row of rows) Effect.runSync(row.command.run(ctx, { step: row.step, via: 'menu' }));
    expect(moved).toEqual([
      'frames 1',
      'frames 10',
      'frames -1',
      'frames -10',
      'next scene',
      'previous scene',
    ]);
  });
});

describe('the legend', () => {
  test('it has no key on any page (`?` is the keys sheet), and its label says what it would do', () => {
    let shown = false;
    const legend = { shown: () => shown, toggle: () => (shown = !shown) };
    expect(legendCommand('player', legend).keys).toEqual([]);
    expect(legendCommand('lab', legend).keys).toEqual([]);
    const command = legendCommand('player', legend);
    expect(labelOf(command, ctx)).toBe('Show the keys and the legend');
    Effect.runSync(command.run(ctx, BY_BUTTON));
    expect(labelOf(command, ctx)).toBe('Hide the keys and the legend');
  });
});
