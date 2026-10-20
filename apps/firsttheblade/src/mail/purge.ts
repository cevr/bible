/**
 * The daily purge: a sign-up still not confirmed `PENDING_FOR` after it is
 * undone (`List.purge`). The Worker runs it on a cron trigger
 * (`../worker/Site.ts`). It logs counts only, and a failure is logged and
 * left for the next day's run.
 */
import { Clock, Effect } from 'effect';

import { List } from './list.ts';
import { logMail, reasonOf, warnMail } from './log.ts';

/** When the purge runs: each day at 04:17 UTC. */
export const PURGE_CRON = '17 4 * * *';

export const purge = Effect.fn('Mail.purge')(
  function* () {
    const list = yield* List;
    const purged = yield* list.purge(yield* Clock.currentTimeMillis);
    yield* logMail('purge.done', { ...purged });
  },
  Effect.catchCause((cause) =>
    warnMail('purge.failed', { reason: reasonOf(cause, (failure) => failure._tag) }),
  ),
);
