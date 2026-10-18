// A film's timeline over HTTP, as the studio page reads it: the production's
// open version when none is asked, and a version asked by `?v=`; refused at
// 404 by name, a version the production does not have (FilmVersionUnknown)
// and one it has that kept nothing to show (FilmVersionUnkept); a film the
// lab does not have is refused too.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Result, Schema } from 'effect';
import { labUrls } from '../core/api.ts';
import { FilmTimeline } from '../core/timeline-schema.ts';
import { labHandler } from './lab.ts';
import { ProductionStore } from './production-store.ts';
import { echoPages, freshFilm, labInMemory, text } from './testing.ts';

const bound = { hostname: '127.0.0.1', port: 4401 } as const;
const get = (path: string) => new Request(`http://127.0.0.1:4401${path}`, { method: 'GET' });
const readTimeline = Schema.decodeUnknownEffect(FilmTimeline);
const Refused = Schema.Struct({ _tag: Schema.String });

/** Film `f` with its registered files, a beat of 8 s on its clock. */
const provided = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  self.pipe(
    Effect.scoped,
    Effect.provide(
      labInMemory(new Map([['/films/f/scenes/index.ts', text('export {};\n')]]), echoPages, {
        film: freshFilm({
          clock: () =>
            Effect.succeed({
              beats: [
                {
                  id: 'seed',
                  start: 0,
                  dur: 8,
                  hold: { lead: 0.5, tail: 0.1, declared: [] },
                  speech: { start: 0.5, end: 7.9 },
                  marks: [],
                  voice: 'estimated',
                  drawn: false,
                },
              ],
              acts: [],
              movements: [],
            }),
        }),
      }),
    ),
  );

/** Film `f`'s production: v1, then v2 open on the registered files. */
const twoVersions = Effect.gen(function* () {
  const productions = yield* ProductionStore;
  yield* productions.start('f', {
    title: 'F',
    film: Option.some('f'),
    blurb: Option.none(),
    first: 'the first cut',
    at: 1,
  });
  yield* productions.modify('f', (current) =>
    Result.succeed({
      ...current,
      versions: [...current.versions, { at: 2, title: 'written again', because: Option.none() }],
    }),
  );
});

describe('the timeline route', () => {
  it.effect(
    'answers the open version and a version asked, and refuses one the production has not and one that kept nothing',
    () =>
      provided(
        Effect.gen(function* () {
          yield* twoVersions;
          const lab = yield* labHandler();
          const ask = (query: { readonly v?: number }, film = 'f') =>
            Effect.promise(() =>
              lab(get(labUrls.timeline.read({ params: { film }, query })), bound),
            );
          const open = yield* ask({});
          expect(open.status).toBe(200);
          const read = yield* readTimeline(yield* Effect.promise(() => open.json()));
          expect(read.version).toEqual({ n: 2, title: 'written again', open: true, files: 'film' });
          expect(read.lanes.map((lane) => lane.track)).toEqual(['script']);
          const asked = yield* ask({ v: 2 });
          expect(asked.status).toBe(200);
          const two = yield* readTimeline(yield* Effect.promise(() => asked.json()));
          expect(two.version).toEqual(read.version);
          const refusedAs = (answer: Response) =>
            Effect.flatMap(
              Effect.promise(() => answer.json()),
              Schema.decodeUnknownEffect(Refused),
            );
          const none = yield* ask({ v: 9 });
          expect(none.status).toBe(404);
          expect((yield* refusedAs(none))._tag).toBe('FilmVersionUnknown');
          // v1 was replaced in place: no folder of its own, and the film's files are v2's.
          const unkept = yield* ask({ v: 1 });
          expect(unkept.status).toBe(404);
          expect((yield* refusedAs(unkept))._tag).toBe('FilmVersionUnkept');
          const unknown = yield* ask({}, 'nofilm');
          expect(unknown.status).toBe(404);
        }),
      ),
  );
});
