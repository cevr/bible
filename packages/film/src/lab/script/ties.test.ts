// The Script's ties: each cue of a beat tied to the words its start and end
// land on, through `after` and `with` chains, as `layout()` placed it; and
// a picture's brief read into the cues and marks it names.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from '../../core/layout.ts';
import { lineRows } from '../transcript/lit.ts';
import { Brief, briefOf, tieTimes, tiesOf, tiesOfCue, tiesOfMark, tiesOfWords } from './ties.ts';

const said = Result.getOrThrow(
  layout(
    [
      {
        id: 'gift',
        say: 'By {grace}grace you are {saved}saved through {faith}faith, and that not of yourselves.',
        timeline: {
          open: { at: 'start', dur: 1 },
          glow: { mark: 'grace', dur: 0.5 },
          lift: { after: 'glow', dur: 0.4 },
          ring: { with: 'lift', dur: 0.2 },
          push: { mark: 'saved', until: 'faith' },
          seal: { mark: 'saved', word: 'faith', dur: 0.3 },
          tail: { after: 'push', dur: 0.2 },
        },
      },
      { id: 'still', min: 2 },
    ],
    { voice: '', scenes: {} },
  ),
);
const gift = said[0];
const lines = lineRows(said);
const ties = Option.getOrElse(
  Option.map(Option.fromUndefinedOr(gift), (p) => tiesOf(p, Option.fromUndefinedOr(lines[0]))),
  () => [],
);
const names = (list: ReadonlyArray<{ readonly cue: string }>) => list.map((t) => t.cue);

describe("the Script's ties of a beat's cues to its words", () => {
  test('each cue where layout placed it, in play order, saying what it starts from and runs until', () => {
    const placed = (cue: string) => Option.fromUndefinedOr(gift?.cues.get(cue));
    expect(names(ties).toSorted()).toEqual([
      'glow',
      'lift',
      'open',
      'push',
      'ring',
      'seal',
      'tail',
    ]);
    for (const t of ties)
      expect(Option.some({ start: t.start, end: t.end })).toEqual(
        Option.map(placed(t.cue), (c) => ({ start: c.start, end: c.end })),
      );
    const starts = ties.map((t) => t.start);
    expect(starts).toEqual(starts.toSorted((a, b) => a - b));
    expect(Object.fromEntries(ties.map((t) => [t.cue, t.said]))).toEqual({
      open: 'scene start',
      glow: 'mark {grace}',
      lift: 'after cue glow',
      ring: 'with cue lift',
      push: 'mark {saved} · until {faith}',
      seal: 'word "faith" after mark {saved}',
      tail: 'after cue push',
    });
  });

  test('a start and an end land on the words their marks stand before, through every after and with', () => {
    expect(Object.fromEntries(ties.map((t) => [t.cue, [t.marks, t.words]]))).toEqual({
      // A landmark lands on no word.
      open: [[], []],
      glow: [['grace'], [1]],
      // After glow is where glow ends, a length past its mark; with lift is where lift starts.
      lift: [['grace'], [1]],
      ring: [['grace'], [1]],
      // Its end runs until {faith}: two words.
      push: [
        ['saved', 'faith'],
        [4, 6],
      ],
      // A word pinned after a mark lands on that word.
      seal: [['saved'], [6]],
      // After push is where push ends: {faith}.
      tail: [['faith'], [6]],
    });
  });

  test("a mark's ties, words' ties, and a cue's among the cues that share its marks", () => {
    expect(names(tiesOfMark(ties, 'grace'))).toEqual(['glow', 'lift', 'ring']);
    expect(names(tiesOfMark(ties, 'saved'))).toEqual(
      names(ties.filter((t) => ['push', 'seal'].includes(t.cue))),
    );
    expect(names(tiesOfWords(ties, 6, 6))).toEqual(
      names(ties.filter((t) => ['push', 'seal', 'tail'].includes(t.cue))),
    );
    expect(tiesOfWords(ties, 7, 11)).toEqual([]);
    expect(names(tiesOfCue(ties, 'lift'))).toEqual(['glow', 'lift', 'ring']);
    // A cue tied to no mark stands alone; a name the beat lacks has none.
    expect(names(tiesOfCue(ties, 'open'))).toEqual(['open']);
    expect(tiesOfCue(ties, 'nowhere')).toEqual([]);
  });

  test('a chain that leads back to itself lands nowhere, and a beat with no line ties to no word', () => {
    const looped = Option.map(Option.fromUndefinedOr(gift), (p) =>
      tiesOf(
        {
          ...p,
          spec: { ...p.spec, timeline: { a: { after: 'b' }, b: { with: 'a' } } },
          cues: new Map([
            ['a', { start: 0, end: 0, dur: 0, ease: 'linear', stagger: 0 }],
            ['b', { start: 0, end: 0, dur: 0, ease: 'linear', stagger: 0 }],
          ]),
        },
        Option.fromUndefinedOr(lines[0]),
      ),
    );
    expect(Option.map(looped, (l) => l.map((t) => [t.cue, t.marks, t.words]))).toEqual(
      Option.some([
        ['a', [], []],
        ['b', [], []],
      ]),
    );
    const silent = Option.map(Option.fromUndefinedOr(gift), (p) => tiesOf(p, Option.none()));
    expect(Option.map(silent, (l) => l.find((t) => t.cue === 'glow')?.words)).toEqual(
      Option.some([]),
    );
  });

  test('a tie is timed to the hundredth, as `film cues` prints it', () => {
    expect(tieTimes({ start: 0.85, end: 1.9 })).toBe('0.85–1.90 s');
    expect(tieTimes({ start: 0.85, end: 0.85 })).toBe('0.85 s');
  });
});

describe("a picture's brief", () => {
  test('a name in backticks is the cue it names, else the mark, else the beat, else code', () => {
    expect(
      briefOf(
        'It climbs on `rise`, drops on `fall` as in `two` and stops: `still`.',
        ['rise'],
        { fall: 3 },
        ['one', 'two'],
      ),
    ).toEqual([
      Brief.Text({ text: 'It climbs on ' }),
      Brief.Cue({ name: 'rise' }),
      Brief.Text({ text: ', drops on ' }),
      Brief.Mark({ name: 'fall' }),
      Brief.Text({ text: ' as in ' }),
      Brief.Beat({ name: 'two' }),
      Brief.Text({ text: ' and stops: ' }),
      Brief.Code({ text: 'still' }),
      Brief.Text({ text: '.' }),
    ]);
    // A cue, a mark and a beat of one name: the cue; a mark and a beat: the mark. No empty
    // words around a name that opens or ends it.
    expect(briefOf('`rise`', ['rise'], { rise: 0 }, ['rise'])).toEqual([
      Brief.Cue({ name: 'rise' }),
    ]);
    expect(briefOf('`fall`', [], { fall: 0 }, ['fall'])).toEqual([Brief.Mark({ name: 'fall' })]);
    expect(briefOf('No names here.', [], {}, [])).toEqual([Brief.Text({ text: 'No names here.' })]);
  });
});
