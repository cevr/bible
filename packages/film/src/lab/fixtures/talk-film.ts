// A talk, for the talk page's browser tests: a synthetic take
// (`core/fixtures/talk-take.ts`) whose picture is a numbered clip
// (`numbered-frames.ts`), 9:16 so the page's crop is the whole clip and its
// bars run across the page; cut into two sections with a seam inside each (a
// struck word, a long pause tightened), so the page reads the take on, jumps,
// reads on. No hook, so nothing but the captions is drawn over the take, and
// they sit below the bars' middle row.

import { Effect } from 'effect';
import { talkFilms } from '../../canvas/talk.ts';
import type { Film } from '../../canvas/film.ts';
import { syntheticTake } from '../../core/fixtures/talk-take.ts';
import type { Talk } from '../../core/talk.ts';

/** The talk's name in its registry. */
export const TALK = 'talk';

/** The take's numbered clip, 9:16 (each bar 18 px wide). */
export const TALK_CLIP = { width: 180, height: 320 };

/** The words the take says: one struck ("um"), one long pause (before "To"), one fixed ("hour"). */
const WORDS = ['Why', 'was', 'um', 'the', 'law', 'given?', 'To', 'show', 'us', 'hour', 'need.'];

/** The take, as the library names its source and probed its picture. */
export const TALK_TAKE = {
  ...syntheticTake(
    WORDS,
    WORDS.map((_, i) => [0.1, 0.8][Number(i === 6)] ?? 0.1),
  ),
  source: 'take.numbered/0123456789ab',
  ...TALK_CLIP,
};

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

/** The talk's page, built as the films index builds it, playing no narration. */
export const talkFilm = (): Promise<Film> =>
  Effect.runPromise(
    Effect.map(
      Effect.promise(() =>
        talkFilms({
          [TALK]: () =>
            Effect.runPromise(Effect.succeed({ talk: TALK_EDIT, takes: { a: TALK_TAKE } })),
        })[TALK](),
      ),
      (page) => page.film({ audio: '' }),
    ),
  );
