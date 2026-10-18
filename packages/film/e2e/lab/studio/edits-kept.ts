// The lab's edit routes faked over the probe film's first version, as the
// studio's edit cases and the touch guards' receipt case read them: each
// move or hold lands as a change on the film's history, and Undo and Redo
// step the newest (`ripple.ts` lays each change on the version's timeline).

import { Array as Arr, Boolean as Bool, Option, Schema } from 'effect';
import { AGENTS_AFTER, heldWords, movedWords } from '../../../src/core/beat-edit.ts';
import type { FilmTimeline } from '../../../src/core/timeline-schema.ts';
import { type Preview, rippled, scriptOf } from '../../../src/lab/film-studio/ripple.ts';
import { type Json, json, route } from '../../../src/lab/fixtures/harness.ts';
import { probeTimeline } from '../../../src/lab/fixtures/probe-timeline.ts';

/** What the page sends the edit and note routes, as these fakes read it. */
export const Sent = Schema.Struct({
  beat: Schema.optionalKey(Schema.String),
  before: Schema.optionalKey(Schema.String),
  edge: Schema.optionalKey(Schema.Literals(['lead', 'tail'])),
  seconds: Schema.optionalKey(Schema.Finite),
  scene: Schema.optionalKey(Schema.String),
  T: Schema.optionalKey(Schema.Finite),
  frame: Schema.optionalKey(Schema.Finite),
  text: Schema.optionalKey(Schema.String),
  still: Schema.optionalKey(Schema.Json),
  sketch: Schema.optionalKey(Schema.Array(Schema.Json)),
});
export type Sent = typeof Sent.Type;

/** A request's body as `Sent`: empty when it has none or is not one. */
export const sentOf = (body: Option.Option<Json>): Sent =>
  Option.getOrElse(
    Option.flatMap(body, (b) => Schema.decodeUnknownOption(Sent)(b)),
    (): Sent => ({}),
  );

/**
 * The lab's edit routes over the first version: each move or hold lands as
 * a change on the film's history (`c1`, `c2`, …), the version's timeline is
 * the first version's with every change still done laid on it, and Undo and
 * Redo step the newest, as the lab's source writer does.
 */
export const editsKept = () => {
  interface Change {
    readonly id: string;
    readonly preview: Preview;
    readonly said: string;
  }
  let done: ReadonlyArray<Change> = [];
  let undone: ReadonlyArray<Change> = [];
  let made = 0;
  const now = (): FilmTimeline => done.reduce((t, c) => rippled(t, c.preview), probeTimeline(1));
  const stepOf = (c: Change) => ({ file: 'v1/script.ts', target: c.said, change: c.id });
  const steps = () => ({
    ...Option.match(Option.fromUndefinedOr(done.at(-1)), {
      onNone: () => ({}),
      onSome: (c) => ({ undo: stepOf(c), latest: stepOf(c) }),
    }),
    ...Option.match(Option.fromUndefinedOr(undone.at(-1)), {
      onNone: () => ({}),
      onSome: (c) => ({ redo: stepOf(c) }),
    }),
  });
  const landed = (preview: Preview, said: string) => {
    made += 1;
    const change = { id: `c${made}`, preview, said };
    done = [...done, change];
    undone = [];
    return json({
      change: change.id,
      target: 'beats',
      said: `${said} ${AGENTS_AFTER}`,
      steps: steps(),
    });
  };
  const stepped = (verb: 'undo' | 'redo') => {
    const undoing = verb === 'undo';
    const from = Bool.match(undoing, { onTrue: () => done, onFalse: () => undone });
    return Option.match(Arr.last(from), {
      onNone: () => json({ _tag: 'NothingToStep', message: `nothing to ${verb}` }, 409),
      onSome: (c) => {
        const rest = from.slice(0, -1);
        Bool.match(undoing, {
          onTrue: () => {
            done = rest;
            undone = [...undone, c];
          },
          onFalse: () => {
            undone = rest;
            done = [...done, c];
          },
        });
        const word = Bool.match(undoing, { onTrue: () => 'Undid', onFalse: () => 'Redid' });
        return json({ change: c.id, target: 'beats', said: `${word}: ${c.said}`, steps: steps() });
      },
    });
  };
  return [
    route('GET', /^\/timeline(\?|$)/, () => json(now())),
    route('GET', /^\/steps$/, () => json(steps())),
    route('POST', /^\/beats\/move$/, (asked) => {
      const sent = sentOf(asked.body);
      const beat = sent.beat ?? '';
      const before = Option.fromUndefinedOr(sent.before);
      return landed({ _tag: 'Move', beat, before }, movedWords(beat, before));
    }),
    route('POST', /^\/beats\/hold$/, (asked) => {
      const sent = sentOf(asked.body);
      const beat = sent.beat ?? '';
      const edge = sent.edge ?? 'tail';
      const to = sent.seconds ?? 0;
      const from = Option.getOrElse(
        Option.map(
          Option.fromUndefinedOr(scriptOf(now()).find((b) => b.beat === beat)),
          (b) => b.hold[edge],
        ),
        () => 0,
      );
      return landed({ _tag: 'Hold', beat, edge, from, to }, heldWords(beat, edge, from, to));
    }),
    route('POST', /^\/edits\/undo$/, () => stepped('undo')),
    route('POST', /^\/edits\/redo$/, () => stepped('redo')),
  ];
};
