// The transport's rates as commands: the rate chip offers every rate but the
// one it plays at, K plays at 1× again, J and L step a rate slower or faster
// and are not offered past either end; and where a phone plays and turns the
// captions, by page.

import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { BY_BUTTON, type Command } from '../command/command.ts';
import { contextAt } from '../command/context.ts';
import { chipRows, contextRows } from '../command/menu.ts';
import { rateCommands, rateId, rateText, transportCommands } from './transport.ts';

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

describe('the steps, a finger away (AA-8)', () => {
  test("a press on the picture's nothing lists the frame and scene steps, the frames' also ×10", () => {
    const moved: Array<string> = [];
    const commands = transportCommands('player', {
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
    for (const row of rows)
      Effect.runSync(row.command.run(ctx, { step: row.step, via: 'menu', input: 'pointer' }));
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

describe('the captions and play, a finger away', () => {
  test("the studio's captions are its command menu's, the review's its CC button, and a tap on the film plays", () => {
    const transport = {
      toggle: () => undefined,
      stepFrames: () => undefined,
      nextScene: () => undefined,
      previousScene: () => undefined,
      toggleCaptions: () => undefined,
    };
    const touchOf = (page: 'review' | 'player', id: string) =>
      transportCommands(page, transport).find((c) => c.id === id)?.touch;
    expect(touchOf('review', 'view.captions')).toBe('the CC button');
    expect(touchOf('player', 'view.captions')).toBe('the command menu, then Captions on or off');
    expect(touchOf('player', 'play.toggle')).toBe('tap the film');
  });
});
