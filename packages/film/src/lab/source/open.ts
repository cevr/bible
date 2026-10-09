// How the Source view is open (`?code=` in the lab's place): not at all, which
// is the address bar's `?code=` absent; following the frame (`follow`), the
// view scrolling to what plays; or held on a line of the scene's file
// (`?code=12`), as the inspector's `file:line` opens it. One reader and one
// printer, so a link written is a link read.

import { Match, Option } from 'effect';

/** The view is open, and where it looks. */
export type CodeOpen =
  | { readonly _tag: 'Follow' }
  | { readonly _tag: 'Line'; readonly line: number };

export const FOLLOW: CodeOpen = { _tag: 'Follow' };

/** Held on `line` (1 is the file's first line). */
export const lineOpen = (line: number): CodeOpen => ({ _tag: 'Line', line });

const FOLLOWING = 'follow';

/** The view `?code=<text>` opens: none for no key, or for anything but `follow` and a line number from 1. */
export const codeOpenOf = (text: string): Option.Option<CodeOpen> =>
  Option.orElse(
    Option.map(
      Option.liftPredicate(text, (t) => t === FOLLOWING),
      () => FOLLOW,
    ),
    () =>
      Option.map(
        Option.liftPredicate(text, (t) => /^[1-9]\d{0,6}$/.test(t)),
        (t) => lineOpen(Number(t)),
      ),
  );

/** `?code=`'s value for `open`: empty for a closed view. */
export const codeText = (open: Option.Option<CodeOpen>): string =>
  Option.match(open, {
    onNone: () => '',
    onSome: (o) =>
      Match.value(o).pipe(
        Match.tag('Follow', () => FOLLOWING),
        Match.tag('Line', ({ line }) => String(line)),
        Match.exhaustive,
      ),
  });
