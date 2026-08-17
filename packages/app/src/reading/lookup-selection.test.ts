/** The web/desktop half of Milestone 7's adapter check (§10).
 *
 *  > **Adapter checks:** DOM selection on web and desktop produces the same
 *  > portable lookup input the CLI builds from its argument.
 *
 *  Web and desktop share this builder — one component tree, one function — so
 *  what needs proving is that its output equals the CLI's. The shared expected
 *  value is `@bible/core/wiki/testing`'s `LOOKUP_ADAPTER_INPUT`, asserted here
 *  and in `packages/cli/test/commands/wiki.test.ts`, because neither package can
 *  import the other's builder.
 */

import { Reference } from '@bible/core/bible';
import {
  LOOKUP_ADAPTER_EMPTY_TEXTS,
  LOOKUP_ADAPTER_INPUT,
  LOOKUP_ADAPTER_INPUT_NO_CONTEXT,
  LOOKUP_ADAPTER_SELECTION,
  LOOKUP_ADAPTER_TEXTS,
} from '@bible/core/wiki/testing';
import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import {
  lookupSelection,
  selectionOwnsClick,
  selectionVerse,
  VERSE_ATTRIBUTE,
  type SelectionNode,
  type TextSelection,
  type VerseTarget,
} from './lookup-selection.js';

/** A node inside the verse the numbers name, as the walk to a verse reads one:
 *  a text node whose parent chain carries `data-verse`. */
const inVerse = (verse: Option.Option<number>): SelectionNode => {
  // `Option.getOrNull` rather than a `null` literal, as `gesture.test.ts` does:
  // the DOM types these members nullable and the stand-in has to match, so the
  // absence is spelled as an `Option` up to the last line.
  const outside: VerseTarget = {
    parentElement: Option.getOrNull(Option.none<VerseTarget>()),
    getAttribute: () => Option.getOrNull(Option.none<string>()),
  };
  const marker: VerseTarget = {
    parentElement: outside,
    getAttribute: (name) => {
      if (name !== VERSE_ATTRIBUTE) return Option.getOrNull(Option.none<string>());
      return Option.getOrNull(Option.map(verse, String));
    },
  };
  return { parentElement: marker };
};

/** A DOM selection, as this module reads one. A real `Selection` is assignable
 *  to `TextSelection`, so the stand-in needs no cast. */
const selection = (
  text: string,
  isCollapsed = false,
  range = {
    startContainer: inVerse(Option.some(LOOKUP_ADAPTER_SELECTION.verse)),
    endContainer: inVerse(Option.some(LOOKUP_ADAPTER_SELECTION.verse)),
  },
): TextSelection => ({
  isCollapsed,
  toString: () => text,
  rangeCount: 1,
  getRangeAt: () => range,
});

const VERSE = Reference.verse(
  LOOKUP_ADAPTER_SELECTION.book,
  LOOKUP_ADAPTER_SELECTION.chapter,
  LOOKUP_ADAPTER_SELECTION.verse,
);

describe('lookupSelection — the portable input (§7)', () => {
  test('builds the CLI’s value from every raw text the fixture names', () => {
    // The DOM half of the shared table. The CLI asserts the same rows against
    // the same expected `text`, so "the same portable input" is a property of
    // one builder over one set of inputs rather than of two builders over two.
    for (const row of LOOKUP_ADAPTER_TEXTS) {
      expect(
        Option.map(lookupSelection(selection(row.raw), Option.some(VERSE)), (input) => input.text),
      ).toEqual(Option.some(row.text));
    }
  });

  test('asks for no lookup on every text the fixture calls empty', () => {
    for (const raw of LOOKUP_ADAPTER_EMPTY_TEXTS) {
      expect(lookupSelection(selection(raw), Option.some(VERSE))).toEqual(Option.none());
    }
  });

  test('builds the CLI’s no-context value when no verse locates the selection', () => {
    expect(lookupSelection(selection(LOOKUP_ADAPTER_SELECTION.text), Option.none())).toEqual(
      Option.some(LOOKUP_ADAPTER_INPUT_NO_CONTEXT),
    );
  });

  test('builds the same value the CLI builds from its argument', () => {
    const built = lookupSelection(selection(LOOKUP_ADAPTER_SELECTION.text), Option.some(VERSE));
    expect(built).toEqual(Option.some(LOOKUP_ADAPTER_INPUT));
  });

  test('a selection carrying the markup’s whitespace builds the same value', () => {
    // A drag across a rendered verse picks up the indentation and the line
    // breaks between the spans it crossed. The CLI's argument has neither, so
    // without §4.3's collapse the two adapters would disagree about `text`
    // while agreeing about everything else.
    const messy = selection(`\n  ${LOOKUP_ADAPTER_SELECTION.text}  \n`);
    expect(lookupSelection(messy, Option.some(VERSE))).toEqual(Option.some(LOOKUP_ADAPTER_INPUT));
  });

  test('a selection outside Scripture carries no context', () => {
    // §7 gives `context` one job — locating the selection inside a verse — so a
    // selection made where there is no verse asks for four groups, not for a
    // guessed fifth.
    const built = lookupSelection(selection('the daily'), Option.none());
    expect(Option.map(built, (input) => Option.isNone(input.context))).toEqual(Option.some(true));
  });
});

describe('lookupSelection — what is not a lookup', () => {
  test('an ordinary click asks for nothing', () => {
    // Every tap in the reading surface leaves a collapsed selection. If that
    // were a lookup, the panel would open on every verse tap and §8.5's gesture
    // rule would be broken by the surface that is supposed to honor it.
    expect(lookupSelection(selection('', true), Option.some(VERSE))).toEqual(Option.none());
  });

  test('a selection of pure whitespace asks for nothing', () => {
    expect(lookupSelection(selection('  \n  '), Option.some(VERSE))).toEqual(Option.none());
  });
});

describe('selectionVerse — the verse that holds the whole selection (§7)', () => {
  test('names the verse when both ends of the range are inside it', () => {
    expect(selectionVerse(selection('the daily'))).toEqual(
      Option.some(LOOKUP_ADAPTER_SELECTION.verse),
    );
  });

  test('names no verse when the selection crosses two of them', () => {
    // §7's `context` locates the selection *inside a verse*. A drag from verse
    // 13 into verse 14 is inside neither, and answering with the verse the
    // gesture ended in makes core compare one verse's words against another
    // verse's text — lexicon entries for words the reader never selected.
    const crossing = selection('the daily was taken away, and the place', false, {
      startContainer: inVerse(Option.some(13)),
      endContainer: inVerse(Option.some(14)),
    });
    expect(selectionVerse(crossing)).toEqual(Option.none());
  });

  test('names no verse outside Scripture', () => {
    const prose = selection('the daily', false, {
      startContainer: inVerse(Option.none()),
      endContainer: inVerse(Option.none()),
    });
    expect(selectionVerse(prose)).toEqual(Option.none());
  });

  test('names no verse when a selection has no range at all', () => {
    expect(
      selectionVerse({
        isCollapsed: false,
        toString: () => 'the daily',
        rangeCount: 0,
        // Never called: `selectionVerse` reads `rangeCount` first, which is the
        // rule under test. A range that names no verse would pass for the wrong
        // reason, so this one names a verse and must still not be reached.
        getRangeAt: () => ({
          startContainer: inVerse(Option.some(13)),
          endContainer: inVerse(Option.some(13)),
        }),
      }),
    ).toEqual(Option.none());
  });
});

describe('selectionOwnsClick — one gesture, one surface (§8.5)', () => {
  test('a finished drag owns the click that completes it', () => {
    // `mouseup` opens the panel; the browser then delivers a `click` to the
    // same element. Without this rule the verse handler answers that click by
    // opening the study pane, so one drag opens two surfaces.
    expect(selectionOwnsClick(Option.some(selection('the daily')))).toBe(true);
  });

  test('an ordinary tap owns nothing', () => {
    // A tap leaves a collapsed selection, and a press that starts a new gesture
    // collapses the old one before `click` — so the verse tap still opens the
    // pane, which is §8.5's rule rather than an exception to it.
    expect(selectionOwnsClick(Option.some(selection('', true)))).toBe(false);
  });

  test('a selection of pure whitespace owns nothing', () => {
    expect(selectionOwnsClick(Option.some(selection('  \n ')))).toBe(false);
  });

  test('a host with no selection at all owns nothing', () => {
    expect(selectionOwnsClick(Option.none())).toBe(false);
  });
});
