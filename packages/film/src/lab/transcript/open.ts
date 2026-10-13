// How the Transcript view is open (`?text=` in the lab's place): not at all,
// which is the address bar's `?text=` absent; following the frame (`follow`),
// the view scrolling to the word that plays; or held on a word of the talk
// (`?text=12`, a take word index), as a cited range opens it. One reader and
// one printer, so a link written is a link read.

import { Match, Option } from 'effect';

/** The view is open, and where it looks. */
export type TextOpen =
  | { readonly _tag: 'Follow' }
  | { readonly _tag: 'Word'; readonly word: number };

export const FOLLOW_TEXT: TextOpen = { _tag: 'Follow' };

/** Held on take word `word`. */
const wordOpen = (word: number): TextOpen => ({ _tag: 'Word', word });

const FOLLOWING = 'follow';

/** The view `?text=<value>` opens: none for no key, or for anything but `follow` and a word index from 0. */
export const textOpenOf = (text: string): Option.Option<TextOpen> =>
  Option.orElse(
    Option.map(
      Option.liftPredicate(text, (t) => t === FOLLOWING),
      () => FOLLOW_TEXT,
    ),
    () =>
      Option.map(
        Option.liftPredicate(text, (t) => /^(0|[1-9]\d{0,5})$/.test(t)),
        (t) => wordOpen(Number(t)),
      ),
  );

/** `?text=`'s value for `open`: empty for a closed view. */
export const textText = (open: Option.Option<TextOpen>): string =>
  Option.match(open, {
    onNone: () => '',
    onSome: (o) =>
      Match.value(o).pipe(
        Match.tag('Follow', () => FOLLOWING),
        Match.tag('Word', ({ word }) => String(word)),
        Match.exhaustive,
      ),
  });
