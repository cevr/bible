// How the editor words and draws what it shows: a cue's anchor,
// an ease as a small curve, and its receipts.

import { Match, Option } from 'effect';
import { type Receipt, busy, refused, said } from '../../command/command.ts';
import type { CheckLine, CheckReport, EaseName, Span } from '../../core/schema.ts';
import { ease } from '../../core/time.ts';
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

const DOING = { undo: 'undoing', redo: 'redoing' } as const;

/**
 * The editor's receipt in `state`, on `film`: a write on its way (busy),
 * what a write that landed did with the step that undoes it (Redo for an
 * Undo), bound to the change it made, why it was refused, or why a drag
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
          Option.some(`edit.${s.undo}`),
          Option.map(s.change, (change) => ({ film, change })),
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
