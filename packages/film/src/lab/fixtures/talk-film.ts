// A talk, for the talk page's browser tests: a synthetic take
// (`core/fixtures/talk-take.ts`) whose picture is a numbered clip
// (`numbered-frames.ts`), 9:16 so the page's crop is the whole clip and its
// bars run across the page; cut into two sections with a seam inside each (a
// struck word, a long pause tightened), so the page reads the take on, jumps,
// reads on. No hook, so nothing but the captions is drawn over the take, and
// they sit below the bars' middle row. The page loads it as the films index
// loads a talk (`talkFilms`): its edit, then the footage library's lock and
// the take's transcript, which the render harness serves at the footage
// route (`TALK_LIBRARY`).

import { Effect, Schema } from 'effect';
import type { Film } from '../../canvas/film.ts';
import { syntheticTake } from '../../core/fixtures/talk-take.ts';
import {
  FOOTAGE_LOCK_HREF,
  FootageLockJson,
  FootageTranscriptJson,
  transcriptHref,
} from '../../core/footage.ts';
import type { Talk } from '../../core/talk.ts';
import { talkFilms } from '../../player/talks.ts';

/** The talk's name in its registry. */
export const TALK = 'talk';

/** The take's numbered clip, 9:16 (each bar 18 px wide). */
export const TALK_CLIP = { width: 180, height: 320 };

/** The words the take says: one struck ("um"), one long pause (before "To"), one fixed ("hour"). */
const WORDS = ['Why', 'was', 'um', 'the', 'law', 'given?', 'To', 'show', 'us', 'hour', 'need.'];

/** The take's original's hash, whose head names its source. */
const SHA = `0123456789ab${'0'.repeat(52)}`;

/** The take, as the library keeps it: its source, its transcript's words, its picture's size. */
export const TALK_TAKE = syntheticTake(
  WORDS,
  WORDS.map((_, i) => [0.1, 0.8][Number(i === 6)] ?? 0.1),
  'take.numbered/0123456789ab',
  TALK_CLIP,
);

/** The take's transcript's file. */
const TRANSCRIPT = 'take.numbered.0123456789ab.json';

/** The talk's edit. */
export const TALK_EDIT: Talk = {
  title: 'Why the law?',
  format: 'question',
  takes: { a: 'take.numbered' },
  fixes: { a: { '9': 'our' } },
  quotes: [{ take: 'a', from: 8, to: 10 }],
  sections: [
    { id: 'ask', take: 'a', from: 0, to: 5, cut: [[2, 2]] },
    { id: 'answer', take: 'a', from: 5, to: 10 },
  ],
};

/**
 * The footage library's files the page reads at the footage route, by URL:
 * the lock, listing the take heard, and the transcript it names.
 */
export const TALK_LIBRARY: Effect.Effect<Readonly<Record<string, string>>> = Effect.gen(
  function* () {
    const lock = yield* Schema.encodeEffect(FootageLockJson)({
      version: 1,
      footage: {
        'take.numbered': {
          kind: 'take',
          sha256: SHA,
          bytes: 1,
          ext: '.mp4',
          probe: {
            container: 'MP4',
            duration: 10,
            picture: {
              codec: 'avc',
              ...TALK_CLIP,
              rotation: 0,
              fps: 30,
              variable: false,
              start: 0,
            },
          },
          transcript: TRANSCRIPT,
        },
      },
    });
    const transcript = yield* Schema.encodeEffect(FootageTranscriptJson)({
      source: TALK_TAKE.source,
      text: WORDS.join(' '),
      words: TALK_TAKE.words,
      envelope: TALK_TAKE.envelope,
    });
    return { [FOOTAGE_LOCK_HREF]: lock, [transcriptHref(TRANSCRIPT)]: transcript };
  },
).pipe(Effect.orDie);

/** The talk's page, built as the films index builds it, playing no narration. */
export const talkFilm = (): Promise<Film> =>
  Effect.runPromise(
    Effect.map(
      Effect.promise(() =>
        talkFilms({ [TALK]: () => Effect.runPromise(Effect.succeed({ talk: TALK_EDIT })) })[TALK](),
      ),
      (page) => page.film({ audio: '' }),
    ),
  );
