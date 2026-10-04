// The lab page onto new code: the server builds the pages itself and numbers
// each build (`LabPage`); the page was served at one, by one server process
// (`<meta name="lab-build">`, `<meta name="lab-server">`), and waits on
// `/api/review/build?since=&film=` for a later one, which a change to a file
// the pages are built from makes, or a new mix of its film's track, or for
// an answer from another server (the lab
// restarted: the page is old code, whatever the numbers). Then the page
// reloads at the frame it shows, as a write does (`StageOps.reload`), so a
// scene edited in the editor or by an agent is on screen without a hand on
// the page. A failed wait (the server restarting) is asked again after a
// pause, for an hour at most (a page left open past that loads the new code
// on its next reload); nothing else of the page waits on it.

import { Effect, Option, Schedule } from 'effect';
import type { PageBuild } from '../core/api.ts';
import { LabClient } from './api.ts';

/** A `<meta>`'s content on this page. */
const meta = (name: string) =>
  Option.fromNullishOr(document.querySelector(`meta[name="${name}"]`)?.getAttribute('content'));

/** The build this page was served at; none outside the lab's server. */
const servedBuild = (): Option.Option<PageBuild> =>
  Option.flatMap(meta('lab-server'), (server) =>
    Option.map(
      Option.filter(
        Option.map(meta('lab-build'), (text) => Number(text)),
        Number.isFinite,
      ),
      (build) => ({ build, server }),
    ),
  );

/** How long a wait is held at the server: under its 60 s cap. */
const WAIT_S = 50;
/** A lost server is asked again every 2 s, for an hour. */
const REASKED = { schedule: Schedule.spaced('2 seconds'), times: 1800 } as const;

/** Whether `answer` is newer code than `served`: another server's, or a later build. */
const newer = (served: PageBuild) => (answer: PageBuild) =>
  answer.server !== served.server || answer.build > served.build;

/**
 * Wait (through `wait`, asked with the build served) for newer code than
 * `served`, then `reload`. A failed wait is asked again after a pause.
 */
export const reloadPast = <E, R>(
  served: PageBuild,
  wait: (served: PageBuild) => Effect.Effect<PageBuild, E, R>,
  reload: Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    yield* wait(served).pipe(Effect.retry(REASKED), Effect.repeat({ until: newer(served) }));
    yield* Effect.logInfo(`lab.rebuilt since=${served.build} server=${served.server}`);
    yield* reload;
  });

/**
 * Wait for newer code than this page was served, or a new mix of `film`,
 * whose track it plays, then `reload`; a page with no build waits for none.
 */
export const reloadOnRebuild = (film: string, reload: Effect.Effect<void>) =>
  Option.match(servedBuild(), {
    onNone: () => Effect.void,
    onSome: (served) =>
      Effect.flatMap(LabClient, (client) =>
        reloadPast(
          served,
          ({ build, server }) =>
            client.page.wait({ query: { since: build, server, film, timeout: WAIT_S } }),
          reload,
        ),
      ),
  });

/**
 * Each newer answer than the last (through `wait`, asked first with `served`),
 * then `heard`, for as long as it runs: a page that keeps its place rather
 * than reloading. A failed wait is asked again after a pause.
 */
export const hearEach = <E, R, H = never>(
  served: PageBuild,
  wait: (served: PageBuild) => Effect.Effect<PageBuild, E, R>,
  heard: Effect.Effect<void, never, H>,
) =>
  Effect.gen(function* () {
    let last = served;
    while (true) {
      const answer = yield* wait(last).pipe(Effect.retry(REASKED));
      if (newer(last)(answer)) {
        yield* Effect.logInfo(`lab.heard since=${last.build} build=${answer.build}`);
        yield* heard;
      }
      last = answer;
    }
  });

/**
 * A review tab of `film` hears each new mix of it (another tab's write
 * mixed it again: `LabPage` watches the track once a page waits with its
 * film), and each newer build, then `heard`, in place: a half-typed comment
 * stays. A page with no build hears none.
 */
export const hearMixes = <H = never>(film: string, heard: Effect.Effect<void, never, H>) =>
  Option.match(servedBuild(), {
    onNone: () => Effect.void,
    onSome: (served) =>
      Effect.flatMap(LabClient, (client) =>
        hearEach(
          served,
          ({ build, server }) =>
            client.page.wait({ query: { since: build, server, film, timeout: WAIT_S } }),
          heard,
        ),
      ),
  });
