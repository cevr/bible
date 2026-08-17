/** Select-to-lookup (§7).
 *
 *  Curated phrases render as visible links; **any text selection can be looked
 *  up on demand** as the fallback. This module is that fallback: one call that
 *  asks five sources what a run of selected text might mean, and answers with
 *  five groups in one value.
 *
 *  | Group                 | Source                                              |
 *  | --------------------- | --------------------------------------------------- |
 *  | Topic matches         | phrase dictionary exact hit, then fuzzy             |
 *  | Strong's              | `getVerseWords` + `getStrongsEntry`, under `context` |
 *  | Bible FTS hits        | `BibleDatabase.searchVerseWindow`                   |
 *  | EGW FTS hits          | `WritingsService.search`                            |
 *  | Catalog topical index | `TopicService.list`                                 |
 *
 *  **No new data layer.** Every read here is a call one of the four services
 *  already exposed, exactly as `StudyService` composes §8's bundle and
 *  `composeSections` composes §6's lineup. What was missing was the seam that
 *  asks all five at once about a string, and this module is only that seam.
 *
 *  **The effect does not fail.** Every source is fallible and every one of them
 *  degrades to an empty group, for the reason §6.3 gives the section composer: a
 *  partial corpus produces a smaller answer rather than an error. A reader who
 *  selected a phrase and has no writings library installed still gets the topic,
 *  verse and catalog groups — and a lookup that failed outright because one of
 *  five optional sources was absent would be a worse answer than four groups and
 *  an empty fifth. Degradation is over the **error channel** only: a defect is
 *  not a corpus state a source declares, and it is not swallowed here.
 *
 *  Two things *are* refused. An empty `text` is refused by `LookupInput`'s
 *  schema rather than here; and text that §4.3 normalizes away — pure
 *  punctuation and whitespace — is answered with five empty groups below,
 *  because it names nothing and every source asked about it answers about
 *  something else.
 */

import { Effect, Option, Order, Context, Layer, Schema } from 'effect';

import { getBibleBook } from '../bible/canon.js';
import { VerseReference, type BookNumber } from '../bible/model.js';
import type { BibleDatabaseService, StrongsEntry, VerseWord } from '../bible-db/bible-database.js';
import { nodesToText } from '../egw/ast.js';
import { StrongsLexiconEntry } from '../study/model.js';
import type { TopicServiceApi } from '../topics/service.js';
import type { WritingsServiceApi } from '../writings/service.js';
import {
  LOOKUP_HIT_LIMIT,
  LOOKUP_TOPIC_LIMIT,
  LookupCatalogMatch,
  LookupResult,
  LookupStrongsHit,
  LookupTopicMatch,
  LookupVerseHit,
  LookupWritingsHit,
  type LookupInput,
} from './lookup-model.js';
import {
  TopicSlug,
  type PhraseDictionary,
  type PhraseDictionaryEntry,
  type TopicStatus,
} from './model.js';
import { normalizeAlias, normalizedWords } from './normalize.js';
import {
  WikiSectionSources,
  type SectionSources,
  type SectionSourcing,
} from './section-composer.js';
import { WikiService, type WikiServiceApi } from './service.js';

export interface LookupServiceApi {
  /** The five resolver groups for one selection, in one call (§7).
   *
   *  One call rather than five, for the reason `v1.study.verse.get` is one
   *  procedure: the panel always draws all five groups, so granular per-group
   *  resolution would buy nothing but round trips on the two hosts that reach
   *  this over a MessagePort. */
  readonly resolve: (input: LookupInput) => Effect.Effect<LookupResult>;
}

// ---------------------------------------------------------------------------
// The selection, normalized once (§4.3)
// ---------------------------------------------------------------------------

/** One selection, in the two forms every group below reads it in.
 *
 *  Carried as a value rather than recomputed per group, because §4.3 is the
 *  thing the five groups have to agree about: the dictionary is keyed by this
 *  scan, the catalog is filtered by it, the two FTS indexes are queried with it,
 *  and the context verse's words are compared against it. A group that
 *  normalized its own copy is a group that can be widened alone. */
interface Selection {
  /** The §4.3 normalized text: case folded, whitespace collapsed, soft
   *  punctuation transparent. Empty when the text was only separators. */
  readonly text: string;
  /** The same text as its §4.3 words, which is what the boundary rules compare. */
  readonly words: readonly string[];
}

const selectionOf = (text: string): Selection => {
  const normalized = normalizeAlias(text);
  return { text: normalized, words: words(normalized) };
};

/** §7's five groups with nothing in any of them, for a selection that names
 *  nothing. Still five groups, still present-and-empty. */
const emptyResult = (text: string): LookupResult =>
  LookupResult.make({
    text,
    topics: [],
    strongs: [],
    verses: [],
    writings: [],
    catalog: [],
    lonePeek: false,
  });

// ---------------------------------------------------------------------------
// Group 1 — topic matches (§7: "phrase dictionary exact hit, then fuzzy")
// ---------------------------------------------------------------------------

/** §4.3's words, as the units both halves of the fuzzy rule and the Strong's
 *  group compare.
 *
 *  This is `normalizedWords`, the scan `normalize.ts` derives from §4.6's
 *  boundary rule, and not a second reading of it. Splitting is what makes
 *  "matches only on word boundaries" (§4.3) expressible at all — `includes`
 *  answers about characters, and characters are what let `666` match inside
 *  `1666` and `he` inside `the` — but *where* the splits fall has to be the
 *  matcher's answer rather than this module's. Normalization keeps apostrophes
 *  and hyphens (they distinguish "the Lord's day" from "the lords day"), so
 *  space-separated runs and words are not the same list: the matcher links the
 *  authored alias `third angel` inside "the third angel's message" on the
 *  boundary the apostrophe makes, and a resolver splitting on spaces sees the
 *  single token `angel's` and reports nothing for a phrase the page itself
 *  renders as a link. */
const words = normalizedWords;

/** Whether `needle`'s words occur as a whole, contiguous run inside `haystack`'s.
 *
 *  Word-for-word, so both ends of the run land on §4.3 boundaries. This is the
 *  containment test everything below uses: an alias inside a drag-selected
 *  clause, and a verse word inside a selection, are the same question asked of
 *  two vocabularies. */
const containsRun = (haystack: readonly string[], needle: readonly string[]): boolean => {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
};

/** The shortest selection allowed to fuzzy-match by prefix.
 *
 *  §12 leaves the fuzzy threshold to implementation, and this is it. Below three
 *  normalized characters a prefix is not evidence: "th" opens "the daily", "the
 *  daily sacrifice" and most of the language, so every such row is a guess the
 *  reader cannot explain by pointing at their own selection. Three is where a
 *  prefix starts naming something — "san", "666", "dan" — and it is a floor on
 *  the *selection*, never on the alias, so a genuinely short alias stays
 *  reachable by its exact form and by containment. */
const LOOKUP_FUZZY_PREFIX_MINIMUM = 3;

/** Whether the selection is a word-boundary prefix of the alias.
 *
 *  Every word but the last must match whole; the last may be cut, because the
 *  cut word is precisely what a reader who stopped mid-drag produced. So "the
 *  daily sacri" opens "the daily sacrifice" and "sanctu" opens "sanctuary",
 *  while "he daily" opens nothing — a prefix that starts inside a word is not a
 *  prefix of the phrase. */
const prefixesAlias = (selection: readonly string[], alias: readonly string[]): boolean => {
  if (selection.length === 0 || selection.length > alias.length) return false;
  for (let index = 0; index < selection.length - 1; index += 1) {
    if (selection[index] !== alias[index]) return false;
  }
  const last = selection[selection.length - 1] ?? '';
  const against = alias[selection.length - 1] ?? '';
  return against.startsWith(last);
};

/** The fuzzy rule, stated once so it can be argued with.
 *
 *  **An alias matches fuzzily when the normalized selection is a word-boundary
 *  prefix of the normalized alias, or the normalized alias occurs as a whole
 *  word run inside the normalized selection.** Both directions, because the two
 *  describe the two ways a real selection misses an exact key:
 *
 *  - *Selection is a prefix of the alias.* The reader swiped "the daily sacri"
 *    and stopped, or selected "sanctuar" without the trailing y. The alias is
 *    the longer, complete phrase and the selection is its opening.
 *  - *Alias is inside the selection.* The reader selected a whole clause —
 *    "and the daily sacrifice was taken away" — that contains the alias
 *    somewhere within it. This is the common case for a drag-select, which
 *    follows the sentence rather than the phrase.
 *
 *  Both halves are **word-bounded**, which is §4.3's rule and not a refinement
 *  of it: the dictionary is keyed by the same scan, and a matcher that would
 *  refuse a phrase span at render time must not accept the same text here. The
 *  cases that rule is worth stating for are real authored aliases — `666` is a
 *  key of `mark-of-the-beast`, and a character-wise containment reports it for a
 *  reader who selected the year `1666`; `sanctuary` is a key, and character-wise
 *  containment reports it for `sanctuaryx`, which is not a word anyone selected.
 *  The single exception is the *last* word of a prefix, which a drag legitimately
 *  cuts.
 *
 *  It is deliberately **not** edit distance. A Levenshtein or trigram score is
 *  a similarity ranking over a vocabulary, and this vocabulary is 250-400
 *  authored phrases (§4.1) where a near-miss by one character is far rarer than
 *  a selection that over- or under-shoots a phrase boundary. Edit distance also
 *  buys false positives that read as nonsense to a reader — "the daily" is
 *  within edit distance 3 of "the deity" — and there is no threshold that both
 *  admits a real typo and refuses that. Prefix-and-containment produces only
 *  matches whose alias the reader's own text literally contains or begins, so
 *  every fuzzy row in the panel is explainable by pointing at the selection.
 *
 *  Both sides run `normalizeAlias`, the §4.3 scan the compiler keyed the
 *  artifact on, so case, whitespace runs and soft punctuation are already
 *  transparent before either test applies — "The Daily," and "the daily" are the
 *  same query, and neither needs a fuzzy rule to say so.
 *
 *  §4.8's context-restricted aliases ("the daily" must not fire inside "the
 *  daily paper") are **not** answered here. That restriction is authored data —
 *  §4.8 records it as a note in the affected stub — and `topic_aliases` (§2.2)
 *  carries no column for it, so honoring it is an artifact schema change that
 *  rides the compiled pin (§3.6) rather than a rule this resolver can invent. */
const matchesFuzzily = (selection: readonly string[], alias: readonly string[]): boolean => {
  if (selection.length === 0) return false;
  if (containsRun(selection, alias)) return true;
  if (selection.join(' ').length < LOOKUP_FUZZY_PREFIX_MINIMUM) return false;
  return prefixesAlias(selection, alias);
};

/** Which entries the selection names, exact hits first.
 *
 *  One pass with a kind rather than two passes, and the exact test is `===` on
 *  the same normalized form the fuzzy test uses — so an alias can never be both,
 *  and "exact, then fuzzy" is a sort rather than a concatenation of two lists
 *  that might overlap.
 *
 *  Ties inside each kind are broken by the shorter alias first, then
 *  alphabetically. Shorter first because a fuzzy hit's alias is the *phrase the
 *  reader's text contains*, and the shortest containing phrase is the most
 *  specific reading of a long selection; alphabetically after that because a
 *  panel whose rows reorder between two runs of the same query is a panel that
 *  cannot be trusted, and `Array.prototype.sort`'s stability alone would leave
 *  the order at the mercy of the artifact's row order. */
const topicMatchOrder: Order.Order<LookupTopicMatch> = Order.combineAll([
  Order.mapInput(Order.Boolean, (match: LookupTopicMatch) => match.kind !== 'exact'),
  Order.mapInput(Order.Number, (match: LookupTopicMatch) => match.alias.length),
  Order.mapInput(Order.String, (match: LookupTopicMatch) => match.alias),
]);

const topicMatch = (
  entry: PhraseDictionaryEntry,
  selection: Selection,
): Option.Option<LookupTopicMatch> => {
  const alias = normalizeAlias(entry.alias);
  if (alias === selection.text) {
    return Option.some(
      LookupTopicMatch.make({
        slug: entry.slug,
        display: entry.display,
        alias: entry.alias,
        kind: 'exact',
        canonical: entry.canonical,
      }),
    );
  }
  if (matchesFuzzily(selection.words, words(alias))) {
    return Option.some(
      LookupTopicMatch.make({
        slug: entry.slug,
        display: entry.display,
        alias: entry.alias,
        kind: 'fuzzy',
        canonical: entry.canonical,
      }),
    );
  }
  return Option.none();
};

/** Group 1, capped and ordered.
 *
 *  Deduplicated **by slug**, keeping the best-ranked alias for each: a topic
 *  reached through three of its synonyms is one answer, and three rows naming
 *  the same page is the panel repeating itself. The sort runs before the dedupe
 *  so the row that survives is the exact hit rather than whichever synonym the
 *  artifact happened to store first. */
const topicMatches = (
  dictionary: PhraseDictionary,
  selection: Selection,
): readonly LookupTopicMatch[] => {
  const all = dictionary.entries.flatMap((entry) =>
    Option.match(topicMatch(entry, selection), {
      onNone: (): readonly LookupTopicMatch[] => [],
      onSome: (match) => [match],
    }),
  );
  const best = new Map<string, LookupTopicMatch>();
  for (const match of [...all].sort(topicMatchOrder)) {
    if (!best.has(match.slug)) best.set(match.slug, match);
  }
  return [...best.values()].slice(0, LOOKUP_TOPIC_LIMIT);
};

// ---------------------------------------------------------------------------
// Group 2 — Strong's (§7: "when `context` locates the selection inside a verse")
// ---------------------------------------------------------------------------

/** Whether a verse word is part of the selection.
 *
 *  §7's condition is that the context "locates the selection inside a verse",
 *  and the located thing is a run of the verse's own text — so the words this
 *  group reports are the verse's words that the selection covers. Both sides
 *  normalize, so "Daily," in the verse and "daily" in the selection are the same
 *  word, and a selection that spans several words reports each of them.
 *
 *  A word with no Strong's numbers is not a hit: the group is the lexicon
 *  behind the selection, and punctuation or a KJV supplied word has none to
 *  show.
 *
 *  Covered means the verse word's **whole word run** occurs in the selection,
 *  not that its letters do. `he` is a word of Daniel 8:11 and a selection of
 *  "the prince" contains those two letters; reporting H1931 for it would put a
 *  lexicon entry in the panel for a word the reader never touched — and the
 *  panel gives no way to see that the word came from a substring. */
const coveredWord = (word: VerseWord, selection: Selection): boolean => {
  if (word.strongsNumbers.length === 0) return false;
  const normalized = words(normalizeAlias(word.text));
  if (normalized.length === 0) return false;
  return containsRun(selection.words, normalized);
};

const lexiconEntry = (entry: StrongsEntry): Option.Option<StrongsLexiconEntry> =>
  Schema.decodeOption(StrongsLexiconEntry)({
    number: entry.number,
    language: entry.language,
    lemma: entry.lemma,
    transliteration: entry.transliteration,
    pronunciation: entry.pronunciation,
    definition: entry.definition,
    kjvDefinition: entry.kjvDefinition,
  });

/** Group 2. Empty without a `context`, and empty *because* of it.
 *
 *  §7's acceptance names this case directly: "`context` inside a verse produces
 *  the Strong's group and omitting `context` does not". The group is still
 *  present in the result either way — the panel has a row for it — and what the
 *  absent context removes is its content, not its existence.
 *
 *  A word carrying several numbers yields several hits, matching
 *  `StudyWord.strongs`: the KJV's word-to-lexeme mapping is many-to-many, and
 *  reporting only the first would hide the rest behind a row that looks
 *  complete. */
const strongsHits = (
  bible: BibleDatabaseService,
  context: Option.Option<VerseReference>,
  selection: Selection,
): Effect.Effect<readonly LookupStrongsHit[]> =>
  Option.match(context, {
    onNone: () => Effect.succeed<readonly LookupStrongsHit[]>([]),
    onSome: (reference) =>
      bible.getVerseWords(reference.book, reference.chapter, reference.verse).pipe(
        Effect.flatMap((words) =>
          Effect.forEach(
            words.filter((word) => coveredWord(word, selection)),
            (word) =>
              Effect.forEach(word.strongsNumbers, (number) =>
                bible.getStrongsEntry(number).pipe(
                  Effect.map((entry) =>
                    LookupStrongsHit.make({
                      word: word.text,
                      entry: Option.flatMap(entry, lexiconEntry),
                    }),
                  ),
                ),
              ),
            { concurrency: 'unbounded' },
          ),
        ),
        Effect.map((hits) => hits.flat().slice(0, LOOKUP_HIT_LIMIT)),
        Effect.orElseSucceed((): readonly LookupStrongsHit[] => []),
      ),
  });

// ---------------------------------------------------------------------------
// Group 3 — Bible FTS
// ---------------------------------------------------------------------------

/** How a reference reads, from the canon. The same derivation `StudyService`
 *  uses, because a label that differs between the study pane and the lookup
 *  panel is two names for one verse. */
const bookName = (book: BookNumber): string =>
  Option.match(getBibleBook(book), {
    onNone: () => String(book),
    onSome: (found) => found.name,
  });

/** The selection as one FTS phrase.
 *
 *  Quoted, and quotes inside it doubled, exactly as the §6.1 composer quotes a
 *  topic phrase. A selection is arbitrary reader-chosen text and FTS5 treats
 *  bare `AND`, `OR`, `NOT`, `*` and `(` as operators — an unquoted selection
 *  containing any of them is a syntax error rather than a search, and a reader
 *  selecting a clause with a parenthesis in it would meet a failed lookup for
 *  reasons nothing on screen explains. Quoted, every selection is a phrase
 *  search over exactly the words it contains. */
const ftsPhrase = (phrase: string): string => `"${phrase.replaceAll('"', '""')}"`;

/** A catalog id read as the slug its page is reached by. */
const readSlug = Schema.decodeOption(TopicSlug);

/** Whether opening this catalog row lands on an authored page or on a live
 *  catalog assembly (§2.1). */
const catalogStatus = (authored: ReadonlySet<string>, slug: TopicSlug): TopicStatus => {
  if (authored.has(String(slug))) return 'flagship';
  return 'catalog';
};

const verseHits = (
  bible: BibleDatabaseService,
  query: string,
): Effect.Effect<readonly LookupVerseHit[]> =>
  bible.searchVerseWindow(query, { limit: LOOKUP_HIT_LIMIT }).pipe(
    Effect.flatMap((window) =>
      Effect.forEach(window.results, (row) =>
        Schema.decodeEffect(VerseReference)({
          _tag: 'verse',
          book: row.book,
          chapter: row.chapter,
          verse: row.verse,
        }).pipe(
          Effect.map((reference) =>
            LookupVerseHit.make({
              reference,
              label: `${bookName(reference.book)} ${String(reference.chapter)}:${String(
                reference.verse,
              )}`,
              text: row.text,
            }),
          ),
        ),
      ),
    ),
    // A row whose address does not decode is dropped with the group rather than
    // failing the lookup. Unlike §8's bundle — where a malformed row hides a
    // corpus defect behind sparseness and must be reported — this group is a
    // search result list with no total beside it, so a short list is not a
    // claim about anything. The panel is a glance, not an audit surface.
    Effect.orElseSucceed((): readonly LookupVerseHit[] => []),
  );

// ---------------------------------------------------------------------------
// Group 4 — EGW FTS
// ---------------------------------------------------------------------------

/** The paragraph text an FTS hit carries, as the snippet.
 *
 *  Imported through the same `nodesToText` the §6.1 composer uses, so a
 *  paragraph reads identically in a wiki section and in a lookup panel. */
const writingsHits = (
  writings: WritingsServiceApi,
  query: string,
): Effect.Effect<readonly LookupWritingsHit[]> =>
  writings.search(query, { limit: LOOKUP_HIT_LIMIT, scope: 'all' }).pipe(
    Effect.map((hits) =>
      hits.map((hit) =>
        LookupWritingsHit.make({
          refcode: Option.getOrElse(hit.paragraph.refcode, () => hit.publication.code),
          bookCode: hit.publication.code,
          bookTitle: hit.publication.title,
          author: hit.publication.author,
          snippet: nodesToText(hit.paragraph.nodes),
        }),
      ),
    ),
    // An unavailable writings library is an empty group, not a failed lookup —
    // §6.3's posture, and the reader still has four other groups.
    Effect.orElseSucceed((): readonly LookupWritingsHit[] => []),
  );

// ---------------------------------------------------------------------------
// Group 5 — catalog topical index
// ---------------------------------------------------------------------------

/** Group 5: the `bible.db` topical index, filtered by the selection.
 *
 *  `TopicService.list` takes the selection as its `query`, so the filtering is
 *  the catalog's own — the same `LIKE` the `/topics` route and the wiki listing
 *  use — rather than a second matching rule this module invents. §7 names the
 *  source as `TopicService.list` and that is exactly the call.
 *
 *  `status` says what opening the row will show, so it is decided against the
 *  dictionary this same resolve already read rather than assumed. `TopicService`
 *  alone cannot know it — it reads `bible.db`'s topical index, which has no
 *  column saying whether the artifact also carries an authored page for the same
 *  id — and the artifact's own answer is one set lookup away here, because a
 *  compiled page always has dictionary aliases (§2.2's `topic_aliases`) and a
 *  catalog id *is* its page's slug. A row that said `catalog` about an authored
 *  page would be wrong on the one question the field exists to answer, and an
 *  artifact that did not load leaves the set empty — every row then reads
 *  `catalog`, which is exactly true of a host with no authored pages. */
const catalogMatches = (
  catalog: TopicServiceApi,
  selection: string,
  authored: ReadonlySet<string>,
): Effect.Effect<readonly LookupCatalogMatch[]> =>
  catalog.list({ query: selection }).pipe(
    Effect.map((topics) =>
      topics.slice(0, LOOKUP_TOPIC_LIMIT).flatMap((topic) =>
        // A catalog topic's id *is* its page's slug — `catalogSummaries` in
        // `service.ts` explains why — but the two are separately branded, so the
        // crossing is a decode rather than an assertion. A row whose id is not a
        // usable slug is dropped: it names a page no route could reach.
        Option.match(readSlug(topic.id), {
          onNone: (): readonly LookupCatalogMatch[] => [],
          onSome: (slug) => [
            LookupCatalogMatch.make({
              slug,
              name: topic.name,
              status: catalogStatus(authored, slug),
            }),
          ],
        }),
      ),
    ),
    Effect.orElseSucceed((): readonly LookupCatalogMatch[] => []),
  );

// ---------------------------------------------------------------------------
// The lone-topic-hit rule (§7)
// ---------------------------------------------------------------------------

/** §7: "A lone topic hit gets the peek-card treatment from §5 instead of the
 *  full panel."
 *
 *  **Lone** is read strictly: exactly one topic match and nothing else found at
 *  all. The alternative reading — one topic match, never mind the other groups
 *  — would replace a panel carrying eight verse hits and five paragraphs with a
 *  card showing one topic, discarding four groups of answers the reader can no
 *  longer reach. §5's peek card is the treatment for "this selection means this
 *  one thing"; it is not a way to render a full result set more compactly.
 *
 *  Computed here rather than by each host for the reason the doc comment on
 *  `LookupResult.lonePeek` gives: a predicate this particular, restated three
 *  times, is a predicate that will be spelled three ways. */
const isLonePeek = (result: {
  readonly topics: readonly LookupTopicMatch[];
  readonly strongs: readonly LookupStrongsHit[];
  readonly verses: readonly LookupVerseHit[];
  readonly writings: readonly LookupWritingsHit[];
  readonly catalog: readonly LookupCatalogMatch[];
}): boolean =>
  result.topics.length === 1 &&
  result.strongs.length === 0 &&
  result.verses.length === 0 &&
  result.writings.length === 0 &&
  result.catalog.length === 0;

// ---------------------------------------------------------------------------
// The resolver
// ---------------------------------------------------------------------------

/** What the five groups are read from.
 *
 *  The wiki's own dictionary plus the four §6 section sources — which is not a
 *  new bundle but `WikiSectionSources`, the one a host already wires for topic
 *  pages. Reusing it is the point: a host that can compose a topic page can
 *  resolve a lookup, and there is no second answer to "which services back the
 *  wiki" for an operator to keep in step. */
interface LookupSources {
  readonly wiki: WikiServiceApi;
  readonly sections: SectionSourcing;
}

const makeResolve =
  (sources: LookupSources) =>
  (input: LookupInput): Effect.Effect<LookupResult> =>
    Effect.gen(function* () {
      // §4.3 once, at the top. Every group below compares against this same
      // normalized form, so the dictionary, the verse words and the two FTS
      // queries all mean the same thing by "the selection" — the FTS pair
      // included, which is the difference between five groups answering one
      // question and four answering one while the fifth answers another.
      const selection = selectionOf(input.text);
      const query = ftsPhrase(selection.text);

      // Text that normalizes to nothing names nothing. §4.3 makes commas and
      // semicolons transparent, so " , ; " is not a short selection but an
      // absent one, and every group answers it wrongly if asked: the empty
      // string prefixes every alias, an empty `LIKE` matches the whole catalog,
      // and an FTS phrase of pure punctuation matches whatever the tokenizer
      // decides. Five empty groups is the honest answer, and it is still five
      // groups — §7's shape does not change for it.
      if (selection.text.length === 0) return emptyResult(input.text);

      const dictionary = yield* sources.wiki.dictionary.pipe(
        // An unreadable artifact is an empty topic group. §3.5's degradation
        // posture: the other four groups still answer, and the reader gets a
        // smaller panel rather than a failure.
        Effect.map(Option.some),
        Effect.orElseSucceed(() => Option.none<PhraseDictionary>()),
      );
      const topics = Option.match(dictionary, {
        onNone: (): readonly LookupTopicMatch[] => [],
        onSome: (found) => topicMatches(found, selection),
      });
      /** Which slugs the artifact authors a page for, for group 5's `status`. */
      const authored = new Set(
        Option.match(dictionary, {
          onNone: (): readonly string[] => [],
          onSome: (found) => found.entries.map((row) => String(row.slug)),
        }),
      );

      // The four corpus-backed groups run together. They are independent reads
      // over three databases and the panel wants all of them, so this is one
      // batch rather than four sequential awaits — the same argument §6.1's
      // composer makes, and on the two visual hosts it is the difference
      // between one MessagePort round trip and one that takes four times as
      // long to answer.
      const [strongs, verses, writings, catalog] = yield* resolveCorpusGroups(
        sources.sections,
        input,
        selection,
        query,
        authored,
      );

      return LookupResult.make({
        text: input.text,
        topics,
        strongs,
        verses,
        writings,
        catalog,
        lonePeek: isLonePeek({ topics, strongs, verses, writings, catalog }),
      });
    });

/** The four corpus groups, or four empty ones on a host that wired no sources.
 *
 *  `not-wired` is a deliberate choice a host writes down (§6), not an accident,
 *  and it means the same thing here as it does for a topic page: this host
 *  serves no live corpus content. Four empty groups is the honest answer, and
 *  the groups are still present because §7 says an empty group is
 *  present-and-empty. */
const resolveCorpusGroups = (
  sourcing: SectionSourcing,
  input: LookupInput,
  selection: Selection,
  query: string,
  authored: ReadonlySet<string>,
): Effect.Effect<
  readonly [
    readonly LookupStrongsHit[],
    readonly LookupVerseHit[],
    readonly LookupWritingsHit[],
    readonly LookupCatalogMatch[],
  ]
> => {
  if (sourcing._tag === 'not-wired') return Effect.succeed([[], [], [], []]);
  const sources: SectionSources = sourcing.sources;
  return Effect.all(
    [
      strongsHits(sources.bible, input.context, selection),
      verseHits(sources.bible, query),
      writingsHits(sources.writings, query),
      catalogMatches(sources.catalog, selection.text, authored),
    ],
    { concurrency: 'unbounded' },
  );
};

export class LookupService extends Context.Service<LookupService, LookupServiceApi>()(
  '@bible/core/wiki/LookupService',
) {
  /** Backed by the wiki artifact for group 1 and the four §6 section sources
   *  for groups 2-5 — the same two dependencies `WikiService.Live` itself takes,
   *  so a host that can serve topic pages can serve lookups with no new wiring.
   *
   *  `WikiSectionSources` is required rather than optional for the reason §6
   *  gives: a host that forgot the wiring would answer every lookup with four
   *  empty groups and nothing would say so. `NotWired` is the way to mean it. */
  static Live: Layer.Layer<LookupService, never, WikiService | WikiSectionSources> = Layer.effect(
    LookupService,
    Effect.gen(function* () {
      const wiki = yield* WikiService;
      const sections = yield* WikiSectionSources;
      return LookupService.of({
        resolve: Effect.fn('LookupService.resolve')(makeResolve({ wiki, sections })),
      });
    }),
  );
}
