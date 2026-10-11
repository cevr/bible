// A seeded art-direction generator: a deck of independent axes (a medium, an
// era, a palette, a light, …), each a list of options, and a draw that picks
// one option per axis from a seed. The deck is an app's data (the colour
// script and the series' rules are its); this is the draw.
//
// A draw is a pure function of its seed and the deck: on each axis every
// option is scored from the seed, the attempt, the axis and the option's own
// id (`rng` seeded by `seedOf` of the four, rendezvous hashing), and the axis
// takes its best-scored option that agrees with the axes picked before it
// (`excludes`, `requires`; an existing look's `profile` picks are never
// drawn). Because each option's score depends on its id, not its place in
// the list, adding an option to an axis changes only the attempts it wins;
// every other seed draws as before. A draw keeps its distance
// from the deck's existing looks (`existing`, `minDistance`, and never one's
// pick on a `distinct` axis), trying the next attempt until it does. A batch
// takes seed after seed, keeping a draw only when it also keeps that distance
// from the batch's earlier draws (and, with `balance`, while its pick on that
// axis has room), so any brief in a batch is regenerated from its seed alone.

import { Array as Arr, Option } from 'effect';
import { rng, seedOf } from './random.ts';

/** How an option is drawn: on the Canvas 2D kit, or with WebGL (three.js through `glCanvas`). */
type ArtCost = '2d' | 'webgl';

/** An option, written `axis/id` where another option names it. */
type OptionRef = string;

/** One option on an axis: what it looks like and what it asks of the engine and its implementor. */
interface ArtOption {
  /** Its id, unique on its axis, in lower case with dashes: a look's name is made of ids. */
  readonly id: string;
  /** Its name in a brief. */
  readonly name: string;
  /** What it looks like, in a sentence or two. */
  readonly look: string;
  /** What it asks of the engine and of the look's implementor. */
  readonly asks: string;
  readonly cost: ArtCost;
  /** Options it is never drawn with (`axis/id`); either side naming the other is enough. */
  readonly excludes?: ReadonlyArray<OptionRef>;
  /** Options it is drawn only with (`axis/id`): on an axis it names, its pick is one of them. */
  readonly requires?: ReadonlyArray<OptionRef>;
  /** An existing look's own pick, there to describe that look: a draw never picks it. */
  readonly profile?: boolean;
}

/** An independent choice: its options, and how much a different pick on it counts toward a draw's distance. */
export interface ArtAxis {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly options: ReadonlyArray<ArtOption>;
}

/** A look as its pick on each axis (axis id → option id); an existing look may name only some axes. */
type ArtPicks = Readonly<Record<string, string>>;

/** A look the deck already has, which a draw keeps its distance from. */
interface ArtLook {
  readonly name: string;
  readonly picks: ArtPicks;
}

export interface ArtDeck {
  /** Raised when an option is removed or its id changes: a brief cites it beside its seed. */
  readonly version: number;
  /** The axes, in the order a draw picks them (an axis others require first). */
  readonly axes: ReadonlyArray<ArtAxis>;
  readonly existing: ReadonlyArray<ArtLook>;
  /** The least weighted share of axes (0..1) a draw differs on from any existing look or batch-mate. */
  readonly minDistance: number;
  /** Axes whose pick a draw never shares with an existing look or a batch-mate (the medium). */
  readonly distinct: ReadonlyArray<string>;
  /** An axis a batch shares out evenly among its options (the dimension): at most `ceil(count / options)` each. */
  readonly balance?: string;
  /** The axes a look's name is made of, their picks' ids joined by dashes. */
  readonly nameAxes: ReadonlyArray<string>;
  /** What every look of the series keeps, whatever it draws: a brief's standing rules. */
  readonly rules: ReadonlyArray<string>;
}

/** A drawn look: its seed, the attempt that kept its distance, its picks and its name. */
interface ArtDraw {
  readonly seed: number;
  readonly attempt: number;
  readonly picks: ArtPicks;
  readonly name: string;
}

/** How many attempts a seed makes before it is given up. */
const ATTEMPTS = 64;

/** How many seeds a batch tries for each draw it asks for, before it stops short. */
const SEEDS_PER_DRAW = 64;

const refOf = (axis: string, id: string): OptionRef => `${axis}/${id}`;
const axisOf = (ref: OptionRef): string => ref.slice(0, Math.max(0, ref.indexOf('/')));

/** The option `ref` names, if the deck has it. */
const lookup = (options: ReadonlyMap<OptionRef, ArtOption>, ref: OptionRef) =>
  Option.fromUndefinedOr(options.get(ref));

/** A look's pick on `axis`, if it names one. */
const pickOf = (picks: ArtPicks, axis: string): Option.Option<string> =>
  Option.fromUndefinedOr(picks[axis]);

/** The options a draw may pick on `axis`: all but the existing looks' profile picks. */
const drawable = (axis: ArtAxis): ReadonlyArray<ArtOption> =>
  axis.options.filter((o) => o.profile !== true);

/** Every option of the deck by its `axis/id`. */
const optionsOf = (deck: ArtDeck): ReadonlyMap<OptionRef, ArtOption> =>
  new Map(deck.axes.flatMap((axis) => axis.options.map((o) => [refOf(axis.id, o.id), o] as const)));

/** Whether `ref`'s option can stand with `other`'s (both picked): neither excludes the other, and neither's `requires` on the other's axis leaves the other out. */
const agree = (
  options: ReadonlyMap<OptionRef, ArtOption>,
  ref: OptionRef,
  other: OptionRef,
): boolean => {
  const allows = (o: ArtOption, pick: OptionRef) => {
    const named = (o.requires ?? []).filter((r) => axisOf(r) === axisOf(pick));
    return !(o.excludes ?? []).includes(pick) && (named.length === 0 || named.includes(pick));
  };
  return Option.match(Option.all([lookup(options, ref), lookup(options, other)]), {
    onNone: () => false,
    onSome: ([a, b]) => allows(a, other) && allows(b, ref),
  });
};

/**
 * The pairs of `picks` that cannot stand together (`excludes`, `requires`),
 * each as `[axis/id, axis/id]`, and every pick that names no option of its
 * axis as `[axis/id, axis/id]` with itself: none for a draw that holds.
 */
export const conflicts = (
  deck: ArtDeck,
  picks: ArtPicks,
): ReadonlyArray<readonly [OptionRef, OptionRef]> => {
  const options = optionsOf(deck);
  const refs = Object.entries(picks).map(([axis, id]) => refOf(axis, id));
  const unknown = refs.filter((r) => !options.has(r)).map((r) => [r, r] as const);
  const pairs = refs.flatMap((a, i) =>
    refs
      .slice(i + 1)
      .filter((b) => options.has(a) && options.has(b) && !agree(options, a, b))
      .map((b) => [a, b] as const),
  );
  return [...unknown, ...pairs];
};

/**
 * How far apart two looks are: the weighted share of the axes both name on
 * which they differ (0 the same, 1 different on every one); 1 when they share
 * no axis.
 */
const distance = (deck: ArtDeck, a: ArtPicks, b: ArtPicks): number => {
  let differ = 0;
  let total = 0;
  for (const axis of deck.axes) {
    const both = Option.all([pickOf(a, axis.id), pickOf(b, axis.id)]);
    if (Option.isNone(both)) continue;
    total += axis.weight;
    if (both.value[0] !== both.value[1]) differ += axis.weight;
  }
  if (total === 0) return 1;
  return differ / total;
};

/** Whether `picks` keeps its distance from `others`: far enough, and sharing none's pick on a `distinct` axis. */
const apart = (deck: ArtDeck, picks: ArtPicks, others: ReadonlyArray<ArtPicks>): boolean =>
  others.every(
    (other) =>
      distance(deck, picks, other) >= deck.minDistance &&
      deck.distinct.every((axis) =>
        Option.match(pickOf(other, axis), {
          onNone: () => true,
          onSome: (id) => !Option.contains(pickOf(picks, axis), id),
        }),
      ),
  );

/** An option's score on its axis for a seed's attempt: the same, forever, for the same four. */
const score = (seed: number, attempt: number, axis: string, id: string): number =>
  rng(seedOf(`${seed >>> 0}:${attempt}:${axis}:${id}`))();

/** One attempt's picks: each axis its best-scored option agreeing with those picked before it; none at a dead end. */
const attemptPicks = (
  deck: ArtDeck,
  options: ReadonlyMap<OptionRef, ArtOption>,
  seed: number,
  attempt: number,
): Option.Option<Record<string, string>> => {
  const picks: Record<string, string> = {};
  for (const axis of deck.axes) {
    const picked = Object.entries(picks).map(([a, id]) => refOf(a, id));
    const ranked = drawable(axis)
      .map((o) => ({ id: o.id, s: score(seed, attempt, axis.id, o.id) }))
      .toSorted((x, y) => y.s - x.s);
    const best = Arr.findFirst(ranked, (o) =>
      picked.every((p) => agree(options, refOf(axis.id, o.id), p)),
    );
    if (Option.isNone(best)) return Option.none();
    picks[axis.id] = best.value.id;
  }
  return Option.some(picks);
};

/** A look's name: its picks on the deck's `nameAxes`, joined by dashes. */
const lookName = (deck: ArtDeck, picks: ArtPicks): string =>
  deck.nameAxes.flatMap((axis) => Option.toArray(pickOf(picks, axis))).join('-');

/**
 * The look `seed` draws from `deck`: the first attempt whose picks hold and
 * keep their distance from the deck's existing looks. None when no attempt
 * of `ATTEMPTS` does.
 */
const drawLook = (deck: ArtDeck, seed: number): Option.Option<ArtDraw> => {
  const options = optionsOf(deck);
  const existing = deck.existing.map((l) => l.picks);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const picks = attemptPicks(deck, options, seed, attempt);
    if (Option.isSome(picks) && apart(deck, picks.value, existing))
      return Option.some({
        seed: seed >>> 0,
        attempt,
        picks: picks.value,
        name: lookName(deck, picks.value),
      });
  }
  return Option.none();
};

/** A batch: the draws it kept, and each seed it passed over with why. */
interface ArtBatch {
  readonly draws: ReadonlyArray<ArtDraw>;
  readonly skipped: ReadonlyArray<{ readonly seed: number; readonly reason: string }>;
}

/**
 * `count` looks from seed `from` on: each seed's own draw (`drawLook`, so a
 * brief is regenerated from its seed alone), kept when it keeps its distance
 * from the batch's earlier draws and, with the deck's `balance`, while its
 * pick on that axis has room. Seeds that do not are passed over, named; a
 * batch stops short after `SEEDS_PER_DRAW` seeds a draw.
 */
export const drawBatch = (deck: ArtDeck, from: number, count: number): ArtBatch => {
  const draws: ArtDraw[] = [];
  const skipped: Array<{ seed: number; reason: string }> = [];
  const balance = deck.axes.find((a) => a.id === deck.balance);
  const room = Option.match(Option.fromUndefinedOr(balance), {
    onNone: () => count,
    onSome: (axis) => Math.ceil(count / Math.max(1, drawable(axis).length)),
  });
  for (let i = 0; draws.length < count && i < count * SEEDS_PER_DRAW; i++) {
    const seed = (from + i) >>> 0;
    const drawn = drawLook(deck, seed);
    if (Option.isNone(drawn)) {
      skipped.push({ seed, reason: `no attempt of ${ATTEMPTS} holds and keeps its distance` });
      continue;
    }
    const look = drawn.value;
    if (
      !apart(
        deck,
        look.picks,
        draws.map((d) => d.picks),
      )
    ) {
      skipped.push({ seed, reason: `${look.name} is too near an earlier draw` });
      continue;
    }
    const full = Option.filter(
      Option.flatMap(Option.fromUndefinedOr(deck.balance), (axis) =>
        Option.map(pickOf(look.picks, axis), (id) => ({ axis, id })),
      ),
      ({ axis, id }) =>
        draws.filter((d) => Option.contains(pickOf(d.picks, axis), id)).length >= room,
    );
    if (Option.isSome(full)) {
      skipped.push({
        seed,
        reason: `${look.name}: ${full.value.axis} ${full.value.id} has its share of the batch`,
      });
      continue;
    }
    draws.push(look);
  }
  return { draws, skipped };
};

/**
 * A draw as a style brief in markdown: its name, seed and deck version, a
 * paragraph of what it looks like, each axis's pick with what it asks, its
 * cost, the deck's standing rules, and the command that regenerates it.
 */
export const artBrief = (deck: ArtDeck, draw: ArtDraw, command: string): string => {
  const options = optionsOf(deck);
  const picked = deck.axes.flatMap((axis) =>
    Option.toArray(
      Option.map(
        Option.flatMap(pickOf(draw.picks, axis.id), (id) => lookup(options, refOf(axis.id, id))),
        (option) => ({ axis, option }),
      ),
    ),
  );
  const cost = Option.match(Option.fromUndefinedOr(picked.find((p) => p.option.cost === 'webgl')), {
    onNone: () => 'the Canvas 2D kit alone',
    onSome: () => 'WebGL (three.js through `glCanvas`) and the Canvas 2D kit',
  });
  const nearest = deck.existing
    .map((l) => ({ name: l.name, d: distance(deck, draw.picks, l.picks) }))
    .toSorted((a, b) => a.d - b.d)[0];
  return [
    `## \`${draw.name}\``,
    '',
    `Seed \`${draw.seed}\` (attempt ${draw.attempt}), deck v${deck.version}. Regenerate: \`${command} --seed ${draw.seed}\`.`,
    '',
    picked.map((p) => p.option.look).join(' '),
    '',
    ...picked.map((p) => `- **${p.axis.name}: ${p.option.name}.** ${p.option.asks}`),
    '',
    `**Cost:** ${cost}.`,
    ...Option.toArray(
      Option.map(
        Option.fromUndefinedOr(nearest),
        (n) => `**Nearest existing look:** \`${n.name}\`, ${Math.round(n.d * 100)}% apart.`,
      ),
    ),
    '',
    '**Standing rules:**',
    ...deck.rules.map((r) => `- ${r}`),
    '',
  ].join('\n');
};
