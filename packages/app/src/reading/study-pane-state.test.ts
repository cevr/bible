/** The study pane's decisions, asserted where they are decidable.
 *
 *  There is no DOM here and no rendered component: Solid 2 compiles JSX with a
 *  Babel transform rather than shipping a runtime factory, so mounting a
 *  component under plain `bun test` needs the transform this package does not
 *  run. What the *markup* does — one transport request per verse, a working
 *  focus trap on the narrow sheet — is asserted against the compiled component
 *  in `apps/desktop/e2e/study-pane.spec.ts`, which drives the built renderer in
 *  a real browser engine.
 *
 *  What is left here is the part that is a decision rather than a rendering:
 *  which numbers a word offers, which verse the pane is scoped to, what closing
 *  does to the history stack, which presentation a viewport gets.
 */

import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import { StudyWord, strongsNumber } from '@bible/core/study';

/** The reader's stylesheet, as text.
 *
 *  An import attribute rather than a file read: the breakpoint pairing below is
 *  a claim about *this* stylesheet, and importing it is how the test names the
 *  same file the app loads instead of a path that could go stale. */
import stylesheet from '../styles.css' with { type: 'text' };

import {
  chapterPath,
  closeAction,
  closePaneEntries,
  deepened,
  NARROW_BREAKPOINT_QUERY,
  NARROW_BREAKPOINT_REM,
  openPaneEntries,
  presentationClass,
  presentationFor,
  shouldFocusOnOpen,
  tapped,
  verseKey,
  wordActive,
  wordTargetLabel,
  wordTargets,
  type HistoryEntries,
  type PaneReference,
} from './study-pane-state.js';

const H1254 = strongsNumber('H1254');
const H8064 = strongsNumber('H8064');
const H430 = strongsNumber('H430');

/** "created" in Genesis 1:1 — one English word over two lexemes, which is the
 *  many-to-many alignment that makes a word more than one tap target. */
const created = StudyWord.make({ text: 'created', strongs: [H1254, H8064], italic: false });
const god = StudyWord.make({ text: 'God', strongs: [H430], italic: false });
const supplied = StudyWord.make({ text: 'was', strongs: [], italic: true });

const GENESIS_1_1: PaneReference = { book: 1, chapter: 1, verse: 1 };
const GENESIS_1_8: PaneReference = { book: 1, chapter: 1, verse: 8 };

describe('word tap targets (blocker 2)', () => {
  test('a multi-number word exposes every number, not just the first', () => {
    // The bug: the pane rendered one button per word and always opened
    // `strongs[0]`, so H8064 was unreachable on this word — visible in the
    // accessible name, and openable by nothing.
    const targets = wordTargets(created, Option.none());
    expect(targets.map((target) => String(target.number))).toEqual(['H1254', 'H8064']);
  });

  test('each number is separately selectable', () => {
    // The second chip is a distinct target with its own number, which is what
    // makes "tapping the second opens H8064" true rather than aspirational.
    const targets = wordTargets(created, Option.none());
    expect(targets[1]?.number).toBe(H8064);
    expect(targets[0]?.number).toBe(H1254);
  });

  test('selection marks the chosen number and only it', () => {
    const targets = wordTargets(created, Option.some(H8064));
    expect(targets.map((target) => target.selected)).toEqual([false, true]);
  });

  test('a single-number word is one target', () => {
    expect(wordTargets(god, Option.none()).map((target) => String(target.number))).toEqual([
      'H430',
    ]);
  });

  test('a word with no lexicon backing offers nothing', () => {
    // Punctuation and the KJV's supplied words are not tap targets, and putting
    // them in the tab order would be noise.
    expect(wordTargets(supplied, Option.none())).toEqual([]);
  });

  test('the accessible name says which of how many when there is more than one', () => {
    const targets = wordTargets(created, Option.none());
    expect(wordTargetLabel(created, Option.getOrThrow(Option.fromNullishOr(targets[0])))).toBe(
      'created — H1254, 1 of 2',
    );
    expect(wordTargetLabel(created, Option.getOrThrow(Option.fromNullishOr(targets[1])))).toBe(
      'created — H8064, 2 of 2',
    );
  });

  test('the accessible name omits the position when there is only one', () => {
    // "1 of 1" on every single-number word in the verse is noise a screen
    // reader would have to read past.
    const only = Option.getOrThrow(Option.fromNullishOr(wordTargets(god, Option.none())[0]));
    expect(wordTargetLabel(god, only)).toBe('God — H430');
  });

  test('the word reads active when any of its numbers is open', () => {
    expect(wordActive(created, Option.some(H8064))).toBe(true);
    expect(wordActive(created, Option.some(H1254))).toBe(true);
    expect(wordActive(created, Option.some(H430))).toBe(false);
    expect(wordActive(created, Option.none())).toBe(false);
  });
});

describe('the verse a pane is scoped to (should-fix 8)', () => {
  test('the verse key changes on every axis of the address', () => {
    // Whatever changed — book, chapter or verse — it is a different pane, and
    // the key has to say so or the Strong's selection never resets. The retired
    // rule kept a selection whenever the new verse's words happened to contain
    // the same number; H8064 occurs in 420 verses, so Genesis 1:1 → 1:8 left
    // the lexicon open on a word the reader never tapped here.
    expect(verseKey(GENESIS_1_1)).not.toBe(verseKey(GENESIS_1_8));
    expect(verseKey(GENESIS_1_1)).not.toBe(verseKey({ book: 1, chapter: 2, verse: 1 }));
    expect(verseKey(GENESIS_1_1)).not.toBe(verseKey({ book: 2, chapter: 1, verse: 1 }));
  });

  test('the same address is the same key', () => {
    expect(verseKey(GENESIS_1_1)).toBe(verseKey({ book: 1, chapter: 1, verse: 1 }));
  });
});

/** Blocker 3, stated as the property it actually is: **the tap round trip
 *  leaves the history stack exactly as it found it.**
 *
 *  The retired rule pushed the verse route on tap and *replaced* it with the
 *  chapter on close, so the stack went `[…, chapter]` → `[…, chapter, verse]` →
 *  `[…, chapter, chapter]`: one entry longer than it started, and its last two
 *  entries identical. A reader pressing Back then went from the chapter to the
 *  chapter and saw nothing happen.
 *
 *  Asserting the resulting *sequence* rather than a flag on the action is what
 *  makes that visible. `intent === 'refinement'` was true of the broken
 *  behaviour too. */
describe('closing the pane leaves no duplicate entry (blocker 3)', () => {
  const BEFORE: HistoryEntries = ['/topics', '/bible/1/1'];

  test('tap then close restores the stack the tap found', () => {
    const opened = openPaneEntries(BEFORE, '/bible/1/1/1');
    expect(opened).toEqual(['/topics', '/bible/1/1', '/bible/1/1/1']);

    const closed = closePaneEntries(opened, closeAction(GENESIS_1_1, tapped));
    expect(closed).toEqual([...BEFORE]);
  });

  test('and leaves no two adjacent entries alike', () => {
    // The duplicate stated directly, because "same length" alone would be
    // satisfied by a stack that swapped one entry for a copy of its neighbour.
    const closed = closePaneEntries(
      openPaneEntries(BEFORE, '/bible/1/1/1'),
      closeAction(GENESIS_1_1, tapped),
    );
    const adjacentDuplicates = closed.filter(
      (entry, index) => index > 0 && entry === closed[index - 1],
    );
    expect(adjacentDuplicates).toEqual([]);
  });

  test('a tap-opened pane goes back rather than replacing', () => {
    // The mechanism, so a future edit that reintroduces a replace fails here
    // and not only in the sequence assertion above.
    expect(closeAction(GENESIS_1_1, tapped)).toEqual({ _tag: 'pop', depth: 1 });
  });

  test('a pane opened from a search result returns to the search', () => {
    // Going back needs no record of *where* the tap came from: whatever the
    // previous entry is, it is where the reader was. The retired model carried
    // a `background` string for this and could only ever be as right as the
    // moment it was captured.
    const searching: HistoryEntries = ['/search?q=beginning'];
    const closed = closePaneEntries(
      openPaneEntries(searching, '/bible/1/1/1'),
      closeAction(GENESIS_1_1, tapped),
    );
    expect(closed).toEqual(['/search?q=beginning']);
  });

  test('cross-references followed inside the pane are undone together', () => {
    // Each is a real `<a href>` push. Popping one would land the reader on the
    // previous verse — back inside the pane they just closed.
    let entry = tapped;
    let stack = openPaneEntries(BEFORE, '/bible/1/1/1');
    for (const path of ['/bible/66/12/6', '/bible/2/25/1']) {
      stack = openPaneEntries(stack, path);
      entry = deepened(entry);
    }
    expect(entry).toEqual({ _tag: 'tapped', depth: 3 });

    expect(closePaneEntries(stack, closeAction(GENESIS_1_1, entry))).toEqual([...BEFORE]);
  });

  test('a deep link collapses in place instead of leaving the app', () => {
    // Nothing belonging to this app precedes the verse route, so there is
    // nothing to go back *to* — going back would leave. The verse entry becomes
    // the chapter, and the stack stays exactly one entry deep.
    const deepLinked: HistoryEntries = ['/bible/1/8/1'];
    const action = closeAction({ book: 1, chapter: 8, verse: 1 }, { _tag: 'deep-link' });
    expect(action).toEqual({ _tag: 'replace', path: '/bible/1/8' });
    expect(closePaneEntries(deepLinked, action)).toEqual(['/bible/1/8']);
  });

  test('a deep-linked pane that has moved owns the entries it pushed', () => {
    // Following a cross-reference from a deep-linked pane creates a previous
    // entry that *is* the pane's, so closing must pop it rather than replace —
    // otherwise the stack keeps the intermediate verse the reader never chose
    // to be on.
    const deepLinked: HistoryEntries = ['/bible/1/8/1'];
    const entry = deepened({ _tag: 'deep-link' });
    const stack = openPaneEntries(deepLinked, '/bible/66/12/6');
    expect(closePaneEntries(stack, closeAction(GENESIS_1_1, entry))).toEqual(['/bible/1/8/1']);
  });

  test('the chapter path drops the verse segment', () => {
    expect(chapterPath({ book: 27, chapter: 8, verse: 13 })).toBe('/bible/27/8');
  });
});

describe('narrow presentation (blocker 4)', () => {
  test('a narrow viewport gets the overlay, not a rail', () => {
    // The bug: narrow fell through to the stylesheet's block-flow default,
    // which stacked the pane after the *entire* chapter — a verse tap changed
    // the route while the study tools sat several screens below the fold.
    expect(presentationFor(true)).toBe('overlay');
  });

  test('a wide viewport keeps the rail', () => {
    expect(presentationFor(false)).toBe('rail');
  });

  test('the JS breakpoint and the stylesheet state the same rule', () => {
    // The pairing, checked rather than asserted in a comment. The constant used
    // to be `960` — the pixel value `60rem` equals *only* at a 16px root — so a
    // reader with a larger default font moved the CSS breakpoint and not the JS
    // one, and got the stacked fallback this whole section exists to remove.
    //
    // Read out of the stylesheet itself, because the drift this catches is
    // someone editing one of the two files. A unit test over the constant alone
    // would pass with the media query set to anything at all.
    expect(NARROW_BREAKPOINT_QUERY).toBe(`(max-width: ${String(NARROW_BREAKPOINT_REM)}rem)`);
    expect(stylesheet).toContain(`@media ${NARROW_BREAKPOINT_QUERY} {`);
    // And in that unit: a stray pixel form of the same breakpoint would mean
    // the two rules are back to agreeing by coincidence.
    expect(stylesheet).not.toContain('@media (max-width: 960px)');
  });

  test('the presentation is on the pane root as a class a test can see', () => {
    // Not only a media query: the layout has to be an attribute, or "the pane
    // is presented as a sheet" is a claim nothing can check.
    expect(presentationClass('overlay')).toBe('bible-study-pane bible-study-pane--overlay');
    expect(presentationClass('rail')).toBe('bible-study-pane bible-study-pane--rail');
  });

  test('opening an overlay moves focus into it', () => {
    // The other half of the narrow bug: a route change with no visible result
    // and no focus move leaves a keyboard or screen-reader user on Scripture
    // the sheet is now covering.
    expect(shouldFocusOnOpen('overlay')).toBe(true);
  });

  test('opening a rail does not steal focus', () => {
    // It appears beside Scripture the reader is still reading; taking focus
    // would interrupt them for a pane they can already see.
    expect(shouldFocusOnOpen('rail')).toBe(false);
  });
});
