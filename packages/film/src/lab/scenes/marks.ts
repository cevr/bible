// What a scene's card and the tape say of each scene at a glance (design
// language §6): its act, its render's state (out of date, not rendered) and
// its approval (approved, or approved earlier) from the film's project, and the check's findings about it
// (a finding whose address names the scene). Each mark is a chip: a word in
// the state's colour (`MarkChip.state`, a `--state-*` token's name), why in full its title. The
// tape's legend counts them over the film, the film's own lines too. The check is counted
// one way here for every page (`checkCount`, `countState`: Scenes, Project, Choices): each
// line once. Every line of the check is a finding (`tools/findings.ts`), an
// error or a warning by its level: the chips and the legend say `errors` and
// `warnings`, and Project's chip their sum, `findings`. The project or the check may not
// be read (yet, or at all: a short has no project): the scene then has no
// such mark, never a wrong one. Pure.

import { Array as Arr, Boolean as Bool, Option, Result } from 'effect';
import type { ProjectView } from '../../core/api.ts';
import type { ProjectScene } from '../../core/catalogue.ts';
import type { CheckLine } from '../../core/schema.ts';
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

/** Whether `line` is about `scene`: its address names the scene. */
const about = (line: CheckLine, scene: string): boolean =>
  Option.exists(
    Option.fromUndefinedOr(line.address),
    (a) => a.part._tag === 'Scenes' && a.part.ids.includes(scene),
  );

/** Whether `line` is about one of `scenes`. */
const aboutAny = (line: CheckLine, scenes: ReadonlyArray<string>): boolean =>
  scenes.some((scene) => about(line, scene));

/** Whether `line` is the film's own: addressed to no scene (the film's, an act's, or no place). */
const filmsOwn = (line: CheckLine): boolean =>
  !Option.exists(Option.fromUndefinedOr(line.address), (a) => a.part._tag === 'Scenes');

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

/** What is known of each scene, from the project (when read) and the check's findings. */
export const marksOf =
  (project: Option.Option<ProjectView>, findings: ReadonlyArray<CheckLine>) =>
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
    findings: findings.filter((line) => about(line, scene)),
  });

/** `n` of `one`, in words: `1 error`, `3 errors`. */
const count = (n: number, one: string) =>
  Bool.match(n === 1, { onTrue: () => `1 ${one}`, onFalse: () => `${n} ${one}s` });

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
        text: count(n, 'error'),
        why: lines('error'),
        state: 'findings',
      })),
    ...[warnings]
      .filter((n) => n > 0)
      .map((n): MarkChip => ({
        mark: 'warnings',
        text: count(n, 'warning'),
        why: lines('warning'),
        state: 'warning',
      })),
  ];
};

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
const counted = (
  mark: LegendLine['mark'],
  word: string,
  n: number,
  state: MarkChip['state'],
): ReadonlyArray<LegendLine> =>
  [n].filter((k) => k > 0).map((k) => ({ mark, word, text: `${word} ${k}`, state }));

/**
 * The tape's legend over `scenes`: how many are out of date, not rendered
 * and approved; then the check's lines about them, each once, by level
 * (`checkCount`: errors in the findings' colour, warnings in the
 * warnings'), and the film's own lines (`filmsOwn`: addressed to no scene)
 * apart, in the colour of their most pressing level. None left at 0. A
 * check that failed says so, why in its title: never a clean film (RS-1).
 */
export const legendOf = (
  scenes: ReadonlyArray<string>,
  marks: (scene: string) => SceneMarks,
  check: Result.Result<ReadonlyArray<CheckLine>, string>,
): ReadonlyArray<LegendLine> => {
  const lines = Result.getOrElse(check, () => []);
  const all = scenes.map(marks);
  const stale = all.filter((m) => Option.exists(m.render, (r) => r.state === 'stale')).length;
  const missing = all.filter((m) => Option.exists(m.render, (r) => r.state === 'missing')).length;
  const approved = all.filter((m) =>
    Option.exists(m.render, (r) => r.approval === 'approved'),
  ).length;
  const theirs = checkCount(lines.filter((l) => aboutAny(l, scenes)));
  const film = lines.filter(filmsOwn);
  return [
    ...counted('stale', 'out of date', stale, 'stale'),
    ...counted('missing', 'not rendered', missing, 'rendered'),
    ...counted('approved', 'approved', approved, 'approved'),
    ...counted('errors', 'errors', theirs.errors, 'findings'),
    ...counted('warnings', 'warnings', theirs.warnings, 'warning'),
    ...Option.toArray(countState(film)).flatMap((state) =>
      counted('film', 'film', film.length, state),
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
