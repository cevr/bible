// A talk as its page loads it. The page reads what the tools read: the
// talk's edit (its `talk.ts`, imported as the films index imports a film),
// the footage library's lock and the transcripts it names (through the
// footage route, `FOOTAGE_LOCK_HREF` and `transcriptHref`), and builds the
// takes with the one derivation the tools use (`talkTakes`), so the picture
// it cuts and the sound the tools mix play the same pieces. A file it cannot
// fetch or read, or a take that is not ready, is an error naming it.

import { Effect, type Layer, Record as Rec, Schema } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import type { Film } from '../canvas/film.ts';
import { createTalk } from '../canvas/talk.ts';
import { TalkUnreadable } from '../core/errors.ts';
import {
  FOOTAGE_LOCK_HREF,
  FootageLockJson,
  FootageTranscriptJson,
  transcriptHref,
} from '../core/footage.ts';
import {
  Talk,
  type TalkCut,
  type TalkTake,
  talkCut,
  talkTakes,
  talkTranscripts,
} from '../core/talk.ts';

/** A talk's module, its `talk.ts`: the edit, exported as `talk`. */
const TalkModule = Schema.Struct({ talk: Talk });

/** What a talk's page is built from: its edit, its takes by the talk's keys for them, and its cut on them. */
interface TalkPage {
  readonly talk: Talk;
  readonly takes: Readonly<Record<string, TalkTake>>;
  readonly cut: TalkCut;
}

/** How many transcripts a page fetches at once: a browser's own limit per host. */
const TRANSCRIPTS_AT_ONCE = 6;

/** The file at `url`, as `codec` reads it, through the page's client: anything else is `TalkUnreadable`. */
const read = <A>(film: string, url: string, codec: Schema.Codec<A, string>) =>
  Effect.gen(function* () {
    const unreadable = (reason: string) => TalkUnreadable.make({ film, url, reason });
    const http = yield* HttpClient.HttpClient;
    const res = yield* Effect.mapError(http.get(url), (e) => unreadable(e.message));
    if (res.status < 200 || res.status >= 300) return yield* unreadable(`status ${res.status}`);
    const text = yield* Effect.mapError(res.text, (e) => unreadable(e.message));
    return yield* Effect.mapError(Schema.decodeEffect(codec)(text), (e) => unreadable(e.message));
  });

/**
 * Talk `film`'s page input from its module (`talk.ts`): the edit, the takes
 * the footage library keeps for it (`talkTakes`, over the lock and the
 * transcripts it names, read at the footage route), and its cut.
 */
const loadTalk = (
  film: string,
  module: unknown,
): Effect.Effect<TalkPage, TalkUnreadable, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const refused = (reason: string) => TalkUnreadable.make({ film, reason });
    const { talk } = yield* Effect.mapError(Schema.decodeUnknownEffect(TalkModule)(module), (e) =>
      refused(`its talk.ts does not read: ${e.message}`),
    );
    const lock = yield* read(film, FOOTAGE_LOCK_HREF, FootageLockJson);
    const transcripts = new Map(
      yield* Effect.forEach(
        talkTranscripts(talk, lock),
        (file) =>
          Effect.map(
            read(film, transcriptHref(file), FootageTranscriptJson),
            (heard) => [file, heard] as const,
          ),
        { concurrency: TRANSCRIPTS_AT_ONCE },
      ),
    );
    const takes = yield* Effect.mapError(
      Effect.fromResult(talkTakes(talk, lock, transcripts)),
      (e) => refused(e.message),
    );
    const cut = yield* Effect.mapError(Effect.fromResult(talkCut(talk, takes)), (e) =>
      refused(e.message),
    );
    return { talk, takes, cut };
  });

/** A talk's module as the films index loads it: the talk built, playing its mixed narration. */
interface TalkFilmModule {
  readonly film: (narrated: { readonly audio: string }) => Film;
}

/**
 * The films index's entries for its talks, each a talk's `talk.ts` loaded
 * as `narratedFilms` loads a drawn film's module, and its takes read from the
 * footage library (`loadTalk`) through `http` (the page's `fetch` client
 * unless given): spread them beside the drawn films, keyed by each talk's
 * folder, and the framework reads each one's narration (its mixed track) as
 * it reads a film's.
 */
export const talkFilms = <K extends string>(
  talks: Readonly<Record<K, () => Promise<unknown>>>,
  http: Layer.Layer<HttpClient.HttpClient> = FetchHttpClient.layer,
): Record<K, () => Promise<TalkFilmModule>> =>
  Rec.map(
    talks,
    (load, id) => () =>
      Effect.runPromise(
        Effect.promise(load).pipe(
          Effect.flatMap((module) => loadTalk(id, module)),
          Effect.map((page): TalkFilmModule => ({
            film: (narrated) => ({
              ...createTalk(page.talk, page.takes, page.cut),
              audio: narrated.audio,
            }),
          })),
          Effect.provide(http),
        ),
      ),
  );
