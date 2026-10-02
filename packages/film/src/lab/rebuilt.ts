// The lab page onto new code: the server builds the pages itself and numbers
// each build (`LabPage`); the page was served at one (`<meta
// name="lab-build">`), and waits on `/review/build?since=` for a later one,
// which a change to a file the pages are built from makes. Then the page
// reloads at the frame it shows, as a write does (`StageOps.reload`), so a
// scene edited in the editor or by an agent is on screen without a hand on
// the page. A failed wait (the server restarting) is asked again after a
// pause, for an hour at most (a page left open past that loads the new code
// on its next reload); nothing else of the page waits on it.

import { Effect, Option, Schedule } from 'effect';
import { LabClient } from './api.ts';

/** The build this page was served at, from its `<meta name="lab-build">`; none outside the lab's server. */
const servedBuild = (): Option.Option<number> =>
  Option.flatMap(
    Option.fromNullishOr(document.querySelector('meta[name="lab-build"]')?.getAttribute('content')),
    (text) => Option.filter(Option.some(Number(text)), Number.isFinite),
  );

/** How long a wait is held at the server: under its 60 s cap. */
const WAIT_S = 50;
/** A lost server is asked again every 2 s, for an hour. */
const REASKED = { schedule: Schedule.spaced('2 seconds'), times: 1800 } as const;

/** Wait for a build past the one served, then `reload`; a page with no build waits for none. */
export const reloadOnRebuild = (reload: Effect.Effect<void>) =>
  Option.match(servedBuild(), {
    onNone: () => Effect.void,
    onSome: (since) =>
      Effect.gen(function* () {
        const client = yield* LabClient;
        const waited = client.page
          .wait({ query: { since, timeout: WAIT_S } })
          .pipe(Effect.retry(REASKED), Effect.repeat({ until: (answer) => answer.build > since }));
        yield* waited;
        yield* Effect.logInfo(`lab.rebuilt since=${since}`);
        yield* reload;
      }),
  });
