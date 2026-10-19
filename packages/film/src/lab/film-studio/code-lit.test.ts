// What the studio's code view lights, pure: the cues playing at a time light the
// literals that write them by the clock; a read of the clock fires while the
// frame read its name and the clock plays it, and its line glows while one
// fires and fades after; a cue the code does not write lights nothing; the
// view follows what began last, and a tap seeks to a line's next.

import { Option } from 'effect';
import { describe, expect, test } from 'effect-bun-test';
import type { ResolvedCue, SceneCode } from '../../core/schema.ts';
import {
  beatWords,
  followLine,
  litNow,
  liveWords,
  metersOn,
  firingsOf,
  nextFiring,
  rowsOf,
} from './code-lit.ts';

/** Where a tap on `line` seeks at `clock`'s frame: through the scene's firings, built for the frame's staged scene. */
const tapFrom = (of: SceneCode, line: number, clock: ReturnType<typeof clockAt>) =>
  nextFiring(firingsOf(of, clock), line, clock.t, clock.fps);

const TEXT = [
  'const lift = 1;', // 0..16
  'timeline: {', // 16..28
  '  rise: { dur: 1 },', // 28..
  '  fall: { after: "rise", dur: 1 },',
  '}',
  'f.at("rise"); f.at("fall");',
].join('\n');

/** The range of the first `needle` in `TEXT`. */
const range = (needle: string, from = 0): readonly [number, number] => {
  const start = TEXT.indexOf(needle, from);
  return [start, start + needle.length];
};

const code: SceneCode = {
  scene: 'robe',
  file: 'scenes/robe.ts',
  text: TEXT,
  cues: [
    { name: 'rise', at: range('rise: { dur: 1 }'), reads: [range('f.at("rise")')] },
    { name: 'fall', at: range('fall: { after: "rise", dur: 1 }'), reads: [range('f.at("fall")')] },
  ],
  knobs: [],
  marks: [],
  refused: [],
};

const cue = (start: number, dur: number): ResolvedCue => ({
  start,
  dur,
  end: start + dur,
  ease: 'linear',
  stagger: 0,
});

const cues = new Map([
  ['rise', cue(0, 1)],
  ['fall', cue(1, 1)],
  ['unwritten', cue(0, 2)],
]);

/** A voice that says nothing. */
const SILENT = { marks: new Map<string, number>(), speechStart: 0, speechEnd: 0 };

/** A frame that read every cue and mark these tests name. */
const ALL = {
  cues: new Set(['rise', 'fall', 'unwritten']),
  marks: new Set(['take', 'held', 'gone']),
};

/** The scene's clock at scene time `t`, of a film at 30 fps, its frame having read `heard`. */
const clockAt = (t: number, of = cues, voice = SILENT, heard = ALL) => ({
  t,
  fps: 30,
  cues: of,
  voice,
  heard,
});

describe('what is lit at a frame', () => {
  test('the playing cue lights its literal and its reads, and meters its line', () => {
    const lit = litNow(code, clockAt(0.5));
    expect(lit.names).toEqual(['rise']);
    expect(lit.literals).toEqual([range('rise: { dur: 1 }')]);
    expect(lit.reads).toEqual([range('f.at("rise")')]);
    expect(lit.meters).toEqual([{ name: 'rise', line: 3, progress: 0.5 }]);
  });

  test('a cue the code does not write lights nothing; a frame between cues lights nothing', () => {
    expect(litNow(code, clockAt(1, new Map([['unwritten', cue(0, 2)]]))).names).toEqual([]);
    expect(litNow(code, clockAt(5)).names).toEqual([]);
  });

  test('the same time lights the same ranges, whatever came before it', () => {
    const a = litNow(code, clockAt(1.5));
    litNow(code, clockAt(0.2));
    expect(litNow(code, clockAt(1.5))).toEqual(a);
  });

  test('the view follows to the read that began last, else the literal; after them it keeps to the last', () => {
    expect(followLine(code, litNow(code, clockAt(1.5)))).toEqual(Option.some(6));
    const unread = { cues: new Set<string>(), marks: new Set<string>() };
    expect(followLine(code, litNow(code, clockAt(1.5, cues, SILENT, unread)))).toEqual(
      Option.some(4),
    );
    // Nothing plays at 5 s: a still frame there stands where the playing frame stood, on `fall`'s read.
    expect(followLine(code, litNow(code, clockAt(5)))).toEqual(Option.some(6));
    // Before anything has begun, nothing.
    const late = new Map([['rise', cue(2, 1)]]);
    expect(followLine(code, litNow(code, clockAt(1, late)))).toEqual(Option.none());
  });

  test('the view moves only as something begins: an older read still firing never takes it back', () => {
    // `hold` plays 0–3 s, read on line 5; `blip` 1–1.5 s, read two lines down.
    const SPREAD = [
      'timeline: {',
      '  hold: { dur: 3 },',
      '  blip: { dur: 0.5 },',
      '}',
      'f.at("hold");',
      '// between',
      'f.at("blip");',
    ].join('\n');
    const at = (needle: string): readonly [number, number] => {
      const start = SPREAD.indexOf(needle);
      return [start, start + needle.length];
    };
    const spread: SceneCode = {
      ...code,
      text: SPREAD,
      cues: [
        { name: 'hold', at: at('hold: { dur: 3 }'), reads: [at('f.at("hold")')] },
        { name: 'blip', at: at('blip: { dur: 0.5 }'), reads: [at('f.at("blip")')] },
      ],
    };
    const both = new Map([
      ['hold', cue(0, 3)],
      ['blip', cue(1, 0.5)],
    ]);
    const heard = { cues: new Set(['hold', 'blip']), marks: new Set<string>() };
    const follow = (t: number) =>
      followLine(spread, litNow(spread, clockAt(t, both, SILENT, heard)));
    expect(follow(0.5)).toEqual(Option.some(5));
    // `blip` begins: its read, not its literal written above it.
    expect(follow(1.2)).toEqual(Option.some(7));
    // `blip` has ended and `hold` still fires: the view keeps to `blip`'s line, its trail fading there.
    expect(follow(2)).toEqual(Option.some(7));
    // A frame stepped, a pause, a link after both: the same line.
    expect(follow(2 + 1 / 30)).toEqual(Option.some(7));
    expect(follow(5)).toEqual(Option.some(7));
  });

  test('the head names what plays, else that nothing plays; a refused field says no more (REV6-Q1)', () => {
    expect(liveWords(litNow(code, clockAt(0.5)))).toBe('rise');
    expect(liveWords(litNow(code, clockAt(5)))).toBe('nothing playing');
    const computed: SceneCode = {
      ...code,
      cues: [],
      refused: [{ field: 'timeline', reason: 'it is `make()`, not an object literal' }],
    };
    expect(liveWords(litNow(computed, clockAt(0.5)))).toBe('nothing playing');
  });
});

/** A scene that reads its cue on line 2, says `{take}` and `{held}`, and reads them on lines 3 to 6. */
const VOICED = [
  'timeline: { rise: { dur: 1 } },',
  'f.at("rise");',
  'f.mark("take");',
  'f.spoken("take");',
  'f.spoken("take", "held");',
  'f.mark("gone");',
].join('\n');

/** The range of the first `needle` in `VOICED`. */
const inVoiced = (needle: string): readonly [number, number] => {
  const start = VOICED.indexOf(needle);
  return [start, start + needle.length];
};

const voiced: SceneCode = {
  ...code,
  text: VOICED,
  cues: [{ name: 'rise', at: inVoiced('rise: { dur: 1 }'), reads: [inVoiced('f.at("rise")')] }],
  marks: [
    {
      name: 'take',
      reads: [inVoiced('f.mark("take")')],
      speaks: [
        { at: inVoiced('f.spoken("take")') },
        { at: inVoiced('f.spoken("take", "held")'), to: 'held' },
      ],
    },
    { name: 'gone', reads: [inVoiced('f.mark("gone")')], speaks: [] },
  ],
};

/** Speech from 1 s to 4 s: `{take}` said at 1.5 s, `{held}` at 2.5 s. */
const VOICE = {
  marks: new Map([
    ['take', 0.5],
    ['held', 1.5],
  ]),
  speechStart: 1,
  speechEnd: 4,
};

const rise = new Map([['rise', cue(0, 1)]]);
const voicedAt = (t: number, heard = ALL) => litNow(voiced, clockAt(t, rise, VOICE, heard));

describe('a read of the clock fires, and its line glows', () => {
  test('a mark’s read fires on its word’s frame, a `spoken` read from its mark to its end', () => {
    // On the frame `{take}` is said: the instant, the voice to the end of speech, the voice to `{held}`.
    expect(voicedAt(1.51).reads).toEqual([
      inVoiced('f.mark("take")'),
      inVoiced('f.spoken("take")'),
      inVoiced('f.spoken("take", "held")'),
    ]);
    // A frame later the instant is over; past `{held}` only the voice to the end of speech reads.
    expect(voicedAt(1.6).reads).toEqual([
      inVoiced('f.spoken("take")'),
      inVoiced('f.spoken("take", "held")'),
    ]);
    expect(voicedAt(3).reads).toEqual([inVoiced('f.spoken("take")')]);
    expect(voicedAt(4.2).reads).toEqual([]);
  });

  test('a line glows while a read on it fires and fades over 0.6 s after; a mark the scene does not say never lights', () => {
    const glows = voicedAt(1.51).glows;
    expect(glows.get(3)).toBe(1);
    expect(glows.get(4)).toBe(1);
    expect(glows.get(5)).toBe(1);
    // The cue ended at 1 s: 0.51 s of its 0.6 s trail gone.
    expect(glows.get(2)).toBeCloseTo(0.15, 5);
    expect(glows.has(6)).toBe(false);
    // `{held}` said at 2.5 s: half a second of the trail gone, a sixth of it left.
    expect(voicedAt(3).glows.get(5)).toBeCloseTo(1 / 6, 5);
    expect(voicedAt(3).glows.has(3)).toBe(false);
    expect(voicedAt(0.5).glows).toEqual(new Map([[2, 1]]));
  });

  test('a read the frame did not make fires nothing and glows nothing; the literal stays lit by the clock', () => {
    const unread = { cues: new Set<string>(), marks: new Set<string>() };
    const lit = voicedAt(0.5, unread);
    expect(lit.literals).toEqual([inVoiced('rise: { dur: 1 }')]);
    expect(lit.reads).toEqual([]);
    expect(lit.glows.size).toBe(0);
    expect(voicedAt(1.51, unread).glows.size).toBe(0);
  });

  test('the view follows the read that began last, the first written of two together, never a mark’s instant', () => {
    expect(followLine(voiced, voicedAt(0.5))).toEqual(Option.some(2));
    // Both voices begin at `{take}`: the one written first.
    expect(followLine(voiced, voicedAt(1.51))).toEqual(Option.some(4));
    const instantOnly: SceneCode = {
      ...voiced,
      marks: [{ name: 'take', reads: [inVoiced('f.mark("take")')], speaks: [] }],
    };
    // `{take}`'s instant, on line 3, moves nothing: the view keeps to `rise`'s read.
    expect(followLine(instantOnly, litNow(instantOnly, clockAt(1.51, rise, VOICE)))).toEqual(
      Option.some(2),
    );
  });

  test('a `spoken` read over no stretch fires where it steps to its last, at its end: an instant, never followed', () => {
    // From `{held}` (2.5 s) to `{take}` (1.5 s): no word between, so it reads 0 until `{take}` and 1 from there.
    const backwards: SceneCode = {
      ...voiced,
      marks: [
        {
          name: 'held',
          reads: [],
          speaks: [{ at: inVoiced('f.spoken("take", "held")'), to: 'take' }],
        },
      ],
    };
    const at = (t: number) => litNow(backwards, clockAt(t, rise, VOICE));
    expect(at(1.51).reads).toEqual([inVoiced('f.spoken("take", "held")')]);
    expect(at(1.51).glows.get(5)).toBe(1);
    // An instant: the view keeps to `rise`'s read, on line 2.
    expect(followLine(backwards, at(1.51))).toEqual(Option.some(2));
    // Where `{held}` is said nothing steps: the read is dark, its trail long gone.
    expect(at(2.51).reads).toEqual([]);
    expect(at(2.51).glows.has(5)).toBe(false);
    expect(tapFrom(backwards, 5, clockAt(0.2, rise, VOICE))).toEqual(Option.some(1.5 + 0.5 / 30));
  });
});

describe('where a tap on a line seeks', () => {
  const half = 0.5 / 30;

  test('half a frame into the next start the line reads or writes, round to the first past the last', () => {
    const clock = clockAt(0.2, rise, VOICE);
    // The cue's literal and its read start at 0; the scene is past them, so a tap goes round.
    expect(tapFrom(voiced, 1, clock)).toEqual(Option.some(half));
    expect(tapFrom(voiced, 2, clock)).toEqual(Option.some(half));
    // A mark's read and a `spoken` read start where the mark is said.
    expect(tapFrom(voiced, 3, clock)).toEqual(Option.some(1.5 + half));
    expect(tapFrom(voiced, 5, clock)).toEqual(Option.some(1.5 + half));
  });

  test('a frame already on the start goes to the next; a line that reads nothing the scene plays seeks nowhere', () => {
    const twice: SceneCode = {
      ...voiced,
      marks: [
        { name: 'take', reads: [inVoiced('f.mark("take")')], speaks: [] },
        { name: 'held', reads: [inVoiced('f.mark("take")')], speaks: [] },
      ],
    };
    expect(tapFrom(twice, 3, clockAt(1.5 + half, rise, VOICE))).toEqual(Option.some(2.5 + half));
    expect(tapFrom(voiced, 6, clockAt(0, rise, VOICE))).toEqual(Option.none());
    expect(tapFrom(voiced, 99, clockAt(0, rise, VOICE))).toEqual(Option.none());
  });

  test("the firings are the staged scene's alone: one table, built once, answers every frame", () => {
    const unread = { cues: new Set<string>(), marks: new Set<string>() };
    const once = firingsOf(voiced, clockAt(0.2, rise, VOICE));
    // Another frame's time and heard names build the same table, so the view keeps the one it built.
    expect(firingsOf(voiced, clockAt(2.6, rise, VOICE, unread))).toEqual(once);
    for (const t of [0, 0.2, 1.5, 1.5 + half, 2.6])
      for (const line of [1, 2, 3, 4, 5, 6])
        expect(nextFiring(once, line, t, 30)).toEqual(
          tapFrom(voiced, line, clockAt(t, rise, VOICE)),
        );
    expect([...once.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  test('heard or not: a frame to come may read it', () => {
    const unread = { cues: new Set<string>(), marks: new Set<string>() };
    expect(tapFrom(voiced, 4, clockAt(0.2, rise, VOICE, unread))).toEqual(Option.some(1.5 + half));
  });

  test('a cue shorter than half a frame is landed in its middle, never past its end', () => {
    // Five milliseconds from 1 s: half a frame (1/60 s) in would land after it, where nothing fires.
    const blink = new Map([['rise', cue(1, 0.005)]]);
    for (const line of [1, 2]) {
      const at = Option.getOrThrow(tapFrom(voiced, line, clockAt(0.2, blink, VOICE)));
      expect(at).toBeCloseTo(1.0025, 9);
      expect(litNow(voiced, clockAt(at, blink, VOICE)).reads).toEqual([inVoiced('f.at("rise")')]);
    }
  });
});

describe('the band over the code', () => {
  test('names the scene and the mark last said, the scene alone before its first', () => {
    expect(beatWords('cold', VOICE, 1)).toBe('cold');
    expect(beatWords('cold', VOICE, 1.5)).toBe('cold · {take}');
    expect(beatWords('cold', VOICE, 2.4)).toBe('cold · {take}');
    expect(beatWords('cold', VOICE, 9)).toBe('cold · {held}');
    expect(beatWords('cold', SILENT, 9)).toBe('cold');
  });
});

describe('the rows the view draws', () => {
  test('a row to a line, and none after the newline that ends the file', () => {
    const of = (text: string) => rowsOf({ ...code, text }).map((r) => r.text);
    expect(of('a\nb\n')).toStrictEqual(['a', 'b']);
    expect(of('a\nb')).toStrictEqual(['a', 'b']);
    expect(of('a\n\n')).toStrictEqual(['a', '']);
    expect(of('')).toStrictEqual(['']);
  });
});

describe('the meters a line wears', () => {
  const ONE = 'timeline: { rise: { dur: 1 }, fall: { dur: 2 } }\nf.at("rise");';
  const at = (needle: string): readonly [number, number] => {
    const i = ONE.indexOf(needle);
    return [i, i + needle.length];
  };
  const both: SceneCode = {
    ...code,
    text: ONE,
    cues: [
      { name: 'rise', at: at('rise: { dur: 1 }'), reads: [] },
      { name: 'fall', at: at('fall: { dur: 2 }'), reads: [] },
    ],
  };

  test('two cues playing from one line each keep their meter there', () => {
    const lit = litNow(
      both,
      clockAt(
        0.5,
        new Map([
          ['rise', cue(0, 1)],
          ['fall', cue(0, 2)],
        ]),
      ),
    );
    expect(metersOn(lit.meters, 1).map((m) => m.name)).toEqual(['rise', 'fall']);
    expect(metersOn(lit.meters, 2)).toEqual([]);
  });
});
