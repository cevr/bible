// A scene's marks come from what the page has read: its act, render state
// and approval from the project, and the findings whose address names it.
// Unread, a scene has no such mark (never a wrong one); its chips say the
// most pressing first, and the legend counts the film's.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import type { ProjectView } from '../../core/api.ts';
import type { ProjectScene } from '../../core/catalogue.ts';
import type { CheckLine } from '../../core/schema.ts';
import { bandState, checkCount, chipsOf, legendOf, marksOf } from './marks.ts';

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

describe('marksOf', () => {
  const marks = marksOf(Option.some(VIEW), FINDINGS);

  test("a scene's act, render and the findings that name it", () => {
    const one = marks('one');
    expect(one.act).toEqual(Option.some('open'));
    expect(Option.map(one.render, (r) => r.state)).toEqual(Option.some('stale'));
    expect(one.findings.length).toBe(2);
    expect(marks('three').act).toEqual(Option.none());
  });

  test('a project not read leaves a scene with no act and no render state', () => {
    const unread = marksOf(Option.none(), [])('one');
    expect(unread.act).toEqual(Option.none());
    expect(unread.render).toEqual(Option.none());
    expect(chipsOf(unread)).toEqual([]);
    expect(bandState(unread)).toEqual(Option.none());
  });

  test('its chips say the render first, then the approval, then the findings', () => {
    expect(chipsOf(marks('one')).map((c) => c.text)).toEqual(['Out of date', '2 findings']);
    expect(chipsOf(marks('two')).map((c) => c.text)).toEqual(['Approved']);
    expect(chipsOf(marks('three')).map((c) => c.text)).toEqual([
      'Not rendered',
      '1 finding',
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
    )('one');
    expect(chipsOf(bySound).map((c) => [c.text, c.why])).toEqual([
      ['Out of date', "out of date: the film's sound changed since it was made"],
      ['Approved earlier', 'needs review: an earlier version was approved'],
    ]);
    expect(chipsOf(marks('three'))[0]?.why).toBe('not made yet');
  });

  test("the legend counts the film's scenes out of date, approved, and the check's lines once each by level, the film's apart; none left at 0", () => {
    expect(legendOf(['one', 'two', 'three'], marks, FINDINGS).map((l) => l.text)).toEqual([
      'out of date 1',
      'not rendered 1',
      'approved 1',
      'findings 2',
      'warnings 1',
      'film 1',
    ]);
    expect(legendOf(['two'], marksOf(Option.some(VIEW), []), []).map((l) => l.text)).toEqual([
      'approved 1',
    ]);
  });

  test("a check of 21 warnings, 20 about scenes and 1 the film's: the legend says warnings in the warning's colour, and counts the film's (RS-11, SU-3)", () => {
    const lines: ReadonlyArray<CheckLine> = [
      ...Array.from({ length: 20 }, (_, i) =>
        finding('warning', [['one', 'two', 'three'][i % 3] ?? 'one']),
      ),
      { level: 'warning', tag: 'AudioStale', message: "the film's audio is older than its script" },
    ];
    const legend = legendOf(['one', 'two', 'three'], marksOf(Option.none(), lines), lines);
    expect(legend.map((l) => [l.text, l.state])).toEqual([
      ['warnings 20', 'warning'],
      ['film 1', 'warning'],
    ]);
    // Counted as the Project's and Choices' chips count them: 21 lines, warnings only.
    expect(checkCount(lines)).toEqual({ errors: 0, warnings: 21 });
  });
});
