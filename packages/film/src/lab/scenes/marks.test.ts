// A scene's marks come from what the page has read: its act, render state
// and approval from the project, and the findings about it: whose time is in
// it, else whose address names it.
// Unread, a scene has no such mark (never a wrong one); its chips say the
// most pressing first, and the legend counts the film's.

import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import type { ProjectView } from '../../core/api.ts';
import type { ProjectScene } from '../../core/catalogue.ts';
import type { CheckLine } from '../../core/schema.ts';
import {
  bandState,
  checkCount,
  chipsOf,
  filmCounts,
  filmLength,
  filmSpan,
  legendOf,
  marksOf,
} from './marks.ts';

const scene = (
  id: string,
  state: ProjectScene['state'],
  approval: ProjectScene['approval'] = 'none',
): ProjectScene => ({
  scene: id,
  key: 'k',
  state,
  staleBy: Option.none(),
  approval,
  render: Option.none(),
  span: Option.none(),
  comments: [],
});

const VIEW: ProjectView = {
  project: {
    film: 'toy',
    variant: 'main',
    key: 'k',
    sound: Option.none(),
    comments: [],
    acts: [{ name: 'open', scenes: ['one', 'two'], key: 'k', comments: [] }],
    scenes: [scene('one', 'stale'), scene('two', 'current', 'approved'), scene('three', 'missing')],
    gave: Option.none(),
    took: Option.none(),
  },
  folder: Option.none(),
  videos: {},
};

const finding = (level: CheckLine['level'], ids: ReadonlyArray<string>): CheckLine => ({
  level,
  tag: 'DurOnWord',
  message: 'a cue meets a word',
  address: { part: { _tag: 'Scenes', ids: ids as [string, ...string[]] } },
});

const FINDINGS: ReadonlyArray<CheckLine> = [
  finding('error', ['one']),
  finding('error', ['one', 'three']),
  finding('warning', ['three']),
  { level: 'error', tag: 'Film', message: 'about the whole film' },
];

/** The film's scenes where they start: one at 0 s, two at 4 s, three at 9 s. */
const PLACED = [
  { id: 'one', start: 0 },
  { id: 'two', start: 4 },
  { id: 'three', start: 9 },
];

describe('marksOf', () => {
  const marks = marksOf(Option.some(VIEW), FINDINGS, PLACED);

  test("a scene's act, render and the findings that name it", () => {
    const one = marks('one');
    expect(one.act).toEqual(Option.some('open'));
    expect(Option.map(one.render, (r) => r.state)).toEqual(Option.some('stale'));
    expect(one.findings.length).toBe(2);
    expect(marks('three').act).toEqual(Option.none());
  });

  test('a project not read leaves a scene with no act and no render state', () => {
    const unread = marksOf(Option.none(), [], PLACED)('one');
    expect(unread.act).toEqual(Option.none());
    expect(unread.render).toEqual(Option.none());
    expect(chipsOf(unread)).toEqual([]);
    expect(bandState(unread)).toEqual(Option.none());
  });

  test('its chips say the render first, then the approval, then the findings by level', () => {
    expect(chipsOf(marks('one')).map((c) => c.text)).toEqual(['Out of date', '2 errors']);
    expect(chipsOf(marks('two')).map((c) => c.text)).toEqual(['Approved']);
    expect(chipsOf(marks('three')).map((c) => c.text)).toEqual([
      'Not rendered',
      '1 error',
      '1 warning',
    ]);
    expect(bandState(marks('one'))).toEqual(Option.some('stale'));
  });

  test('each chip says in full why (a title over its word): why it is out of date, an approval of an earlier version', () => {
    const bySound = marksOf(
      Option.some({
        ...VIEW,
        project: {
          ...VIEW.project,
          scenes: [{ ...scene('one', 'stale', 'stale'), staleBy: Option.some('sound' as const) }],
        },
      }),
      [],
      PLACED,
    )('one');
    expect(chipsOf(bySound).map((c) => [c.text, c.why])).toEqual([
      ['Out of date', "out of date: the film's sound changed since it was made"],
      ['Approved earlier', 'needs review: an earlier version was approved'],
    ]);
    expect(chipsOf(marks('three'))[0]?.why).toBe('not made yet');
  });

  test("the legend counts the film's scenes out of date, approved, and the check's lines once each by level, the film's apart; none left at 0", () => {
    expect(legendOf(PLACED, marks, Result.succeed(FINDINGS)).map((l) => l.text)).toEqual([
      'out of date 1',
      'not rendered 1',
      'approved 1',
      'errors 2',
      'warnings 1',
      'film 1',
    ]);
    const two = PLACED.filter((p) => p.id === 'two');
    expect(
      legendOf(two, marksOf(Option.some(VIEW), [], two), Result.succeed([])).map((l) => l.text),
    ).toEqual(['approved 1']);
  });

  test("a finding with a time is the scene's playing then, as the Lab's inspector places it: one addressed to the film too", () => {
    const deadAir: CheckLine = {
      level: 'warning',
      tag: 'DeadAir',
      message: 'no sound 5.0-6.2 s',
      address: { part: { _tag: 'Film' }, time: 5 },
    };
    const timed = marksOf(Option.some(VIEW), [deadAir], PLACED);
    expect(timed('two').findings).toEqual([deadAir]);
    expect(timed('one').findings).toEqual([]);
    expect(legendOf(PLACED, timed, Result.succeed([deadAir])).map((l) => l.text)).toEqual([
      'out of date 1',
      'not rendered 1',
      'approved 1',
      'warnings 1',
    ]);
  });

  test("the tape bar's legend is a colour key, its words without the counts Info keeps (UR2-13)", () => {
    expect(legendOf(PLACED, marks, Result.succeed(FINDINGS)).map((l) => l.word)).toEqual([
      'out of date',
      'not rendered',
      'approved',
      'errors',
      'warnings',
      'film',
    ]);
  });

  test('a check that failed says so, why in its title: never a clean film (RS-1)', () => {
    const two = PLACED.filter((p) => p.id === 'two');
    const failed = legendOf(two, marksOf(Option.some(VIEW), [], two), Result.fail('lab down'));
    expect(failed.map((l) => [l.text, l.state])).toEqual([
      ['approved 1', 'approved'],
      ['check failed', 'findings'],
    ]);
    expect(failed.at(-1)).toMatchObject({ mark: 'check-failed', why: 'lab down' });
  });

  test("a check of 21 warnings, 20 about scenes and 1 the film's: the legend says warnings in the warning's colour, and counts the film's (RS-11, SU-3)", () => {
    const lines: ReadonlyArray<CheckLine> = [
      ...Array.from({ length: 20 }, (_, i) =>
        finding('warning', [['one', 'two', 'three'][i % 3] ?? 'one']),
      ),
      { level: 'warning', tag: 'AudioStale', message: "the film's audio is older than its script" },
    ];
    const legend = legendOf(PLACED, marksOf(Option.none(), lines, PLACED), Result.succeed(lines));
    expect(legend.map((l) => [l.text, l.state])).toEqual([
      ['warnings 20', 'warning'],
      ['film 1', 'warning'],
    ]);
    // Counted as the Project's chip counts them: 21 findings, warnings only; the legend's
    // numbers add up to the chip's (one word, `findings`, for every line of the check).
    expect(checkCount(lines)).toEqual({ errors: 0, warnings: 21 });
    expect(legend.reduce((sum, l) => sum + Number(l.text.split(' ').at(-1)), 0)).toBe(21);
  });
});

const placed = (id: string, start: number, dur: number): ProjectScene => ({
  ...scene(id, 'current'),
  span: Option.some({ start, dur }),
});

describe('filmSpan', () => {
  test('runs from where the first scene starts to where the last ends, gaps and unplaced scenes included', () => {
    expect(filmSpan([placed('a', 0, 4), scene('b', 'missing'), placed('c', 6, 2)])).toEqual(
      Option.some(8),
    );
    expect(filmSpan([placed('b', 10, 2), placed('a', 4, 3)])).toEqual(Option.some(8));
  });

  test('none while no scene says where it sits', () => {
    expect(filmSpan([scene('a', 'current')])).toEqual(Option.none());
  });
});

describe('filmLength', () => {
  test("a film's length is where its last scene ends, to the second, then its scenes", () => {
    const scenes = Array.from({ length: 20 }, (_, i) => placed(`s${i}`, i * 26.3, 26.3));
    expect(filmLength(scenes)).toBe('8:46 · 20 scenes');
  });

  test('a scene that does not say where it sits is counted, never measured', () => {
    expect(filmLength([placed('a', 0, 4), scene('b', 'missing'), placed('c', 4, 5.4)])).toBe(
      '0:09 · 3 scenes',
    );
  });

  test('no scene says where it sits: its scenes alone, one said as one', () => {
    expect(filmLength([scene('a', 'current')])).toBe('1 scene');
  });
});

describe('filmCounts', () => {
  test("a film's scenes in the chips' words: approved of all, then those out of date and not rendered (SU-8)", () => {
    expect(filmCounts(VIEW.project.scenes)).toBe('1/3 approved · 1 out of date · 1 not rendered');
  });

  test('none out of date or not rendered: approved alone, never a 0', () => {
    expect(filmCounts([scene('one', 'current'), scene('two', 'current', 'approved')])).toBe(
      '1/2 approved',
    );
  });

  test('20 scenes, each made for an earlier version: 0/20 approved · 20 out of date', () => {
    expect(filmCounts(Array.from({ length: 20 }, (_, i) => scene(`s${i}`, 'stale', 'stale')))).toBe(
      '0/20 approved · 20 out of date',
    );
  });
});
