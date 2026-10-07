// What a scene's card and the tape say of each scene at a glance (design
// language §6): its act, its render's state (out of date, not rendered) and
// its approval (approved, or approved earlier) from the film's project, and the check's findings about it
// (a finding whose time is in the scene, or whose address names it: `findingScenes`). Each mark is a chip: a word in
// the state's colour (`MarkChip.state`, a `--state-*` token's name), why in full its title. The
// tape's legend counts them over the film, the film's own lines too. The check is counted
// one way here for every page (`checkCount`, `countState`: Scenes, Project, Choices): each
// line once. Every line of the check is a finding (`tools/findings.ts`), an
// error or a warning by its level: the chips and the legend say `errors` and
// `warnings`, and Project's chip their sum, `findings`. The project or the check may not
// be read (yet, or at all: a short has no project): the scene then has no
// such mark, never a wrong one. Pure.

import { Array as Arr, Match, Option, Result } from 'effect';
import type { ProjectView } from '../../core/api.ts';
import type { ProjectScene } from '../../core/catalogue.ts';
import { sceneAt } from '../../core/layout.ts';
import type { CheckLine } from '../../core/schema.ts';
import { counted } from '../../core/words.ts';
import { APPROVAL_TEXT, stateText } from '../review/format.ts';

/** What is known of one scene: its act, its render and its approval, and the findings about it. */
export interface SceneMarks {
  readonly act: Option.Option<string>;
  readonly render: Option.Option<ProjectScene>;
  readonly findings: ReadonlyArray<CheckLine>;
}

/** A mark's chip: its word, why in full (its title), and the `--state-*` token it is drawn in. */
interface MarkChip {
  readonly mark: 'stale' | 'missing' | 'approved' | 'approved-earlier' | 'errors' | 'warnings';
  readonly text: string;
  readonly why: string;
  readonly state: 'stale' | 'rendered' | 'approved' | 'findings' | 'warning';
}

/** A scene as a finding is placed against it: its id, and where it starts in film seconds. */
interface PlacedScene {
  readonly id: string;
  readonly start: number;
}

/** The project's scenes as findings are placed against them: each that says where it starts. */
export const projectPlaced = (view: ProjectView): ReadonlyArray<PlacedScene> =>
  view.project.scenes.flatMap((s) =>
    Option.toArray(Option.map(s.span, (span) => ({ id: s.scene, start: span.start }))),
  );

/**
 * The scenes `line` is about: by its time first (the scene `placed` shows
 * then, `sceneAt`, as the playhead would), else by its address's scenes;
 * none when it has neither, the film's own (the film's or an act's with no
 * time, or no place).
 */
const findingScenes = (
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

/** Whether `line` is about one of `scenes`. */
const aboutAny = (
  line: CheckLine,
  scenes: ReadonlyArray<string>,
  placed: ReadonlyArray<PlacedScene>,
): boolean =>
  Option.exists(findingScenes(line, placed), (ids) => ids.some((id) => scenes.includes(id)));

/** Whether `line` is the film's own: about no scene (`findingScenes`). */
const filmsOwn = (line: CheckLine, placed: ReadonlyArray<PlacedScene>): boolean =>
  Option.isNone(findingScenes(line, placed));

/**
 * The check's lines counted one way, wherever a page counts them (a scene's
 * chips, the tape's legend, the Project's check chip): each line once, as
 * an error or a warning.
 */
interface CheckCount {
  readonly errors: number;
  readonly warnings: number;
}

/** `lines` counted by level (`CheckCount`). */
export const checkCount = (lines: ReadonlyArray<CheckLine>): CheckCount => {
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
 * What is known of each scene, from the project (when read) and the check's
 * findings, each about the scenes `findingScenes` places it in.
 */
export const marksOf =
  (
    project: Option.Option<ProjectView>,
    findings: ReadonlyArray<CheckLine>,
    placed: ReadonlyArray<PlacedScene>,
  ) =>
  (scene: string): SceneMarks => ({
    act: Option.flatMap(project, (v) =>
      Option.map(
        Arr.findFirst(v.project.acts, (a) => a.scenes.includes(scene)),
        (a) => a.name,
      ),
    ),
    render: Option.flatMap(project, (v) =>
      Arr.findFirst(v.project.scenes, (s) => s.scene === scene),
    ),
    findings: findings.filter((line) => aboutAny(line, [scene], placed)),
  });

/** A scene's chips, most pressing first: its render's state, its approval, its findings. */
export const chipsOf = (marks: SceneMarks): ReadonlyArray<MarkChip> => {
  const { errors, warnings } = checkCount(marks.findings);
  const render = Option.toArray(marks.render);
  const lines = (level: CheckLine['level']) =>
    marks.findings
      .filter((l) => l.level === level)
      .map((l) => `${l.tag}: ${l.message}`)
      .join('\n');
  return [
    ...render
      .filter((r) => r.state === 'stale')
      .map((r): MarkChip => ({
        mark: 'stale',
        text: 'Out of date',
        why: stateText(r.state, r.staleBy),
        state: 'stale',
      })),
    ...render
      .filter((r) => r.state === 'missing')
      .map((r): MarkChip => ({
        mark: 'missing',
        text: 'Not rendered',
        why: stateText(r.state, r.staleBy),
        state: 'rendered',
      })),
    ...render
      .filter((r) => r.approval === 'approved')
      .map((): MarkChip => ({
        mark: 'approved',
        text: 'Approved',
        why: APPROVAL_TEXT.approved,
        state: 'approved',
      })),
    ...render
      .filter((r) => r.approval === 'stale')
      .map((): MarkChip => ({
        mark: 'approved-earlier',
        text: 'Approved earlier',
        why: APPROVAL_TEXT.stale,
        state: 'stale',
      })),
    ...[errors]
      .filter((n) => n > 0)
      .map((n): MarkChip => ({
        mark: 'errors',
        text: counted(n, 'error'),
        why: lines('error'),
        state: 'findings',
      })),
    ...[warnings]
      .filter((n) => n > 0)
      .map((n): MarkChip => ({
        mark: 'warnings',
        text: counted(n, 'warning'),
        why: lines('warning'),
        state: 'warning',
      })),
  ];
};

/**
 * A film's scenes summed up in the chips' words, as Project's head and a
 * Films card say it: `0/4 approved · 1 out of date · 1 not rendered`, the
 * last two left out at 0.
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

/** The state a scene's band is drawn in on the tape: its most pressing mark's, else none (its hue). */
export const bandState = (marks: SceneMarks): Option.Option<MarkChip['state']> =>
  Option.map(Arr.head(chipsOf(marks)), (c) => c.state);

/**
 * A line of the tape's legend: what it counts (`mark`), its word (the
 * colour key the tape bar shows), its words with the count (Info's), and the
 * `--state-*` token it is drawn in.
 */
interface LegendLine {
  readonly mark: 'stale' | 'missing' | 'approved' | 'errors' | 'warnings' | 'film' | 'check-failed';
  readonly word: string;
  readonly text: string;
  readonly state: MarkChip['state'];
  /** Why, in full (its title), when its words do not say it all. */
  readonly why?: string;
}

/** A legend line counting `n`, none at 0. */
const legendLine = (
  mark: LegendLine['mark'],
  word: string,
  n: number,
  state: MarkChip['state'],
): ReadonlyArray<LegendLine> =>
  [n].filter((k) => k > 0).map((k) => ({ mark, word, text: `${word} ${k}`, state }));

/**
 * The tape's legend over the film's `placed` scenes: how many are out of
 * date, not rendered and approved; then the check's lines about them, each
 * once, by level (`checkCount`: errors in the findings' colour, warnings in
 * the warnings'), and the film's own lines (`filmsOwn`: about no scene)
 * apart, in the colour of their most pressing level. None left at 0. A
 * check that failed says so, why in its title: never a clean film.
 */
export const legendOf = (
  placed: ReadonlyArray<PlacedScene>,
  marks: (scene: string) => SceneMarks,
  check: Result.Result<ReadonlyArray<CheckLine>, string>,
): ReadonlyArray<LegendLine> => {
  const lines = Result.getOrElse(check, () => []);
  const scenes = placed.map((p) => p.id);
  const all = scenes.map(marks);
  const stale = all.filter((m) => Option.exists(m.render, (r) => r.state === 'stale')).length;
  const missing = all.filter((m) => Option.exists(m.render, (r) => r.state === 'missing')).length;
  const approved = all.filter((m) =>
    Option.exists(m.render, (r) => r.approval === 'approved'),
  ).length;
  const theirs = checkCount(lines.filter((l) => aboutAny(l, scenes, placed)));
  const film = lines.filter((l) => filmsOwn(l, placed));
  return [
    ...legendLine('stale', 'out of date', stale, 'stale'),
    ...legendLine('missing', 'not rendered', missing, 'rendered'),
    ...legendLine('approved', 'approved', approved, 'approved'),
    ...legendLine('errors', 'errors', theirs.errors, 'findings'),
    ...legendLine('warnings', 'warnings', theirs.warnings, 'warning'),
    ...Option.toArray(countState(film)).flatMap((state) =>
      legendLine('film', 'film', film.length, state),
    ),
    ...Option.toArray(
      Option.map(Result.getFailure(check), (why): LegendLine => ({
        mark: 'check-failed',
        word: 'check failed',
        text: 'check failed',
        state: 'findings',
        why,
      })),
    ),
  ];
};
