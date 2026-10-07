// How the editor words and draws what it shows: a cue's anchor,
// an ease as a small curve, and its receipts.

import { Match, Option } from 'effect';
import { type Receipt, busy, refused, said } from '../../command/command.ts';
import type { CheckLine, CheckReport, EaseName, Span } from '../../core/schema.ts';
import { ease } from '../../core/time.ts';
import type { StepVerb } from '../api.ts';
import { findingScenes } from '../scenes/marks.ts';
import type { EditState } from './machine.ts';

/** What a cue's span starts from, in words. */
export const anchorText = (span: Span): string => {
  if ('mark' in span)
    return Option.match(Option.fromUndefinedOr(span.word), {
      onNone: () => `mark {${span.mark}}`,
      onSome: (word) => `word "${word}" after mark {${span.mark}}`,
    });
  if ('after' in span) return `after cue ${span.after}`;
  if ('with' in span) return `with cue ${span.with}`;
  return `scene ${span.at}`;
};

/**
 * The selection in one line, as a phone's sheet peeks it (design language
 * §7): what it is and its name, each of its fields' values (to two places,
 * a number knob's bare), then a cue's ease: `cue rise · offset 0.00 · dur
 * 0.60 · inOutCubic`, `knob spot · x 120.00 · y 340.00`, `knob size · 1.20`.
 */
export const peekText = (
  selection: { readonly _tag: 'Cue' | 'Knob'; readonly name: string },
  fields: ReadonlyArray<{ readonly id: string; readonly value: number }>,
  ease: Option.Option<string>,
): string =>
  [
    `${selection._tag.toLowerCase()} ${selection.name}`,
    ...fields.map((f) =>
      [
        ...Option.toArray(Option.liftPredicate(f.id, (id) => id !== 'value')),
        f.value.toFixed(2),
      ].join(' '),
    ),
    ...Option.toArray(ease),
  ].join(' · ');

/** An ease drawing's box: 0→1 across, with room for an overshoot. */
export const EASE_BOX = { w: 44, h: 30 } as const;

/** The height in an ease drawing of the eased value `v`. */
export const easeY = (v: number): number => EASE_BOX.h - 4 - v * (EASE_BOX.h - 10);

/** The polyline of ease `name`, 0→1 across the drawing's box. */
export const easePoints = (name: EaseName): string =>
  Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    return `${(2 + t * (EASE_BOX.w - 4)).toFixed(1)},${easeY(ease[name](t)).toFixed(1)}`;
  }).join(' ');

/** The findings the panel lists: the landed write's, else the check the page loaded with. */
export const findingsOf = (
  state: EditState,
  report: Option.Option<CheckReport>,
): ReadonlyArray<CheckLine> =>
  Match.value(state).pipe(
    Match.tag('Written', (s) => s.findings),
    Match.orElse(() => Option.match(report, { onNone: () => [], onSome: (r) => r.findings })),
  );

/**
 * Where the film shows `finding`, in film seconds: its own time, else the
 * start of the first scene it names; none for one about the whole film or
 * an act (F walks only to a finding that has a place on the time line).
 */
export const findingTime = (
  finding: CheckLine,
  placed: ReadonlyArray<{ readonly spec: { readonly id: string }; readonly start: number }>,
): Option.Option<number> =>
  Option.flatMap(Option.fromUndefinedOr(finding.address), (at) =>
    Option.orElse(Option.fromUndefinedOr(at.time), () =>
      Match.value(at.part).pipe(
        Match.tag('Scenes', (part) =>
          Option.map(
            Option.fromUndefinedOr(placed.find((p) => part.ids.includes(p.spec.id))),
            (p) => p.start,
          ),
        ),
        Match.orElse(() => Option.none<number>()),
      ),
    ),
  );

/** The findings the inspector lists for one scene, and how many sit elsewhere (UI-6). */
interface SceneFindings {
  /** The scene's own: listed under its name. */
  readonly here: ReadonlyArray<CheckLine>;
  /** Those with no place on the film (about the whole film): listed apart, as the film's (SU-3). */
  readonly film: ReadonlyArray<CheckLine>;
  /** How many belong to other scenes: counted, and F walks to them. */
  readonly elsewhere: number;
}

/**
 * `findings` as the inspector shows them in `scene`, each placed as the
 * Scenes' tape places it (`findingScenes`): one whose time is in the scene
 * (the scene the playhead shows there), or whose address names it, is the
 * scene's; one with no place (no address, or the whole film or an act with
 * no time) is the film's, shown with every scene, having no other; the rest
 * are counted as elsewhere.
 */
export const findingsIn = (
  findings: ReadonlyArray<CheckLine>,
  placed: ReadonlyArray<{ readonly spec: { readonly id: string }; readonly start: number }>,
  scene: string,
): SceneFindings => {
  const scenes = placed.map((p) => ({ id: p.spec.id, start: p.start }));
  const named = (f: CheckLine) => findingScenes(f, scenes);
  const here = findings.filter((f) => Option.exists(named(f), (ids) => ids.includes(scene)));
  const film = findings.filter((f) => Option.isNone(named(f)));
  return { here, film, elsewhere: findings.length - here.length - film.length };
};

const DOING = { undo: 'undoing', redo: 'redoing' } as const;

/** Why a grip held takes no write. */
const HELD = 'a cue or a handle is held; let it go first';

/** What the machine may be asked: a commit, a press on a cue or a handle, or an Undo or Redo. */
type Asked = 'commit' | 'press' | StepVerb;

/** Each ask as a receipt says when to try it again. */
const AGAIN: Readonly<Record<Asked, string>> = {
  commit: 'commit',
  press: 'drag',
  undo: 'undo',
  redo: 'redo',
};

/**
 * Why the machine in `state` does not take what is `asked`, in a receipt's
 * words; none when it does. A grip held takes none; a write out takes a
 * commit (it waits, shown) but no press and no step.
 */
export const notTaken = (state: EditState, asked: Asked): Option.Option<string> =>
  Match.value(state).pipe(
    Match.tag('Pressed', 'Dragging', () => Option.some(HELD)),
    Match.tag('Writing', 'Checking', () =>
      Option.filter(
        Option.some(`a write is still out; ${AGAIN[asked]} once it lands`),
        () => asked !== 'commit',
      ),
    ),
    Match.orElse(() => Option.none()),
  );

/**
 * The editor's receipt in `state`, on `film`: a write on its way (busy),
 * what a write that landed did with the step that undoes it (Redo for an
 * Undo), bound to the change it made (none when it made none), why it was refused, or why a drag
 * cannot be shown; none at rest or mid-drag, where the last receipt stands.
 */
export const receiptOf = (state: EditState, film: string): Option.Option<Receipt> =>
  Match.value(state).pipe(
    Match.tag('Writing', (s) =>
      Option.some(
        busy(
          Match.value(s.write).pipe(
            Match.tag('StepWrite', (w) => `${DOING[w.verb]}…`),
            Match.orElse(() => 'writing…'),
          ),
        ),
      ),
    ),
    Match.tag('Checking', (s) =>
      Option.some(busy(`${DOING[s.write.verb]}: no answer yet, asking the lab whether it landed…`)),
    ),
    Match.tag('Written', (s) =>
      Option.some(
        said(
          s.note,
          Option.map(s.change, (change) => ({
            command: `edit.${s.undo}`,
            bound: { film, change },
          })),
        ),
      ),
    ),
    Match.tag('Refused', (s) => Option.some(refused(s.message))),
    Match.tag('Dragging', (s) =>
      Option.map(
        Option.liftPredicate(s.note, (n) => n !== ''),
        refused,
      ),
    ),
    Match.orElse(() => Option.none()),
  );
