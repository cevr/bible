// The choices' keys over the selected point: ⌥→/⌥← audition its variants in
// place round from the one heard (else the picked one), skipping what cannot
// be heard; Enter picks the selected variant only while it is the one heard
// and is not picked; `.`/`,` walk its marks past the time shown, and each
// mark is a jump on its card's menu while there is a picture.

import { describe, expect, test } from 'bun:test';
import { Effect, Option, Schema } from 'effect';
import { BY_BUTTON, type Command, labelOf } from '../../../command/command.ts';
import { type Context, contextAt, withSelection } from '../../../command/context.ts';
import { contextRows } from '../../../command/menu.ts';
import { Selection } from '../../../command/selection.ts';
import { FilmChoices } from '../../../core/choice.ts';
import {
  type Deck,
  type InPlace,
  auditionOf,
  heardSelectedOf,
  markCommands,
  pointCommands,
  verbTitle,
} from './keys.ts';

/** A variant heard in place, as the wire carries it. */
const variant = (id: string, picked: boolean, state = 'current') => ({
  id,
  label: id,
  lines: [],
  state,
  picked,
  verbs: ['pick'],
  media: { _tag: 'Heard', alone: true, inPlace: true },
  key: id,
  approval: 'none',
  comments: [],
});

const points = Schema.decodeUnknownSync(FilmChoices)({
  film: 'toy',
  pictures: [],
  points: [
    {
      id: 'score',
      kind: 'score',
      address: { _tag: 'Film' },
      title: 'Score',
      lines: [],
      start: 0,
      marks: [
        { t: 4, label: 'cold' },
        { t: 1, label: 'open' },
      ],
      variants: [
        variant('strings', true),
        variant('piano', false),
        variant('missing', false, 'missing'),
        variant('brass', false),
      ],
    },
  ],
}).points;

/** A deck over the toy's score, `heard` playing, with a picture unless `still`. */
const deck = (heard: Option.Option<InPlace>, still = false) => {
  const auditioned: Array<InPlace> = [];
  const picked: Array<InPlace> = [];
  const jumped: Array<number> = [];
  const d: Deck = {
    film: 'toy',
    points: () => points,
    heard: () => heard,
    audition: (h) => auditioned.push(h),
    pick: (h) => {
      picked.push(h);
      return Effect.runPromise(Effect.succeed(true));
    },
    jump: () =>
      Option.liftPredicate(
        (t: number) => jumped.push(t),
        () => !still,
      ),
    now: () => 2,
  };
  return { d, auditioned, picked, jumped };
};

const page = contextAt('review', '/review/films/toy/choices');
const onVariant = (id: string): Context =>
  withSelection(page, [Selection.cases.Variant.make({ film: 'toy', point: 'score', variant: id })]);
const onCard = withSelection(page, [Selection.cases.Point.make({ film: 'toy', point: 'score' })]);

const scoreOf = (variant: string): Option.Option<InPlace> =>
  Option.some({ point: 'score', variant });

const byId = (commands: ReadonlyArray<Command>, id: string): Command =>
  Option.getOrThrow(Option.fromUndefinedOr(commands.find((c) => c.id === id)));

describe('audition', () => {
  test('steps round the hearable variants from the one heard, never to a missing one', () => {
    const { d } = deck(scoreOf('piano'));
    expect(Option.map(auditionOf(d, onCard, 'next'), (v) => v.id)).toEqual(Option.some('brass'));
    expect(Option.map(auditionOf(d, onCard, 'previous'), (v) => v.id)).toEqual(
      Option.some('strings'),
    );
    const last = deck(scoreOf('brass')).d;
    expect(Option.map(auditionOf(last, onCard, 'next'), (v) => v.id)).toEqual(
      Option.some('strings'),
    );
  });

  test('starts from the picked one when the point is not heard, and needs a selected point', () => {
    const { d, auditioned } = deck(Option.none());
    const commands = pointCommands(d);
    expect(labelOf(byId(commands, 'review.audition-next'), onCard)).toBe('Hear piano in place');
    Effect.runSync(byId(commands, 'review.audition-next').run(onCard, BY_BUTTON));
    expect(auditioned).toEqual([{ point: 'score', variant: 'piano' }]);
    expect(byId(commands, 'review.audition-next').when(page)).toBe(false);
    expect(byId(commands, 'review.audition-next').keys).toEqual(['alt+arrowright']);
  });
});

describe("Enter's pick", () => {
  test('picks the selected variant only while it is the one heard and not picked', () => {
    const { d, picked } = deck(scoreOf('piano'));
    const pick = byId(pointCommands(d), 'review.pick-heard');
    expect(pick.when(onVariant('brass'))).toBe(false);
    expect(pick.when(onCard)).toBe(false);
    expect(pick.when(onVariant('piano'))).toBe(true);
    expect(labelOf(pick, onVariant('piano'))).toBe('Pick piano');
    Effect.runFork(pick.run(onVariant('piano'), BY_BUTTON));
    expect(picked).toEqual([{ point: 'score', variant: 'piano' }]);
    expect(Option.isNone(heardSelectedOf(deck(scoreOf('strings')).d, onVariant('strings')))).toBe(
      true,
    );
    expect(verbTitle('take', 'pick')).toBe('Keep');
  });
});

describe('the marks', () => {
  test('`.` and `,` jump to the next and previous mark past the time shown', () => {
    const { d, jumped } = deck(Option.none());
    const commands = pointCommands(d);
    Effect.runSync(byId(commands, 'review.mark-next').run(onVariant('piano'), BY_BUTTON));
    Effect.runSync(byId(commands, 'review.mark-previous').run(onVariant('piano'), BY_BUTTON));
    expect(jumped).toEqual([4, 1]);
    expect(byId(commands, 'review.mark-next').keys).toEqual(['.']);
    expect(byId(pointCommands(deck(Option.none(), true).d), 'review.mark-next').when(onCard)).toBe(
      false,
    );
  });

  test("each mark is a jump in its card's menu while there is a picture", () => {
    const { d } = deck(Option.none());
    const marks = markCommands(d);
    const rows = contextRows(
      marks.filter((c) => c.when(onCard)),
      onCard,
    ).flatMap(([, r]) => r.map((row) => row.label));
    expect(rows).toEqual(['Jump to 0:04.0 · cold', 'Jump to 0:01.0 · open']);
    expect(marks.every((c) => c.typed === true)).toBe(true);
    expect(markCommands(deck(Option.none(), true).d).some((c) => c.when(onCard))).toBe(false);
  });
});
