/**
 * What the page can prove of the device from its status reads and the acts
 * between them.
 *
 * A read is the device's state at one unknown instant inside
 * `[asked, answered]`. Every move of the place that sound did not make
 * comes from an act (a page command, a lock-screen press, a play from a
 * place), and the page knows each act before it handles any read that shows
 * it: One applies a lock-screen press and calls its listeners in one
 * main-thread task, its status reads resolve in later ones, and Nitro sends
 * both to JS through one queue. So a pair of reads with no act between them
 * proves:
 *
 * - silence, when the place stayed within 2 ms and both say `loading` or
 *   `playing`: the device made no sound over `[answered_a, asked_b]`,
 *   whatever the gap;
 * - sound, when the place moved on more than 2 ms and the second says
 *   `playing`;
 * - nothing otherwise.
 *
 * A read asked before the latest act is stale. An act that moves the device
 * to a place is pending until a read lands it: a place within
 * `[target - 2 ms, target + (answered - known)]`: a device that landed and
 * sounded on cannot be past that bound, and one that has not landed may be
 * anywhere. No sound pair is taken across an act or while one is pending. No length of a gap and no count of reads proves
 * anything.
 */

import { Option } from 'effect';

import type { Status } from './player';

/** One status read: asked at `asked`, answered at `answered`, in ms. */
export interface Read {
  readonly asked: number;
  readonly answered: number;
  readonly status: Status;
}

/** An act's place that no read has seen yet; `after`, the read after it that may open a pair. */
interface Pending {
  readonly target: number;
  readonly known: number;
  readonly after: Option.Option<Read>;
}

export interface Proof {
  /** When the page learnt of the latest act. */
  readonly known: number;
  readonly pending: Option.Option<Pending>;
  /** The read the next read pairs with. */
  readonly last: Option.Option<Read>;
  /** The `answered` of the first read of the silence run since the latest act. */
  readonly quietFrom: Option.Option<number>;
  /** Whether this load (the latest `play`) has sounded. */
  readonly sounded: boolean;
  /** The reader's place, in ms: where a read with no act pending last saw the device once this load sounded, or the latest seek since. */
  readonly place: Option.Option<number>;
}

/** What a read proved: stale, its act still pending, or the pair it closed. */
export type Seen = 'stale' | 'pending' | 'opened' | 'silence' | 'sound' | 'nothing';

/** The proof after a read, and what the read proved. */
export interface Proved {
  readonly proof: Proof;
  readonly seen: Seen;
}

/** Before any load. */
export const none: Proof = {
  known: Number.NEGATIVE_INFINITY,
  pending: Option.none(),
  last: Option.none(),
  quietFrom: Option.none(),
  sounded: false,
  place: Option.none(),
};

/** The slack a place keeps: One rounds a seek to 1/600 s, and Android's to whole ms. */
const slack = 2;

/**
 * An act known at `now`. One that moves the device to `target` (ms) is
 * pending until a read lands it, and becomes the reader's place; one with
 * no place leaves an earlier act pending. No pair spans an act.
 */
export const acted = (proof: Proof, now: number, target: Option.Option<number>): Proof => ({
  ...proof,
  known: now,
  last: Option.none(),
  quietFrom: Option.none(),
  pending: Option.match(target, {
    onNone: () => Option.map(proof.pending, (it) => ({ ...it, after: Option.none<Read>() })),
    onSome: (at) => Option.some({ target: at, known: now, after: Option.none<Read>() }),
  }),
  place: Option.orElse(target, () => proof.place),
});

/** A load (a `play`) from `from` ms, known at `now`: nothing has sounded; the reader's place is `from` past 0. */
export const loaded = (now: number, from: number): Proof => ({
  ...acted(none, now, Option.some(from)),
  place: Option.liftPredicate(from, (at) => at > 0),
});

const moving = (state: Status['state']) => state === 'loading' || state === 'playing';

/** What the pair `a`, `b` proves. */
export const pairOf = (a: Read, b: Read): 'silence' | 'sound' | 'nothing' => {
  const moved = b.status.positionMs - a.status.positionMs;
  if (Math.abs(moved) <= slack && moving(a.status.state) && moving(b.status.state))
    return 'silence';
  if (moved > slack && b.status.state === 'playing') return 'sound';
  return 'nothing';
};

/** The pair `last`, `read` closed, and the proof after it. */
const paired = (proof: Proof, read: Read): Proved =>
  Option.match(proof.last, {
    onNone: () => ({ proof: { ...proof, last: Option.some(read) }, seen: 'opened' }),
    onSome: (last) => {
      const pair = pairOf(last, read);
      const next = { ...proof, last: Option.some(read) };
      if (pair === 'silence')
        return {
          proof: {
            ...next,
            quietFrom: Option.orElse(proof.quietFrom, () => Option.some(last.answered)),
          },
          seen: pair,
        };
      if (pair === 'sound')
        return {
          proof: {
            ...next,
            quietFrom: Option.none(),
            sounded: true,
            place: Option.some(read.status.positionMs),
          },
          seen: pair,
        };
      return { proof: { ...next, quietFrom: Option.none() }, seen: pair };
    },
  });

/** Whether `read` shows the device at `pending`'s target, or on from it by no more than time allows. */
const landsAt = (pending: Pending, read: Read) =>
  read.status.positionMs >= pending.target - slack &&
  read.status.positionMs <= pending.target + (read.answered - pending.known);

/** A pending act's landing at `read`: landed, or still pending. */
const landing = (proof: Proof, pending: Pending, read: Read): Proved => {
  const landed = Option.none<Pending>();
  if (landsAt(pending, read))
    return {
      proof: { ...proof, pending: landed, last: Option.some(read) },
      seen: 'opened',
    };
  // Two reads after the act at one place prove silence while it is pending: a landing would
  // have moved the place. Sound is never proved across it: a forward landing looks like sound.
  const quiet = Option.filter(pending.after, (after) => pairOf(after, read) === 'silence');
  return {
    proof: {
      ...proof,
      pending: Option.some({ ...pending, after: Option.some(read) }),
      quietFrom: Option.flatMap(quiet, (after) =>
        Option.orElse(proof.quietFrom, () => Option.some(after.answered)),
      ),
    },
    seen: 'pending',
  };
};

/** The proof after `read`, and what it proved. */
export const readOf = (proof: Proof, read: Read): Proved => {
  if (read.asked < proof.known) return { proof, seen: 'stale' };
  // An end short of a pending place was read before the device moved there.
  const before = Option.filter(
    proof.pending,
    (it) =>
      read.status.state === 'ended' &&
      !landsAt(it, read) &&
      it.target < read.status.positionMs - slack,
  );
  if (Option.isSome(before))
    return {
      proof: { ...proof, pending: Option.some({ ...before.value, after: Option.none<Read>() }) },
      seen: 'pending',
    };
  if (read.status.state === 'ended')
    return {
      proof: { ...proof, pending: Option.none(), last: Option.none(), quietFrom: Option.none() },
      seen: 'nothing',
    };
  return Option.match(proof.pending, {
    onNone: () => placed(paired(proof, read), read),
    onSome: (pending) => landing(proof, pending, read),
  });
};

/**
 * A read with no act pending shows where the device is: once this load has
 * sounded, that is the reader's place, as across an act that moved nothing.
 */
const placed = (after: Proved, read: Read): Proved => {
  if (!after.proof.sounded || read.status.state === 'idle' || read.status.state === 'failed')
    return after;
  return { ...after, proof: { ...after.proof, place: Option.some(read.status.positionMs) } };
};

/** How long silence has been proved, as of `read`: from the run's first read to `read`'s ask. */
export const silentFor = (proof: Proof, read: Read) =>
  Option.match(proof.quietFrom, { onNone: () => 0, onSome: (from) => read.asked - from });
