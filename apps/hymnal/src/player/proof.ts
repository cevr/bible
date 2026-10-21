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
 * - nothing otherwise, though a place that moved on more than 2 ms shows
 *   the device sounded at some instant between them.
 *
 * A read asked before the latest act is stale. An act that moves the device
 * to a place is pending until it lands, and a read's place never lands it:
 * One answers the page's seek only at the seek's completion (iOS
 * `HybridOneAudio.swift:198-207`, Android `HybridOneAudio.kt:293-304`, the
 * web's `seeked`), so the act lands at the answer of the page's seek, or of
 * the play (past 0, the answer of the adapter's seek), when the answer's
 * place lies in `[target - 2 ms, target + 2 ms + (answered - known)]`, the
 * target clamped to the answer's length. A read
 * or an answer that says `ended` lands every act. No sound pair is taken
 * while an act is pending; two reads at one place still prove silence then,
 * since a landing would have moved the place. No length of a gap and no
 * count of reads proves anything.
 */

import { Option } from 'effect';

import type { Status } from './player';

/** One status read: asked at `asked`, answered at `answered`, in ms. */
export interface Read {
  readonly asked: number;
  readonly answered: number;
  readonly status: Status;
}

/** An act's place that has not landed; `after`, the latest read since it, which a silence pair may start from. */
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
 * pending until its answer lands it, and becomes the reader's place; one
 * with no place leaves an earlier act pending. No pair spans an act.
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

/**
 * The device already stands at `place` by an act the page follows, known at
 * `now` (a lock-screen play that took an ended recording back to its start):
 * nothing is pending, and no pair spans the act.
 */
export const followed = (proof: Proof, now: number, place: number): Proof => ({
  ...acted(proof, now, Option.none()),
  pending: Option.none(),
  place: Option.some(place),
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
      // A place moved on with no act: the device sounded, though it may not play now.
      const moved = read.status.positionMs - last.status.positionMs > slack;
      return {
        proof: {
          ...next,
          quietFrom: Option.none(),
          sounded: proof.sounded || moved,
        },
        seen: pair,
      };
    },
  });

/** An end lands every act, and leaves no place to go back to: a play after it is from 0:00 (P8). */
const ended = (proof: Proof): Proof => ({
  ...proof,
  pending: Option.none(),
  last: Option.none(),
  quietFrom: Option.none(),
  place: Option.none(),
});

/**
 * A read with no act pending shows where the device is: once this load has
 * sounded, that is the reader's place, as across an act that moved nothing.
 */
const placed = (after: Proved, read: Read): Proved => {
  // A failed device still says where it stood, unless it let the recording go (0).
  const letGo =
    read.status.state === 'idle' || (read.status.state === 'failed' && read.status.positionMs <= 0);
  if (!after.proof.sounded || letGo) return after;
  return { ...after, proof: { ...after.proof, place: Option.some(read.status.positionMs) } };
};

/** The proof after `read`, and what it proved. */
export const readOf = (proof: Proof, read: Read): Proved => {
  if (read.asked < proof.known) return { proof, seen: 'stale' };
  if (read.status.state === 'ended') return { proof: ended(proof), seen: 'nothing' };
  return Option.match(proof.pending, {
    onNone: () => placed(paired(proof, read), read),
    // Two reads after the act at one place prove silence while it is pending: a landing would
    // have moved the place. Sound is never proved across it: a forward landing looks like sound.
    onSome: (pending) => {
      const quiet = Option.exists(pending.after, (after) => pairOf(after, read) === 'silence');
      return {
        proof: {
          ...proof,
          pending: Option.some({ ...pending, after: Option.some(read) }),
          quietFrom: Option.match(pending.after, {
            onNone: () => proof.quietFrom,
            onSome: (after) =>
              Option.flatMap(
                Option.liftPredicate(after, () => quiet),
                (it) => Option.orElse(proof.quietFrom, () => Option.some(it.answered)),
              ),
          }),
        },
        seen: 'pending',
      };
    },
  });
};

/** The proof after a seek's answer, and whether the answer landed the act. */
interface Answered {
  readonly proof: Proof;
  readonly landed: boolean;
}

/**
 * The proof after the device answered the page's seek to `target` ms (or a
 * play's seek) with `answer`, and whether the act landed. It lands when the
 * act is still the pending one, known by the ask, and the answer's place
 * lies in the window, or when an answer asked since the latest act says
 * `ended`. An answer may come after later commands: an act known after its
 * ask is not the one it answers. A landing onto the place the device
 * already stood at keeps the silence run; one that moved it breaks the run.
 * The answer opens the next pair only if it was asked since the latest act:
 * its status is the device's after the landing, never a sound pair's end.
 */
export const answered = (proof: Proof, answer: Read, target: number): Answered => {
  const fresh = answer.asked >= proof.known;
  if (answer.status.state === 'ended' && fresh) return { proof: ended(proof), landed: true };
  if (answer.status.state === 'ended') return { proof, landed: false };
  const lands = Option.exists(proof.pending, (pending) => {
    if (Math.abs(pending.target - target) > slack || pending.known > answer.asked) return false;
    const to = Option.match(Option.fromNullishOr(answer.status.durationMs), {
      onNone: () => pending.target,
      onSome: (length) => Math.min(pending.target, length),
    });
    const at = answer.status.positionMs;
    return at >= to - slack && at <= to + slack + (answer.answered - pending.known);
  });
  if (!lands) return { proof, landed: false };
  const after = Option.flatMap(proof.pending, (it) => it.after);
  const quiet = Option.exists(after, (it) => pairOf(it, answer) === 'silence');
  return {
    proof: {
      ...proof,
      pending: Option.none(),
      last: Option.liftPredicate(answer, () => fresh),
      quietFrom: Option.flatMap(
        Option.liftPredicate(after, () => quiet && fresh),
        (it) => Option.orElse(proof.quietFrom, () => Option.map(it, (read) => read.answered)),
      ),
    },
    landed: true,
  };
};

/** How long silence has been proved, as of `read`: from the run's first read to `read`'s ask. */
export const silentFor = (proof: Proof, read: Read) =>
  Option.match(proof.quietFrom, { onNone: () => 0, onSome: (from) => read.asked - from });
