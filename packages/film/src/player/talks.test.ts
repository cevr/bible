// A talk's page reads its edit and, through the footage route, the footage
// library's lock and the transcript it names, and cuts on them with the
// derivation the tools use (`talkTakes`): the same pieces as a talk built on
// the take directly. A file it cannot fetch or read, or a take not ready,
// fails, naming it.

import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, Layer, Option, Result, Schema } from 'effect';
import { HttpClient, HttpClientRequest, HttpClientResponse } from 'effect/http';
import { createTalk } from '../canvas/talk.ts';
import { TalkUnreadable } from '../core/errors.ts';
import { syntheticTake } from '../core/fixtures/talk-take.ts';
import {
  FOOTAGE_LOCK_HREF,
  type FootageLock,
  FootageLockJson,
  FootageTranscriptJson,
  transcriptHref,
} from '../core/footage.ts';
import { TALK_FPS, type Talk, talkCut } from '../core/talk.ts';
import { talkFilms } from './talks.ts';

const SOURCE = 'take.why/0123456789ab';
const FILE = 'take.why.0123456789ab.json';
const WORDS = ['Why', 'the', 'um', 'law?', 'To', 'show', 'grace.'];
const TAKE = syntheticTake(WORDS, [], SOURCE, { width: 720, height: 1280 });

const TALK: Talk = {
  title: 'Why the law?',
  format: 'question',
  takes: { a: 'take.why' },
  sections: [
    { id: 'ask', take: 'a', from: 0, to: 3, cut: [[2, 2]] },
    { id: 'answer', take: 'a', from: 4, to: 6 },
  ],
};

const ENTRY = {
  kind: 'take' as const,
  sha256: `0123456789ab${'c'.repeat(52)}`,
  bytes: 1,
  ext: '.mov',
  probe: {
    container: 'MP4',
    duration: 5,
    picture: {
      codec: 'hevc',
      width: 720,
      height: 1280,
      rotation: 0 as const,
      fps: 30,
      variable: false,
      start: 0,
    },
  },
};

/** The library's files as the footage route serves them, its lock as `lock`. */
const libraryOf = (lock: FootageLock) =>
  Effect.gen(function* () {
    const transcript = yield* Schema.encodeEffect(FootageTranscriptJson)({
      source: SOURCE,
      text: WORDS.join(' '),
      words: TAKE.words,
      envelope: TAKE.envelope,
    });
    return new Map([
      [FOOTAGE_LOCK_HREF, yield* Schema.encodeEffect(FootageLockJson)(lock)],
      [transcriptHref(FILE), transcript],
    ]);
  });

const HEARD: FootageLock = { version: 1, footage: { 'take.why': { ...ENTRY, transcript: FILE } } };

/**
 * A client on a stand-in page answering each path from `files`, a 404 for
 * any other, noting the paths it was asked: bun has no `location`, so a
 * page-relative URL is resolved against an origin here.
 */
const serving = (files: ReadonlyMap<string, string>) => {
  const asked: Array<string> = [];
  const client = HttpClient.make((request, url) => {
    asked.push(url.pathname);
    const response = Option.match(Option.fromUndefinedOr(files.get(url.pathname)), {
      onNone: () => new Response('not found', { status: 404 }),
      onSome: (body) => new Response(body),
    });
    return Effect.succeed(HttpClientResponse.fromWeb(request, response));
  });
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.mapRequest(client, HttpClientRequest.prependUrl('http://lab.test')),
  );
  return { layer, asked };
};

const isUnreadable = Schema.is(TalkUnreadable);

/**
 * Talk `why`'s module as the page loads it, its edit `talk.ts` exporting
 * `module`, over `files`; the page's refusal, if it is `TalkUnreadable`.
 */
const pageOf = (files: ReadonlyMap<string, string>, module: unknown = { talk: TALK }) => {
  const { layer, asked } = serving(files);
  const loaded = Effect.tryPromise({
    try: () => talkFilms({ why: () => Promise.resolve(module) }, layer).why(),
    catch: (error) => Option.liftPredicate(error, isUnreadable),
  });
  return { loaded, asked };
};

describe('talkFilms', () => {
  it.effect(
    'cuts the talk on the take the footage library keeps, read at the footage route: the pieces a talk on that take plays',
    () =>
      Effect.gen(function* () {
        const { loaded, asked } = pageOf(yield* libraryOf(HEARD));
        const film = (yield* loaded).film({ audio: '/films/why/narration/full.wav' });
        expect(asked).toEqual([FOOTAGE_LOCK_HREF, transcriptHref(FILE)]);
        expect(film.audio).toBe('/films/why/narration/full.wav');
        const want = createTalk(TALK, { a: TAKE }, Result.getOrThrow(talkCut(TALK, { a: TAKE })));
        const frames = Arr.makeBy(
          Math.round(want.duration * TALK_FPS),
          (i) => (i + 0.5) / TALK_FPS,
        );
        expect(frames.map((T) => film.footageAt?.(T))).toEqual(
          frames.map((T) => want.footageAt?.(T)),
        );
        expect(film.placed.map((p) => [p.spec.id, p.start, p.dur])).toEqual(
          want.placed.map((p) => [p.spec.id, p.start, p.dur]),
        );
        expect(film.footageAt?.(0)?.[0]?.source).toBe(SOURCE);
      }),
  );

  it.effect(
    'fails, naming the talk and the file and why, on a library it cannot read or a take not ready',
    () =>
      Effect.gen(function* () {
        const library = yield* libraryOf(HEARD);
        const without = (url: string) => new Map([...library].filter(([at]) => at !== url));
        const unheard = yield* libraryOf({ version: 1, footage: { 'take.why': ENTRY } });
        const cases = [
          [without(FOOTAGE_LOCK_HREF), { talk: TALK }, { url: FOOTAGE_LOCK_HREF }, 'status 404'],
          [
            without(transcriptHref(FILE)),
            { talk: TALK },
            { url: transcriptHref(FILE) },
            'status 404',
          ],
          [unheard, { talk: TALK }, {}, 'film footage make take.why'],
          [library, { talk: { title: 3 } }, {}, 'talk.ts does not read'],
        ] as const;
        for (const [files, module, at, why] of cases) {
          const refused = Option.getOrThrow(yield* Effect.flip(pageOf(files, module).loaded));
          expect(refused).toMatchObject({ film: 'why', ...at });
          expect(refused.message).toContain(why);
        }
      }),
  );
});
