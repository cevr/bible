// What a scene's card and the tape say of each scene at a glance (design
// language §6): its act, its render's state (out of date, not rendered) and
// its approval from the film's project, and the check's findings about it
// (a finding whose address names the scene). Each mark is a chip: a word in
// the state's colour (`MarkChip.state`, a `--state-*` token's name). The
// tape's legend counts them over the film. The project or the check may not
// be read (yet, or at all: a short has no project): the scene then has no
// such mark, never a wrong one. Pure.

import { Array as Arr, Boolean as Bool, Option } from 'effect';
import type { ProjectView } from '../../core/api.ts';
import type { ProjectScene } from '../../core/catalogue.ts';
import type { CheckLine } from '../../core/schema.ts';

/** What is known of one scene: its act, its render and its approval, and the findings about it. */
export interface SceneMarks {
  readonly act: Option.Option<string>;
  readonly render: Option.Option<ProjectScene>;
  readonly findings: ReadonlyArray<CheckLine>;
}

/** A mark's chip: its word and the `--state-*` token it is drawn in. */
interface MarkChip {
  readonly mark: 'stale' | 'missing' | 'approved' | 'findings' | 'warnings';
  readonly text: string;
  readonly state: 'stale' | 'rendered' | 'approved' | 'findings' | 'warning';
}

/** Whether `line` is about `scene`: its address names the scene. */
const about = (line: CheckLine, scene: string): boolean =>
  Option.exists(
    Option.fromUndefinedOr(line.address),
    (a) => a.part._tag === 'Scenes' && a.part.ids.includes(scene),
  );

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

/** `n` of `one`, in words: `1 finding`, `3 findings`. */
const count = (n: number, one: string) =>
  Bool.match(n === 1, { onTrue: () => `1 ${one}`, onFalse: () => `${n} ${one}s` });

/** A scene's chips, most pressing first: its render's state, its approval, its findings. */
export const chipsOf = (marks: SceneMarks): ReadonlyArray<MarkChip> => {
  const errors = marks.findings.filter((l) => l.level === 'error').length;
  const warnings = marks.findings.length - errors;
  const render = Option.toArray(marks.render);
  return [
    ...render
      .filter((r) => r.state === 'stale')
      .map((): MarkChip => ({ mark: 'stale', text: 'Out of date', state: 'stale' })),
    ...render
      .filter((r) => r.state === 'missing')
      .map((): MarkChip => ({ mark: 'missing', text: 'Not rendered', state: 'rendered' })),
    ...render
      .filter((r) => r.approval === 'approved')
      .map((): MarkChip => ({ mark: 'approved', text: 'Approved', state: 'approved' })),
    ...[errors]
      .filter((n) => n > 0)
      .map((n): MarkChip => ({ mark: 'findings', text: count(n, 'finding'), state: 'findings' })),
    ...[warnings]
      .filter((n) => n > 0)
      .map((n): MarkChip => ({ mark: 'warnings', text: count(n, 'warning'), state: 'warning' })),
  ];
};

/** The state a scene's band is drawn in on the tape: its most pressing mark's, else none (its hue). */
export const bandState = (marks: SceneMarks): Option.Option<MarkChip['state']> =>
  Option.map(Arr.head(chipsOf(marks)), (c) => c.state);

/** The tape's legend over `scenes`: how many are out of date, approved, and how many findings. */
export const legendOf = (
  scenes: ReadonlyArray<string>,
  marks: (scene: string) => SceneMarks,
): ReadonlyArray<{ readonly text: string; readonly state: MarkChip['state'] }> => {
  const all = scenes.map(marks);
  const stale = all.filter((m) => Option.exists(m.render, (r) => r.state === 'stale')).length;
  const missing = all.filter((m) => Option.exists(m.render, (r) => r.state === 'missing')).length;
  const approved = all.filter((m) =>
    Option.exists(m.render, (r) => r.approval === 'approved'),
  ).length;
  const findings = all.reduce((n, m) => n + m.findings.length, 0);
  return [
    { n: stale, text: `out of date ${stale}`, state: 'stale' as const },
    { n: missing, text: `not rendered ${missing}`, state: 'rendered' as const },
    { n: approved, text: `approved ${approved}`, state: 'approved' as const },
    { n: findings, text: `findings ${findings}`, state: 'findings' as const },
  ]
    .filter((l) => l.n > 0)
    .map(({ text, state }) => ({ text, state }));
};
