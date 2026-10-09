// The choices' keys over the selected point (the point of a focused or
// long-pressed variant's row, its card, the project's `?point=`).
// Audition: ⌥→ and ⌥← hear the point's next or previous variant in
// place, as its speaker does, and put the focus on that variant's row; Enter
// picks the variant heard while it is the one selected (a focused Pick on
// another row keeps its own Enter). The instants the point plays at:
// `.` and `,` jump the clock to its next or previous one past the time
// shown, and each is a `Jump to 00:00:04:00 · evidence in cold` in the card's
// context menu and in ⌘K once typed, never at rest. A voice's pick refused
// as heard as something else (`TakeMismatch`) offers Accept anyway: on its
// receipt's button, in its row's context menu and in ⌘K, while that refusal
// stands, never at rest. The words a verb's button says (`verbTitle`) are
// here too, so a key and a button say one thing. Pure.

import { Effect, Option } from 'effect';
import { type Command, quiet, quietly } from '../../../command/command.ts';
import { type Context, selectedAll } from '../../../command/context.ts';
import { type Toward, walkFrom } from '../../../command/walk.ts';
import type { ChoiceKind, ChoicePoint, ChoiceVariant, ChoiceVerb } from '../../../core/choice.ts';
import type { LabFailure } from '../../api.ts';
import { timecode } from '../../../core/time.ts';
import type { ChoiceAct } from './api.ts';

/** A verb's button, as a kind names it: a take is kept, anything else picked. */
export const verbTitle = (kind: ChoiceKind, verb: ChoiceVerb): string => {
  if (verb === 'unpick') return 'Unkeep';
  if (verb === 'reject') return 'Reject';
  if (kind === 'take') return 'Keep';
  if (kind === 'voice') return 'Keep as the take';
  return 'Pick';
};

/** A variant of a point, heard in place over the picture. */
export interface InPlace {
  readonly point: string;
  readonly variant: string;
}

/** What the keys drive: the film's points, what is heard, the pick and the clock. */
export interface Deck {
  readonly film: string;
  readonly points: () => ReadonlyArray<ChoicePoint>;
  /** The variant heard in place now, if one is. */
  readonly heard: () => Option.Option<InPlace>;
  /** Hear `heard` in place, and put the focus on its variant's row. */
  readonly audition: (heard: InPlace) => void;
  /** Pick `heard`, answering whether it landed. */
  readonly pick: (heard: InPlace) => Promise<boolean>;
  /** The voice's attempt whose pick was refused as heard as something else, while that stands. */
  readonly mismatched: () => Option.Option<InPlace>;
  /** Keep `refused` though it is heard as something else (its pick, accepted anyway). */
  readonly accept: (refused: InPlace) => Promise<boolean>;
  /** Jump the clock to a time, while there is a picture to jump. */
  readonly jump: () => Option.Option<(t: number) => void>;
  /** The time shown, in the film's seconds. */
  readonly now: () => number;
}

/** The point the selection is about: a selected variant's, else a selected point. */
const pointIn = (deck: Deck, ctx: Context): Option.Option<ChoicePoint> =>
  Option.flatMap(
    Option.fromUndefinedOr(
      [...selectedAll(ctx, 'Variant'), ...selectedAll(ctx, 'Point')].find(
        (s) => s.film === deck.film,
      ),
    ),
    (s) => Option.fromUndefinedOr(deck.points().find((p) => p.id === s.point)),
  );

/** Whether a variant can be heard in place now. */
const hearable = (variant: ChoiceVariant): boolean =>
  variant.media._tag === 'Heard' && variant.media.inPlace && variant.state !== 'missing';

/**
 * The variant of the selected point an audition step toward `toward` hears:
 * the one after (or before) the one heard, else after the picked one, round
 * the point's hearable variants; none where it would hear what is heard.
 */
export const auditionOf = (
  deck: Deck,
  ctx: Context,
  toward: Toward,
): Option.Option<ChoiceVariant & { readonly point: string }> =>
  Option.flatMap(pointIn(deck, ctx), (point) => {
    const heard = point.variants.filter(hearable);
    const playing = Option.flatMap(
      Option.filter(deck.heard(), (h) => h.point === point.id),
      (h) =>
        Option.liftPredicate(
          heard.findIndex((v) => v.id === h.variant),
          (i) => i >= 0,
        ),
    );
    const from = Option.getOrElse(playing, () => heard.findIndex((v) => v.picked));
    const by = { next: 1, previous: -1 }[toward];
    const start = Option.getOrElse(
      Option.liftPredicate(from, (i) => i >= 0),
      () => [heard.length, -1][Number(toward === 'next')] ?? 0,
    );
    const at = (((start + by) % heard.length) + heard.length) % heard.length;
    return Option.map(
      Option.filter(
        Option.fromUndefinedOr(heard[at]),
        (v) => !Option.exists(playing, (i) => heard[i]?.id === v.id),
      ),
      (v) => ({ ...v, point: point.id }),
    );
  });

/** The variant Enter picks: the selected one, while it is the one heard and is not picked. */
export const heardSelectedOf = (
  deck: Deck,
  ctx: Context,
): Option.Option<{ readonly point: ChoicePoint; readonly variant: ChoiceVariant }> =>
  Option.flatMap(
    Option.fromUndefinedOr(selectedAll(ctx, 'Variant').find((s) => s.film === deck.film)),
    (s) =>
      Option.flatMap(
        Option.filter(deck.heard(), (h) => h.point === s.point && h.variant === s.variant),
        () =>
          Option.flatMap(
            Option.fromUndefinedOr(deck.points().find((p) => p.id === s.point)),
            (point) =>
              Option.map(
                Option.fromUndefinedOr(
                  point.variants.find(
                    (v) => v.id === s.variant && !v.picked && v.verbs.includes('pick'),
                  ),
                ),
                (variant) => ({ point, variant }),
              ),
          ),
      ),
  );

const auditionCommand = (deck: Deck, toward: Toward, label: string, key: string): Command => ({
  id: `review.audition-${toward}`,
  label,
  labelIn: (ctx) =>
    Option.match(auditionOf(deck, ctx, toward), {
      onNone: () => label,
      onSome: (v) => `Hear ${v.label} in place`,
    }),
  group: 'Review',
  keys: [key],
  touch: 'tap a variant’s speaker',
  when: (ctx) => Option.isSome(auditionOf(deck, ctx, toward)),
  run: quietly((ctx) =>
    Option.map(auditionOf(deck, ctx, toward), (v) =>
      deck.audition({ point: v.point, variant: v.id }),
    ),
  ),
});

/** The first of `point`'s marks past the time shown toward `toward`. */
const markOf = (deck: Deck, ctx: Context, toward: Toward) =>
  Option.flatMap(pointIn(deck, ctx), (point) =>
    walkFrom(point.marks, (m) => m.t, deck.now(), toward),
  );

const markWalk = (deck: Deck, toward: Toward, label: string, key: string): Command => ({
  id: `review.mark-${toward}`,
  label,
  group: 'Review',
  keys: [key],
  touch: 'long-press its card, then Jump to…',
  when: (ctx) => Option.isSome(deck.jump()) && Option.isSome(markOf(deck, ctx, toward)),
  run: quietly((ctx) =>
    Option.map(Option.all({ jump: deck.jump(), mark: markOf(deck, ctx, toward) }), (m) =>
      m.jump(m.mark.t),
    ),
  ),
});

/** Audition, Enter's pick and the mark walk, over the selected point. */
export const pointCommands = (deck: Deck): ReadonlyArray<Command> => [
  auditionCommand(deck, 'next', 'Hear the next variant in place', 'alt+arrowright'),
  auditionCommand(deck, 'previous', 'Hear the previous variant in place', 'alt+arrowleft'),
  {
    id: 'review.pick-heard',
    label: 'Pick the variant heard',
    labelIn: (ctx) =>
      Option.match(heardSelectedOf(deck, ctx), {
        onNone: () => 'Pick the variant heard',
        onSome: (h) => `${verbTitle(h.point.kind, 'pick')} ${h.variant.label}`,
      }),
    group: 'Review',
    keys: ['enter'],
    about: ['Variant'],
    touch: 'tap its Pick',
    when: (ctx) => Option.isSome(heardSelectedOf(deck, ctx)),
    run: (ctx) =>
      Option.match(heardSelectedOf(deck, ctx), {
        onNone: () => Effect.succeed(quiet),
        onSome: (h) =>
          Effect.as(
            Effect.promise(() => deck.pick({ point: h.point.id, variant: h.variant.id })),
            quiet,
          ),
      }),
  },
  markWalk(deck, 'next', 'Jump to the next place it plays', '.'),
  markWalk(deck, 'previous', 'Jump to the previous place it plays', ','),
  {
    id: ACCEPT_ANYWAY,
    label: 'Accept anyway',
    labelIn: (ctx) =>
      Option.match(acceptedOf(deck, ctx), {
        onNone: () => 'Accept anyway',
        onSome: (m) => `Accept anyway · ${m.variant.slice(0, 12)} as ${m.point}`,
      }),
    group: 'Review',
    about: ['Variant'],
    touch: 'tap Accept anyway on its refusal, or long-press its row',
    when: (ctx) => Option.isSome(acceptedOf(deck, ctx)),
    run: (ctx) =>
      Option.match(acceptedOf(deck, ctx), {
        onNone: () => Effect.succeed(quiet),
        onSome: (m) =>
          Effect.as(
            Effect.promise(() => deck.accept(m)),
            quiet,
          ),
      }),
  },
];

/** The command a voice's refused pick offers: keep the attempt though it is heard as something else. */
export const ACCEPT_ANYWAY = 'review.accept-anyway';

/**
 * The variant whose pick `failure` refused as heard as something else (a
 * voice's attempt, `TakeMismatch`): what Accept anyway keeps. None for any
 * other act or refusal.
 */
export const mismatchOf = (act: ChoiceAct, failure: LabFailure): Option.Option<InPlace> => {
  if (act._tag !== 'Verb' || act.verb !== 'pick' || failure._tag !== 'TakeMismatch')
    return Option.none();
  return Option.some({ point: act.point, variant: act.variant });
};

/**
 * The refused pick Accept anyway keeps: the one standing, while no other
 * variant is selected (on its own row, its context menu offers it; a
 * receipt's button, with nothing selected, keeps it too).
 */
const acceptedOf = (deck: Deck, ctx: Context): Option.Option<InPlace> =>
  Option.filter(deck.mismatched(), (m) =>
    selectedAll(ctx, 'Variant')
      .filter((s) => s.film === deck.film)
      .every((s) => s.point === m.point && s.variant === m.variant),
  );

/**
 * Each instant every point plays at, as a jump in its card's context menu
 * (and in ⌘K once typed): `Jump to 00:00:04:00 · evidence in cold`, offered while
 * its point is the one selected and there is a picture to jump.
 */
export const markCommands = (deck: Deck): ReadonlyArray<Command> =>
  deck.points().flatMap((point) =>
    point.marks.map((mark, i): Command => ({
      id: `review.mark.${point.id}.${i}`,
      label: `Jump to ${timecode(mark.t)} · ${mark.label}`,
      group: 'Review',
      typed: true,
      about: ['Point', 'Variant'],
      touch: 'long-press its card',
      when: (ctx) =>
        Option.isSome(deck.jump()) && Option.exists(pointIn(deck, ctx), (p) => p.id === point.id),
      run: quietly(() => Option.map(deck.jump(), (jump) => jump(mark.t))),
    })),
  );
