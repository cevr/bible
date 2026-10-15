// A page waiting on a video's phone copy asks after it every few seconds
// until the copy is made or has failed: a lost ask is asked again, and a
// copy that failed is asked after no more (the index then says so).

import { Duration, Effect, Schedule, Stream } from 'effect';
import type { PhoneCopy } from '../../core/served.ts';

/** How often a page waiting on a video's phone copy asks whether it is made. */
const PHONE_ASKED_EVERY = Duration.seconds(3);

/**
 * `ask`'s answers, asked now and every `PHONE_ASKED_EVERY` after while the
 * copy is on its way; it ends on the first that is made or failed. An ask
 * that fails is heard as on its way, and asked again.
 */
export const copyAwaited = <E, R>(
  ask: Effect.Effect<PhoneCopy, E, R>,
): Stream.Stream<PhoneCopy, never, R> =>
  Stream.fromEffectSchedule(
    ask.pipe(Effect.orElseSucceed((): PhoneCopy => 'pending')),
    Schedule.spaced(PHONE_ASKED_EVERY),
  ).pipe(Stream.takeUntil((copy) => copy !== 'pending'));
