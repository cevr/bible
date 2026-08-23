/** §9.3's query router: automatic routing, no new syntax.
 *
 *  | Input shape                | Route                                        |
 *  | -------------------------- | -------------------------------------------- |
 *  | Quoted string              | exact phrase, lexical only                   |
 *  | Refcode pattern (`GC 425`) | locate-jump                                  |
 *  | Everything else            | lexical, plus the vector leg when wordy       |
 *
 *  Pure and total: a string in, a `RoutedQuery` out, no service and no failure.
 *  The routing decision is the part of hybrid search a reader feels most
 *  directly — typing `"the daily"` and getting fuzzy neighbors would be a bug
 *  they could not work around — so it is a value a test can enumerate rather
 *  than a branch inside the service.
 */

import { Option } from 'effect';

import type { SearchRoute } from './model.js';

/** The query is "wordy" at or above this many words (§9.3).
 *
 *  **The threshold, pinned as one documented constant.** Three, because that is
 *  where a query stops being an *identifier* and starts being a *description*.
 *  One or two words are how a reader spells a term they already know — "sealing",
 *  "latter rain" — and FTS answers those better than embeddings do, because the
 *  reader chose the corpus's own vocabulary and lexical match is exactly the
 *  operation that rewards it. At three words a reader is describing something
 *  whose name they do not have — "what happens at the close of probation" — and
 *  that is the query embeddings exist for.
 *
 *  It is also the cost boundary. §9.5 puts a query embed at ~100-400 ms on
 *  WebGPU, which is the entire latency budget for a one-word query that FTS
 *  answers in single-digit milliseconds. Paying it for "sealing" would make the
 *  common case slower for no measurable recall, which is the same argument
 *  §9.3's strong-BM25 short-circuit makes one step later in the pipeline.
 */
export const WORDY_WORD_THRESHOLD = 3;

/** A refcode as §9.3 means it: a book code, then a page or chapter number,
 *  optionally a paragraph.
 *
 *  Anchored whole-string, because the router's job is to tell a *reference*
 *  from a *description* and "GC 425 and the loud cry" is the second. The code is
 *  2-8 characters of letters and digits — `GC`, `1SM`, `DAR1909`, `4bSDABC` —
 *  and must contain at least one letter, so a bare `1 2` is not a refcode.
 *
 *  The number is required. A bare `GC` is a book, not a location, and routing it
 *  to the locate-jump would hijack every short lexical query that happens to
 *  spell a book code — `DA`, `MH`, `EW` are all words or initials a reader might
 *  search for.
 */
const REFCODE = /^([A-Za-z0-9]{1,8})\s+(\d{1,4})(?:\.(\d{1,3}))?$/u;

const hasLetter = /[A-Za-z]/u;

/** The two quote characters a reader's keyboard or editor produces. Typographic
 *  quotes are included because a phrase pasted from a document carries them, and
 *  a reader who pasted `“the daily”` meant the same thing as one who typed it. */
const QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ['“', '”'],
  ['‘', '’'],
  ["'", "'"],
];

/** What the router decided, with the payload each route needs.
 *
 *  A tagged union rather than a route plus loose fields, because the three
 *  routes carry three different things: a phrase route carries the *unquoted*
 *  text, a locate route carries the parsed refcode, and a hybrid route carries
 *  whether the vector leg is even eligible. Flattening them would give every
 *  consumer fields that are meaningless on two of three branches.
 */
export type RoutedQuery =
  | {
      readonly _tag: 'phrase';
      /** The text inside the quotes, which is what the FTS phrase query wraps. */
      readonly phrase: string;
    }
  | {
      readonly _tag: 'locate';
      /** The refcode as the corpus spells it: `GC 425`, `1SM 12.3`. */
      readonly refcode: string;
    }
  | {
      readonly _tag: 'hybrid';
      readonly text: string;
      /** Whether §9.3's "the query is wordy" condition holds. `false` means the
       *  vector leg is skipped before any index or embedder is consulted. */
      readonly wordy: boolean;
      /** How many words `countWords` saw, carried so a caller can explain the
       *  `wordy` decision without recounting. */
      readonly words: number;
    };

/** The route tag as the wire model spells it. One mapping, so `RoutedQuery` and
 *  `SearchResult.route` cannot drift apart. */
export const routeOf = (routed: RoutedQuery): SearchRoute => routed._tag;

/** Strips a matched pair of quotes, or `None` when the text is not quoted.
 *
 *  Both ends must match *and* there must be something between them: `"` alone
 *  and `""` are not phrases, and treating them as one would send an empty MATCH
 *  to FTS. */
const unquote = (text: string): Option.Option<string> => {
  for (const [open, close] of QUOTE_PAIRS) {
    if (text.length > open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, text.length - close.length).trim();
      if (inner.length > 0) return Option.some(inner);
    }
  }
  return Option.none();
};

/** Words as the wordiness threshold counts them: runs of non-whitespace.
 *
 *  Deliberately not §4.3's `normalizedWords`. That scan folds punctuation away
 *  to compare a selection against a dictionary key; here the question is how
 *  much the reader typed, and a hyphenated compound the reader wrote as one
 *  token is one token. */
export const countWords = (text: string): number =>
  text.split(/\s+/u).filter((word) => word.length > 0).length;

/** Whether the text parses as §9.3's refcode pattern, and how the corpus spells
 *  it.
 *
 *  Exported because the locate leg needs the normalized form and the router
 *  needs the predicate, and deriving one from the other twice is how the two
 *  come to disagree about whether `gc 425` is a refcode.
 */
export const parseRefcode = (text: string): Option.Option<string> => {
  const match = Option.fromNullishOr(REFCODE.exec(text.trim()));
  if (Option.isNone(match)) return Option.none();
  const [, rawCode, rawNumber, rawParagraph] = match.value;
  const code = Option.fromNullishOr(rawCode);
  const number = Option.fromNullishOr(rawNumber);
  if (Option.isNone(code) || Option.isNone(number)) return Option.none();
  if (!hasLetter.test(code.value)) return Option.none();
  const tail = Option.match(Option.fromNullishOr(rawParagraph), {
    onNone: () => number.value,
    onSome: (part) => `${number.value}.${part}`,
  });
  return Option.some(`${code.value.toUpperCase()} ${tail}`);
};

/** §9.3's table, as one total function.
 *
 *  Quote check first, then refcode, then hybrid — the order is the table's, and
 *  it matters at exactly one place: `"GC 425"` in quotes is a phrase search for
 *  that literal string, not a locate-jump. A reader who quoted it asked for the
 *  text, and the quote is the only way to ask.
 */
export const route = (text: string): RoutedQuery => {
  const trimmed = text.trim();
  const quoted = unquote(trimmed);
  if (Option.isSome(quoted)) return { _tag: 'phrase', phrase: quoted.value };
  const refcode = parseRefcode(trimmed);
  if (Option.isSome(refcode)) return { _tag: 'locate', refcode: refcode.value };
  const words = countWords(trimmed);
  return { _tag: 'hybrid', text: trimmed, wordy: words >= WORDY_WORD_THRESHOLD, words };
};
