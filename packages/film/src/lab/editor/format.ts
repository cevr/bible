// How the editor words and draws what it shows: a cue's anchor, a number as
// the write stores it, an ease as a small curve, and the status line.

import { Match, Option } from 'effect';
import type { CheckLine, CheckReport, EaseName, Span } from '../../core/schema.ts';
import { ease } from '../../core/time.ts';
import type { EditState } from './machine.ts';

/** Seconds and pixels to the thousandth, as the write stores them. */
export const round = (v: number): number => Math.round(v * 1000) / 1000 + 0;

/** What a cue's span starts from, in words. */
export const anchorText = (span: Span): string => {
  if ('mark' in span)
    return Option.match(Option.fromUndefinedOr(span.word), {
      onNone: () => `mark {${span.mark}}`,
      onSome: (word) => `word "${word}" after mark {${span.mark}}`,
    });
  if ('after' in span) return `after cue ${span.after}`;
  if ('with' in span) return `with cue ${span.with}`;
  return `scene ${span.scene}`;
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

const DOING = { undo: 'undoing', redo: 'redoing' } as const;

/**
 * The editor's status line: a write on its way, what the last thing done
 * said, or else what the change that reloaded this page was.
 */
export const statusText = (state: EditState, report: Option.Option<CheckReport>): string => {
  const said = Match.value(state).pipe(
    Match.tag('Writing', (s) =>
      Match.value(s.write).pipe(
        Match.tag('StepWrite', (w) => `${DOING[w.verb]}…`),
        Match.orElse(() => 'writing…'),
      ),
    ),
    Match.tag('Refused', (s) => s.message),
    Match.orElse((s) => s.note),
  );
  if (said !== '') return said;
  return Option.match(
    Option.flatMap(report, (r) => Option.fromUndefinedOr(r.latest)),
    { onNone: () => '', onSome: (l) => `${l.file}: ${l.target}` },
  );
};
