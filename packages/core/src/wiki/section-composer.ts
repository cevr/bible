/** The one auto-mined section composer (§6).
 *
 *  Flagship and catalog pages traverse this module identically: §2.1 gives both
 *  statuses the same layered anatomy, and the artifact deliberately stores no
 *  section bodies, so there is exactly one code path and partial-corpus honesty
 *  is automatic. A catalog page is simply a compose with an empty authored core.
 *
 *  Everything is live-queried at view time (§6). Nothing here caches, and
 *  nothing here reads a precomputed excerpt: a stored snippet goes stale
 *  against a re-synced book and cannot represent a book that is not installed
 *  at all, which is the exact pair of failures §4.1 and §6.3 rule out.
 */

import { Cause, Context, Effect, Layer, Option, Predicate, Result, Schema } from 'effect';
import * as SqlError from 'effect/unstable/sql/SqlError';

import { getBibleBook, getBibleBookByName } from '../bible/canon.js';
import {
  Reference as BibleReference,
  chapterNumber,
  verseNumber,
  type VerseReference,
} from '../bible/model.js';
import {
  BibleDatabase,
  type BibleDatabaseService,
  type BibleVerse,
} from '../bible-db/bible-database.js';
import { EGWCommentaryService, type EGWCommentaryServiceApi } from '../egw-commentary/service.js';
import type { TopicId } from '../topics/model.js';
import { TopicService, type TopicServiceApi } from '../topics/service.js';
import { EGW_SCOPE_AUTHORS, type CorpusScope } from '../writings/corpus-scope.js';
import { WritingsService, type WritingsServiceApi } from '../writings/service.js';
import { nodesToText } from '../egw/ast.js';
import {
  type AuthoredCore,
  type Block,
  type Inline,
  type TopicEdge,
  type TopicSlug,
  WikiCommentaryEntry,
  WikiCommentarySection,
  WikiCrossReference,
  WikiCrossReferencesSection,
  WikiEgwStatementsSection,
  WikiKeyVersesSection,
  WikiMissingBook,
  WikiPassageRef,
  WikiPioneerWitnessesSection,
  WikiRelatedTopic,
  WikiRelatedTopicsSection,
  WikiSearchHandoff,
  type WikiSectionLineup,
  WikiVerseRef,
  WikiWritingsHit,
} from './model.js';

// ---------------------------------------------------------------------------
// Composer constants (§6.1)
//
// "Caps and ordering live in core as composer constants, so all three clients
// cap identically." They are values here rather than call-site literals for
// exactly that reason: a client cannot pass its own cap, and a test asserts the
// constant rather than a number it copied.
// ---------------------------------------------------------------------------

/** The §6.1 cap per section. Section 6's row is uncapped — §6.2 records why it
 *  needs no cap: graph degree stays small because the long tail is a search
 *  handoff rather than a section — so its cap is `Option.none()` rather than a
 *  large number standing in for "all of them".
 *
 *  Every field is the same `Option<number>` so `capped` below has one signature
 *  and no section is capped by a different mechanism than its neighbours. */
export interface SectionCaps {
  readonly keyVerses: Option.Option<number>;
  readonly egwStatements: Option.Option<number>;
  readonly commentary: Option.Option<number>;
  readonly pioneerWitnesses: Option.Option<number>;
  readonly crossReferences: Option.Option<number>;
  readonly relatedTopics: Option.Option<number>;
}

export const SECTION_CAPS = {
  keyVerses: Option.some(8),
  egwStatements: Option.some(5),
  commentary: Option.some(5),
  pioneerWitnesses: Option.some(5),
  crossReferences: Option.some(10),
  relatedTopics: Option.none(),
} satisfies SectionCaps;

/** Applies one §6.1 cap and records the pre-cap count, in one place so every
 *  section's `items`/`total` pair means the same thing. An absent cap takes
 *  everything — section 6's uncapped row. */
const capped = <A>(all: readonly A[], cap: Option.Option<number>): CappedItems<A> =>
  Option.match(cap, {
    onNone: (): CappedItems<A> => ({ items: all, total: all.length }),
    onSome: (limit) => ({ items: all.slice(0, limit), total: all.length }),
  });

/** The corpus scope each FTS-backed section searches under (§6.1 rows 2 and 4).
 *  The same two values feed the §6.2 handoff descriptors, so the search a
 *  reader jumps into is scoped exactly like the section they jumped from. */
export interface SectionScopes {
  readonly egwStatements: CorpusScope;
  readonly pioneerWitnesses: CorpusScope;
}

export const SECTION_SCOPES = {
  egwStatements: 'egw',
  pioneerWitnesses: 'pioneer',
} satisfies SectionScopes;

/** The most chapters one key-verse passage will read text for.
 *
 *  A catalog range is normally a handful of verses, but nothing in
 *  `topic_references` forbids `Gen.1.1-Rev.22.21`, and reading 1,189 chapters
 *  to render one entry of a section capped at 8 is not a query this composer
 *  makes. Past the bound the passage keeps its label and its navigable ends and
 *  simply carries no text — the same shape a range whose chapters are not in
 *  this library already has.
 *
 *  A named constant rather than an inline slice for the same reason
 *  `SECTION_CAPS` is: the three hosts run this composer, and a bound one of
 *  them could pass in is a bound they could disagree about. */
export const PASSAGE_TEXT_CHAPTER_LIMIT = 12;

/** A capped section's two numbers: the items that survived the cap, and how
 *  many the source produced before it. `total > items.length` is exactly the
 *  condition a "show all" affordance exists for, so the pair travels together
 *  rather than being recomputed by whoever needs the second half. */
interface CappedItems<A> {
  readonly items: readonly A[];
  readonly total: number;
}

// §5's arrival rule is no longer a function here: `WikiKeyVersesSection` types
// `defaultOpen` as `true` and the other five type it as `false`, so the rule is
// enforced by the constructor rather than by a helper a caller could bypass.

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Everything the composer reads, as the four service interfaces that already
 *  own those tables. Interfaces rather than `Context.Service` tags so the
 *  composer stays a function: `WikiService` already resolves its dependencies
 *  and a second resolution inside the composer would make the page's data
 *  sources invisible from the layer graph. */
export interface SectionSources {
  readonly catalog: TopicServiceApi;
  readonly bible: BibleDatabaseService;
  readonly writings: WritingsServiceApi;
  readonly commentary: EGWCommentaryServiceApi;
}

/** What a host wired for §6, as a closed choice rather than a presence check.
 *
 *  `wired` carries the four sources; `not-wired` carries nothing and means this
 *  host deliberately composes no live sections. Two values rather than an
 *  optional service: absence-by-omission and absence-by-decision look identical
 *  to `Effect.serviceOption`, and only the second is a state a page should
 *  report — the first is a wiring bug that must not typecheck. */
export type SectionSourcing =
  | { readonly _tag: 'wired'; readonly sources: SectionSources }
  | { readonly _tag: 'not-wired' };

/** The composer's four sources, bundled as one service so a host wires them
 *  once.
 *
 *  A **required** dependency of `WikiService.Live`, not an optional read. An
 *  optional read means a host that forgot the wiring renders every topic page
 *  with an empty lineup and no way to tell that apart from a bare library — the
 *  silent-empty-page failure this milestone's review found. A host with no
 *  writings database still has a legitimate answer: `NotWired`, which is a
 *  deliberate choice written at the composition site rather than an accident of
 *  what happened not to be in scope. */
export class WikiSectionSources extends Context.Service<WikiSectionSources, SectionSourcing>()(
  '@bible/core/wiki/WikiSectionSources',
) {
  /** Assembles the bundle from the four services that already own these tables.
   *  Every host composes this rather than constructing the record by hand, so
   *  "which services back a topic page" is one answer in one place. */
  static Live: Layer.Layer<
    WikiSectionSources,
    never,
    TopicService | BibleDatabase | WritingsService | EGWCommentaryService
  > = Layer.effect(
    WikiSectionSources,
    Effect.gen(function* () {
      return WikiSectionSources.of({
        _tag: 'wired',
        sources: {
          catalog: yield* TopicService,
          bible: yield* BibleDatabase,
          writings: yield* WritingsService,
          commentary: yield* EGWCommentaryService,
        },
      });
    }),
  );

  /** The explicit "this host composes no live sections" choice.
   *
   *  The page still carries all six sections — §6.1's lineup is the page's
   *  shape, so a client indexing position 3 for commentary must find it in every
   *  state — but every one is empty and the page says
   *  `sectionsUnavailable: sources-not-wired`, which is the fact a silently
   *  empty lineup could never carry. A host provides this when its corpora would
   *  not open, or when it genuinely serves authored cores only. Either way, the
   *  choice is written down. */
  static NotWired: Layer.Layer<WikiSectionSources> = Layer.succeed(
    WikiSectionSources,
    WikiSectionSources.of({ _tag: 'not-wired' }),
  );

  /** The §3.5 degradation policy for a host's own section-source wiring:
   *  **corpora that will not open** become `NotWired`; everything else keeps
   *  going up.
   *
   *  All three hosts want the same thing here, and all three previously spelled
   *  it `Layer.catchCause(() => NotWired)` — which converts *every* cause, so a
   *  null dereference in a service constructor, a schema-migration bug and a
   *  shutdown interrupt all arrived at the reader as a cheerful
   *  "sections not wired". That is the round-one failure one level up: a real
   *  fault hidden behind a degradation state.
   *
   *  The discrimination is by what the cause carries, not by fail-vs-die,
   *  because on this stack the *expected* failure is a defect. `bun:sqlite` and
   *  `node:sqlite` both construct their handle with a throwing constructor
   *  inside `Effect.gen`, so a missing or unreadable corpus file surfaces as a
   *  died `SQLITE_CANTOPEN` rather than as anything typed — the SQL client
   *  layers declare `never` in their error channel. `SqlError` covers the other
   *  half: a corpus that opens but whose schema step fails, which
   *  `EGWParagraphDatabase.layerCore` does report typed.
   *
   *  Interruption is deliberately not in the set. A host shutting down mid-build
   *  has not discovered an unavailable corpus, and turning that into a value
   *  would keep the fiber alive past the point it was asked to stop. */
  static NotWiredOnCorpusAbsence = <E, R>(
    self: Layer.Layer<WikiSectionSources, E, R>,
  ): Layer.Layer<WikiSectionSources, E, R> =>
    self.pipe(
      Layer.catchCause((cause) =>
        Layer.unwrap(
          Effect.gen(function* () {
            // Re-raised unchanged, defect and interrupt alike: this combinator
            // narrows what degrades, it does not reclassify what does not.
            if (!isCorpusUnavailable(cause)) return yield* Effect.failCause(cause);
            // Logged on the way down. The reader sees `sections-not-wired` and
            // has no way to ask *why*; the operator needs the driver's own
            // message, and this is the only place that still holds it.
            yield* Effect.logWarning('wiki.sectionSources.degraded-to-not-wired').pipe(
              Effect.annotateLogs({ cause: Cause.pretty(cause) }),
            );
            return WikiSectionSources.NotWired;
          }),
        ),
      ),
    );
}

/** Whether a layer-construction cause is "this host's corpora are not there".
 *
 *  Two shapes qualify, and only these two. A `SqlError` is the typed report
 *  from a corpus that opened but could not be prepared. A died `SQLiteError` —
 *  identified by the `SQLITE_…` code every driver stamps on it — is the
 *  untyped report from a corpus file that would not open at all, which is the
 *  common case and the one that has no typed channel to travel in.
 *
 *  Anything else, defect or interrupt, is not an absent corpus and is not this
 *  function's business. */
const isCorpusUnavailable = (cause: Cause.Cause<unknown>): boolean => {
  if (Cause.hasInterrupts(cause)) return false;
  return cause.reasons.every((reason) => {
    if (reason._tag === 'Fail') return SqlError.isSqlError(reason.error);
    if (reason._tag === 'Die')
      return Option.exists(decodeSqliteThrow(reason.defect), isSqliteDefect);
    return false;
  });
};

/** The only part of a driver-level throw this module reads.
 *
 *  A defect is `unknown` by construction — that is what makes it a defect — so
 *  the one field the classification depends on is declared as a schema and
 *  parsed, rather than reached for through a chain of `hasProperty` guards. The
 *  boundary is right here: past this parse the value is a `SqliteThrow` and
 *  nothing downstream touches the raw defect. */
const SqliteThrow = Schema.Struct({ code: Schema.String });

const decodeSqliteThrow = Schema.decodeUnknownOption(SqliteThrow);

/** A driver-level SQLite throw, by the `code` both `bun:sqlite` and
 *  `node:sqlite` set on the errors they raise (`SQLITE_CANTOPEN`,
 *  `SQLITE_NOTADB`, `SQLITE_CORRUPT`, …). Matching the prefix rather than one
 *  code keeps "the file is missing" and "the file is not a database" on the
 *  same side of the line, which is where §3.5 already puts them: both mean this
 *  host has no usable corpus. */
const isSqliteDefect = (defect: SqliteThrow): boolean => defect.code.startsWith('SQLITE_');

type SqliteThrow = typeof SqliteThrow.Type;

export interface ComposeInput {
  readonly slug: TopicSlug;
  readonly title: string;
  /** `None` for a catalog page. Supplies the §6.2 canonical phrase and the
   *  section-6 authored edges; a catalog page has neither and still gets all
   *  six sections. */
  readonly core: Option.Option<AuthoredCore>;
  /** The catalog topic this page overlays, when one is keyed. Sections 1, 3 and
   *  5 all descend from it, so a page with no overlay gets three empty
   *  sections rather than a failure — §2.4's "the page renders without the
   *  catalog-sourced key-verses section", made a value. */
  readonly catalogId: Option.Option<TopicId>;
  /** Resolves a neighbouring slug's display title. Section 6 lists titles, not
   *  slugs, and only `WikiService` can read the artifact's `topics` table. */
  readonly titleOf: (slug: TopicSlug) => Effect.Effect<Option.Option<string>>;
  /** Every flagship page whose `topic_edges` row points *at* this slug, in edge
   *  order — §2.3's live catalog backlinks. Supplied as a closure for the same
   *  reason `titleOf` is: only `WikiService` holds the artifact connection, and
   *  a catalog page has no core to read edges out of. */
  readonly backlinksTo: (slug: TopicSlug) => Effect.Effect<readonly TopicEdge[]>;
}

// ---------------------------------------------------------------------------
// Section 1 — key verses (catalog `topic_references`, OSIS-normalized, cap 8)
// ---------------------------------------------------------------------------

const OSIS_VERSE = /^(\w+)\.(\d+)\.(\d+)$/;

/** Parses one OSIS verse token — `Exod.6.16` — into a verse the reader can
 *  navigate.
 *
 *  A handful of apocryphal books (`PrAzar`, `Wis`) the 66-book canon has no
 *  number for yield `None` and drop out rather than becoming a partial
 *  reference nothing downstream could open. The book half resolves through
 *  `getBibleBookByName`, which already carries the OSIS abbreviations as
 *  aliases — 76,944 of the catalog's 76,957 OSIS tokens resolve through it, the
 *  13 misses being exactly those apocryphal books. */
const parseOsisVerse = (token: string): Option.Option<WikiVerseRef> => {
  const matched = Option.fromNullishOr(OSIS_VERSE.exec(token));
  if (Option.isNone(matched)) return Option.none();
  const [, abbreviation, chapter, verse] = matched.value;
  if (
    Predicate.isUndefined(abbreviation) ||
    Predicate.isUndefined(chapter) ||
    Predicate.isUndefined(verse)
  ) {
    return Option.none();
  }
  return getBibleBookByName(abbreviation).pipe(
    Option.map((book) =>
      WikiVerseRef.make({
        book: book.number,
        chapter: chapterNumber(Number(chapter)),
        verse: verseNumber(Number(verse)),
        label: `${book.name} ${chapter}:${verse}`,
        text: Option.none(),
      }),
    ),
  );
};

/** How a range reads once both ends are known.
 *
 *  Within one chapter the end collapses to its verse (`Exod 6:16-20`), across
 *  chapters it keeps chapter and verse (`Exod 6:16-7:2`), and across books it
 *  keeps the book too (`Mal 4:5-Matt 1:1`) — the same elision a reader writes by
 *  hand, so the label reads as a reference rather than as two references glued
 *  together. */
const rangeLabel = (start: WikiVerseRef, end: WikiVerseRef): string => {
  if (start.book !== end.book) return `${start.label}-${end.label}`;
  if (start.chapter !== end.chapter) {
    return `${start.label}-${String(end.chapter)}:${String(end.verse)}`;
  }
  return `${start.label}-${String(end.verse)}`;
};

/** Why one OSIS token produced no passage. A rejected token is a fact about the
 *  catalog data, so it names its own cause rather than collapsing into the
 *  absence a caller cannot act on. */
type OsisRejection = 'unresolvable-book' | 'malformed-range' | 'reversed-range';

/** Parses one OSIS token into the passage it names — a single verse, or the
 *  range the catalog stored as one reference — or says why it could not.
 *
 *  Ranges are not an edge case in this catalog — `topic_references` holds 11,464
 *  of them and 120 topics whose references are *all* ranges. Dropping them, as
 *  the single-verse-only parse did, empties section 1 on every one of those
 *  pages. A range whose ends are out of order, or whose halves name a book the
 *  66-book canon has no number for, is still dropped from the page — a
 *  reference nothing can open is worse than one that is not shown — but it is
 *  now dropped *audibly*: `Result.fail` here is what lets `keyVerses` log the
 *  token, and a silently vanishing reference was how the reversed-range bug in
 *  the catalog stayed invisible. */
const parseOsisPassage = (token: string): Result.Result<WikiPassageRef, OsisRejection> => {
  const halves = token.split('-');
  const [startToken, endToken, ...rest] = halves;
  if (Predicate.isUndefined(startToken) || rest.length > 0) {
    return Result.fail('malformed-range');
  }
  const start = parseOsisVerse(startToken);
  if (Option.isNone(start)) return Result.fail('unresolvable-book');
  if (Predicate.isUndefined(endToken)) {
    return Result.succeed(
      WikiPassageRef.make({
        start: start.value,
        end: Option.none(),
        label: start.value.label,
        text: Option.none(),
      }),
    );
  }
  const end = parseOsisVerse(endToken);
  if (Option.isNone(end)) return Result.fail('unresolvable-book');
  if (!isBefore(start.value, end.value)) return Result.fail('reversed-range');
  return Result.succeed(
    WikiPassageRef.make({
      start: start.value,
      end: Option.some(end.value),
      label: rangeLabel(start.value, end.value),
      text: Option.none(),
    }),
  );
};

/** Strictly-before in canonical order. A range whose end equals its start is a
 *  single verse written the long way, and encodes as one — `end` is `Some` only
 *  when it really spans. */
const isBefore = (start: WikiVerseRef, end: WikiVerseRef): boolean => {
  if (start.book !== end.book) return start.book < end.book;
  if (start.chapter !== end.chapter) return start.chapter < end.chapter;
  return start.verse < end.verse;
};

/** Section 1's passages in catalog position order, deduplicated.
 *
 *  `TopicService.topic` already returns sections and their references in
 *  `(section.position, reference.position)` order, so "catalog position" is the
 *  order the rows arrive in and this function never sorts. Deduplication is
 *  necessary rather than tidy: Nave's lists the same verse under several
 *  section labels of one topic, and a cap of 8 spent on one verse eight times
 *  is a page with one verse on it. The dedup key spans the whole passage, so a
 *  range and the single verse it starts at stay two distinct entries. */
const keyVerses = (
  sources: SectionSources,
  slug: TopicSlug,
  catalogId: Option.Option<TopicId>,
): Effect.Effect<readonly WikiPassageRef[]> => {
  if (Option.isNone(catalogId)) return Effect.succeed([]);
  return sources.catalog.topic(catalogId.value).pipe(
    Effect.flatMap((detail) => {
      const seen = new Set<string>();
      const passages: WikiPassageRef[] = [];
      const rejected: { readonly token: string; readonly reason: OsisRejection }[] = [];
      for (const section of detail.sections) {
        for (const reference of section.references) {
          for (const token of reference.osis) {
            const parsed = parseOsisPassage(token);
            if (Result.isFailure(parsed)) {
              rejected.push({ token, reason: parsed.failure });
              continue;
            }
            const key = passageKey(parsed.success);
            if (seen.has(key)) continue;
            seen.add(key);
            passages.push(parsed.success);
          }
        }
      }
      // A warning rather than a failure or a silence. The composer runs at view
      // time, so a bad catalog token must not take the page down — but it must
      // also not disappear, which is how a reversed range in `topic_references`
      // could quietly shrink section 1 on one page and nowhere else. The token
      // and the slug together are enough to find the row.
      return Effect.forEach(rejected, (entry) =>
        Effect.logWarning('wiki.keyVerses.rejected-osis-token').pipe(
          Effect.annotateLogs({ slug, token: entry.token, reason: entry.reason }),
        ),
      ).pipe(Effect.as(passages));
    }),
    // A page whose catalog overlay cannot be read is a page with no key verses,
    // not a failed page. The overlay is one of five sources; letting it fail the
    // whole compose would make an unreadable catalog row indistinguishable from
    // a broken artifact, and §3.5's posture is that the page still renders.
    Effect.orElseSucceed((): readonly WikiPassageRef[] => []),
  );
};

const verseKey = (verse: WikiVerseRef): string =>
  `${String(verse.book)}.${String(verse.chapter)}.${String(verse.verse)}`;

const passageKey = (passage: WikiPassageRef): string =>
  `${verseKey(passage.start)}-${Option.match(passage.end, {
    onNone: () => '',
    onSome: verseKey,
  })}`;

/** Attaches KJV text to the passages that survive the cap, and only to those.
 *  The cap runs first deliberately: fetching text for every one of a Nave's
 *  topic's hundreds of references to then throw all but eight away is the query
 *  this ordering exists to not make.
 *
 *  A range's text is the spanned verses joined, read chapter by chapter through
 *  `getChapter` — the same call the reader uses — across every book the span
 *  touches. Cross-book spans are read rather than skipped: `Mal 4:5-Matt 1:1`
 *  is one of the catalog's own references, and the old per-book restriction
 *  rendered it silently textless, which reads to a user exactly like a Bible
 *  that does not have Malachi in it. */
const withVerseText = (
  sources: SectionSources,
  passages: readonly WikiPassageRef[],
): Effect.Effect<readonly WikiPassageRef[]> =>
  Effect.forEach(passages, (passage) =>
    passageText(sources, passage).pipe(
      Effect.map((text) => WikiPassageRef.make({ ...passage, text })),
      Effect.orElseSucceed(() => passage),
    ),
  );

const passageText = (
  sources: SectionSources,
  passage: WikiPassageRef,
): Effect.Effect<Option.Option<string>> => {
  const end = passage.end;
  if (Option.isNone(end)) {
    return sources.bible
      .getVerse(passage.start.book, passage.start.chapter, passage.start.verse)
      .pipe(
        Effect.map(Option.map((row) => row.text)),
        Effect.orElseSucceed(() => Option.none<string>()),
      );
  }
  const span = chapterSpan(passage.start, end.value);
  if (span.length === 0) return Effect.succeedNone;
  return Effect.forEach(span, (address) =>
    sources.bible.getChapter(address.book, address.chapter).pipe(
      Effect.map((verses) =>
        verses.filter((verse) => withinSpan(passage.start, end.value, address, verse.verse)),
      ),
      Effect.orElseSucceed((): readonly BibleVerse[] => []),
    ),
  ).pipe(
    Effect.map((chapters) => {
      const spanned = chapters.flat();
      if (spanned.length === 0) return Option.none<string>();
      return Option.some(spanned.map((verse) => verse.text).join(' '));
    }),
  );
};

/** One chapter of the span, by the two coordinates `getChapter` takes. */
interface ChapterAddress {
  readonly book: number;
  readonly chapter: number;
}

/** Every chapter a range touches, inclusive, in canonical order — across book
 *  boundaries as well as within one book.
 *
 *  The canonical order is `BIBLE_BOOKS`' own: book numbers run 1..66 in order
 *  and each book states its chapter count, so walking from the start book to
 *  the end book and taking chapters 1..n of every book between them is the
 *  reading order itself rather than a second ordering this module invented.
 *
 *  Returns empty past `PASSAGE_TEXT_CHAPTER_LIMIT` — the caller reads that as
 *  "no text", which is the honest answer for a span too large to render inline.
 *  A book number the canon does not know also yields empty: the range has no
 *  chapters this library could read. */
/** Where the span starts inside one book of it: at the range's own verse in the
 *  opening book, and at chapter 1 in every book after it. */
const firstChapterOf = (book: number, start: WikiVerseRef): number => {
  if (book === start.book) return start.chapter;
  return 1;
};

/** Where the span ends inside one book of it: at the range's own chapter in the
 *  closing book, and at the book's last chapter in every book before it. */
const lastChapterOf = (book: number, end: WikiVerseRef, chapters: number): number => {
  if (book === end.book) return end.chapter;
  return chapters;
};

const chapterSpan = (start: WikiVerseRef, end: WikiVerseRef): readonly ChapterAddress[] => {
  const addresses: ChapterAddress[] = [];
  for (let book = start.book; book <= end.book; book++) {
    const found = getBibleBook(book);
    if (Option.isNone(found)) return [];
    const first = firstChapterOf(book, start);
    const last = lastChapterOf(book, end, found.value.chapters);
    for (let chapter = first; chapter <= last; chapter++) {
      if (addresses.length >= PASSAGE_TEXT_CHAPTER_LIMIT) return [];
      addresses.push({ book, chapter });
    }
  }
  return addresses;
};

/** Whether one verse of a fetched chapter falls inside the range. Only the
 *  span's first and last chapters are clipped — every chapter between them is
 *  whole — and a single-chapter range is clipped at both ends by the same two
 *  comparisons. The chapter is identified by book *and* number, so the first
 *  chapter of the end book is not mistaken for the first chapter of the start
 *  book when a range crosses a boundary. */
const withinSpan = (
  start: WikiVerseRef,
  end: WikiVerseRef,
  address: ChapterAddress,
  verse: number,
): boolean => {
  if (address.book === start.book && address.chapter === start.chapter && verse < start.verse) {
    return false;
  }
  if (address.book === end.book && address.chapter === end.chapter && verse > end.verse) {
    return false;
  }
  return true;
};

// ---------------------------------------------------------------------------
// Sections 2 and 4 — FTS by corpus scope, rank order, cap 5 each
// ---------------------------------------------------------------------------

/** The topic's canonical phrase: the alias the compiler marked canonical, and
 *  the page title when the artifact carries no authored core to mark one. It is
 *  both the FTS query for sections 2 and 4 and the §6.2 handoff's pre-fill, so
 *  the search a reader lands in is the search the section ran. */
const canonicalPhrase = (input: ComposeInput): string =>
  input.core.pipe(
    Option.flatMap((core) => Option.fromNullishOr(core.aliases.find((alias) => alias.canonical))),
    Option.map((alias) => alias.display),
    Option.getOrElse(() => input.title),
  );

/** FTS5 reads bare input as a query expression, where a quote or a bare `NEAR`
 *  is syntax rather than text. Wrapping the phrase in double quotes makes it one
 *  literal phrase — which is what a topic's canonical phrase always is — and
 *  doubling any embedded quote is FTS5's own escape. */
const ftsPhrase = (phrase: string): string => `"${phrase.replaceAll('"', '""')}"`;

/** One FTS-backed section's ranked hits **and** its real match count.
 *
 *  The two travel together because §6.1's `total` means "how many the source
 *  produced before the cap", and the row query cannot report that: the cap is
 *  pushed into SQL as a `LIMIT`, so counting the returned rows saturates at 5
 *  and `total` could never exceed `items.length`. A section that always reads
 *  `5/5` is a section whose "show all" affordance never appears, which is
 *  exactly backwards for §6.2 — the handoff exists *because* the tail is long.
 *
 *  So the count is its own query, run concurrently with the rows. Both go
 *  through the same phrase and the same scope, so the number under the section
 *  is the number the handoff's search would return. */
const writingsHits = (
  sources: SectionSources,
  phrase: string,
  scope: CorpusScope,
  cap: Option.Option<number>,
): Effect.Effect<CappedItems<WikiWritingsHit>> => {
  const query = ftsPhrase(phrase);
  const hits = sources.writings
    .search(
      query,
      // The FTS limit is the section cap pushed down into the query: an
      // uncapped section asks for the default window rather than for a number
      // this module invented.
      Option.match(cap, {
        onNone: () => ({ scope }),
        onSome: (limit) => ({ limit, scope }),
      }),
    )
    .pipe(
      Effect.map((found) =>
        found.map((hit) =>
          WikiWritingsHit.make({
            refcode: Option.getOrElse(hit.paragraph.refcode, () => hit.publication.code),
            bookCode: hit.publication.code,
            bookTitle: hit.publication.title,
            author: hit.publication.author,
            // An FTS hit is by definition text this library holds — the index
            // cannot reach a book that is not installed. So it always carries a
            // snippet and never an absence; the §6.3 pair is produced by the
            // citation path below, which is the only path that can name a book
            // the library lacks.
            snippet: Option.some(nodesToText(hit.paragraph.nodes)),
            absence: Option.none(),
          }),
        ),
      ),
      // An unavailable writings library is an empty section, not a failed page.
      // The reader is looking at a topic, and four of the six sources still have
      // something to say.
      Effect.orElseSucceed((): readonly WikiWritingsHit[] => []),
    );
  const matches = sources.writings.searchCount(query, { scope }).pipe(
    Effect.map(Option.some),
    Effect.orElseSucceed(() => Option.none<number>()),
  );
  return Effect.all([hits, matches], { concurrency: 'unbounded' }).pipe(
    Effect.map(([all, total]) => {
      const items = Option.match(cap, {
        onNone: () => all,
        onSome: (limit) => all.slice(0, limit),
      });
      // A count that would not run leaves the section reporting what it can
      // show. `total` is a number, so there is no absence to encode — and 0
      // beside a non-empty `items` would be a worse lie than the count being
      // merely a floor.
      return { items, total: Option.getOrElse(total, () => items.length) };
    }),
  );
};

/** §6.3: a citation in the authored core naming a book this library does not
 *  hold renders refcode + book title + a get-this-book marker, and no snippet.
 *
 *  These entries can only come from citations. FTS cannot reach an uninstalled
 *  book, so search never produces one — which is why the two paths join at the
 *  *section* (as `missingBooks`) rather than in `items`. They cannot join in
 *  `items`: a citation has no FTS rank, so prepending it to a rank-ordered list
 *  and then capping evicts the fifth-ranked hit and leaves a list that is no
 *  longer what §6.1 says it is. */
const citedMissingBooks = (
  sources: SectionSources,
  core: Option.Option<AuthoredCore>,
): Effect.Effect<readonly WikiMissingBook[]> =>
  Effect.forEach(Option.match(core, { onNone: noCitations, onSome: citationsIn }), (refcode) =>
    resolveCitation(sources, refcode),
  ).pipe(Effect.map((resolved) => dedupeByRefcode(resolved.flatMap(present))));

/** One entry per refcode: an authored core citing the same uninstalled
 *  paragraph twice is one book to get, not two. */
const dedupeByRefcode = (books: readonly WikiMissingBook[]): readonly WikiMissingBook[] => {
  const seen = new Set<string>();
  const unique: WikiMissingBook[] = [];
  for (const book of books) {
    if (seen.has(book.refcode)) continue;
    seen.add(book.refcode);
    unique.push(book);
  }
  return unique;
};

/** An `Option` as a zero-or-one array, so `flatMap` drops the empty ones. */
const present = <A>(value: Option.Option<A>): readonly A[] =>
  Option.match(value, { onNone: (): readonly A[] => [], onSome: (found) => [found] });

const noCitations = (): readonly string[] => [];

/** Every refcode the authored core cites, in reading order. Only the refcode is
 *  needed: the quoted text is the compiler's verification evidence (§3.4 step
 *  6), not something this section reproduces — §6.3 forbids a snippet here. */
const citationsIn = (core: AuthoredCore): readonly string[] =>
  [...core.thesis, ...core.body].flatMap(blockInlines).flatMap(citedRefcode);

const blockInlines = (block: Block): readonly Inline[] => {
  if (block._tag === 'list') return block.items.flat();
  return block.content;
};

const citedRefcode = (inline: Inline): readonly string[] => {
  if (inline._tag === 'citation') return [inline.refcode];
  return [];
};

/** The book code half of a refcode: `GC 425.1` names book `GC`. */
const refcodeBookCode = (refcode: string): Option.Option<string> =>
  Option.fromNullishOr(refcode.trim().split(/\s+/)[0]).pipe(
    Option.filter((code) => code.length > 0),
  );

const resolveCitation = (
  sources: SectionSources,
  refcode: string,
): Effect.Effect<Option.Option<WikiMissingBook>> => {
  const code = refcodeBookCode(refcode);
  if (Option.isNone(code)) return Effect.succeedNone;
  return sources.writings.publicationByCode(code.value).pipe(
    Effect.map((publication) => {
      const installed = Option.getOrElse(publication.paragraphCount, () => 0) > 0;
      if (installed) return Option.none<WikiMissingBook>();
      // Present in the catalog, absent from disk: the §6.3 entry. The book
      // title is available because `books` carries catalog metadata for every
      // publication, installed or not — which is precisely what lets the entry
      // say *which* book to get.
      return Option.some(
        WikiMissingBook.make({
          refcode,
          bookCode: publication.code,
          bookTitle: publication.title,
          author: publication.author,
          absence: 'not-installed',
        }),
      );
    }),
    // A refcode naming a publication the catalog has never heard of is not an
    // uninstalled book — nothing could be downloaded to satisfy it — so it
    // yields no entry rather than a get-this-book marker pointing at nothing.
    Effect.orElseSucceed(() => Option.none<WikiMissingBook>()),
  );
};

/** The uninstalled cited books belonging to one section's corpus scope.
 *
 *  Scoped the same way the hits are, so an EGW citation does not surface under
 *  "pioneer witnesses". They never touch `items`: §6.1 orders sections 2 and 4
 *  by FTS rank and caps them at 5, and an unranked entry inside that list would
 *  both break the order and evict a real hit. */
const missingBooksInScope = (
  books: readonly WikiMissingBook[],
  scope: CorpusScope,
): readonly WikiMissingBook[] => books.filter((book) => scopeAdmits(scope, book.author));

/** The same author partition the SQL applies, in memory, for the citation half
 *  — those entries never reach the FTS query, so nothing else would scope them
 *  and an EGW citation would otherwise show up under "pioneer witnesses". */
const scopeAdmits = (scope: CorpusScope, author: string): boolean => {
  if (scope === 'all') return true;
  const isEgw = EGW_SCOPE_AUTHORS.includes(author);
  if (scope === 'egw') return isEgw;
  return !isEgw;
};

// ---------------------------------------------------------------------------
// Section 3 — commentary on the key verses (verse order, cap 5)
// ---------------------------------------------------------------------------

/** Commentary for the key verses, in verse order.
 *
 *  "Verse order" is the order section 1 already presents — which is catalog
 *  position, not canonical order — so this walks the capped key passages and
 *  keeps their sequence rather than re-sorting. Two sections claiming to be in
 *  "verse order" while disagreeing about what that means would be worse than
 *  either order alone.
 *
 *  A range is keyed by the verse it opens at. `getCommentary` takes one verse,
 *  and the opening verse is the one a reader following the passage arrives at
 *  first — walking every verse of every range instead would spend the cap of 5
 *  inside a single reference. */
const commentaryEntries = (
  sources: SectionSources,
  passages: readonly WikiPassageRef[],
  cap: Option.Option<number>,
): Effect.Effect<CappedItems<WikiCommentaryEntry>> =>
  Effect.forEach(passages, (passage) =>
    sources.commentary.getCommentary(verseReference(passage.start)).pipe(
      Effect.map((result) =>
        result.entries.map((entry) =>
          WikiCommentaryEntry.make({
            verse: passage.start,
            refcode: entry.refcode,
            bookCode: entry.bookCode,
            bookTitle: entry.bookTitle,
            content: entry.content,
          }),
        ),
      ),
      Effect.orElseSucceed((): readonly WikiCommentaryEntry[] => []),
    ),
  ).pipe(Effect.map((perVerse) => capped(perVerse.flat(), cap)));

const verseReference = (verse: WikiVerseRef): VerseReference =>
  BibleReference.verse(verse.book, verse.chapter, verse.verse);

// ---------------------------------------------------------------------------
// Section 5 — cross-references from the key verses (source order, cap 10)
// ---------------------------------------------------------------------------

/** `getCrossRefs` returns rows in stored order per verse (`ORDER BY rowid`, the
 *  artifact's insertion order); walking the key passages in their own order and
 *  concatenating is therefore "source order" for the page as a whole. Nothing is
 *  re-ranked — an ordering the source did not make is an ordering no client
 *  could reproduce.
 *
 *  A range contributes the cross-references of its opening verse, matching how
 *  section 3 keys commentary: the passage's own reference is the anchor, and
 *  fanning out across every verse of a range would spend the cap of 10 inside
 *  one entry of section 1. */
const crossReferences = (
  sources: SectionSources,
  passages: readonly WikiPassageRef[],
  cap: Option.Option<number>,
): Effect.Effect<CappedItems<WikiCrossReference>> =>
  Effect.forEach(passages, (passage) =>
    sources.bible.getCrossRefs(passage.start.book, passage.start.chapter, passage.start.verse).pipe(
      Effect.map((rows) =>
        rows.flatMap((row) =>
          crossReferenceTarget(row.book, row.chapter, row.verse).pipe(
            Option.map((to) =>
              WikiCrossReference.make({
                from: passage.start,
                to,
                source: row.source,
                preview: row.previewText,
              }),
            ),
            Option.match({
              onNone: (): readonly WikiCrossReference[] => [],
              onSome: (reference) => [reference],
            }),
          ),
        ),
      ),
      Effect.orElseSucceed((): readonly WikiCrossReference[] => []),
    ),
  ).pipe(
    Effect.map((perVerse) => {
      const seen = new Set<string>();
      const all: WikiCrossReference[] = [];
      for (const reference of perVerse.flat()) {
        // The same target reached from two key verses is one cross-reference,
        // not two: the reader is being pointed at a passage, and a cap of 10
        // spent listing the same passage twice is a shorter page for no gain.
        const key = verseKey(reference.to);
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(reference);
      }
      return capped(all, cap);
    }),
  );

/** A chapter-level cross-reference (`verse` is `None`) targets verse 1 — the
 *  reader opens the chapter at its start, which is what a chapter reference
 *  means to a reader. A book number outside the canon yields `None`: the row is
 *  unusable as a destination, and a reference nothing can open is worse than a
 *  reference that is not shown. */
const crossReferenceTarget = (
  book: number,
  chapter: number,
  verse: Option.Option<number>,
): Option.Option<WikiVerseRef> => {
  const target = Option.getOrElse(verse, () => 1);
  return getBibleBook(book).pipe(
    Option.map((found) =>
      WikiVerseRef.make({
        book: found.number,
        chapter: chapterNumber(chapter),
        verse: verseNumber(target),
        label: `${found.name} ${String(chapter)}:${String(target)}`,
        text: Option.none(),
      }),
    ),
  );
};

// ---------------------------------------------------------------------------
// Section 6 — related topics (authored edges, then backlinks; uncapped)
// ---------------------------------------------------------------------------

/** Authored edges first, then backlinks, each in edge position (§6.1 row 6).
 *
 *  Two sources join here. The authored core's own `topic_edges` rows arrive
 *  `ORDER BY kind, position`, so edge position is the order they come in and is
 *  preserved untouched. The **live** backlinks — every flagship page whose
 *  `topic_edges` row points *at* this slug — are then appended in the same edge
 *  order. §2.3 requires the live half: catalog page backlinks are never stored
 *  in the artifact, so a catalog page reading only the core (which it does not
 *  have) has an empty section by construction, and a flagship page misses every
 *  neighbour compiled after it.
 *
 *  The authored-before-backlink half is partitioned explicitly rather than
 *  relying on `'authored' < 'backlink'` sorting lexically the way the lineup
 *  wants — that is a coincidence of two literals, not a rule, and it would break
 *  silently the day a third edge kind appears. */
const relatedTopics = (input: ComposeInput): Effect.Effect<readonly WikiRelatedTopic[]> =>
  Effect.gen(function* () {
    const edges = Option.match(input.core, {
      onNone: (): readonly TopicEdge[] => [],
      onSome: (core) => core.edges,
    });
    const live = yield* input.backlinksTo(input.slug);
    const seen = new Set<string>([String(input.slug)]);
    const ordered: TopicEdge[] = [];
    for (const edge of [
      ...edges.filter((edge) => edge.kind === 'authored'),
      ...edges.filter((edge) => edge.kind === 'backlink'),
      ...live,
    ]) {
      // A neighbour the authored core already names is not listed twice because
      // it also links back — the edge is one relationship, and the authored
      // half is the one the author chose to say something about.
      const key = String(edge.slug);
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(edge);
    }
    return yield* Effect.forEach(ordered, (edge) =>
      input.titleOf(edge.slug).pipe(
        Effect.map((title) =>
          WikiRelatedTopic.make({
            slug: edge.slug,
            title: Option.getOrElse(title, () => String(edge.slug)),
            kind: edge.kind,
          }),
        ),
      ),
    );
  });

// ---------------------------------------------------------------------------
// The composer
// ---------------------------------------------------------------------------

/** Builds the §6.1 lineup for any topic page.
 *
 *  Always six sections, always in order, each already capped and ordered. A
 *  section with nothing to show is present and empty: the lineup is the page's
 *  shape, and a client that has to work out which sections exist this time is a
 *  client that will eventually render them in a different order than its two
 *  siblings.
 *
 *  The effect does not fail. Every source is fallible and every one of them
 *  degrades to an empty section, because §3.5's posture is that a partial
 *  corpus produces a smaller page rather than an error — the reader still has a
 *  topic in front of them. */
export const composeSections = Effect.fn('Wiki.composeSections')(function* (
  sources: SectionSources,
  input: ComposeInput,
) {
  const phrase = canonicalPhrase(input);
  const allKeyVerses = yield* keyVerses(sources, input.slug, input.catalogId);
  const keyPassages = capped(allKeyVerses, SECTION_CAPS.keyVerses);
  const withText = yield* withVerseText(sources, keyPassages.items);
  const missing = yield* citedMissingBooks(sources, input.core);

  const [egwHits, pioneerHits, commentary, crossRefs, related] = yield* Effect.all(
    [
      writingsHits(sources, phrase, SECTION_SCOPES.egwStatements, SECTION_CAPS.egwStatements),
      writingsHits(sources, phrase, SECTION_SCOPES.pioneerWitnesses, SECTION_CAPS.pioneerWitnesses),
      commentaryEntries(sources, withText, SECTION_CAPS.commentary),
      crossReferences(sources, withText, SECTION_CAPS.crossReferences),
      relatedTopics(input),
    ],
    // The five remaining sources are independent reads over three databases,
    // and §6's whole premise is that the batch is warm-fast (0.1-4.3 ms). Run
    // them together: on the web host this is one MessagePort round trip for the
    // page, which is the adapter contract Milestone 3 owes.
    { concurrency: 'unbounded' },
  );

  // Sections 2 and 4 arrive already capped *and* already carrying their real
  // pre-cap count — `writingsHits` runs the count query the `LIMIT` makes
  // impossible to infer — so nothing is re-capped here. All six sections'
  // `total` therefore mean the same thing: matches before the cap.
  const relatedTopicsSection = capped(related, SECTION_CAPS.relatedTopics);

  const lineup: WikiSectionLineup = [
    WikiKeyVersesSection.make({
      items: withText,
      total: keyPassages.total,
      defaultOpen: true,
    }),
    WikiEgwStatementsSection.make({
      items: egwHits.items,
      total: egwHits.total,
      defaultOpen: false,
      handoff: Option.some(
        WikiSearchHandoff.make({ query: phrase, scope: SECTION_SCOPES.egwStatements }),
      ),
      missingBooks: missingBooksInScope(missing, SECTION_SCOPES.egwStatements),
    }),
    WikiCommentarySection.make({
      items: commentary.items,
      total: commentary.total,
      defaultOpen: false,
    }),
    WikiPioneerWitnessesSection.make({
      items: pioneerHits.items,
      total: pioneerHits.total,
      defaultOpen: false,
      handoff: Option.some(
        WikiSearchHandoff.make({ query: phrase, scope: SECTION_SCOPES.pioneerWitnesses }),
      ),
      missingBooks: missingBooksInScope(missing, SECTION_SCOPES.pioneerWitnesses),
    }),
    WikiCrossReferencesSection.make({
      items: crossRefs.items,
      total: crossRefs.total,
      defaultOpen: false,
    }),
    WikiRelatedTopicsSection.make({
      items: relatedTopicsSection.items,
      total: relatedTopicsSection.total,
      defaultOpen: false,
    }),
  ];
  return lineup;
});

/** The lineup a host that deliberately wired no section sources serves: six
 *  empty sections in order, plus (on the page) the typed reason.
 *
 *  Six empty sections rather than an empty array. §6.1's lineup is the page's
 *  shape, so a client indexing position 3 for commentary must find commentary
 *  there in every state the page can be in. What distinguishes this from six
 *  sections that queried a bare library is `WikiPage.sectionsUnavailable`,
 *  which only this path sets. */
export const emptySectionLineup = (): WikiSectionLineup => [
  WikiKeyVersesSection.make({ items: [], total: 0, defaultOpen: true }),
  WikiEgwStatementsSection.make({
    items: [],
    total: 0,
    defaultOpen: false,
    handoff: Option.none(),
    missingBooks: [],
  }),
  WikiCommentarySection.make({ items: [], total: 0, defaultOpen: false }),
  WikiPioneerWitnessesSection.make({
    items: [],
    total: 0,
    defaultOpen: false,
    handoff: Option.none(),
    missingBooks: [],
  }),
  WikiCrossReferencesSection.make({ items: [], total: 0, defaultOpen: false }),
  WikiRelatedTopicsSection.make({ items: [], total: 0, defaultOpen: false }),
];
