// What the pages say of a film's scenes at a glance (design language §6): a
// Films card's state band, each scene in its render's state (out of date, not
// rendered) or its approval (approved, or approved earlier) from the film's
// project, and the film's length and counts. The project may not be read
// (yet, or at all: a short has no project): the page then says nothing of
// it, never a wrong word. Pure.

import { Array as Arr, Option } from 'effect';
import type { ProjectScene } from '../../core/catalogue.ts';
import { clock } from '../../core/time.ts';
import { counted } from '../../core/words.ts';

/**
 * How long `scenes` run, the one rule of a film's length: from
 * where the first of the scenes that say where they sit starts to where the
 * last ends. A scene that does not say is no part of it; none says: none.
 */
const filmSpan = (scenes: ReadonlyArray<ProjectScene>): Option.Option<number> => {
  const spans = Arr.getSomes(scenes.map((s) => s.span));
  return Arr.match(spans, {
    onEmpty: () => Option.none<number>(),
    onNonEmpty: (all) =>
      Option.some(
        Math.max(...all.map((p) => p.start + p.dur)) - Math.min(...all.map((p) => p.start)),
      ),
  });
};

/**
 * A film's length and its scenes, as a Films card says it over its band:
 * `8:46 · 20 scenes`. The length is `filmSpan`, to the second; a film none of
 * whose scenes says where it sits is its scenes alone.
 */
export const filmLength = (scenes: ReadonlyArray<ProjectScene>): string => {
  const length = Option.map(filmSpan(scenes), clock);
  return [...Option.toArray(length), counted(scenes.length, 'scene')].join(' · ');
};

/**
 * A film's scenes summed up, as a Films card says it:
 * `0/4 approved · 1 out of date · 1 not rendered`, the last two left out at 0.
 */
export const filmCounts = (scenes: ReadonlyArray<ProjectScene>): string =>
  [
    `${scenes.filter((s) => s.approval === 'approved').length}/${scenes.length} approved`,
    ...[
      [scenes.filter((s) => s.state === 'stale').length, 'out of date'] as const,
      [scenes.filter((s) => s.state === 'missing').length, 'not rendered'] as const,
    ]
      .filter(([n]) => n > 0)
      .map(([n, word]) => `${n} ${word}`),
  ].join(' · ');

/**
 * The state a scene's band segment is drawn in (a `--state-*` token's name):
 * its most pressing, its render's state first (out of date, not rendered),
 * then its approval (approved, approved earlier); none when all is well (its
 * hue).
 */
export const bandState = (scene: ProjectScene): Option.Option<'stale' | 'rendered' | 'approved'> =>
  Arr.findFirst(
    [
      [scene.state === 'stale', 'stale'],
      [scene.state === 'missing', 'rendered'],
      [scene.approval === 'approved', 'approved'],
      [scene.approval === 'stale', 'stale'],
    ] as const,
    ([holds]) => holds,
  ).pipe(Option.map(([, state]) => state));
