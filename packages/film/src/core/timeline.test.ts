import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { CueCycle, UnknownCue, UnknownMark, UntilBeforeStart, WordMissing } from './errors.ts';
import { layout, sceneClock } from './layout.ts';
import type { Span, Timeline, Timings } from './schema.ts';

/** No recorded takes: every scene is estimated. */
const noTakes: Timings = { voice: '', scenes: {} };
import { DEFAULT_EASE, ease } from './time.ts';
import {
  type SceneClock,
  cueKeys,
  cueProgress,
  dragPatch,
  patchSpan,
  resolveTimeline,
  staggerProgress,
} from './timeline.ts';

const clock: SceneClock = {
  scene: 'justified',
  marks: new Map([
    ['fiction', 2],
    ['as', 5],
  ]),
  words: [
    { text: 'A', start: 0, end: 0.2 },
    { text: 'legal', start: 0.3, end: 0.6 },
    { text: 'fiction?', start: 2, end: 2.5 },
    { text: '“Not,', start: 3, end: 3.3 },
    { text: 'as', start: 5, end: 5.2 },
    { text: 'not', start: 6, end: 6.2 },
  ],
  speechStart: 0.5,
  speechEnd: 8.5,
  dur: 9.4,
};

/** Why `timeline` does not resolve on `clock`. */
const failure = (timeline: Timeline) =>
  Option.getOrThrow(Result.getFailure(resolveTimeline(timeline, clock)));

describe('timeline', () => {
  test('a mark anchor starts at the mark, scene-local, plus its offset', () => {
    const cues = Result.getOrThrow(
      resolveTimeline({ slam: { mark: 'fiction', offset: 0.9, dur: 0.35 } }, clock),
    );
    expect(cues.get('slam')).toEqual({
      start: 0.5 + 2 + 0.9,
      end: 0.5 + 2 + 0.9 + 0.35,
      dur: 0.35,
      ease: DEFAULT_EASE,
      stagger: 0,
    });
  });

  test('a span’s ease is data: the resolved cue carries it, or the default', () => {
    const cues = Result.getOrThrow(
      resolveTimeline(
        { slam: { mark: 'fiction', dur: 1, ease: 'inQuad' }, lift: { after: 'slam', dur: 1 } },
        clock,
      ),
    );
    expect(cues.get('slam')?.ease).toBe('inQuad');
    expect(cues.get('lift')?.ease).toBe('inOutCubic');
  });

  test('cueKeys reads keyframes in fractions of the cue, so a longer dur stretches the motion', () => {
    const swing = [
      [0, 0.35],
      [0.4, -0.2],
      [0.8, 1.5, 'inOutCubic'],
      [1, 1.45],
    ] as const;
    const short = { start: 2, end: 2.5, dur: 0.5, ease: DEFAULT_EASE, stagger: 0 } as const;
    const long = { ...short, end: 3, dur: 1 };
    // The same fraction of each cue reads the same value; the same second does not.
    expect(cueKeys(long, 2.8, swing)).toBe(cueKeys(short, 2.4, swing));
    expect(cueKeys(long, 2.4, swing)).not.toBe(cueKeys(short, 2.4, swing));
    expect(cueKeys(short, 2.5, swing)).toBe(1.45);
    expect(cueKeys(short, 1, swing)).toBe(0.35);
  });

  test('cueKeys eases a key that names none by the cue’s ease, so the lab’s ease picker moves it', () => {
    const rise = [
      [0, 0],
      [1, 1],
    ] as const;
    const cue = { start: 0, end: 2, dur: 2, ease: 'inQuad', stagger: 0 } as const;
    expect(cueKeys(cue, 1, rise)).toBe(0.25);
    expect(cueKeys({ ...cue, ease: 'linear' }, 1, rise)).toBe(0.5);
    expect(
      cueKeys(cue, 1, [
        [0, 0],
        [1, 1, 'linear'],
      ]),
    ).toBe(0.5);
  });

  test('cueKeys on an instant cue jumps to its last value at the cue', () => {
    const cue = { start: 1, end: 1, dur: 0, ease: DEFAULT_EASE, stagger: 0 } as const;
    const step = [
      [0, 3],
      [1, 7],
    ] as const;
    expect([cueKeys(cue, 0.99, step), cueKeys(cue, 1, step)]).toEqual([3, 7]);
  });

  test('a staggered cue spreads n items over its stagger share; each lasts the rest', () => {
    const drop = { start: 2, end: 3.4, dur: 1.4, ease: 'linear', stagger: 0.5 } as const;
    // Three items start at 0, 0.25 and 0.5 of the cue (2, 2.35, 2.7 s), each lasting 0.7 s.
    expect(staggerProgress(drop, 2.35, 0, 3)).toBeCloseTo(0.5);
    expect(staggerProgress(drop, 2.35, 1, 3)).toBe(0);
    expect(staggerProgress(drop, 2.7, 1, 3)).toBeCloseTo(0.5);
    expect(staggerProgress(drop, 3.05, 1, 3)).toBeCloseTo(1);
    expect(staggerProgress(drop, 3.4, 2, 3)).toBeCloseTo(1);
    expect(staggerProgress(drop, 3.5, 2, 3)).toBe(1);
    // A dur edit scales every item: item 1 now starts at 2.7 and lasts 1.4 s.
    const longer = { ...drop, end: 4.8, dur: 2.8 };
    expect(staggerProgress(longer, 3.4, 1, 3)).toBeCloseTo(0.5);
    // Each item eases by the cue's ease.
    expect(staggerProgress({ ...drop, ease: 'inQuad' }, 2.35, 0, 3)).toBeCloseTo(0.25);
  });

  test('with no stagger, or one item, every item is the whole cue', () => {
    const cue = { start: 1, end: 3, dur: 2, ease: 'inQuad', stagger: 0 } as const;
    expect(staggerProgress(cue, 2, 4, 9)).toBe(cueProgress(cue, 2));
    expect(staggerProgress({ ...cue, stagger: 0.6 }, 2, 0, 1)).toBe(cueProgress(cue, 2));
  });

  test('a span’s stagger resolves onto its cue, 0 when it declares none', () => {
    const cues = Result.getOrThrow(
      resolveTimeline(
        { drop: { mark: 'fiction', dur: 1.4, stagger: 0.5 }, lift: { after: 'drop' } },
        clock,
      ),
    );
    expect([cues.get('drop')?.stagger, cues.get('lift')?.stagger]).toEqual([0.5, 0]);
  });

  test('cueProgress eases by the cue’s own ease', () => {
    const cue = { start: 1, end: 3, dur: 2, ease: 'inQuad', stagger: 0 } as const;
    // Halfway through: inQuad gives 0.25.
    expect(cueProgress(cue, 2)).toBeCloseTo(0.25);
    expect(cueProgress({ ...cue, ease: DEFAULT_EASE }, 2.5)).toBeCloseTo(ease.inOutCubic(0.75));
    // Before and after the span it is pinned, whatever the ease.
    expect(cueProgress(cue, 0)).toBe(0);
    expect(cueProgress(cue, 9)).toBe(1);
  });

  test('`after` chains from the end of a cue, `with` from its start, in any declared order', () => {
    const cues = Result.getOrThrow(
      resolveTimeline(
        {
          no: { with: 'strike', offset: 0.3, dur: 0.6 },
          strike: { after: 'ask', offset: -0.2, dur: 0.5 },
          ask: { after: 'slam', offset: 0.85, dur: 1 },
          slam: { mark: 'fiction', dur: 0.35 },
        },
        clock,
      ),
    );
    const at = (n: string) => cues.get(n)?.start ?? NaN;
    expect(at('ask')).toBeCloseTo(2.5 + 0.35 + 0.85);
    expect(at('strike')).toBeCloseTo(at('ask') + 1 - 0.2);
    expect(at('no')).toBeCloseTo(at('strike') + 0.3);
    expect(cues.get('no')?.end).toBeCloseTo(at('no') + 0.6);
  });

  test('scene anchors read the scene landmarks; an instant has no length', () => {
    const cues = Result.getOrThrow(
      resolveTimeline(
        {
          open: { scene: 'start', offset: 0.1 },
          voice: { scene: 'speech' },
          hush: { scene: 'speechEnd', offset: 0.2 },
          close: { scene: 'end', offset: -1, dur: 1 },
        },
        clock,
      ),
    );
    expect(cues.get('open')).toEqual({
      start: 0.1,
      end: 0.1,
      dur: 0,
      ease: DEFAULT_EASE,
      stagger: 0,
    });
    expect(cues.get('voice')?.start).toBe(0.5);
    expect(cues.get('hush')?.start).toBeCloseTo(8.7);
    expect(cues.get('close')?.end).toBeCloseTo(9.4);
  });

  test('`until` ends a cue on a mark: its dur is whatever reaches it', () => {
    const cues = Result.getOrThrow(
      resolveTimeline(
        { walk: { mark: 'fiction', offset: 0.3, until: 'as' }, sit: { after: 'walk', dur: 1 } },
        clock,
      ),
    );
    expect(cues.get('walk')?.start).toBeCloseTo(2.8);
    expect(cues.get('walk')?.end).toBe(0.5 + 5);
    expect(cues.get('walk')?.dur).toBeCloseTo(2.7);
    expect(cues.get('sit')?.start).toBe(0.5 + 5);
    // A re-take that moves the mark moves the end with it.
    const later = { ...clock, marks: new Map([...clock.marks, ['as', 6]]) };
    expect(
      Result.getOrThrow(resolveTimeline({ walk: { mark: 'fiction', until: 'as' } }, later)).get(
        'walk',
      )?.dur,
    ).toBe(4);
  });

  test('`until` an unknown mark, or a mark before the cue starts, is an authoring error', () => {
    expect(failure({ walk: { scene: 'start', until: 'nope' } })).toEqual(
      UnknownMark.make({
        scene: 'justified',
        mark: 'nope',
        by: 'cue "walk"',
        known: ['fiction', 'as'],
      }),
    );
    expect(failure({ walk: { mark: 'as', until: 'fiction' } })).toEqual(
      UntilBeforeStart.make({ scene: 'justified', cue: 'walk', mark: 'fiction' }),
    );
  });

  test('patchSpan: a span ends one way, so a dur replaces an until and an until a dur', () => {
    const walk = { mark: 'fiction', offset: 0.3, until: 'as', ease: 'linear' } as const;
    expect(patchSpan(walk, { dur: 2 })).toEqual({
      mark: 'fiction',
      offset: 0.3,
      dur: 2,
      ease: 'linear',
    });
    expect(patchSpan({ after: 'slam', dur: 1 }, { until: 'as', offset: -0.1 })).toEqual({
      after: 'slam',
      offset: -0.1,
      until: 'as',
    });
    expect(patchSpan(walk, { ease: 'inQuad' })).toEqual({ ...walk, ease: 'inQuad' });
  });

  test('dragPatch: the body moves the offset, the right edge the dur, the left edge both', () => {
    const slam = { mark: 'fiction', offset: 0.9, dur: 0.35 } as const;
    const c = Option.getOrThrow(
      Option.fromUndefinedOr(Result.getOrThrow(resolveTimeline({ slam }, clock)).get('slam')),
    );
    const drag = (edge: 'move' | 'start' | 'end', start: number, end: number) =>
      dragPatch(slam, c, edge, { start, end }, 1 / 30);
    expect(drag('move', c.start + 0.2, c.end + 0.2)).toEqual(Option.some({ offset: 1.1 }));
    expect(drag('end', c.start, c.end + 0.25)).toEqual(Option.some({ dur: 0.6 }));
    expect(drag('start', c.start - 0.1, c.end)).toEqual(Option.some({ offset: 0.8, dur: 0.45 }));
    expect(drag('start', c.start, c.end)).toEqual(Option.none());
  });

  test('a span that `ends` on its anchor lands there, and a dur edit keeps the landing', () => {
    const land = { mark: 'fiction', dur: 0.5, ends: true } as const;
    const at = (span: Span) =>
      Result.getOrThrow(resolveTimeline({ land: span }, clock)).get('land');
    // Lands on {fiction} (0.5 + 2) and starts its length before it.
    expect(at(land)).toMatchObject({ start: 2.5 - 0.5, end: 2.5, dur: 0.5 });
    // The same cue written as a negative offset: one number twice.
    expect(at(land)).toEqual(at({ mark: 'fiction', offset: -0.5, dur: 0.5 }));
    // A longer dur starts earlier; the landing holds.
    expect(at(patchSpan(land, { dur: 0.8 }))).toMatchObject({ end: 2.5, dur: 0.8 });
    // An offset moves the landing off the anchor.
    expect(at({ ...land, offset: 0.1 })?.end).toBeCloseTo(2.6);
    // An `until` replaces the landing.
    expect(patchSpan(land, { until: 'as' })).toEqual({ mark: 'fiction', until: 'as' });
  });

  test('dragPatch: a span that ends on its anchor moves its end by its offset', () => {
    const land = { mark: 'fiction', dur: 0.5, ends: true } as const;
    const c = Option.getOrThrow(
      Option.fromUndefinedOr(Result.getOrThrow(resolveTimeline({ land }, clock)).get('land')),
    );
    const drag = (edge: 'move' | 'start' | 'end', start: number, end: number) =>
      dragPatch(land, c, edge, { start, end }, 1 / 30);
    // The left edge sets only the dur: the landing stays on the mark.
    expect(drag('start', c.start - 0.3, c.end)).toEqual(Option.some({ dur: 0.8 }));
    // The body and the right edge move the landing by the offset.
    expect(drag('move', c.start + 0.2, c.end + 0.2)).toEqual(Option.some({ offset: 0.2 }));
    expect(drag('end', c.start, c.end + 0.2)).toEqual(Option.some({ offset: 0.2, dur: 0.7 }));
    expect(drag('start', c.start, c.end)).toEqual(Option.none());
  });

  test('dragPatch: a span that runs until a mark keeps ending on it', () => {
    // Starts at 2.8 (speech 0.5 + fiction 2 + 0.3), ends on {as} at 5.5.
    const walk = { mark: 'fiction', offset: 0.3, until: 'as' } as const;
    const c = Option.getOrThrow(
      Option.fromUndefinedOr(Result.getOrThrow(resolveTimeline({ walk }, clock)).get('walk')),
    );
    const drag = (edge: 'move' | 'start' | 'end', start: number, end: number) =>
      dragPatch(walk, c, edge, { start, end }, 1 / 30);
    // The left edge and the body move only the start: the end stays on the mark.
    expect(drag('start', 3, 5.5)).toEqual(Option.some({ offset: 0.5 }));
    expect(drag('move', 3.8, 6.5)).toEqual(Option.some({ offset: 1.3 }));
    // Dragged past the mark, the start holds a frame before it: the span still resolves.
    const past = drag('move', 6, 8.7);
    expect(past).toEqual(Option.some({ offset: 2.967 }));
    const moved = Result.getOrThrow(
      resolveTimeline({ walk: patchSpan(walk, Option.getOrThrow(past)) }, clock),
    );
    expect(moved.get('walk')?.end).toBe(5.5);
    // The right edge dropped on the mark keeps `until`; dropped off it, the dur is set by hand.
    expect(drag('end', 2.8, 5.5)).toEqual(Option.none());
    expect(drag('end', 2.8, 6)).toEqual(Option.some({ dur: 3.2 }));
  });

  test('a word pin starts at the first word said at or after its mark that reads the word', () => {
    const cues = Result.getOrThrow(
      resolveTimeline(
        {
          open: { mark: 'fiction', word: 'not', offset: -0.3, dur: 0.6 },
          again: { mark: 'as', word: 'not', dur: 0.5 },
          self: { mark: 'fiction', word: 'fiction' },
        },
        clock,
      ),
    );
    // Quotes, commas and case are ignored: “Not, reads not.
    expect(cues.get('open')?.start).toBeCloseTo(0.5 + 3 - 0.3, 9);
    expect(cues.get('open')?.dur).toBe(0.6);
    // The first "not" at or after {as}, not the one before it.
    expect(cues.get('again')?.start).toBe(0.5 + 6);
    // The mark's own word counts.
    expect(cues.get('self')?.start).toBe(0.5 + 2);
  });

  test('a word pin reads a word as the take check does: any case, apostrophes dropped, a hyphen’s parts, accents kept', () => {
    const said: SceneClock = {
      ...clock,
      marks: new Map([['m', 0]]),
      words: [
        { text: '“God’s', start: 1, end: 1.2 },
        { text: 'cover-up,', start: 2, end: 2.4 },
        { text: 'Christ', start: 3, end: 3.3 },
        { text: 'Café.', start: 4, end: 4.3 },
        { text: 'naïve', start: 5, end: 5.3 },
      ],
    };
    const at = (word: string) =>
      Result.map(
        resolveTimeline({ c: { mark: 'm', word, dur: 0.1 } }, said),
        (cues) => cues.get('c')?.start,
      ).pipe(Result.getOrElse((e) => e._tag));
    expect(at("god's")).toBe(0.5 + 1);
    expect(at('God’s')).toBe(0.5 + 1);
    expect(at('gods')).toBe(0.5 + 1);
    expect(at('cover')).toBe(0.5 + 2);
    expect(at('up')).toBe(0.5 + 2);
    expect(at('cover-up')).toBe(0.5 + 2);
    expect(at('Christ')).toBe(0.5 + 3);
    expect(at('café')).toBe(0.5 + 4);
    expect(at('CAFÉ')).toBe(0.5 + 4);
    // Composed or decomposed, an accent is the same letter.
    expect(at('naïve')).toBe(0.5 + 5);
    // A part is a whole part: "cove" is not "cover", "caf" not "café".
    expect(at('cove')).toBe('WordMissing');
    expect(at('caf')).toBe('WordMissing');
  });

  test('a word pin on a word the line never says after its mark is WordMissing, never the mark', () => {
    const pin = (mark: string, word: string) => failure({ lit: { mark, word, dur: 0.6 } });
    // Said only before the mark.
    expect(pin('as', 'legal')).toEqual(
      WordMissing.make({ scene: 'justified', by: 'cue "lit"', mark: 'as', word: 'legal' }),
    );
    // Never said.
    expect(pin('fiction', 'faith')).toBeInstanceOf(WordMissing);
  });

  test('patchSpan keeps a word pin’s word', () => {
    expect(patchSpan({ mark: 'fiction', word: 'not', dur: 0.6 }, { offset: -0.2 })).toEqual({
      mark: 'fiction',
      word: 'not',
      offset: -0.2,
      dur: 0.6,
    });
  });

  test('an unknown mark names the scene and the cue', () => {
    expect(failure({ slam: { mark: 'nope' } })).toMatchObject({
      _tag: 'UnknownMark',
      scene: 'justified',
      mark: 'nope',
      by: 'cue "slam"',
    });
  });

  test('an unknown cue names the scene and the cue that refers to it', () => {
    expect(failure({ ask: { after: 'slam' } })).toEqual(
      UnknownCue.make({ scene: 'justified', cue: 'slam', by: 'cue "ask"', known: ['ask'] }),
    );
  });

  test('a cycle is an authoring error', () => {
    expect(failure({ a: { after: 'b' }, b: { with: 'c' }, c: { after: 'a' } })).toEqual(
      CueCycle.make({ scene: 'justified', cycle: ['a', 'b', 'c', 'a'] }),
    );
  });

  test('layout resolves each scene’s cues once, against its own voice', () => {
    const [a] = Result.getOrThrow(
      layout(
        [{ id: 'a', say: 'Look {live}and live.', lead: 0.5, timeline: { lift: { mark: 'live' } } }],
        noTakes,
      ),
    );
    expect(a?.cues.get('lift')?.start).toBe(0.5 + (a?.voice.marks.get('live') ?? NaN));
  });

  test('layout carries each scene’s knobs as declared; a scene without them has none', () => {
    const [a, b] = Result.getOrThrow(
      layout(
        [
          { id: 'a', knobs: { handY: 800, quoteAt: [960, 170] } },
          { id: 'b', say: 'Look.' },
        ],
        noTakes,
      ),
    );
    expect(a?.knobs.get('handY')).toBe(800);
    expect(a?.knobs.get('quoteAt')).toEqual([960, 170]);
    expect(b?.knobs.size).toBe(0);
  });

  test('a placed scene re-resolves on its own clock exactly as layout placed it', () => {
    const placed = Result.getOrThrow(
      layout(
        [
          {
            id: 'hand',
            say: 'Faith {earns} nothing.',
            timeline: {
              topple: { mark: 'earns', offset: 0.1, dur: 1.8 },
              stars: { after: 'topple', offset: 0.2, dur: 1 },
            },
          },
        ],
        noTakes,
      ),
    );
    expect(placed.length).toBe(1);
    for (const p of placed) {
      const clockOfHand = sceneClock(p);
      expect(Result.getOrThrow(resolveTimeline(p.spec.timeline, clockOfHand))).toEqual(p.cues);
      // The lab's preview of a drag: +0.3s on topple moves it and what follows it.
      const dragged = Result.getOrThrow(
        resolveTimeline(
          { ...p.spec.timeline, topple: { mark: 'earns', offset: 0.4, dur: 1.8 } },
          clockOfHand,
        ),
      );
      for (const name of ['topple', 'stars'])
        expect(dragged.get(name)?.start).toBeCloseTo((p.cues.get(name)?.start ?? NaN) + 0.3, 9);
    }
  });
});
