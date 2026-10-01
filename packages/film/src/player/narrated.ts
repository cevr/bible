// A film's narration as its page loads it. The framework names the files by
// the film's id, the folder the tools read and write (`FilmPaths`: the
// timings under `narration/`, the mixed master beside them), so a film never
// builds its own URLs and the page and the tools lay out the same takes. A
// film with no timings file yet is laid out on estimates, as the tools lay it
// out; a file that is there but cannot be fetched or read is an error naming
// it, never a silent fall back to estimates.

import { Record as Rec, Schema } from 'effect';
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

/** The fetch the page uses: a response's status and its text. */
export type Fetch = (url: string) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly text: () => Promise<string>;
}>;

/** Film `id`'s narration: its timings (none yet on a 404) and its master's URL. */
export const loadNarrated = (id: string, get: Fetch): Promise<Narrated> => {
  const at = narrationUrls(id);
  const unreadable = (reason: string) =>
    Promise.reject(NarrationUnreadable.make({ film: id, url: at.timings, reason }));
  return get(at.timings).then(
    (res) => {
      if (res.status === 404) return { timings: NO_TAKES, audio: at.audio };
      if (!res.ok) return unreadable(`status ${res.status}`);
      return res.text().then((text) => {
        const timings = Schema.decodeResult(TimingsJson)(text);
        if (timings._tag === 'Failure') return unreadable(timings.failure.message);
        return { timings: timings.success, audio: at.audio };
      });
    },
    (cause: unknown) => unreadable(String(cause)),
  );
};

/**
 * The registry's loaders: each film, keyed by its folder under `films/`, its
 * module and its narration loaded together and the film built from them.
 */
export const narratedFilms = <K extends string>(
  modules: Readonly<Record<K, () => Promise<FilmModule>>>,
  get: Fetch = (url) => fetch(url),
): Record<K, () => Promise<Film>> =>
  Rec.map(
    modules,
    (load, id) => () =>
      Promise.all([load(), loadNarrated(id, get)]).then(([m, narrated]) => m.film(narrated)),
  );
