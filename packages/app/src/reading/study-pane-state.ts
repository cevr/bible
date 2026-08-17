/** The study pane's decisions, as plain functions (§8, Milestone 5).
 *
 *  Four questions the pane has to answer, none of which are about markup:
 *
 *  - which Strong's numbers a word offers as tap targets, and how a reader picks
 *    one when the word carries several;
 *  - which verse a pane is scoped to, so its transient state resets when that
 *    changes;
 *  - what closing the pane does to the history stack;
 *  - how the pane is presented when the viewport is too narrow for two columns.
 *
 *  They live here rather than inside `verse-study-pane.tsx` for the reason
 *  `gesture.ts` lives outside `bible-reader.tsx`: this package's tests run under
 *  plain Bun with no DOM, and Solid 2 compiles JSX with a Babel transform rather
 *  than shipping a runtime factory. What the markup *does* — one transport
 *  request per verse, a real focus trap on the narrow overlay — is asserted
 *  against the compiled component in `apps/desktop/e2e/study-pane.spec.ts`.
 */

import { Option } from 'effect';

import type { StrongsNumber, StudyWord } from '@bible/core/study';

// ---------------------------------------------------------------------------
// Word tap targets (blocker 2)
// ---------------------------------------------------------------------------

/** One tappable Strong's number on a word.
 *
 *  A word is not one target. `StudyWord.strongs` is an array because the KJV's
 *  word-to-lexeme mapping is many-to-many — 16,162 rows in the shipped
 *  `verse_words` table carry more than one number, which is what a Hebrew
 *  construct like *bara' shamayim* looks like once it is aligned to English.
 *  Rendering the word as a single button and opening `strongs[0]` made every
 *  number after the first unreachable: the reader could see the word was a tap
 *  target, tap it, and get an entry that was not the one they wanted, with no
 *  affordance saying the others existed. */
export interface WordTarget {
  /** The number this chip opens. */
  readonly number: StrongsNumber;
  /** The chip's own label — the number as written, which is also how a reader
   *  looking it up elsewhere would name it. */
  readonly label: string;
  /** Whether this chip's entry is the one currently open. */
  readonly selected: boolean;
  /** Where this chip sits among the word's numbers, and how many there are.
   *  Both are for the accessible name: "H1254, 1 of 2" tells a screen-reader
   *  user the word has more behind it, which a bare number does not. */
  readonly position: number;
  readonly total: number;
}

/** Every Strong's number on a word, each as its own tap target.
 *
 *  Empty for a word with no lexicon backing — punctuation and the KJV's
 *  supplied words — which is the pane's signal to render plain text instead of
 *  a control. A word with numbers yields one target per number, never one for
 *  the word. */
export const wordTargets = (
  word: StudyWord,
  selected: Option.Option<StrongsNumber>,
): readonly WordTarget[] =>
  word.strongs.map((number, index) => ({
    number,
    label: String(number),
    selected: Option.isSome(selected) && selected.value === number,
    position: index + 1,
    total: word.strongs.length,
  }));

/** The accessible name for one chip.
 *
 *  The word is included because a chip reading only "H8064" is meaningless out
 *  of context, and the position is included only when there is more than one —
 *  "of 1" is noise a screen reader would read on every single-number word in
 *  the verse. */
export const wordTargetLabel = (word: StudyWord, target: WordTarget): string => {
  if (target.total === 1) return `${word.text} — ${target.label}`;
  return `${word.text} — ${target.label}, ${String(target.position)} of ${String(target.total)}`;
};

/** Whether the word itself reads as active: any of its numbers is the open one.
 *
 *  Distinct from a chip's own `selected`, and both are needed — the word marks
 *  which word the reader is inside, the chip marks which of its numbers is
 *  open. */
export const wordActive = (word: StudyWord, selected: Option.Option<StrongsNumber>): boolean =>
  Option.isSome(selected) && word.strongs.includes(selected.value);

// ---------------------------------------------------------------------------
// The verse a pane is scoped to (should-fix 8)
// ---------------------------------------------------------------------------

/** A verse address, as the three numbers the route carries. */
export interface PaneReference {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}

/** The pane's own address, and the key its transient state is scoped to.
 *
 *  A Strong's drill-down is a gesture *within* one verse, so the key changes on
 *  every axis of the address and the selection resets whenever it does. The
 *  retired rule kept a selection whenever the new verse's words happened to
 *  contain the same number, which is not rare — H8064 (*shamayim*) occurs in
 *  420 verses — so moving from Genesis 1:1 to Genesis 1:8 left the lexicon
 *  panel open on a word the reader never tapped here. */
export const verseKey = (reference: PaneReference): string =>
  `${String(reference.book)}/${String(reference.chapter)}/${String(reference.verse)}`;

// ---------------------------------------------------------------------------
// Closing the pane (blocker 3)
// ---------------------------------------------------------------------------

/** The chapter route a verse belongs to. A deep-linked pane closes to *this* —
 *  the reader is reading a chapter and asked to put the study tools away, not
 *  to leave. */
export const chapterPath = (reference: PaneReference): string =>
  `/bible/${String(reference.book)}/${String(reference.chapter)}`;

/** How the pane was reached, and — for a tap — how much history it has pushed
 *  since. The route itself says neither.
 *
 *  `depth` counts the entries the *pane* is responsible for. A tap pushes one.
 *  Following a cross-reference from inside the open pane pushes another, and
 *  another, because those are real `<a href>` navigations to real verse routes.
 *  Closing has to undo all of them or the reader lands back inside the pane
 *  they just closed. */
export type PaneEntry =
  | { readonly _tag: 'tapped'; readonly depth: number }
  /** The verse route was the first thing this session loaded. */
  | { readonly _tag: 'deep-link' };

/** The pane opened by a tap, one entry deep. */
export const tapped: PaneEntry = { _tag: 'tapped', depth: 1 };

/** One more verse route pushed while the pane was open — a cross-reference or a
 *  concordance hit followed from inside it. A deep-linked pane stays a deep
 *  link only until the reader moves: once they follow a link there *is* a
 *  previous entry belonging to this app, and it is one the pane put there. */
export const deepened = (entry: PaneEntry): PaneEntry => {
  if (entry._tag === 'tapped') return { _tag: 'tapped', depth: entry.depth + 1 };
  return { _tag: 'tapped', depth: 1 };
};

/** What closing the pane does to history.
 *
 *  Two operations, because there are genuinely two situations and one operation
 *  cannot serve both without leaving an entry behind.
 *
 *  - `pop` — **the tap round trip, undone.** The tap *pushed* the verse route on
 *    top of the background it came from, so history reads `[…, background,
 *    verse]`. Going *back* removes the verse entry and lands on the background
 *    that is already there. Replacing instead would overwrite the verse entry
 *    with a second copy of the background — `[…, background, background]` —
 *    which is the duplicate the review names: two adjacent identical entries,
 *    and a reader pressing Back once appears to have pressed nothing. `depth`
 *    is how many entries to drop, so a reader who followed three
 *    cross-references from inside the pane lands where they opened it rather
 *    than back inside it.
 *  - `replace` — **the deep link, collapsed.** Nothing belonging to this app
 *    precedes the verse route, so there is no entry to go back *to*; going back
 *    would leave the app entirely. The verse entry is overwritten with the
 *    chapter, which leaves the stack exactly one entry deep either way.
 *
 *  Stated as an operation rather than as `NavigationIntent`, deliberately.
 *  `intent` has two values and both close paths were `'refinement'`, so the
 *  field said nothing; `_tag` distinguishes cases that actually differ, and
 *  `pop` is not a destination the intent vocabulary can express at all. */
export type CloseAction =
  | { readonly _tag: 'pop'; readonly depth: number }
  | { readonly _tag: 'replace'; readonly path: string };

export const closeAction = (reference: PaneReference, entry: PaneEntry): CloseAction => {
  if (entry._tag === 'tapped') return { _tag: 'pop', depth: entry.depth };
  return { _tag: 'replace', path: chapterPath(reference) };
};

/** One history stack, as the sequence of entries a reader can press Back
 *  through. The last element is where they are.
 *
 *  A model rather than the browser's own object because the property under test
 *  — "open the pane, close it, and the stack is what it was" — is a statement
 *  about the *sequence*, and `window.history` exposes only its length. */
export type HistoryEntries = readonly string[];

/** The tap: the verse route goes on top of what the reader was looking at. */
export const openPaneEntries = (entries: HistoryEntries, versePath: string): HistoryEntries => [
  ...entries,
  versePath,
];

/** The close, applied to a stack.
 *
 *  `pop` drops the last entry; `replace` overwrites it. Both are total: a `pop`
 *  on a stack of one would empty it, which is exactly why a deep link never
 *  produces one. */
export const closePaneEntries = (entries: HistoryEntries, action: CloseAction): HistoryEntries => {
  if (action._tag === 'pop') return entries.slice(0, -action.depth);
  return [...entries.slice(0, -1), action.path];
};

// ---------------------------------------------------------------------------
// Narrow presentation (blocker 4)
// ---------------------------------------------------------------------------

/** How the pane is presented at a given viewport. The one model of it.
 *
 *  The pane originally shipped consulting no model at all, so narrow got the CSS
 *  default — `display: block` on the split — which stacks the pane *after* the
 *  entire chapter. A verse tap then changed the route and moved focus nowhere,
 *  leaving the reader looking at unchanged Scripture with the thing they asked
 *  for several screens below the fold.
 *
 *  `overlay` is what narrow gets instead: the pane is presented over the reader
 *  as a full-width sheet, and focus moves into it, so the tap has a visible
 *  result at the point of the tap. `rail` is the wide case, unchanged. */
export type PanePresentation = 'rail' | 'overlay';

/** Where narrow starts, in the unit the stylesheet states it in.
 *
 *  **One definition, one unit.** The constant used to be `960` — the pixel value
 *  the stylesheet's `60rem` happens to equal *at a 16px root*, and only there. A
 *  reader who enlarges their browser's default font moves the CSS breakpoint and
 *  not the JS one, so the split rule stacked the column while `presentationFor`
 *  still said `rail`: the reader got the block-flow fallback this whole section
 *  exists to eliminate, at exactly the setting that makes it hardest to notice.
 *
 *  Rem in both, therefore. CSS has no custom media queries, so the pairing is
 *  held by {@link NARROW_BREAKPOINT_QUERY} being the exact text of the
 *  stylesheet's own rule — `styles.css` carries a comment naming this constant
 *  at that rule — and `matchMedia` accepting rem is not a workaround: the CSSOM
 *  resolves the query against the same initial font size the stylesheet does,
 *  which is precisely the agreement a pixel constant could not express. */
export const NARROW_BREAKPOINT_REM = 60;

export const NARROW_BREAKPOINT_QUERY = `(max-width: ${String(NARROW_BREAKPOINT_REM)}rem)`;

/** The presentation for a viewport, from the media query's own verdict.
 *
 *  A `MediaQueryList.matches` rather than a width in pixels, because the
 *  breakpoint is stated in rem and only the CSSOM knows what the reader's root
 *  font size makes that. Passing the boolean in keeps the decision a pure
 *  function while leaving the one browser-dependent step at the call site. */
export const presentationFor = (matchesNarrow: boolean): PanePresentation => {
  if (matchesNarrow) return 'overlay';
  return 'rail';
};

/** The class the pane's root carries, so the presentation is one attribute a
 *  test can assert and one selector the stylesheet can hang off — rather than a
 *  layout that is only ever implied by a media query. */
export const presentationClass = (presentation: PanePresentation): string =>
  `bible-study-pane bible-study-pane--${presentation}`;

/** Whether opening the pane should move focus into it.
 *
 *  Only when it is presented as an overlay. In the wide rail the pane appears
 *  beside the Scripture the reader is already looking at and stealing focus
 *  would interrupt them; as an overlay it covers what they were reading, and
 *  leaving focus behind it strands a keyboard or screen-reader user on content
 *  they can no longer see. */
export const shouldFocusOnOpen = (presentation: PanePresentation): boolean =>
  presentation === 'overlay';
