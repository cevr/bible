/* oxlint-disable effect/noNullish -- the wire shape is JSON (see ../server/api.ts); `null` is what an absent refcode or link arrives as. */
/* oxlint-disable effect/noTernary -- these are JSX render branches, not domain matches; `Match.value` in an attribute position reads worse and builds a matcher per render. */
/* oxlint-disable effect/noGlobals -- a new pane's search box takes the caret on the next frame, once it is in the document. */

/**
 * EGW searcher — Solid 2 + Effect 4.
 *
 * **The URL is the state.** Each pane holds exactly one signal of its own —
 * the uncommitted text in its box — and reads everything else from
 * `currentPanes()`, which parses the address bar. Submitting a query or
 * toggling a filter is an `updateWorkspace` call, not a `setState`, so every
 * view the app can show has a link, and the back button works without any
 * code that knows what "back" means. See `./url-state.ts` and `./history.ts`.
 *
 * **The async states are the framework's, not hand-rolled.** Solid 2 ships
 * `isPending` (a request is in flight) and `latest` (the previous settled
 * value while a new one resolves). Together they are stale-while-revalidate:
 * the first search renders skeletons because there is no previous value, and a
 * re-search keeps the old results on screen, dimmed, because there is.
 */

import { Effect, Option } from 'effect';
import type { Element } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  For,
  isPending,
  latest,
  Loading,
  onCleanup,
  Show,
  untrack,
  useContext,
} from 'solid-js';

import {
  type BookSubtype,
  type BookType,
  type CorpusScope,
  type CorpusSection,
  SELECTABLE_SUBTYPES,
  type SearchResponse,
} from '../server/api.js';
import { contextSide } from './context-window.js';
import { currentPanes, isHome, trackRead, updateWorkspace } from './history.js';
import { remembered, runQuery, search, type ContextParagraph, type Hit } from './search.js';
import {
  EMPTY_PARAMS,
  hasFilters,
  MAX_PANES,
  type SearchParams,
  type Sign,
  signOf,
  toggle,
  toRequest,
  toWorkspaceString,
} from './url-state.js';

/** Paragraphs *fetched* on each side of a match, which is not the number shown.
 *
 *  One neighbour is usually the sentence that makes the hit land; more turns the
 *  results page into a reader. So the page renders {@link CONTEXT_SHOWN} and
 *  keeps the rest for the expand control — fetching the full radius up front
 *  means "show more" is instant and costs no second request. The server caps
 *  this at `MAX_CONTEXT` (3) regardless. */
const CONTEXT = 3;

/** Paragraphs shown on each side before the reader asks for more. */
const CONTEXT_SHOWN = 1;

/** How long a pane's request waits for the reader to stop changing it. The
 *  URL changes at once, for links and history; the request waits for a short
 *  quiet period so rapid filter changes share one request. */
const QUIET = '100 millis';

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
// One pane's state
// ---------------------------------------------------------------------------

/** What a pane's request has come to. `Idle` is the client's own case — no
 *  query yet — rather than anything the server returns. */
type Outcome =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Ready'; readonly response: SearchResponse }
  | { readonly _tag: 'Failed'; readonly message: string };

const IDLE: Outcome = { _tag: 'Idle' };

const hitsOf = (outcome: Outcome): readonly Hit[] =>
  outcome._tag === 'Ready' ? outcome.response.hits : [];

/** What every part of a pane can read. The provider below is the only thing
 *  that knows *how* any of it is produced. */
interface SearchStore {
  /** The text in the box, uncommitted — the only state not in the URL, because
   *  a half-typed query is not a place anyone wants to link to. */
  readonly draft: () => string;
  readonly setDraft: (value: string) => void;
  /** This pane's committed search state, parsed from the address bar. */
  readonly params: () => SearchParams;
  /** The last settled outcome. While a request is in flight this is the
   *  previous one, which is what keeps a re-search's rows on screen. */
  readonly settled: () => Outcome;
  /** Whether a request is owed or in flight for the current URL. */
  readonly pending: () => boolean;
  /** Commit a query — used by the form and by the example chips alike. */
  readonly search: (value: string) => void;
  /** Change the filters, keeping the query. `replace` rather than `push` so
   *  the back button returns to the previous *search* rather than walking back
   *  through each toggle the reader tried. */
  readonly refine: (update: (current: SearchParams) => SearchParams) => void;
  /** Ask again after a failure. */
  readonly retry: () => void;
}

/** Default-less on purpose: `useContext` throws `ContextNotFoundError` outside
 *  a provider, so a missing provider is a loud bug rather than a silent
 *  `undefined` every consumer would have to guard. */
const SearchContext = createContext<SearchStore>();

const useSearch = (): SearchStore => useContext(SearchContext);

const SearchProvider = (props: { readonly pane: number; readonly children: Element }) => {
  /** This pane's slice of the workspace. Every read below goes through it, so
   *  a pane never sees another pane's query. */
  const params = (): SearchParams => currentPanes()[props.pane] ?? EMPTY_PARAMS;

  /** Replace this pane against the workspace as the URL holds it now, leaving
   *  the others exactly as they are. */
  const put = (
    update: (current: SearchParams) => SearchParams,
    options?: { readonly replace?: boolean },
  ): void => {
    updateWorkspace(
      (panes) =>
        panes.map((existing, index) => (index === props.pane ? update(existing) : existing)),
      options,
    );
  };

  /** What the box shows: the committed query, until the reader types — then
   *  what they typed, until this pane's query changes.
   *
   *  `None` means "nothing typed since this pane's query last changed", which
   *  is what makes the box follow the back button. It is keyed on this pane's
   *  own query rather than on every navigation: another pane's filter is a
   *  navigation too, and it must not discard this pane's unsent text. */
  const [typed, setTyped] = createSignal(Option.none<string>());
  const committed = createMemo(() => params().q);
  // Solid 2's `createEffect` takes *two* functions: `compute` is the tracked
  // read, `effect` the untracked reaction to its result.
  createEffect(committed, () => {
    setTyped(Option.none());
  });

  const draft = (): string => Option.getOrElse(typed(), () => params().q);

  /** This pane's request, as a string.
   *
   *  `currentPanes()` re-parses the URL on every navigation and hands back
   *  fresh objects, so a memo that depends on `params()` would re-run whenever
   *  *any* pane changes: adding a fourth pane re-fetched the other three.
   *  Comparing the serialised request instead makes the dependency the request
   *  itself. `toWorkspaceString` is exhaustive over `SearchParams`, so an axis
   *  added later cannot silently drop out of the key. */
  const requestKey = createMemo((): string => {
    const current = params();
    if (current.q.trim() === '') return '';
    return toWorkspaceString([current]);
  });

  /** Whether the first commit has happened.
   *
   *  `render()` builds the tree and then *schedules* the first DOM insertion,
   *  which produces nothing while a memo it depends on is still unsettled — so
   *  a first load with a query in the URL painted no masthead and no search
   *  box until the query came back. Seeding `false` gives the first pass a
   *  *settled* value to commit, so the shell paints; the effect then flips it
   *  and the query starts. */
  const [mounted, setMounted] = createSignal(false);
  createEffect(
    () => undefined,
    () => {
      setMounted(true);
    },
  );

  /** Bumped by a retry: a new input, so the retry reads as pending. */
  const [attempt, setAttempt] = createSignal(0);

  /** The request. An async memo is Solid 2's resource: it re-runs when this
   *  pane's own request changes — by a submit, a filter toggle or the back
   *  button — and a superseded or disposed run aborts its read, which leaves
   *  the batch it was in (see `./batch.ts`).
   *
   *  An answer this page has already seen is drawn at once, without the
   *  quiet period; that is what lets Back and Forward land on their rows. */
  const outcome = createMemo((): Outcome | Promise<Outcome> => {
    const ready = mounted();
    const key = requestKey();
    attempt();
    if (!ready || key === '') return IDLE;
    const request = toRequest(untrack(params), CONTEXT);
    const known = remembered(request);
    if (Option.isSome(known)) return { _tag: 'Ready', response: known.value };
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const read = Effect.andThen(Effect.sleep(QUIET), search(request)).pipe(
      Effect.match({
        onFailure: (error): Outcome => ({ _tag: 'Failed', message: error.message }),
        onSuccess: (response): Outcome => ({ _tag: 'Ready', response }),
      }),
    );
    return trackRead(runQuery(read, controller.signal));
  });

  const store: SearchStore = {
    draft,
    setDraft: (value) => {
      setTyped(Option.some(value));
    },
    params,
    settled: () => latest(outcome),
    // `!mounted()` covers the frame before the query is released; `isPending`
    // covers it once in flight. Either way the reader is waiting.
    pending: () => (!mounted() && requestKey() !== '') || isPending(() => outcome()),
    search: (value) => {
      put((current) => ({ ...current, q: value.trim() }));
    },
    refine: (update) => put(update, { replace: true }),
    retry: () => setAttempt((count) => count + 1),
  };

  // Solid 2: the context object *is* its own provider component.
  return <SearchContext value={store}>{props.children}</SearchContext>;
};

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

/** The page: the workspace on `/`, the not-found view anywhere else. */
export const App = () => (
  <Show when={isHome()} fallback={<NotFound />}>
    <Workspace />
  </Show>
);

/** The server answers every unknown path with the app, so the app is what
 *  says a path is nothing. */
const NotFound = () => (
  <div class="shell">
    <header class="masthead">
      <h1>EGW&nbsp;Search</h1>
    </header>
    <div class="status">
      <span>
        nothing at {window.location.pathname} — <a href="/">search</a>
      </span>
    </div>
  </div>
);

/**
 * The workspace: one or more independent searches, side by side.
 *
 * Each pane is a whole `SearchProvider`, so a pane has its own query, its own
 * filters and its own request, and nothing is shared but the URL they all
 * live in.
 *
 * `keyed={false}`, Solid 2's spelling of Solid 1's `<Index>`: the row is keyed
 * by *position* rather than by item identity. `currentPanes()` parses the URL
 * afresh on every navigation, so every pane object is new on every filter
 * click; keyed by identity, all of them re-mounted and threw away each pane's
 * local UI state. A pane *is* its position.
 */
const Workspace = () => {
  const panes = (): readonly SearchParams[] => currentPanes();

  /** The pane whose search box takes the caret when it mounts: the one the
   *  reader just added, and no other — not the panes of a link, and not the
   *  panes Back restores. */
  let claim: number | undefined;

  const addPane = (): void => {
    updateWorkspace((current) => {
      if (current.length >= MAX_PANES) return current;
      // The new pane inherits the previous pane's filters but none of its
      // query: a second pane is almost always the same corpus asked a
      // different question.
      const last = current[current.length - 1] ?? EMPTY_PARAMS;
      claim = current.length;
      return [...current, { ...last, q: '' }];
    });
  };

  const closePane = (index: number): void => {
    updateWorkspace((current) => {
      if (current.length <= 1) return current;
      return current.filter((_, position) => position !== index);
    });
  };

  /** A new pane's box takes the caret and comes into view — once it is in
   *  the document, which is the frame after it is made. */
  const takeCaret =
    (pane: number) =>
    (input: HTMLInputElement): void => {
      if (claim !== pane) return;
      claim = undefined;
      window.requestAnimationFrame(() => {
        input.focus({ preventScroll: true });
        input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    };

  return (
    <div class="shell">
      <header class="masthead">
        <h1>EGW&nbsp;Search</h1>
        <Show when={panes().length < MAX_PANES}>
          <button type="button" class="addpane" onClick={addPane}>
            + pane
          </button>
        </Show>
      </header>

      <div class="panes" data-count={String(panes().length)}>
        <For each={panes()} keyed={false}>
          {(_params, index) => (
            <SearchProvider pane={index}>
              <section class="pane">
                <Show when={panes().length > 1}>
                  <button
                    type="button"
                    class="closepane"
                    aria-label={`Close pane ${String(index + 1)}`}
                    onClick={() => closePane(index)}
                  >
                    ✕
                  </button>
                </Show>
                <SearchBar ref={takeCaret(index)} />
                <Filters />
                <Results />
              </section>
            </SearchProvider>
          )}
        </For>
      </div>
    </div>
  );
};

const SearchBar = (props: { readonly ref: (input: HTMLInputElement) => void }) => {
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
        ref={props.ref}
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

/**
 * A chip over one value of a signed axis: off → include → exclude → off.
 *
 * `aria-pressed` cannot say "excluded" — it is a two-state attribute — so the
 * sign is carried in the accessible name instead (`"Devotionals, excluded"`),
 * and `aria-pressed` reports whether the chip is doing anything at all.
 */
const SignedChip = (props: {
  readonly label: string;
  readonly sign: Sign;
  readonly onPick: () => void;
}) => (
  <button
    type="button"
    class={props.sign === 'off' ? 'chip' : `chip ${props.sign}`}
    aria-pressed={props.sign === 'off' ? 'false' : 'true'}
    aria-label={props.sign === 'exclude' ? `${props.label}, excluded` : props.label}
    title={
      props.sign === 'exclude'
        ? `Excluding ${props.label} — click to clear`
        : props.sign === 'include'
          ? `Only ${props.label} — click to exclude`
          : `Click to require ${props.label}, twice to exclude`
    }
    onClick={() => props.onPick()}
  >
    <Show when={props.sign !== 'off'}>
      <span class="csign" aria-hidden="true">
        {props.sign === 'include' ? '✓' : '−'}
      </span>
    </Show>
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
 * are noise. Once something is set, the summary says what, so a narrowed
 * search never looks like an empty one.
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
            onClick={() => search.refine((current) => ({ ...EMPTY_PARAMS, q: current.q }))}
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
                <SignedChip
                  label={entry.label}
                  sign={signOf(search.params().section, entry.value)}
                  onPick={() => search.refine((current) => toggle(current, 'section', entry.value))}
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
                  onPick={() => search.refine((current) => ({ ...current, scope: entry.value }))}
                />
              )}
            </For>
          </FilterRow>

          <FilterRow label="Kind">
            <For each={TYPES}>
              {(entry) => (
                <SignedChip
                  label={entry.label}
                  sign={signOf(search.params().type, entry.value)}
                  onPick={() => search.refine((current) => toggle(current, 'type', entry.value))}
                />
              )}
            </For>
          </FilterRow>

          <FilterRow label="Form">
            <For each={SELECTABLE_SUBTYPES}>
              {(entry) => (
                <SignedChip
                  label={SUBTYPE_LABELS[entry]}
                  sign={signOf(search.params().subtype, entry)}
                  onPick={() => search.refine((current) => toggle(current, 'subtype', entry))}
                />
              )}
            </For>
          </FilterRow>

          <FilterRow label="Apparatus">
            <Chip
              label="Hide dictionaries & indexes"
              active={search.params().excludeApparatus}
              onPick={() =>
                search.refine((current) => ({
                  ...current,
                  excludeApparatus: !current.excludeApparatus,
                }))
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
 * `settled()` is the whole loading strategy: during a request it yields the
 * previous outcome rather than suspending, so a re-search keeps its rows and
 * only dims. On the *first* search there are no previous rows, and `pending()`
 * picks that case up to render skeletons.
 *
 * The `<Loading>` boundary is a backstop, not the loading strategy: `latest`
 * and `isPending` deliberately do not throw, so on the normal path it catches
 * nothing. It is here for any pending read not routed through them, so that
 * such a read suspends this region rather than the tree.
 */
const Results = () => {
  const search = useSearch();
  const rows = (): readonly Hit[] => hitsOf(search.settled());
  const failure = (): string | undefined => {
    const current = search.settled();
    return current._tag === 'Failed' ? current.message : undefined;
  };

  return (
    <Loading fallback={<Skeleton />}>
      <Status />
      <Show when={!search.pending() || rows().length > 0} fallback={<Skeleton />}>
        <Show
          when={failure()}
          fallback={
            <Show when={rows().length > 0} fallback={<Empty />}>
              <ul
                class={search.pending() ? 'results stale' : 'results'}
                aria-busy={search.pending() ? 'true' : 'false'}
              >
                {/* Keyed by position: a new answer updates the rows in place
                    rather than rebuilding the list. */}
                <For each={rows()} keyed={false}>
                  {(hit) => <HitRow hit={hit()} />}
                </For>
              </ul>
            </Show>
          }
        >
          {(message) => (
            <div class="status">
              <span class="err">search failed — {message()}</span>
              <button type="button" onClick={() => search.retry()}>
                retry
              </button>
            </div>
          )}
        </Show>
      </Show>
    </Loading>
  );
};

const pluralResults = (count: number): string =>
  count === 1 ? '1 result' : `${String(count)} results`;

const Status = () => {
  const search = useSearch();

  /** What the status line says, as a guard chain rather than nested
   *  ternaries. The non-selective case must precede the count: it *has* no
   *  count, and "0 results" for a word in half the corpus states the opposite
   *  of what happened. */
  const label = (): string => {
    const query = search.params().q;
    if (query === '') return 'awaiting query';
    if (search.pending()) return `searching “${query}”…`;
    const current = search.settled();
    if (current._tag === 'Failed') return `“${query}” — failed`;
    if (current._tag === 'Ready' && current.response.nonSelective) {
      return `“${query}” — too common to rank`;
    }
    return `“${query}” — ${pluralResults(hitsOf(current).length)}`;
  };

  return (
    <div class="status">
      <span>{label()}</span>
      <Show when={hasFilters(search.params())}>
        <span class="filtered">filtered</span>
      </Show>
    </div>
  );
};

/** Nothing to show: no query yet, a query that matched nothing, or a query too
 *  common to rank. Offers the examples in every case, since all three want the
 *  same next step — a different query. */
const Empty = () => {
  const search = useSearch();
  const narrowed = (): boolean => search.params().q !== '' && hasFilters(search.params());
  const nonSelective = (): boolean => {
    const current = search.settled();
    return current._tag === 'Ready' && current.response.nonSelective;
  };

  return (
    <div class="empty">
      {/* Three states, not two. A query the corpus does not contain and a
          query the corpus contains half a million times both arrive here with
          no hits, and telling a reader who searched "the" that there are "no
          matches" would be a plain falsehood. */}
      <Show when={!nonSelective()} fallback={<div>too common to rank</div>}>
        <div>{search.params().q === '' ? 'no query yet' : 'no matches'}</div>
      </Show>
      <Show when={nonSelective()}>
        <div class="hint">
          “{search.params().q}” appears in a large share of the corpus, so ranking it would not
          surface anything in particular. Add a word or two to narrow it.
        </div>
      </Show>
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
            onClick={() => search.refine((current) => ({ ...EMPTY_PARAMS, q: current.q }))}
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

/**
 * One hit, with its context disclosed on demand.
 *
 * The row shows {@link CONTEXT_SHOWN} neighbour on each side and a "Show more"
 * control for the rest. The row is a position in the list, so it outlives
 * the hit it shows; the expansion is held against the hit itself, so a fresh
 * answer starts collapsed while a neighbouring pane's search — which leaves
 * this pane's hits as they are — leaves the expansion alone.
 */
const HitRow = (props: { readonly hit: Hit }) => {
  const [expandedHit, setExpandedHit] = createSignal<Hit | undefined>(undefined);
  const expanded = (): boolean => expandedHit() === props.hit;
  const expand = (): void => {
    setExpandedHit(props.hit);
  };
  // `before` is in reading order and the nearest neighbour is the *last* entry,
  // so it is reversed to walk outward, trimmed, then reversed back for display.
  const before = () => {
    const outward = [...props.hit.before].reverse();
    const side = contextSide(outward, expanded(), CONTEXT_SHOWN);
    return { shown: [...side.shown].reverse(), more: side.more };
  };
  const after = () => contextSide(props.hit.after, expanded(), CONTEXT_SHOWN);
  return (
    <li class="hit">
      <div class="meta">
        <Reference class="refcode" refcode={props.hit.refcode} url={props.hit.url} />
        <span class="book">{props.hit.bookTitle}</span>
        {/* Says what the row *is*, next to where it came from. A chapter title
            and a sentence are otherwise the same shape — a refcode and a line
            of text. */}
        <Show when={props.hit.isHeading}>
          <span class="kind">Chapter</span>
        </Show>
        {/* The server orders back matter last; this says why it is there. */}
        <Show when={props.hit.backMatter}>
          <span class="kind">Back matter</span>
        </Show>
      </div>
      <div class="body">
        <Show when={before().more > 0}>
          <button type="button" class="expand" onClick={expand}>
            Show more
          </button>
        </Show>
        <For each={before().shown}>{(para) => <Context para={para} />}</For>
        {/* The match carries the accent bar; the neighbours carry nothing. The
            decoration marks *what you searched for*, so the eye lands on it
            before it reads anything around it. */}
        <div class={props.hit.isHeading ? 'match heading' : 'match'}>
          <p class="text">{props.hit.text}</p>
        </div>
        <For each={after().shown}>{(para) => <Context para={para} />}</For>
        <Show when={after().more > 0}>
          <button type="button" class="expand" onClick={expand}>
            Show more
          </button>
        </Show>
      </div>
    </li>
  );
};

/** A reference, linked when the corpus has a link for it. Rows the corpus
 *  stores without a citation (signatures, datelines, "this chapter is based
 *  on..." notes) show nothing here, so the book title moves up and the row
 *  does not look like a broken link. */
const Reference = (props: {
  readonly class: string;
  readonly refcode: string | null;
  readonly url: string | null;
}) => (
  <Show when={props.refcode}>
    {(refcode) => (
      <Show when={props.url} fallback={<span class={props.class}>{refcode()}</span>}>
        {(href) => (
          <a class={props.class} href={href()} target="_blank" rel="noopener noreferrer">
            {refcode()}
          </a>
        )}
      </Show>
    )}
  </Show>
);

/** A neighbouring paragraph: smaller and dimmer than the match, but addressable
 *  in its own right — its reference links into egwwritings exactly as the
 *  match's does. The reference trails the text rather than leading it, so the
 *  three paragraphs of a hit all begin on prose. */
const Context = (props: { readonly para: ContextParagraph }) => (
  // A neighbouring heading is the chapter the hit opens under, so it reads as a
  // label rather than as another sentence of prose.
  <p class={props.para.isHeading ? 'context heading' : 'context'}>
    {props.para.text}
    <Reference class="cref" refcode={props.para.refcode} url={props.para.url} />
  </p>
);
