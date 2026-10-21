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
 * to a place is pending until a read lands it: a place within
 * `[target - 2 ms, target + (answered - known)]`: a device that landed and
 * sounded on cannot be past that bound, and one that has not landed may be
 * anywhere. No sound pair is taken across an act or while one is pending. No length of a gap and no count of reads proves
 * anything.
 */

import { Array as Arr, Option } from 'effect';

import type { Status } from './player';

/** One status read: asked at `asked`, answered at `answered`, in ms. */
export interface Read {
  readonly asked: number;
  readonly answered: number;
  readonly status: Status;
}

/**
 * An act's place that no read has seen yet; `after`, the read after it that may open a pair;
 * `seen`, the latest read since it, kept across acts with no place, which move nothing.
 */
interface Pending {
  readonly target: number;
  readonly known: number;
  readonly after: Option.Option<Read>;
  readonly seen: Option.Option<Read>;
  /** The latest read since it that showed the device outside the place's window: not landed when it was sampled. */
  readonly outside: Option.Option<Read>;
  /** The latest read before the act: where the device stood when it was asked to move. */
  readonly before: Option.Option<Read>;
  /** A load's place: its lead-in from 0:00 (Android) sounds short of it and proves nothing. */
  readonly load: boolean;
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
  /**
   * The places of seeks a later act replaced before a read proved them: a device may still
   * land one (an iOS lock-screen seek runs on AVPlayer with no readiness guard, after the
   * page's own seek was refused), and a read there is no place the reader asked.
   */
  readonly superseded: ReadonlyArray<number>;
}

/** What a read proved: stale, its act still pending or landed, or the pair it closed. */
export type Seen =
  | 'stale'
  | 'pending'
  | 'landed'
  | 'superseded'
  | 'opened'
  | 'silence'
  | 'sound'
  | 'nothing';

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
  superseded: [],
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
    onSome: (at) =>
      Option.some({
        target: at,
        known: now,
        after: Option.none<Read>(),
        seen: Option.none<Read>(),
        outside: Option.none<Read>(),
        before: Option.orElse(proof.last, () =>
          Option.flatMap(proof.pending, (it) => Option.orElse(it.seen, () => it.before)),
        ),
        load: false,
      }),
  }),
  place: Option.orElse(target, () => proof.place),
  superseded: Option.match(target, {
    onNone: () => proof.superseded,
    onSome: () => [
      ...proof.superseded,
      ...Option.toArray(Option.map(proof.pending, (it) => it.target)),
    ],
  }),
});

/** A load (a `play`) from `from` ms, known at `now`: nothing has sounded; the reader's place is `from` past 0. */
export const loaded = (now: number, from: number): Proof => ({
  ...acted(none, now, Option.some(from)),
  pending: Option.some({
    target: from,
    known: now,
    after: Option.none<Read>(),
    seen: Option.none<Read>(),
    outside: Option.none<Read>(),
    before: Option.none<Read>(),
    load: true,
  }),
  // A new play replaces the item, and its seeks with it.
  superseded: [],
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

/** Whether `read` shows the device at `pending`'s target, or on from it by no more than time allows. */
const landsAt = (pending: Pending, read: Read) => {
  // A read since the act that showed the device outside the window was sampled before the
  // landing, so the device has sounded on from the place no longer than since that read's ask.
  // The slack holds on both sides: the device lands at the place rounded (1/600 s on iOS,
  // whole ms on Android).
  const from = Option.match(pending.outside, {
    onNone: () => pending.known,
    onSome: (before) => Math.max(pending.known, before.asked),
  });
  const at = read.status.positionMs;
  return at >= pending.target - slack && at <= pending.target + slack + (read.answered - from);
};

/** A pending act's landing at `read`: landed, or still pending. */
const landing = (proof: Proof, pending: Pending, read: Read, takenAt: number): Proved => {
  const landed = Option.none<Pending>();
  // The read before, if it showed the device outside the window, saw it not landed.
  const outside = Option.filter(pending.seen, (before) =>
    Option.exists(pending.outside, (it) => it === before),
  );
  // A device at that read's place stood still: no landing came between. Unless the place lies
  // past the target by no more than the time since that read's ask, and the device sounds now:
  // then it may have landed and sounded back up to it. A device that says it is not playing at
  // the place it stood at did not land and sound up to that very place and stop there.
  const playing = read.status.state === 'playing';
  const at = (before: Read) => Math.abs(read.status.positionMs - before.status.positionMs) <= slack;
  const stood =
    Option.exists(
      outside,
      (before) =>
        at(before) &&
        !(
          playing &&
          before.status.positionMs > pending.target + slack &&
          before.status.positionMs - pending.target - slack <= read.answered - before.asked
        ),
    ) ||
    // With no read since that saw it outside, the read before the act is where it stood.
    (Option.isNone(outside) &&
      !playing &&
      Option.exists(
        pending.before,
        (before) => at(before) && Math.abs(before.status.positionMs - pending.target) > slack,
      ));
  // A refused device stands where it stood: it comes onto the place only by sound from short
  // of it, or by a phone's press that moves it there itself.
  const onto = Option.exists(
    outside,
    (before) =>
      before.status.positionMs < pending.target - slack ||
      Math.abs(read.status.positionMs - pending.target) <= slack,
  );
  // Two reads after the act at one place prove silence while it is pending: a landing would
  // have moved the place. Sound is never proved across it: a forward landing looks like sound.
  const quiet = Option.filter(pending.after, (after) => pairOf(after, read) === 'silence');
  const quietFrom = Option.flatMap(quiet, (after) =>
    Option.orElse(proof.quietFrom, () => Option.some(after.answered)),
  );
  if (!stood && (read.asked >= takenAt || onto) && landsAt(pending, read))
    return {
      // A landing that moved the device breaks the silence run; one onto the place the device
      // already stood at moved nothing, so the run goes on.
      proof: { ...proof, pending: landed, last: Option.some(read), quietFrom },
      seen: 'landed',
    };
  // A landing never leaves the device short of its place, so a move on that stops short of
  // it is sound, though no pair proves the device plays now.
  const short = Option.exists(
    Option.filter(pending.seen, () => !pending.load),
    (after) =>
      read.status.positionMs > after.status.positionMs + slack &&
      read.status.positionMs < pending.target - slack,
  );
  // So a sound pair short of it, after the act, proves sound while the place stays pending.
  const sound = Option.exists(
    Option.filter(pending.after, () => !pending.load),
    (after) => pairOf(after, read) === 'sound' && read.status.positionMs < pending.target - slack,
  );
  const next = Option.some({
    ...pending,
    after: Option.some(read),
    seen: Option.some(read),
    outside: Option.orElse(
      // A device that stood where a read saw it not landed is not landed either.
      Option.liftPredicate(read, (it) => stood || !landsAt(pending, it)),
      () => pending.outside,
    ),
  });
  if (sound)
    return {
      proof: { ...proof, sounded: true, pending: next, quietFrom: Option.none() },
      seen: 'sound',
    };
  return {
    proof: {
      ...proof,
      sounded: proof.sounded || short,
      pending: next,
      quietFrom,
    },
    seen: 'pending',
  };
};

/**
 * The proof after `read`, and what it proved. A pending place lands only at
 * a read asked from `takenAt`: a device that refused the place may stand
 * anywhere, the place asked included, until it is asked again.
 */
export const readOf = (proof: Proof, read: Read, takenAt = Number.NEGATIVE_INFINITY): Proved => {
  if (read.asked < proof.known) return { proof, seen: 'stale' };
  // An end read while a place short of it is pending may be from before the device moved
  // there (an iOS seek lands after its tell): the place stays pending until a read shows it.
  const before = Option.filter(
    proof.pending,
    (it) => read.status.state === 'ended' && it.target < read.status.positionMs - slack,
  );
  if (Option.isSome(before))
    return {
      proof: { ...proof, pending: Option.some({ ...before.value, after: Option.none<Read>() }) },
      seen: 'pending',
    };
  // An end lands every act, and leaves no place to go back to: a play after it is from 0:00 (P8).
  if (read.status.state === 'ended')
    return {
      proof: {
        ...proof,
        pending: Option.none(),
        last: Option.none(),
        quietFrom: Option.none(),
        place: Option.none(),
      },
      seen: 'nothing',
    };
  // A superseded seek landed: the device stands at a place no later act asked. The reader's
  // place is pending again, to be asked of the device once more.
  const reader = Option.orElse(
    Option.map(proof.pending, (it) => it.target),
    () => proof.place,
  );
  const stray = Option.flatMap(reader, (at) =>
    Arr.findFirst(
      proof.superseded,
      (it) => Math.abs(read.status.positionMs - it) <= slack && Math.abs(at - it) > slack,
    ).pipe(Option.map((it) => ({ it, at }))),
  );
  if (Option.isSome(stray))
    return {
      proof: {
        ...proof,
        last: Option.none(),
        quietFrom: Option.none(),
        superseded: proof.superseded.filter((it) => it !== stray.value.it),
        pending: Option.some({
          target: stray.value.at,
          known: read.asked,
          after: Option.none<Read>(),
          seen: Option.some(read),
          outside: Option.some(read),
          before: Option.some(read),
          load: false,
        }),
      },
      seen: 'superseded',
    };
  return Option.match(proof.pending, {
    onNone: () => placed(paired(proof, read), read),
    onSome: (pending) => landing(proof, pending, read, takenAt),
  });
};

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

/** How long silence has been proved, as of `read`: from the run's first read to `read`'s ask. */
export const silentFor = (proof: Proof, read: Read) =>
  Option.match(proof.quietFrom, { onNone: () => 0, onSome: (from) => read.asked - from });
