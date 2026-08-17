/** The lookup panel's rules (§7, Milestone 7 UI acceptance).
 *
 *  > **UI parity:** one panel, all groups, empty groups collapsed, no action
 *  > menu, identical on web and desktop.
 *
 *  Two of those three are decisions rather than markup — which rows exist, and
 *  which arrive open — and they are stated here as properties of a function
 *  rather than demonstrated once by a rendered page. "No action menu" and
 *  "identical on web and desktop" are properties of the component, and the
 *  component is one file both hosts render; the rendered form is asserted in
 *  `apps/desktop/e2e/lookup-panel.spec.ts`.
 */

import { Reference } from '@bible/core/bible';
import {
  LookupCatalogMatch,
  LookupResult,
  LookupStrongsHit,
  LookupTopicMatch,
  LookupVerseHit,
  LookupWritingsHit,
  topicSlug,
} from '@bible/core/wiki';
import { StrongsLexiconEntry, strongsNumber } from '@bible/core/study';
import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { createMemo, createRoot, createSignal, flush } from 'solid-js';

import { lookupView } from './lookup-panel-state.js';

const topic = (slug: string, display: string): LookupTopicMatch =>
  LookupTopicMatch.make({
    slug: topicSlug(slug),
    display,
    alias: display.toLowerCase(),
    kind: 'exact',
    canonical: true,
  });

const verse = LookupVerseHit.make({
  reference: Reference.verse(27, 8, 13),
  label: 'Daniel 8:13',
  text: 'Then I heard one saint speaking…',
});

const catalog = LookupCatalogMatch.make({
  slug: topicSlug('the-daily'),
  name: 'The Daily',
  status: 'catalog',
});

const strongs = LookupStrongsHit.make({
  word: 'the daily',
  entry: Option.some(
    StrongsLexiconEntry.make({
      number: strongsNumber('H8548'),
      language: 'hebrew',
      lemma: 'תָּמִיד',
      transliteration: Option.none(),
      pronunciation: Option.none(),
      definition: 'continuance, continually',
      kjvDefinition: Option.none(),
    }),
  ),
});

const writings = LookupWritingsHit.make({
  refcode: 'GC 1.1',
  bookCode: 'GC',
  bookTitle: 'The Great Controversy',
  author: 'Ellen Gould White',
  snippet: 'the sanctuary in heaven',
});

const result = (input: {
  readonly topics?: readonly LookupTopicMatch[];
  readonly strongs?: readonly LookupStrongsHit[];
  readonly verses?: readonly LookupVerseHit[];
  readonly writings?: readonly LookupWritingsHit[];
  readonly catalog?: readonly LookupCatalogMatch[];
  readonly lonePeek?: boolean;
}): LookupResult =>
  LookupResult.make({
    text: 'the daily',
    topics: input.topics ?? [],
    strongs: input.strongs ?? [],
    verses: input.verses ?? [],
    writings: input.writings ?? [],
    catalog: input.catalog ?? [],
    lonePeek: input.lonePeek ?? false,
  });

describe('lookupView — one panel, all groups (§7)', () => {
  test('draws all five groups in §7 order even when every one is empty', () => {
    const view = lookupView(result({}));
    expect(view.groups.map((group) => group.id)).toEqual([
      'topics',
      'strongs',
      'verses',
      'writings',
      'catalog',
    ]);
    expect(view.groups.map((group) => group.count)).toEqual([0, 0, 0, 0, 0]);
  });

  test('collapses the empty groups and opens the ones that answered', () => {
    const view = lookupView(result({ topics: [topic('the-daily', 'The Daily')], verses: [verse] }));
    const open = view.groups.filter((group) => group.open).map((group) => group.id);
    expect(open).toEqual(['topics', 'verses']);
    // The collapsed ones are still rows: §7's present-and-empty, on screen.
    expect(view.groups).toHaveLength(5);
  });

  test('every group carries a name of its own', () => {
    // A row with no label is a disclosure triangle with nothing to disclose,
    // and the reader cannot tell which corpus answered.
    const view = lookupView(result({ catalog: [catalog] }));
    expect(view.groups.map((group) => group.label.length > 0)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  test('carries every group’s own rows, and a count that is those rows', () => {
    // The property the torn render broke. `count` is what the summary prints
    // and `rows` is what the group lists; they come from one result here by
    // construction, so no arithmetic in the component can pair one result's
    // number with another result's items.
    const view = lookupView(
      result({
        topics: [topic('the-daily', 'The Daily')],
        strongs: [strongs],
        verses: [verse],
        writings: [writings],
        catalog: [catalog],
      }),
    );
    for (const group of view.groups) expect(group.count).toBe(group.rows.length);
    expect(view.groups.map((group) => group.rows.map((row) => row._tag))).toEqual([
      ['topic'],
      ['lexicon'],
      ['verse'],
      ['passage'],
      ['topic'],
    ]);
  });

  test('projects each row into what the panel draws', () => {
    const view = lookupView(result({ verses: [verse], strongs: [strongs], catalog: [catalog] }));
    expect(view.groups[2]?.rows[0]).toEqual({
      _tag: 'verse',
      href: '/bible/27/8/13',
      label: 'Daniel 8:13',
      text: verse.text,
    });
    expect(view.groups[1]?.rows[0]).toEqual({
      _tag: 'lexicon',
      word: 'the daily',
      entry: Option.some('H8548 · continuance, continually'),
    });
    // A catalog row says what opening it will show; a dictionary row says how
    // it was found. One shape, two notes.
    expect(view.groups[4]?.rows[0]).toEqual({
      _tag: 'topic',
      slug: 'the-daily',
      title: 'The Daily',
      note: 'catalog',
    });
  });
});

describe('lookupView — one plan per result', () => {
  test('a memoized plan never mixes two results', () => {
    // What the panel does: one `createMemo` over one read. The plan taken
    // before the change still describes the result it was built from — the
    // count and the rows move together, because they were never two reads.
    createRoot((dispose) => {
      const [live, setLive] = createSignal(result({ verses: [verse] }));
      const plan = createMemo(() => lookupView(live()));

      flush();
      const before = plan();
      setLive(result({ verses: [], topics: [topic('the-daily', 'The Daily')] }));
      flush();
      const after = plan();

      expect(before.groups[2]?.count).toBe(1);
      expect(before.groups[2]?.rows).toHaveLength(1);
      expect(after.groups[2]?.count).toBe(0);
      expect(after.groups[2]?.rows).toHaveLength(0);
      expect(after.groups[0]?.count).toBe(1);
      dispose();
    });
  });

  test('reads the result exactly once', () => {
    // A live accessor that answers differently on its second call is what a
    // resolving query is. One read is what makes the plan a snapshot; a second
    // read is where a stale count meets fresh rows.
    let reads = 0;
    const live = () => {
      reads += 1;
      if (reads === 1) return result({ verses: [verse] });
      return result({});
    };
    const view = lookupView(live());
    expect(reads).toBe(1);
    expect(view.groups[2]?.count).toBe(1);
  });
});

describe('lookupView — the §5 treatment, obeyed not re-derived', () => {
  test('names the card’s topic when core flagged the result', () => {
    const view = lookupView(result({ topics: [topic('the-daily', 'The Daily')], lonePeek: true }));
    expect(view.peek).toEqual(Option.some({ slug: 'the-daily', phrase: 'The Daily' }));
  });

  test('stays a panel when core did not flag it, however few topics there are', () => {
    // One topic hit beside a verse hit is a full panel: the peek card would
    // discard four groups of answers the reader can still use. The rule is
    // core's, and this asserts the host reads it rather than counting topics.
    const view = lookupView(result({ topics: [topic('the-daily', 'The Daily')], verses: [verse] }));
    expect(view.peek).toEqual(Option.none());
  });

  test('falls back to the panel when the flag has no topic behind it', () => {
    expect(lookupView(result({ lonePeek: true })).peek).toEqual(Option.none());
  });

  test('names the panel by the selection it resolved', () => {
    expect(lookupView(result({})).label).toBe('Lookup: the daily');
  });
});
