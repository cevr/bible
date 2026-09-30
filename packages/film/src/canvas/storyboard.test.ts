import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { type Light, createFilm, drawing } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';
import { Timed, defineScript } from '../core/schema.ts';
import { scenesOf } from './scenes.ts';
import { storyboard } from './storyboard.ts';

const CARD = { brief: 'Brief Serif', label: 'Label Sans' } as const;

describe('storyboard', () => {
  test('a card declares itself, and the tools keep it when they decode the scene', () => {
    const card = { id: 'daily', say: 'words', ...storyboard('daily', 'a brief', CARD) };
    expect(Schema.decodeSync(Timed)(card).storyboard).toBe(true);
  });

  test("a card sets its brief and its label in the film's type, naming no family of its own", () => {
    const fonts: string[] = [];
    const film = createFilm({
      title: 't',
      paper: { base: '#fff', tone: '#000', seed: 1 },
      shade: '#000',
      scenes: [{ id: 'a', say: 'A line.', ...storyboard('a', 'a brief', CARD) }],
    });
    withDom(
      () =>
        film.render(
          recorder(1920, 1080, {
            record: false,
            onCall: (key, args) => {
              if (key === 'font') fonts.push(String(args[0]));
            },
          }).ctx,
          1,
        ),
      { record: false },
    );
    expect(fonts.some((f) => f.includes('Brief Serif'))).toBe(true);
    expect(fonts.some((f) => f.includes('Label Sans'))).toBe(true);
  });
});

describe('scenesOf', () => {
  const script = defineScript([
    { id: 'one', say: 'One.', cite: ['A source'], picture: 'the first' },
    { id: 'two', say: 'Two.', picture: 'the second' },
    { id: 'three', say: 'Three.', lead: 0.4, picture: 'the third' },
  ]);
  const act: Light = { color: '#eee' };
  const dawn: Light = { color: '#fed' };
  const one = drawing({ timeline: {}, draw: () => {} });
  const three = drawing({
    timeline: { weave: { at: 'start', dur: 1 } },
    light: () => dawn,
    draw: () => {},
  });

  test("pairs each beat with its drawing, a card where it has none, the script's timing last", () => {
    const scenes = scenesOf(script, { drawings: { one, three }, light: () => act, card: CARD });
    expect(scenes.map((s) => [s.id, s.say, s.storyboard === true])).toEqual([
      ['one', 'One.', false],
      ['two', 'Two.', true],
      ['three', 'Three.', false],
    ]);
    expect(scenes[2]?.lead).toBe(0.4);
    expect(scenes.every((s) => !('cite' in s) && !('picture' in s))).toBe(true);
  });

  test("a drawing's own light wins over the one the film gives it", () => {
    const scenes = scenesOf(script, { drawings: { one, three }, light: () => act, card: CARD });
    expect(scenes.map((s) => s.light)).toEqual([act, act, three.light]);
  });

  test('a drawing keyed by an id the script lacks does not compile', () => {
    // @ts-expect-error: `four` is no beat of the script.
    const scenes = scenesOf(script, { drawings: { one, four: one }, card: CARD });
    expect(scenes).toHaveLength(3);
  });
});
