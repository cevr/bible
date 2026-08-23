/**
 * The reading data surface the components use.
 *
 * Every read is one `AtomRpc` query atom read through `useAtomSuspense`, so it
 * returns the value directly and suspends or fails into the nearest
 * `<Loading>` / `<Errored>` boundary — the same contract the components had
 * before, now Solid 2's own async convention rather than a hand-rolled one.
 * Every write is one `AtomRpc` mutation atom read through `useAtomSet` in
 * promise mode, so it still returns a promise the caller can settle a busy
 * flag on — and that promise stays pending until the reads it staled have
 * refreshed, which `../cache/settled-mutation` restores because `Reactivity`
 * only *starts* those refreshes.
 *
 * A read that a mutation can stale declares the reactivity keys it covers, and
 * the mutation declares the keys it touches; `Reactivity` refreshes the
 * intersection. `../cache/reactivity-keys` derives both sides from core's own
 * change-scope vocabulary and proves the result equivalent to the predicate
 * matching this layer replaced.
 */

import type {
  BookNumber,
  Chapter,
  ChapterMarginAnchors,
  ChapterNumber,
  SearchWindow,
  VerseNumber,
  VerseReference,
} from '@bible/core/bible';
import type {
  LibraryCollection,
  LocationAnnotations,
  MemoryPractice,
  ReaderLocation,
  ReadingPlan,
} from '@bible/core/library-state';
import type { LibraryMutationCommand } from '@bible/core/local-first';
import type { MutationCommitValue } from '@bible/core/procedure';
import type { ReadingPreferences, ReadingPreferencesPatch } from '@bible/core/reading-preferences';
import type { SearchResult } from '@bible/core/search';
import type { StrongsNumber, StrongsStudy, VerseStudy } from '@bible/core/study';
import type { TopicDetail, TopicId, TopicListInput, TopicSummary } from '@bible/core/topics';
import type { LookupResult, TopicSlug, PhraseDictionary, WikiPage } from '@bible/core/wiki';
import type {
  CorpusScope,
  Page,
  PageNumber,
  Paragraph,
  ParagraphId,
  PublicationId,
  WritingsDownloadResult,
  WritingsLibraryPublication,
} from '@bible/core/writings';
import {
  RegistryContext,
  RegistryProvider,
  useAtomInitialValues,
  useAtomSet,
  useAtomSuspense,
} from '@bible/atom-solid';
import { Option } from 'effect';
import { createComponent, useContext, type Accessor, type ParentProps } from 'solid-js';

import {
  annotationQueryKeys,
  keysForLibraryMutation,
  keysForScope,
  libraryAreaKey,
  READING_CONTINUITY_KEY,
  READING_PREFERENCES_KEY,
  WRITINGS_LIBRARY_KEY,
} from '../cache/reactivity-keys.js';
import { procedureClientAtom, ReadingRpc, type ProcedureClient } from '../cache/reading-rpc.js';
import { trackQuery, withSettledQueries, type QueryAtom } from '../cache/settled-mutation.js';

/** Payloads whose procedure takes no arguments. */
const NO_PAYLOAD = {};

/**
 * The library-wide reads are held for as long as the reading session owns its
 * registry, which is what the retired cache did: its entries lived on the
 * Solid owner and were dropped only when the owner was disposed.
 *
 * An infinite time-to-live is `AtomRpc`'s spelling of `Atom.keepAlive`, so the
 * node is exempt from idle eviction entirely — including the registry's 400ms
 * default, which would otherwise drop a query the moment a route change
 * unmounts its last reader and re-fetch it on the way back. These six reads
 * are small, singleton, and mutation-invalidated, so staleness is not a risk
 * the TTL has to cover; the reactivity keys already cover it.
 */
const LIBRARY_TTL = Infinity;

/**
 * An import rewrites preferences, annotations, collections, plans, practice
 * and continuity in one operation, so it stales every cached area. Listing the
 * area keys refreshes each area's queries; the per-location annotation keys
 * need no entry because every annotations query also covers its area key.
 */
const EVERY_CACHED_AREA: readonly string[] = [
  READING_PREFERENCES_KEY,
  READING_CONTINUITY_KEY,
  libraryAreaKey('annotations'),
  libraryAreaKey('collections'),
  libraryAreaKey('plans'),
  libraryAreaKey('practice'),
];

/**
 * Builds a keyed query atom and indexes it, so a mutation touching those keys
 * can wait for this query's refresh before it resolves.
 *
 * Every query that declares reactivity keys is built through here. The keys
 * are named once and used twice — passed to `AtomRpc`, which makes the atom
 * *refresh* on invalidation, and to `trackQuery`, which makes the atom
 * *findable* by a mutation that wants to await that refresh — so the two can
 * never drift. An *unkeyed* query needs no entry: nothing can stale it, so
 * indexing it would add a row no lookup can reach.
 *
 * `keys` is taken as a separate argument rather than read back off the built
 * atom because `AtomRpc` keeps its query options private, and it is spread
 * into the options so callers see one list, not two.
 */
const keyedQuery = <A extends QueryAtom>(
  keys: readonly string[],
  build: (options: {
    readonly reactivityKeys: readonly string[];
    readonly timeToLive?: number;
  }) => A,
  timeToLive?: number,
): A => {
  const atom = build({ reactivityKeys: keys, timeToLive });
  trackQuery(atom, keys);
  return atom;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const useBibleChapter = (
  reference: Accessor<{ readonly book: BookNumber; readonly chapter: ChapterNumber }>,
): Accessor<Chapter> =>
  useAtomSuspense(() => ReadingRpc.query('v1.reading.bibleChapter.get', reference()));

/**
 * The chapter's margin anchors (§10 M6's margin layer).
 *
 * A second read beside `useBibleChapter` rather than a wider chapter payload:
 * the anchors exist for a minority of verses, the reader wants the text first,
 * and Solid's `<Loading>` boundary lets the two settle independently — the
 * chapter paints and the anchors join it. **Unkeyed**, like the study bundle and
 * for the same reason: the KJV margin corpus is an immutable artifact no library
 * mutation can stale.
 */
export const useChapterMarginAnchors = (
  reference: Accessor<{ readonly book: BookNumber; readonly chapter: ChapterNumber }>,
): Accessor<ChapterMarginAnchors> =>
  useAtomSuspense(() => ReadingRpc.query('v1.reading.bibleChapterMarginAnchors.get', reference()));

export interface BibleSearchInput {
  readonly query: string;
  readonly books?: readonly BookNumber[];
  readonly offset?: number;
  readonly limit?: number;
}

export const useBibleSearch = (input: Accessor<BibleSearchInput>): Accessor<SearchWindow> =>
  useAtomSuspense(() => ReadingRpc.query('v1.reading.bibleSearch.get', input()));

/**
 * The combined library: what the archive offers, with each entry marked
 * installed or not. One read serves the whole writings surface, so a finished
 * download stales exactly this query — which is what retired the hand-written
 * refresh-the-catalog-after-download coordination.
 */
export const useWritingsLibrary = (): Accessor<readonly WritingsLibraryPublication[]> =>
  useAtomSuspense(() =>
    keyedQuery(
      [WRITINGS_LIBRARY_KEY],
      (options) => ReadingRpc.query('v1.reading.writingsLibrary.get', NO_PAYLOAD, options),
      LIBRARY_TTL,
    ),
  );

export const useWritingsPage = (
  reference: Accessor<{ readonly publicationId: PublicationId; readonly page: PageNumber }>,
): Accessor<Page> =>
  useAtomSuspense(() => ReadingRpc.query('v1.reading.writingsPage.get', reference()));

export const useWritingsPublication = (
  reference: Accessor<{ readonly publicationId: PublicationId }>,
): Accessor<Page> =>
  useAtomSuspense(() => ReadingRpc.query('v1.reading.writingsPublication.open', reference()));

export const useWritingsParagraph = (
  reference: Accessor<{
    readonly publicationId: PublicationId;
    readonly paragraphId: ParagraphId;
  }>,
): Accessor<Paragraph> =>
  useAtomSuspense(() => ReadingRpc.query('v1.reading.writingsParagraph.get', reference()));

export const useReadingPreferences = (): Accessor<ReadingPreferences> =>
  useAtomSuspense(() =>
    keyedQuery(
      [READING_PREFERENCES_KEY],
      (options) => ReadingRpc.query('v1.preferences.reading.get', NO_PAYLOAD, options),
      LIBRARY_TTL,
    ),
  );

/**
 * The procedure answers `null` when nothing has been read yet; the reader
 * models that as an absent location rather than a null one.
 */
export const useReadingContinuity = (): Accessor<Option.Option<ReaderLocation>> => {
  const location = useAtomSuspense(() =>
    keyedQuery(
      [READING_CONTINUITY_KEY],
      (options) => ReadingRpc.query('v1.reading.continuity.get', NO_PAYLOAD, options),
      LIBRARY_TTL,
    ),
  );
  return () => Option.fromNullishOr(location());
};

export const useLocationAnnotations = (
  location: Accessor<ReaderLocation>,
): Accessor<LocationAnnotations> =>
  useAtomSuspense(() =>
    keyedQuery(annotationQueryKeys(location()), (options) =>
      ReadingRpc.query('v1.library.annotations.get', location(), options),
    ),
  );

/**
 * The whole study bundle for one verse (§8.2): words with their Strong's
 * numbers, cross-references, margin notes, EGW Bible Commentary, and the
 * parallel writings that cite the verse.
 *
 * One hook because it is one procedure — the pane always wants all five
 * sections, and the host composes them behind a single MessagePort round trip.
 *
 * **Unkeyed**, deliberately: the study corpora are immutable artifacts that no
 * library mutation can stale, so there is nothing for a reactivity key to
 * invalidate and indexing the atom would add a row no lookup could reach. What
 * the app *does* get for free is the retained-stale behavior every read here
 * has — omitting `suspendOnWaiting` means a refetch keeps rendering the
 * previous bundle instead of flashing the pane's loading state.
 */
export const useVerseStudy = (
  reference: Accessor<{
    readonly book: BookNumber;
    readonly chapter: ChapterNumber;
    readonly verse: VerseNumber;
  }>,
): Accessor<VerseStudy> =>
  useAtomSuspense(() => ReadingRpc.query('v1.study.verse.get', reference()));

/**
 * The word-tap payload: one lexicon entry plus the reverse concordance, capped.
 *
 * `limit` rides in the payload, so changing it swaps the atom and the new cap is
 * fetched — the same accessor-in/accessor-out shape every other read here has.
 */
export const useStrongsStudy = (
  input: Accessor<{ readonly number: StrongsNumber; readonly limit?: number }>,
): Accessor<StrongsStudy> =>
  useAtomSuspense(() => ReadingRpc.query('v1.study.strongs.get', input()));

export const useCollections = (): Accessor<readonly LibraryCollection[]> =>
  useAtomSuspense(() =>
    keyedQuery(
      [libraryAreaKey('collections')],
      (options) => ReadingRpc.query('v1.library.collections.get', NO_PAYLOAD, options),
      LIBRARY_TTL,
    ),
  );

export const useReadingPlans = (): Accessor<readonly ReadingPlan[]> =>
  useAtomSuspense(() =>
    keyedQuery(
      [libraryAreaKey('plans')],
      (options) => ReadingRpc.query('v1.library.plans.get', NO_PAYLOAD, options),
      LIBRARY_TTL,
    ),
  );

export const useMemoryPractice = (): Accessor<MemoryPractice> =>
  useAtomSuspense(() =>
    keyedQuery(
      [libraryAreaKey('practice')],
      (options) => ReadingRpc.query('v1.library.practice.get', NO_PAYLOAD, options),
      LIBRARY_TTL,
    ),
  );

/**
 * The compiled alias → slug table (§2.5), loaded once per session.
 *
 * `LIBRARY_TTL` and the writings-library key, for two different reasons that
 * both point the same way. The dictionary is small (250-400 phrases, §4.1),
 * singleton, and read by every rendered chapter and every rendered EGW page —
 * so an idle eviction between two route changes would refetch it and, worse,
 * rebuild the automaton the reader's next screenful is about to use. The
 * reactivity key is the §6.3 seam: installing a book is the one action that can
 * change what the wiki can say locally, and it already invalidates this key.
 *
 * The **automaton** is not built here. This hook returns the dictionary; the
 * memo that turns it into a matcher lives in `../reading/match-plan.ts`
 * (`usePhraseSource`), because §4.2's "build once per dictionary load" is a
 * property of the render tree's memo, not of the transport cache.
 */
export const useWikiDictionary = (): Accessor<PhraseDictionary> =>
  useAtomSuspense(() =>
    keyedQuery(
      [WRITINGS_LIBRARY_KEY],
      (options) => ReadingRpc.query('v1.wiki.dictionary.get', NO_PAYLOAD, options),
      LIBRARY_TTL,
    ),
  );

/**
 * One composed topic page (§6.1): the authored core plus the six-section
 * lineup, already capped and already ordered by the one composer.
 *
 * Keyed on the writings library, because §6.3's "get this book" affordance is
 * inside this payload: downloading the cited book has to make the page stop
 * saying the reader does not have it, and the download mutation already
 * invalidates `WRITINGS_LIBRARY_KEY`. That is the whole of the wiring the spec
 * promises comes for free.
 */
export const useWikiTopic = (input: Accessor<{ readonly slug: TopicSlug }>): Accessor<WikiPage> =>
  useAtomSuspense(() =>
    keyedQuery([WRITINGS_LIBRARY_KEY], (options) =>
      ReadingRpc.query('v1.wiki.topic.get', input(), options),
    ),
  );

/**
 * The five resolver groups for one selection (§7), in one round trip.
 *
 * One hook because it is one procedure: the panel draws all five groups every
 * time, so per-group reads would turn one MessagePort crossing into five.
 *
 * Keyed on the writings library for the reason `useWikiTopic` is — the EGW
 * group is answered out of the installed library, so downloading a book has to
 * make a repeated lookup say more than it did before, and the download mutation
 * already invalidates this key.
 *
 * The payload carries `context` as an optional verse address, which is what the
 * Strong's group's entry condition reads. `Option.getOrUndefined` is the wire's
 * own spelling of an absent optional field, and the procedure declares it as
 * `Schema.optional` on the far side.
 */
export const useLookup = (
  input: Accessor<{
    readonly text: string;
    readonly context: Option.Option<VerseReference>;
  }>,
): Accessor<LookupResult> =>
  useAtomSuspense(() =>
    keyedQuery([WRITINGS_LIBRARY_KEY], (options) => {
      // One read of the accessor, because the two fields describe one
      // selection. Read twice, the text can come from the gesture the reader
      // just finished and the context from the one before it — a Strong's
      // group about words nobody selected.
      const selection = input();
      return ReadingRpc.query(
        'v1.wiki.lookup.resolve',
        { text: selection.text, context: Option.getOrUndefined(selection.context) },
        options,
      );
    }),
  );

/** §9's hybrid search over the writings, as one read.
 *
 * Keyed on `WRITINGS_LIBRARY_KEY` for the reason `useLookup` is: installing a
 * book changes what search can answer, and the download mutation already
 * invalidates that key. An unkeyed read would keep serving results from a
 * library the reader has since added to.
 *
 * The three narrowings travel as one value read once. Read separately, a scope
 * from the gesture the reader just made could pair with a book code from the one
 * before it — a query nobody asked for. `Option.getOrUndefined` is the wire's
 * own spelling of an absent optional field, which is how
 * `SearchQueryProcedure` declares all three.
 */
export const useSearch = (
  input: Accessor<{
    readonly text: string;
    readonly scope: Option.Option<CorpusScope>;
    readonly bookCode: Option.Option<string>;
  }>,
): Accessor<SearchResult> =>
  useAtomSuspense(() =>
    keyedQuery([WRITINGS_LIBRARY_KEY], (options) => {
      const request = input();
      return ReadingRpc.query(
        'v1.search.query',
        {
          text: request.text,
          scope: Option.getOrUndefined(request.scope),
          bookCode: Option.getOrUndefined(request.bookCode),
        },
        options,
      );
    }),
  );

export const useTopics = (input: Accessor<TopicListInput>): Accessor<readonly TopicSummary[]> =>
  useAtomSuspense(() => ReadingRpc.query('v1.topics.list', input()));

export const useTopicDetail = (input: Accessor<{ readonly id: TopicId }>): Accessor<TopicDetail> =>
  useAtomSuspense(() => ReadingRpc.query('v1.topics.get', input()));

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

type LibraryMutation = MutationCommitValue<{}>;

/**
 * A mutation whose promise waits for the reads it staled.
 *
 * `useAtomSet(..., { mode: 'promise' })` settles on the RPC's own result, at
 * which point `Reactivity` has only *started* the dependent refreshes. The
 * retired cache resolved a mutation after every matching active query had
 * finished refreshing, and callers depend on that: a component that awaits a
 * mutation before clearing a busy flag or navigating is promised the reads it
 * can then see are post-mutation reads. This hook restores the contract by
 * running the setter inside {@link withSettledQueries}.
 *
 * The registry is resolved once here, from the same `RegistryContext` the
 * setter itself uses, so the queries waited on are the ones this owner tree
 * actually holds.
 */
const useSettled = (): (<A>(keys: readonly string[], mutate: () => Promise<A>) => Promise<A>) => {
  const registry = useContext(RegistryContext);
  return (keys, mutate) => withSettledQueries(registry, keys, mutate);
};

/**
 * Every library change goes through one procedure, so one mutation atom
 * serves them all; the keys it invalidates are derived from the command.
 */
export const useLibraryMutation = (): ((
  command: LibraryMutationCommand,
) => Promise<LibraryMutation>) => {
  const mutate = useAtomSet(() => ReadingRpc.mutation('v1.library.mutate'), { mode: 'promise' });
  const settled = useSettled();
  return (command) => {
    const reactivityKeys = keysForLibraryMutation(command);
    return settled(reactivityKeys, () => mutate({ payload: { command }, reactivityKeys }));
  };
};

export const useReadingPreferencesMutation = (): ((
  patch: ReadingPreferencesPatch,
) => Promise<MutationCommitValue<ReadingPreferences>>) => {
  const mutate = useAtomSet(() => ReadingRpc.mutation('v1.preferences.reading.patch'), {
    mode: 'promise',
  });
  const settled = useSettled();
  const reactivityKeys = keysForScope({ _tag: 'ReadingPreferences' });
  return (patch) => settled(reactivityKeys, () => mutate({ payload: { patch }, reactivityKeys }));
};

export interface RecordReadingCommand {
  readonly location: ReaderLocation;
  readonly progress: number;
}

export const useRecordReading = (): ((
  command: RecordReadingCommand,
) => Promise<LibraryMutation>) => {
  const mutate = useAtomSet(() => ReadingRpc.mutation('v1.reading.continuity.record'), {
    mode: 'promise',
  });
  const settled = useSettled();
  const reactivityKeys = keysForScope({ _tag: 'ReadingContinuity' });
  return (command) => settled(reactivityKeys, () => mutate({ payload: command, reactivityKeys }));
};

export type WritingsLibraryCommand =
  | { readonly _tag: 'DownloadPublication'; readonly publicationId: PublicationId }
  | { readonly _tag: 'DownloadAll' };

/**
 * One publication or the whole archive. Both invalidate the writings-library
 * key, which is what refreshes the combined library read.
 */
export const useWritingsDownload = (): ((
  command: WritingsLibraryCommand,
) => Promise<readonly WritingsDownloadResult[]>) => {
  const downloadOne = useAtomSet(
    () => ReadingRpc.mutation('v1.reading.writingsPublication.download'),
    { mode: 'promise' },
  );
  const downloadAll = useAtomSet(
    () => ReadingRpc.mutation('v1.reading.writingsLibrary.downloadAll'),
    {
      mode: 'promise',
    },
  );
  const settled = useSettled();
  const reactivityKeys = keysForScope({ _tag: 'WritingsLibrary' });
  return (command) =>
    settled(reactivityKeys, () => {
      if (command._tag === 'DownloadPublication') {
        return downloadOne({
          payload: { publicationId: command.publicationId },
          reactivityKeys,
        }).then((result) => [result]);
      }
      return downloadAll({ payload: NO_PAYLOAD, reactivityKeys });
    });
};

export interface DataPortability {
  readonly export: () => Promise<string>;
  readonly import: (document: string) => Promise<{ readonly imported: number }>;
}

/**
 * Export and import move the whole library at once. They are not cached
 * reads, so they run as mutation atoms; an import replaces everything, so it
 * invalidates every area the cache holds.
 */
export const useDataPortability = (): DataPortability => {
  const exportLibrary = useAtomSet(() => ReadingRpc.mutation('v1.data.export'), {
    mode: 'promise',
  });
  const importLibrary = useAtomSet(() => ReadingRpc.mutation('v1.data.import'), {
    mode: 'promise',
  });
  const settled = useSettled();
  return {
    // An export stales nothing, so its promise has nothing to wait for.
    export: () => exportLibrary({ payload: NO_PAYLOAD }),
    import: (document) =>
      settled(EVERY_CACHED_AREA, () =>
        importLibrary({ payload: { document }, reactivityKeys: EVERY_CACHED_AREA }),
      ),
  };
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ReadingDataProviderProps extends ParentProps {
  readonly procedures: ProcedureClient;
}

/**
 * Owns one atom registry for the reading session and seeds it with the host's
 * procedure client. The registry disposes with the Solid owner, which is what
 * ends every in-flight request the cache started.
 *
 * The two components are composed with `createComponent` rather than JSX for
 * the same reason `RegistryProvider` is: a provider that only nests two
 * components and passes children through needs no markup, and staying out of
 * JSX keeps this module readable from a plain test.
 */
export const ReadingDataProvider = (props: ReadingDataProviderProps) =>
  createComponent(RegistryProvider, {
    get children() {
      return createComponent(ProcedureClientBridge, {
        get procedures() {
          return props.procedures;
        },
        get children() {
          return props.children;
        },
      });
    },
  });

const ProcedureClientBridge = (props: ReadingDataProviderProps) => {
  useAtomInitialValues([[procedureClientAtom, props.procedures]]);
  return props.children;
};
