// A film's narration as its page loads it. The framework names the files by
// the film's id, the folder the tools read and write (`FilmPaths`: the
// timings under `narration/`, the mixed master beside them), so a film never
// builds its own URLs and the page and the tools lay out the same takes. A
// film with no timings file yet is laid out on estimates, as the tools lay it
// out; a file that is there but cannot be fetched or read is an error naming
// it, never a silent fall back to estimates.

import { Effect, type Layer, Record as Rec, Schema } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { NarrationUnreadable } from '../core/errors.ts';
import { type Timings, TimingsJson } from '../core/schema.ts';
import type { Film } from '../canvas/film.ts';

/** What a film's page is built from: its takes' timings and its master's URL. */
export interface Narrated {
  readonly timings: Timings;
  readonly audio: string;
}

/** A film's module as the registry loads it: the film, built from its narration. */
interface FilmModule {
  readonly film: (narrated: Narrated) => Film;
}

/** The timings of a film with no takes yet: every scene estimated, as the tools read no file. */
export const NO_TAKES: Timings = { voice: '', scenes: {} };

/** Where the page reads film `id`'s narration. */
export const narrationUrls = (id: string) => ({
  timings: `/films/${id}/narration/timings.json`,
  audio: `/films/${id}/narration/full.wav`,
});

/** Film `id`'s narration: its timings (none yet on a 404) and its master's URL. */
export const loadNarrated = (
  id: string,
): Effect.Effect<Narrated, NarrationUnreadable, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const at = narrationUrls(id);
    const unreadable = (reason: string) =>
      NarrationUnreadable.make({ film: id, url: at.timings, reason });
    const http = yield* HttpClient.HttpClient;
    const res = yield* Effect.mapError(http.get(at.timings), (e) => unreadable(e.message));
    if (res.status === 404) return { timings: NO_TAKES, audio: at.audio };
    if (res.status < 200 || res.status >= 300) return yield* unreadable(`status ${res.status}`);
    const text = yield* Effect.mapError(res.text, (e) => unreadable(e.message));
    const timings = yield* Effect.mapError(Schema.decodeEffect(TimingsJson)(text), (e) =>
      unreadable(e.message),
    );
    return { timings, audio: at.audio };
  });

/**
 * The registry's loaders: each film, keyed by its folder under `films/`, its
 * module and its narration loaded together and the film built from them; the
 * narration is read through `http` (the page's `fetch` client unless given).
 */
export const narratedFilms = <K extends string>(
  modules: Readonly<Record<K, () => Promise<FilmModule>>>,
  http: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer,
): Record<K, () => Promise<Film>> =>
  Rec.map(
    modules,
    (load, id) => () =>
      Effect.runPromise(
        Effect.all([Effect.promise(load), loadNarrated(id)], { concurrency: 2 }).pipe(
          Effect.map(([m, narrated]) => m.film(narrated)),
          Effect.provide(http),
        ),
      ),
  );
