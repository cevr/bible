// What the pages say of a film's scenes at a glance (design language §6): a
// Films card's state band, each scene in its render's state (out of date, not
// rendered) or its approval (approved, or approved earlier) from the film's
// project, and the film's length and counts; and the check's findings, each
// placed in the scenes it is about (a finding whose time is in the scene, or
// whose address names it: `findingScenes`). The check is counted one way for
// every page (`checkCount`, `countState`): each line once, an error or a
// warning by its level (`tools/findings.ts`). The project may not be read
// (yet, or at all: a short has no project): the page then says nothing of
// it, never a wrong word. Pure.

import { Array as Arr, Match, Option } from 'effect';
import type { ProjectScene } from '../../core/catalogue.ts';
import { sceneAt } from '../../core/layout.ts';
import { clock } from '../../core/time.ts';
import type { CheckLine } from '../../core/schema.ts';
import { counted } from '../../core/words.ts';

/** A scene as a finding is placed against it: its id, and where it starts in film seconds. */
interface PlacedScene {
  readonly id: string;
  readonly start: number;
}

/**
 * The scenes `line` is about: by its time first (the scene `placed` shows
 * then, `sceneAt`, as the playhead would), else by its address's scenes;
 * none when it has neither, the film's own (the film's or an act's with no
 * time, or no place). The one rule for every page that places a finding:
 * the Lab's inspector (`editor/format.ts` `findingsIn`).
 */
export const findingScenes = (
  line: CheckLine,
  placed: ReadonlyArray<PlacedScene>,
): Option.Option<ReadonlyArray<string>> =>
  Option.flatMap(Option.fromUndefinedOr(line.address), (at) =>
    Option.orElse(
      Option.flatMap(Option.fromUndefinedOr(at.time), (t) =>
        Option.map(sceneAt(placed, t), (p): ReadonlyArray<string> => [p.id]),
      ),
      () =>
        Match.value(at.part).pipe(
          Match.tag('Scenes', (part): Option.Option<ReadonlyArray<string>> =>
            Option.some(part.ids),
          ),
          Match.orElse(() => Option.none<ReadonlyArray<string>>()),
        ),
    ),
  );

/**
 * The check's lines counted one way, wherever a page counts them (the Lab's
 * inspector, the Findings sheet): each line once, as an error or a warning.
 */
interface CheckCount {
  readonly errors: number;
  readonly warnings: number;
}

/** `lines` counted by level (`CheckCount`). */
const checkCount = (lines: ReadonlyArray<CheckLine>): CheckCount => {
  const errors = lines.filter((l) => l.level === 'error').length;
  return { errors, warnings: lines.length - errors };
};

/** The state `lines` are drawn in: an error among them, warnings only, or none at all. */
export const countState = (
  lines: ReadonlyArray<CheckLine>,
): Option.Option<'findings' | 'warning'> => {
  const count = checkCount(lines);
  return Option.orElse(
    Option.as(
      Option.liftPredicate(count.errors, (n) => n > 0),
      'findings' as const,
    ),
    () =>
      Option.as(
        Option.liftPredicate(count.warnings, (n) => n > 0),
        'warning' as const,
      ),
  );
};

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
