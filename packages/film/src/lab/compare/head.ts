// What the compare draws and says for a scene at HEAD, pure: HEAD's timeline
// and knobs over today's declarations (the server gives only the literals it
// could read, so a span HEAD computed stays as it is now), and the panel's
// line: the file it read and what changed since, or, while HEAD is read or
// when it cannot be, that, in the server's words.

import { Option } from 'effect';
import type { EditError, SceneEdit } from '../../canvas/film.ts';
import type { HeadSource, Knobs, Timeline } from '../../core/schema.ts';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type LabFailure, reasonOf } from '../api.ts';
import type { CompareMode } from './machine.ts';

/** A scene's declarations today: its drawing's timeline and knobs. */
interface Declared {
  readonly timeline?: Timeline;
  readonly knobs?: Knobs;
}

/** The edit that draws `head` through today's code, over `today`'s declarations. */
export const headEdit = (today: Option.Option<Declared>, head: HeadSource): SceneEdit => {
  const timeline = Option.flatMap(today, (d) => Option.fromUndefinedOr(d.timeline));
  const knobs = Option.flatMap(today, (d) => Option.fromUndefinedOr(d.knobs));
  return {
    timeline: { ...Option.getOrElse(timeline, () => ({})), ...head.timeline },
    knobs: { ...Option.getOrElse(knobs, () => ({})), ...head.knobs },
  };
};

/**
 * What the compare says of `scene` in `mode`, HEAD read as `head`, and why
 * HEAD's edit does not resolve on today's narration when it does not
 * (`Film.edit`): then nothing is drawn, and the line says so.
 */
export const compareText = (
  mode: CompareMode,
  scene: string,
  head: AsyncResult.AsyncResult<HeadSource, LabFailure>,
  unresolved: Option.Option<EditError>,
): string => {
  if (mode === 'off') return '';
  return AsyncResult.match(head, {
    onInitial: () => `reading ${scene} at the last commit…`,
    onFailure: (f) => `${scene}: ${reasonOf(f.cause)}`,
    onSuccess: ({ value }) =>
      Option.match(unresolved, {
        onSome: (err) =>
          `${scene}: the last commit's timeline does not resolve now: ${err.message}`,
        onNone: () => headText(value),
      }),
  });
};

/** The file HEAD was read from, and what changed since. */
const headText = (value: HeadSource): string =>
  [
    `${value.file} at the last commit`,
    ...Option.toArray(
      Option.liftPredicate(
        'code changed since the last commit — compare shows data only',
        () => value.codeChanged,
      ),
    ),
    ...Option.toArray(
      Option.liftPredicate(
        "the last commit's timeline and knobs are the same as now",
        () => value.sameData,
      ),
    ),
  ].join(' · ');
