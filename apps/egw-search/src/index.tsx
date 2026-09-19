/* oxlint-disable effect/noNullish -- the wire shape is JSON (see ./search.ts); `null` is what an absent refcode or link arrives as. */
/* oxlint-disable effect/noAsyncFunction -- Solid 2's async `createMemo` *is* the resource primitive: it takes an async callback and surfaces its pending and failed states through the boundaries below. */
/* oxlint-disable effect/noTernary -- these are JSX render branches, not domain matches; `Match.value` in an attribute position reads worse and builds a matcher per render. */

/**
 * EGW searcher — Solid 2 + Effect 4.
 *
 * **The URL is the state.** `SearchProvider` holds exactly one signal of its
 * own — the uncommitted text in the box — and reads everything else from
 * `currentParams()`, which parses the address bar. Submitting a query or
 * toggling a filter is a `navigate` call, not a `setState`, so every view the
 * app can show has a link, the back button works without any code that knows
 * what "back" means, and there is no second copy of the query to drift from
 * the one in the URL. See `./url-state.ts`.
 *
 * **The async states are the framework's, not hand-rolled.** Solid 2 ships
 * `isPending` (a request is in flight) and `latest` (the previous settled
 * value while a new one resolves). Together they are stale-while-revalidate:
 * the first search renders skeletons because there is no previous value, and a
 * re-search keeps the old results on screen, dimmed, because there is. An
 * earlier version of this file reimplemented both with signals and a
 * try/finally; these are the primitives that already do it.
 */

import { render } from '@solidjs/web';
import type { Element } from 'solid-js';
import {
  createContext,
  createErrorBoundary,
  createMemo,
  createSignal,
  For,
  isPending,
  latest,
  Show,
  useContext,
} from 'solid-js';

import {
  type BookSubtype,
  type BookType,
  type CorpusScope,
  type CorpusSection,
  SELECTABLE_SUBTYPES,
} from '../server/api.js';
import { runQuery, searchEffect, type ContextParagraph, type Hit } from './search.js';
import {
  currentParams,
  EMPTY_PARAMS,
  hasFilters,
  navigate,
  toggle,
  type SearchParams,
} from './url-state.js';
import './styles.css';

/** Paragraphs shown on each side of a match. One is usually the sentence that
 *  makes the hit land; more turns the results page into a reader. */
const CONTEXT = 1;

const EXAMPLES: readonly string[] = [
  'walk through the fire',
  'time of trouble',
  'latter rain',
  'the shaking',
  'loud cry',
];

// ---------------------------------------------------------------------------
// The filter vocabulary, as the UI labels it
// ---------------------------------------------------------------------------

/** The four libraries, with the paragraph counts measured over the corpus.
 *
 *  Counts are shown because the headline fact about this corpus is invisible
 *  otherwise: Ellen White's own writings are 510k of 3.01M paragraphs, and a
 *  reader who does not know that cannot tell why a search returned mostly
 *  lexicon entries. */
const SECTIONS: readonly { readonly value: CorpusSection; readonly label: string }[] = [
  { value: 'egw-writings', label: 'EGW Writings' },
  { value: 'pioneer-library', label: 'Pioneers' },
  { value: 'reference', label: 'Reference' },
  { value: 'bible', label: 'Bible' },
];

const SCOPES: readonly { readonly value: CorpusScope; readonly label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'egw', label: 'Ellen White' },
  { value: 'pioneer', label: 'Pioneers' },
];

const TYPES: readonly { readonly value: BookType; readonly label: string }[] = [
  { value: 'book', label: 'Books' },
  { value: 'periodical', label: 'Periodicals' },
  { value: 'manuscript', label: 'Letters & MSS' },
  { value: 'bible', label: 'Bible' },
  { value: 'dictionary', label: 'Dictionaries' },
  { value: 'topicalindex', label: 'Topical index' },
  { value: 'scriptindex', label: 'Scripture index' },
];

const SUBTYPE_LABELS = {
  devotional: 'Devotionals',
  commentary: 'Commentaries',
  LtMs: 'Letters & MSS',
  ModernEnglish: 'Modern English',
} satisfies Record<BookSubtype, string>;

// ---------------------------------------------------------------------------
// The one piece of shared state
// ---------------------------------------------------------------------------

/** What every part of the page can read. The provider below is the only thing
 *  that knows *how* any of it is produced. */
interface SearchStore {
  /** The text in the box, uncommitted — the only state not in the URL, because
   *  a half-typed query is not a place anyone wants to link to. */
  readonly draft: () => string;
  readonly setDraft: (value: string) => void;
  /** The committed search state, parsed from the address bar. */
  readonly params: () => SearchParams;
  /** The hits for `params()`. Reading this inside a loading boundary suspends;
   *  reading it through `latest` yields the previous set instead. */
  readonly hits: () => readonly Hit[];
  /** Commit a query — used by the form and by the example chips alike. */
  readonly search: (value: string) => void;
  /** Replace the filters, keeping the query. `replace` rather than `push` so
   *  the back button returns to the previous *search* rather than walking back
   *  through each toggle the reader tried. */
  readonly refine: (next: SearchParams) => void;
}

/** Default-less on purpose: `useContext` throws `ContextNotFoundError` outside
 *  a provider, so a missing provider is a loud bug rather than a silent
 *  `undefined` every consumer would have to guard. */
const SearchContext = createContext<SearchStore>();

const useSearch = (): SearchStore => useContext(SearchContext);

const SearchProvider = (props: { readonly children: Element }) => {
  const [draft, setDraft] = createSignal(currentParams().q);

  /** The request. An async memo is Solid 2's resource: it re-runs when
   *  `currentParams` changes — which is to say when the URL changes, by a
   *  submit, a filter toggle or the back button — and its pending and failed
   *  states are surfaced by the boundaries rather than by flags kept here. */
  const outcome = createMemo(async (): Promise<{ readonly hits: readonly Hit[] }> => {
    const params = currentParams();
    if (params.q === '') return { hits: [] };
    return runQuery(searchEffect(params, CONTEXT), AbortSignal.timeout(40_000));
  });

  const store: SearchStore = {
    draft,
    setDraft,
    params: currentParams,
    hits: () => outcome().hits,
    search: (value) => {
      setDraft(value);
      navigate({ ...currentParams(), q: value.trim() });
    },
    refine: (next) => navigate(next, { replace: true }),
  };

  // Solid 2: the context object *is* its own provider component.
  return <SearchContext value={store}>{props.children}</SearchContext>;
};

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

const App = () => (
  <SearchProvider>
    <div class="shell">
      <header class="masthead">
        <h1>EGW&nbsp;Search</h1>
      </header>
      <SearchBar />
      <Filters />
      <Results />
    </div>
  </SearchProvider>
);

const SearchBar = () => {
  const search = useSearch();

  return (
    <form
      class="searchbar"
      onSubmit={(event) => {
        event.preventDefault();
        search.search(search.draft());
      }}
    >
      <input
        type="search"
        value={search.draft()}
        placeholder="search the writings…"
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        onInput={(event) => search.setDraft(event.currentTarget.value)}
      />
      <button type="submit" disabled={search.draft().trim() === ''}>
        Search
      </button>
    </form>
  );
};

/** One toggle. A `button` with `aria-pressed` rather than a checkbox: these are
 *  filters that take effect immediately, not a form to submit, and the pressed
 *  state is what a screen reader should hear. */
const Chip = (props: {
  readonly label: string;
  readonly active: boolean;
  readonly onPick: () => void;
}) => (
  <button
    type="button"
    class={props.active ? 'chip on' : 'chip'}
    aria-pressed={props.active ? 'true' : 'false'}
    onClick={() => props.onPick()}
  >
    {props.label}
  </button>
);

const FilterRow = (props: { readonly label: string; readonly children: Element }) => (
  <div class="frow">
    <span class="flabel">{props.label}</span>
    <div class="fchips">{props.children}</div>
  </div>
);

/**
 * The filter panel.
 *
 * Collapsed by default behind a summary, because on a first visit the filters
 * are noise — the reader has not searched yet, and every axis is a question
 * about a corpus they have not seen. Once something is set, the summary says
 * what, so a narrowed search never looks like an empty one.
 */
const Filters = () => {
  const search = useSearch();
  const [open, setOpen] = createSignal(false);
  const active = (): boolean => hasFilters(search.params());

  return (
    <div class="filters">
      <div class="fhead">
        <button
          type="button"
          class="ftoggle"
          aria-expanded={open() ? 'true' : 'false'}
          onClick={() => setOpen(!open())}
        >
          {open() ? '− Filters' : '+ Filters'}
        </button>
        <Show when={active()}>
          <button
            type="button"
            class="fclear"
            onClick={() => search.refine({ ...EMPTY_PARAMS, q: search.params().q })}
          >
            clear
          </button>
        </Show>
      </div>

      <Show when={open()}>
        <div class="fbody">
          <FilterRow label="Library">
            <For each={SECTIONS}>
              {(entry) => (
                <Chip
                  label={entry.label}
                  active={search.params().section.includes(entry.value)}
                  onPick={() => search.refine(toggle(search.params(), 'section', entry.value))}
                />
              )}
            </For>
          </FilterRow>

          <FilterRow label="Author">
            <For each={SCOPES}>
              {(entry) => (
                <Chip
                  label={entry.label}
                  active={search.params().scope === entry.value}
                  onPick={() => search.refine({ ...search.params(), scope: entry.value })}
                />
              )}
            </For>
          </FilterRow>

          <FilterRow label="Kind">
            <For each={TYPES}>
              {(entry) => (
                <Chip
                  label={entry.label}
                  active={search.params().type.includes(entry.value)}
                  onPick={() => search.refine(toggle(search.params(), 'type', entry.value))}
                />
              )}
            </For>
          </FilterRow>

          <FilterRow label="Form">
            <For each={SELECTABLE_SUBTYPES}>
              {(entry) => (
                <Chip
                  label={SUBTYPE_LABELS[entry]}
                  active={search.params().subtype.includes(entry)}
                  onPick={() => search.refine(toggle(search.params(), 'subtype', entry))}
                />
              )}
            </For>
          </FilterRow>

          <FilterRow label="Apparatus">
            <Chip
              label="Hide dictionaries & indexes"
              active={search.params().excludeApparatus}
              onPick={() =>
                search.refine({
                  ...search.params(),
                  excludeApparatus: !search.params().excludeApparatus,
                })
              }
            />
          </FilterRow>
        </div>
      </Show>
    </div>
  );
};

/**
 * The results region.
 *
 * `latest(search.hits)` is the whole loading strategy: during a request it
 * yields the previous result set rather than suspending, so a re-search keeps
 * its content and only dims. On the *first* search there is no previous set —
 * it yields empty — and `isPending` picks that case up to render skeletons.
 */
const Results = () => {
  const search = useSearch();

  const body = createErrorBoundary(
    () => {
      const previous = (): readonly Hit[] => latest(search.hits);
      const pending = (): boolean => isPending(search.hits);

      return (
        <>
          <Status pending={pending()} count={previous().length} />
          <Show when={!pending() || previous().length > 0} fallback={<Skeleton />}>
            <Show when={previous().length > 0} fallback={<Empty />}>
              <ul
                class={pending() ? 'results stale' : 'results'}
                aria-busy={pending() ? 'true' : 'false'}
              >
                <For each={previous()}>{(hit) => <HitRow hit={hit} />}</For>
              </ul>
            </Show>
          </Show>
        </>
      );
    },
    (error, reset) => (
      <div class="status">
        <span class="err">search failed — {String(error)}</span>
        <button type="button" onClick={reset}>
          retry
        </button>
      </div>
    ),
  );

  return <>{body()}</>;
};

const Status = (props: { readonly pending: boolean; readonly count: number }) => {
  const search = useSearch();
  const query = (): string => search.params().q;

  return (
    <div class="status">
      <span>
        {props.pending
          ? `searching “${query()}”…`
          : query() === ''
            ? 'awaiting query'
            : `“${query()}” — ${String(props.count)} result${props.count === 1 ? '' : 's'}`}
      </span>
      <Show when={hasFilters(search.params())}>
        <span class="filtered">filtered</span>
      </Show>
    </div>
  );
};

/** Nothing to show: either no query yet, or a query that matched nothing.
 *  Offers the examples either way, since both states want the same next step. */
const Empty = () => {
  const search = useSearch();
  const narrowed = (): boolean => search.params().q !== '' && hasFilters(search.params());

  return (
    <div class="empty">
      <div>{search.params().q === '' ? 'no query yet' : 'no matches'}</div>
      {/* A filtered empty result is the one case where the fix is not a
          different query: say so, and offer the undo rather than the
          examples. */}
      <Show
        when={narrowed()}
        fallback={
          <div class="examples">
            <For each={EXAMPLES}>
              {(example) => (
                <button type="button" onClick={() => search.search(example)}>
                  {example}
                </button>
              )}
            </For>
          </div>
        }
      >
        <div class="examples">
          <button
            type="button"
            onClick={() => search.refine({ ...EMPTY_PARAMS, q: search.params().q })}
          >
            clear filters and search again
          </button>
        </div>
      </Show>
    </div>
  );
};

/** First search only: rows in the shape of the answer, so the page does not
 *  jump when results land. Line widths are uneven so it reads as prose rather
 *  than as a progress bar. */
const SKELETON_ROWS: readonly (readonly string[])[] = [
  ['92%', '88%', '64%'],
  ['85%', '94%', '71%'],
  ['90%', '79%'],
  ['88%', '91%', '58%'],
];

const Skeleton = () => (
  <ul class="results" aria-busy="true">
    <For each={SKELETON_ROWS}>
      {(lines) => (
        <li class="hit skeleton">
          <div class="meta">
            <span class="sk sk-ref" />
            <span class="sk sk-book" />
          </div>
          <div class="body">
            <For each={lines}>{(width) => <span class="sk sk-line" style={{ width }} />}</For>
          </div>
        </li>
      )}
    </For>
  </ul>
);

const HitRow = (props: { readonly hit: Hit }) => (
  <li class="hit">
    <div class="meta">
      <Show when={props.hit.url} fallback={<span class="refcode">{props.hit.refcode}</span>}>
        {(href) => (
          <a class="refcode" href={href()} target="_blank" rel="noopener noreferrer">
            {props.hit.refcode}
          </a>
        )}
      </Show>
      <span class="book">{props.hit.bookTitle}</span>
    </div>
    <div class="body">
      <For each={props.hit.before}>{(para) => <Context para={para} />}</For>
      {/* The match carries the accent bar; the neighbours carry nothing. The
          decoration marks *what you searched for*, so the eye lands on it
          before it reads anything around it. */}
      <div class="match">
        <p class="text">{props.hit.text}</p>
      </div>
      <For each={props.hit.after}>{(para) => <Context para={para} />}</For>
    </div>
  </li>
);

/** A neighbouring paragraph: smaller and dimmer than the match, but addressable
 *  in its own right — its reference links into egwwritings exactly as the
 *  match's does, so a reader who wants the paragraph *before* the hit can open
 *  that one instead. */
const Context = (props: { readonly para: ContextParagraph }) => (
  <p class="context">
    <Show when={props.para.refcode}>
      {(ref) => (
        <Show when={props.para.url} fallback={<span class="cref">{ref()}</span>}>
          {(href) => (
            <a class="cref" href={href()} target="_blank" rel="noopener noreferrer">
              {ref()}
            </a>
          )}
        </Show>
      )}
    </Show>
    {props.para.text}
  </p>
);

const root = document.getElementById('root');
if (root !== null) render(() => <App />, root);
