// A note's draft and where it sits, pure: the scene and timecode of the
// moment noted, with the cue edge and mark nearest it; the draft carries
// the box and the ink only when there are any; its scope (the cue selected,
// the in and out points cut to its scene, the words of its line selected) as
// its chip says it and as the draft carries it, and nothing once cleared;
// what a note on words asks of them (a note, a correction, a removal), and
// whether it says no more than that; and a pointer's place on the frame in
// film pixels.

import { Option, Schema } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import { NoteDraft } from '../../core/schema.ts';
import { probeFilm } from '../fixtures/probe-film.ts';
import {
  NO_SCOPE,
  type Scope,
  boxOf,
  draftOf,
  filmPixel,
  saysOnlyAsked,
  scopeText,
  unsaid,
  whenText,
  whereText,
  wordsAt,
} from './draft.ts';

/** What a note asks of its words, as the composer asks it (`unsaid`'s). */
type Asked = Parameters<typeof unsaid>[2];

/** A plain note: it asks nothing of its words but to be read. */
const NOTE_ASKED: Asked = { kind: 'note', replace: '' };

const film = probeFilm();

describe('where a note sits', () => {
  test('names the scene and the timecode, with the nearest cue edge', () => {
    const where = whereText(film.placed, film.fps, 1);
    expect(where.startsWith('one · 00:00:01:00 · ')).toBe(true);
    expect(where).toContain('cue ');
  });

  test('names the mark nearest it', () => {
    expect(whereText(film.placed, film.fps, 1)).toMatch(/ · \{\w+\}$/);
  });

  test("speaks the scene's time beside the scene's name, never the film's", () => {
    const two = film.placed[1]?.start ?? 0;
    expect(whereText(film.placed, film.fps, two + 0.5).startsWith('two · 00:00:00:15')).toBe(true);
  });

  test("a made note says its time into its scene now, or the film's, named, once its scene is gone", () => {
    expect(whenText(film.placed, film.fps, { scene: 'two', T: 0.5, local: 0.4 })).toBe(
      '00:00:00:12',
    );
    expect(whenText(film.placed, film.fps, { scene: 'gone', T: 2, local: 0.4 })).toBe(
      'film 00:00:02:00',
    );
  });
});

describe('the draft', () => {
  test('a point or a box goes with the draft; no ink leaves ink out', () => {
    const draft = draftOf(film.placed, film.fps, {
      T: 1,
      box: Option.some({ x: 5, y: 6, w: 0, h: 0 }),
      ink: [],
      text: '  too early ',
    });
    expect(Option.map(draft, (d) => [d.scene, d.T, d.frame, d.text, d.box, 'ink' in d])).toEqual(
      Option.some(['one', 1, 30, 'too early', { x: 5, y: 6, w: 0, h: 0 }, false]),
    );
  });

  test('ink goes with the draft; no box leaves the box out', () => {
    const draft = draftOf(film.placed, film.fps, {
      T: 1,
      box: Option.none(),
      ink: [
        [
          [1, 2],
          [3, 4],
        ],
      ],
      text: 'this arc',
    });
    expect(Option.map(draft, (d) => ['box' in d, d.ink])).toEqual(
      Option.some([
        false,
        [
          [
            [1, 2],
            [3, 4],
          ],
        ],
      ]),
    );
  });

  test('the draft says how far into its scene it was made', () => {
    const two = film.placed[1];
    const T = (two?.start ?? 0) + 0.4;
    const draft = draftOf(film.placed, film.fps, {
      T,
      box: Option.none(),
      ink: [],
      text: 'later in two',
    });
    expect(Option.map(draft, (d) => [d.scene, d.T])).toEqual(Option.some(['two', T]));
    expect(Option.getOrThrow(draft).local).toBeCloseTo(0.4, 9);
  });

  test('a draft at a scene start reached by frame steps is a draft the server takes', () => {
    const T = (film.placed[1]?.start ?? 0) - 1e-14;
    const draft = Option.getOrThrow(
      draftOf(film.placed, film.fps, { T, box: Option.none(), ink: [], text: 'at the cut' }),
    );
    expect(Schema.is(NoteDraft)(draft)).toBe(true);
  });

  test('an empty note is no draft', () => {
    expect(
      draftOf(film.placed, film.fps, { T: 1, box: Option.none(), ink: [], text: '   ' }),
    ).toEqual(Option.none());
  });
});

describe('the scope', () => {
  const composed = { T: 1.5, box: Option.none(), ink: [], text: 'too slow' };
  const scope: Scope = {
    cue: Option.some({ scene: 'one', name: 'fall' }),
    range: Option.some({ from: 1.2, to: 6 }),
    source: Option.none(),
    words: Option.none(),
  };

  test('its chip names the scene, the cue selected and the range in timecode', () => {
    expect(scopeText(film.placed, scope, film.fps, 1.5)).toEqual(
      Option.some('one · fall · 00:00:01:06–00:00:04:21'),
    );
    expect(scopeText(film.placed, { ...scope, range: Option.none() }, film.fps, 1.5)).toEqual(
      Option.some('one · fall'),
    );
    expect(scopeText(film.placed, NO_SCOPE, film.fps, 1.5)).toEqual(Option.none());
  });

  test('a cue or a range of another scene is no scope of a note in this one', () => {
    const elsewhere: Scope = {
      cue: Option.some({ scene: 'two', name: 'fall' }),
      range: Option.some({ from: 9, to: 10 }),
      source: Option.some({ scene: 'two', source: { file: 'scenes/two.ts', line: 4, text: 'x' } }),
      words: Option.some({ beat: 'two', from: 0, to: 1, text: 'A second' }),
    };
    expect(scopeText(film.placed, elsewhere, film.fps, 1.5)).toEqual(Option.none());
  });

  test('a line of the scene’s file joins the chip and the draft, with its text', () => {
    const line = { file: 'scenes/one.ts', line: 118, text: 'fall: { after: rise, dur: 0.4 },' };
    const cited: Scope = { ...scope, source: Option.some({ scene: 'one', source: line }) };
    expect(scopeText(film.placed, cited, film.fps, 1.5)).toEqual(
      Option.some('one · fall · scenes/one.ts:118 · 00:00:01:06–00:00:04:21'),
    );
    const draft = Option.getOrThrow(draftOf(film.placed, film.fps, composed, cited));
    expect(draft.source).toEqual(line);
    expect(Schema.is(NoteDraft)(draft)).toBe(true);
    const alone: Scope = { ...NO_SCOPE, source: cited.source };
    expect(scopeText(film.placed, alone, film.fps, 1.5)).toEqual(
      Option.some('one · scenes/one.ts:118'),
    );
  });

  test('the draft carries the selected cue’s nearer edge and the range cut to its scene', () => {
    const draft = Option.getOrThrow(draftOf(film.placed, film.fps, composed, scope));
    expect(draft.cue).toEqual({ name: 'fall', edge: 'start' });
    expect(draft.range?.from).toBeCloseTo(1.2, 9);
    expect(draft.range?.to).toBeCloseTo(4.715, 9);
    expect(Schema.is(NoteDraft)(draft)).toBe(true);
  });

  test('cleared, the draft names the nearest cue edge and no range, as before', () => {
    const draft = Option.getOrThrow(draftOf(film.placed, film.fps, composed, NO_SCOPE));
    expect(draft.cue).toEqual({ name: 'rise', edge: 'start' });
    expect('range' in draft).toBe(false);
    expect('source' in draft).toBe(false);
    expect('words' in draft).toBe(false);
    expect('kind' in draft).toBe(false);
  });
});

describe('a note on words of a line', () => {
  const words = { beat: 'one', from: 1, to: 2, text: 'ball rises' };
  const onWords: Scope = { ...NO_SCOPE, words: Option.some(words) };
  const at = (text: string, T = 1.5) => ({ T, box: Option.none(), ink: [], text });
  /** What a draft asks of its words: the words, its kind and a correction's words instead (each while it has them), and its text. */
  const fields = (d: NoteDraft) => ({
    words: Option.fromUndefinedOr(d.words),
    kind: Option.fromUndefinedOr(d.kind),
    replace: Option.fromUndefinedOr(d.replace),
    text: d.text,
  });

  test('its chip names the words, as they read', () => {
    expect(scopeText(film.placed, onWords, film.fps, 1.5)).toEqual(
      Option.some('one · “ball rises”'),
    );
    expect(wordsAt(film.placed, onWords, 1.5)).toEqual(Option.some(words));
  });

  test('a note carries its words and says what it says; one that says nothing is no draft', () => {
    const draft = draftOf(film.placed, film.fps, at(' too quick '), onWords, NOTE_ASKED);
    expect(Option.map(draft, fields)).toEqual(
      Option.some({
        words: Option.some(words),
        kind: Option.some('note' as const),
        replace: Option.none(),
        text: 'too quick',
      }),
    );
    expect(Option.map(draft, (d) => 'replace' in d)).toEqual(Option.some(false));
    expect(draftOf(film.placed, film.fps, at(''), onWords, NOTE_ASKED)).toEqual(Option.none());
  });

  test('a correction carries the words to say instead, and says so when its writer does not', () => {
    const draft = Option.getOrThrow(
      draftOf(film.placed, film.fps, at(''), onWords, {
        kind: 'correction',
        replace: ' ball climbs ',
      }),
    );
    expect(fields(draft)).toEqual({
      words: Option.some(words),
      kind: Option.some('correction' as const),
      replace: Option.some('ball climbs'),
      text: 'say “ball climbs” for “ball rises”',
    });
    expect(Schema.is(NoteDraft)(draft)).toBe(true);
    // Its writer's words stand when there are any.
    expect(
      Option.map(
        draftOf(film.placed, film.fps, at('softer'), onWords, {
          kind: 'correction',
          replace: 'ball climbs',
        }),
        (d) => d.text,
      ),
    ).toEqual(Option.some('softer'));
  });

  test('a correction that says no other words asks nothing: no draft, and the composer says why, of the field that says too little', () => {
    for (const replace of ['', '  ', 'ball rises']) {
      const asked = { kind: 'correction' as const, replace };
      expect(draftOf(film.placed, film.fps, at('why'), onWords, asked)).toEqual(Option.none());
      expect(unsaid('why', Option.some(words), asked)).toEqual(
        Option.some({ field: 'instead', says: 'Write the words to say instead.' }),
      );
    }
    expect(unsaid('', Option.some(words), NOTE_ASKED)).toEqual(
      Option.some({ field: 'note', says: 'Write the note first.' }),
    );
    expect(unsaid('', Option.none(), { kind: 'removal', replace: '' })).toEqual(
      Option.some({ field: 'note', says: 'Write the note first.' }),
    );
    expect(unsaid('', Option.some(words), { kind: 'removal', replace: '' })).toEqual(Option.none());
  });

  test('a removal says what it cuts', () => {
    const draft = Option.getOrThrow(
      draftOf(film.placed, film.fps, at(''), onWords, { kind: 'removal', replace: 'ignored' }),
    );
    expect(fields(draft)).toEqual({
      words: Option.some(words),
      kind: Option.some('removal' as const),
      replace: Option.none(),
      text: 'remove “ball rises”',
    });
    expect('replace' in draft).toBe(false);
    expect(Schema.is(NoteDraft)(draft)).toBe(true);
  });

  test('one that says no more than what it asks says it once; any words of its writer are its own', () => {
    const asking = (text: string, asked: Asked) =>
      Option.getOrThrow(draftOf(film.placed, film.fps, at(text), onWords, asked));
    const correction = asking('', { kind: 'correction', replace: 'ball climbs' });
    expect(saysOnlyAsked(correction)).toBe(true);
    expect(saysOnlyAsked({ ...correction, text: 'softer' })).toBe(false);
    expect(saysOnlyAsked(asking('', { kind: 'removal', replace: '' }))).toBe(true);
    // A note says its writer's words, whatever they are; a note of the frame alone asks nothing.
    expect(saysOnlyAsked(asking('remove “ball rises”', NOTE_ASKED))).toBe(false);
    expect(saysOnlyAsked({ text: 'remove “ball rises”' })).toBe(false);
  });

  test("words of another scene are no scope of a note in this one: it is the frame's, and asks nothing", () => {
    const two = (film.placed[1]?.start ?? 0) + 0.4;
    expect(wordsAt(film.placed, onWords, two)).toEqual(Option.none());
    const draft = Option.getOrThrow(
      draftOf(film.placed, film.fps, at('later', two), onWords, { kind: 'removal', replace: '' }),
    );
    expect(['words' in draft, 'kind' in draft, draft.text]).toEqual([false, false, 'later']);
    expect(
      draftOf(film.placed, film.fps, at('', two), onWords, { kind: 'removal', replace: '' }),
    ).toEqual(Option.none());
  });
});

describe('pixels', () => {
  test("a pointer's place on the frame, in film pixels", () => {
    const frame = { left: 100, top: 50, width: 320, height: 180 };
    expect(filmPixel(frame, { width: 640, height: 360 }, 260, 140)).toEqual([320, 180]);
  });

  test('a box from where a drag began to where it is, either way', () => {
    expect(boxOf([300, 200], [100, 120])).toEqual({ x: 100, y: 120, w: 200, h: 80 });
    expect(boxOf([10, 10], [10, 10])).toEqual({ x: 10, y: 10, w: 0, h: 0 });
  });
});
