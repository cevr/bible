// What a film's write says as its receipt (`Words`, `format.ts`), in the
// words of the choices shown as it was sent: a pick, an unkeep or a reject
// says what the point plays, before → after (`Score: piano → ensemble`), a
// knob its level before → after, a say what was said of which variant, and
// an Undo or a Redo what it walked. A source write is undone by Undo, an
// Undo by Redo, a Redo by Undo; a say, which writes the catalogue and no
// source, by none. The sound check after a pick says it is hearing the mix,
// then what it found.

import { Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { type CommandId, type Receipt, busy, refused, said } from '../../../command/command.ts';
import type { PartAddress } from '../../../core/address.ts';
import type { ChoicePoint, ChoiceVerb, FilmChoices, SoundCheck } from '../../../core/choice.ts';
import type { LabFailure } from '../../api.ts';
import { type Words, failedText, sayText } from '../format.ts';
import type { ChoiceAct, Wrote } from './api.ts';

/** The commands that step the film's source back and on (`section.tsx`). */
export const REVIEW_UNDO: CommandId = 'review.undo';
export const REVIEW_REDO: CommandId = 'review.redo';

const VERB_PAST: Readonly<Record<ChoiceVerb, string>> = {
  pick: 'Picked',
  unpick: 'Unkept',
  reject: 'Rejected',
};

/** A part of the project as a receipt names it: `the film`, `act opening`, `scene cold`. */
export const partText = (address: PartAddress): string =>
  Match.valueTags(address, {
    Film: () => 'the film',
    Act: ({ act }) => `act ${act}`,
    Scenes: ({ ids }) => `${['scenes', 'scene'][Number(ids.length === 1)]} ${ids.join(', ')}`,
  });

/** What `point` plays: its picked variants' labels, or `nothing`. */
const playsText = (point: ChoicePoint): string => {
  const picked = point.variants.filter((v) => v.picked).map((v) => v.label);
  return Option.getOrElse(
    Option.liftPredicate(picked.join(', '), (s) => s !== ''),
    () => 'nothing',
  );
};

/** The point `id` among `choices`. */
const pointIn = (choices: FilmChoices, id: string): Option.Option<ChoicePoint> =>
  Option.fromUndefinedOr(choices.points.find((p) => p.id === id));

/** The label of variant `id` at point `id` in `choices`, else its id. */
const labelIn = (choices: FilmChoices, point: string, variant: string): string =>
  Option.getOrElse(
    Option.flatMap(pointIn(choices, point), (p) =>
      Option.map(Option.fromUndefinedOr(p.variants.find((v) => v.id === variant)), (v) => v.label),
    ),
    () => variant,
  );

/** `n` findings as a summary says them: `check: clean`, `sound check: 2 findings`. */
export const findingsText = (name: string, n: number): string =>
  Match.value(n).pipe(
    Match.when(0, () => `${name}: clean`),
    Match.when(1, () => `${name}: 1 finding`),
    Match.orElse((count) => `${name}: ${count} findings`),
  );

/**
 * The sound check's receipt (UR-38) in `result`: busy while it hears the
 * mix, its findings counted once it has, or why it could not run; none
 * before it first runs.
 */
export const soundReceipt = (
  result: AsyncResult.AsyncResult<SoundCheck, LabFailure>,
): Option.Option<Receipt> => {
  if (result.waiting) return Option.some(busy('sound check: hearing the mix…'));
  return AsyncResult.match(result, {
    onInitial: () => Option.none(),
    onSuccess: (s) => Option.some(said(findingsText('sound check', s.value.findings.length))),
    onFailure: () => Option.some(refused(`sound check: ${failedText(result)}`)),
  });
};

/** A step's target without its verb: what it walked. */
const walked = (wrote: Wrote): string =>
  `${wrote.target.replace(/^(undo|redo) /, '')} in ${wrote.file}`;

/** The receipt of `act`, as the choices `before` show the film as it is sent. */
export const actWords = (act: ChoiceAct, before: FilmChoices): Words<Wrote> => {
  const titleOf = (point: string) =>
    Option.getOrElse(
      Option.map(pointIn(before, point), (p) => p.title),
      () => point,
    );
  return Match.value(act).pipe(
    Match.tagsExhaustive({
      Verb: (v): Words<Wrote> => ({
        doing: `${VERB_PAST[v.verb].toLowerCase()} ${labelIn(before, v.point, v.variant)}…`,
        done: (w) => {
          const was = Option.getOrElse(Option.map(pointIn(before, v.point), playsText), () => '?');
          const now = Option.getOrElse(
            Option.map(
              Option.flatMap(w.choices, (c) => pointIn(c, v.point)),
              playsText,
            ),
            () => '?',
          );
          return `${VERB_PAST[v.verb]} ${labelIn(before, v.point, v.variant)} · ${titleOf(v.point)}: ${was} → ${now}`;
        },
        undo: Option.some(REVIEW_UNDO),
      }),
      Knob: (k): Words<Wrote> => {
        const knob = Option.flatMap(pointIn(before, k.point), (p) => p.knob);
        const unit = Option.getOrElse(
          Option.map(knob, (n) => n.unit),
          () => '',
        );
        const was = Option.getOrElse(
          Option.map(knob, (n) => String(n.value)),
          () => '?',
        );
        return {
          doing: `setting ${titleOf(k.point)}…`,
          done: () =>
            [`${titleOf(k.point)}: ${was} → ${k.value}`, unit].filter((s) => s !== '').join(' '),
          undo: Option.some(REVIEW_UNDO),
        };
      },
      Say: (s): Words<Wrote> => ({
        doing: 'saying…',
        done: () => sayText(s.say, `${labelIn(before, s.point, s.variant)} · ${titleOf(s.point)}`),
        undo: Option.none(),
      }),
      Undo: (): Words<Wrote> => ({
        doing: 'undoing…',
        done: (w) => `Undid ${walked(w)}`,
        undo: Option.some(REVIEW_REDO),
      }),
      Redo: (): Words<Wrote> => ({
        doing: 'redoing…',
        done: (w) => `Redid ${walked(w)}`,
        undo: Option.some(REVIEW_UNDO),
      }),
    }),
  );
};
