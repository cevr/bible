// A Films card's words and band from the film's project: a scene's segment
// in its most pressing state, the film's length and its scenes' counts.

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { ActName } from '../../core/address-schema.ts';
import type { ProjectView } from '../../core/api.ts';
import type { ProjectScene } from '../../core/catalogue.ts';
import { bandState, filmCounts, filmLength } from './marks.ts';

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
  drawn: Option.none(),
  comments: [],
});

const VIEW: ProjectView = {
  project: {
    film: 'toy',
    variant: 'main',
    key: 'k',
    sound: Option.none(),
    comments: [],
    acts: [{ name: ActName.make('open'), scenes: ['one', 'two'], key: 'k', comments: [] }],
    scenes: [scene('one', 'stale'), scene('two', 'current', 'approved'), scene('three', 'missing')],
    gave: Option.none(),
    took: Option.none(),
  },
  folder: Option.none(),
  videos: {},
};

describe('bandState', () => {
  test("a scene's segment is drawn in its render's state first, then its approval's; none when all is well", () => {
    expect(VIEW.project.scenes.map(bandState)).toEqual([
      Option.some('stale'),
      Option.some('approved'),
      Option.some('rendered'),
    ]);
    expect(bandState(scene('one', 'stale', 'approved'))).toEqual(Option.some('stale'));
    expect(bandState(scene('one', 'current', 'stale'))).toEqual(Option.some('stale'));
    expect(bandState(scene('one', 'current'))).toEqual(Option.none());
  });
});

const placed = (id: string, start: number, dur: number): ProjectScene => ({
  ...scene(id, 'current'),
  span: Option.some({ start, dur }),
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
