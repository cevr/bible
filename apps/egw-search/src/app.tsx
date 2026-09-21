/* oxlint-disable effect/noNullish -- the wire shape is JSON (see ../server/api.ts); `null` is what an absent refcode or link arrives as. */

/**
 * EGW searcher — effect-frame views over the search query.
 *
 * **The URL is the state.** The router decodes the query string into the
 * workspace (`props.search`, one `SearchParams` per pane) and publishes every
 * navigation into that `Source`. Submitting a query or toggling a filter is a
 * `router.navigate` call, not a state write, so every view the app can show
 * has a link, and the back button works without any code that knows what
 * "back" means. See `./url-state.ts`.
 *
 * **The async states are the framework's.** `followQuery` keeps the previous
 * result on screen, marked stale, while the next one loads; `Query` draws the
 * skeleton, the failure with a retry, or the results with a stale flag.
 * Nothing here holds a pending flag.
 *
 * **Panes are rows.** `View.list` gives each pane a setup of its own — its
 * query, its draft, its filter panel — in a scope that closes when the pane
 * does. A pane is keyed by its position, which is what keeps its local state
 * when a neighbour opens or closes.
 */

import type { QueryFailure, QueryState } from 'effect-frame/actor/client';
import { Cell, followQuery, isReady, match, select, Source, zip } from 'effect-frame/actor/client';
import type { RouteProps } from 'effect-frame/router';
import { Router } from 'effect-frame/router';
import type { Child, Node } from 'effect-frame/view';
import { For, Query, Show, View } from 'effect-frame/view';
import { Effect, Option, Predicate } from 'effect';

import {
  type BookSubtype,
  type BookType,
  type CorpusScope,
  type CorpusSection,
  SELECTABLE_SUBTYPES,
  type SearchResponse,
} from '../server/api.js';
import { contextSide } from './context-window.js';
import { Search, type SearchRequest } from './contract.js';
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

type Hit = SearchResponse['hits'][number];
type ContextParagraph = Hit['before'][number];

/** Paragraphs *fetched* on each side of a match, which is not the number shown.
 *
 *  One neighbour is usually the sentence that makes the hit land; more turns
 *  the results page into a reader. So the page renders {@link CONTEXT_SHOWN}
 *  and keeps the rest for the expand control — fetching the full radius up
 *  front means "show more" is instant and costs no second request. */
const CONTEXT = 3;

/** Paragraphs shown on each side before the reader asks for more. */
const CONTEXT_SHOWN = 1;

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
// The page
// ---------------------------------------------------------------------------

export type Workspace = ReadonlyArray<SearchParams>;

interface WorkspaceProps {
  /** Every pane, as the URL names them. */
  readonly panes: Source<Workspace>;
  /** Replace one pane, leaving the others exactly as they are. The workspace
   *  is what navigates; a pane only ever describes itself. */
  readonly put: (
    index: number,
    next: SearchParams,
    options: { readonly replace: boolean },
  ) => Effect.Effect<void>;
  readonly close: (index: number) => Effect.Effect<void>;
}

/** A pane's row in the list: its position is its key. */
interface PaneRow {
  readonly key: string;
  readonly index: number;
}

const pluralResults = (count: number): string => {
  if (count === 1) return '1 result';
  return `${String(count)} results`;
};

const canAddPane = (count: number): boolean => count < MAX_PANES;

export const SearchPage = Effect.fn('SearchPage')(function* (
  props: RouteProps<unknown, Workspace>,
) {
  const router = yield* Router;
  const panes = props.search;
  const count = select(panes, (list) => list.length);

  const go = (next: Workspace, replace: boolean): Effect.Effect<void> =>
    router.navigate(toWorkspaceString(next), { replace });

  const workspace: WorkspaceProps = {
    panes,
    put: (index, next, options) =>
      Effect.flatMap(panes.get, (current) =>
        go(
          current.map((existing, position) => {
            if (position === index) return next;
            return existing;
          }),
          options.replace,
        ),
      ),
    close: (index) =>
      Effect.flatMap(panes.get, (current) => {
        if (current.length <= 1) return Effect.void;
        return go(
          current.filter((_, position) => position !== index),
          false,
        );
      }),
  };

  // The new pane inherits the previous pane's filters but none of its
  // query: a second pane is almost always the same corpus asked a different
  // question.
  const addPane = Effect.flatMap(panes.get, (current) => {
    if (current.length >= MAX_PANES) return Effect.void;
    const last = Option.getOrElse(
      Option.fromNullishOr(current[current.length - 1]),
      () => EMPTY_PARAMS,
    );
    return go([...current, { ...last, q: '' }], false);
  });

  const rows: Source<ReadonlyArray<PaneRow>> = select(panes, (list) =>
    list.map((_, index) => ({ key: String(index), index })),
  );
  const paneList = yield* View.list({
    each: rows,
    keyBy: (row: PaneRow) => row.key,
    row: (row: Source<PaneRow>) =>
      Effect.flatMap(row.get, (current) => Pane({ index: current.index, workspace })),
  });

  return (
    <div class="shell">
      <header class="masthead">
        <h1>EGW&nbsp;Search</h1>
        <Show when={count} is={canAddPane}>
          <button type="button" class="addpane" onClick={View.event(() => addPane)}>
            + pane
          </button>
        </Show>
      </header>
      <div class="panes" data-count={View.bind(count, String)}>
        {paneList}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// One pane
// ---------------------------------------------------------------------------

interface PaneProps {
  readonly index: number;
  readonly workspace: WorkspaceProps;
}

const hasSeveral = (list: Workspace): boolean => list.length > 1;

const Pane = Effect.fn('Pane')(function* (props: PaneProps) {
  const router = yield* Router;
  const { workspace, index } = props;

  /** This pane's slice of the workspace. Every read below goes through it,
   *  so a pane never sees another pane's query. */
  const params: Source<SearchParams> = select(workspace.panes, (list) =>
    Option.getOrElse(Option.fromNullishOr(list[index]), () => EMPTY_PARAMS),
  );

  /** The text in the box, uncommitted — the only state not in the URL,
   *  because a half-typed query is not a place anyone wants to link to.
   *  `None` means "nothing typed since the last navigation", which is what
   *  makes the box follow the back button. */
  const typed = yield* Cell.make(Option.none<string>());
  yield* Source.on(router.navigations, () => typed.set(Option.none()));
  const draft = zip(typed.state, params, (text, current) =>
    Option.getOrElse(text, () => current.q),
  );

  const put = (next: SearchParams, replace: boolean) => workspace.put(index, next, { replace });
  const search = (value: string) =>
    Effect.flatMap(params.get, (current) => put({ ...current, q: value.trim() }, false));
  /** Replace the filters, keeping the query. `replace` rather than `push` so
   *  the back button returns to the previous *search* rather than walking
   *  back through each toggle the reader tried. */
  const refine = (f: (current: SearchParams) => SearchParams) =>
    Effect.flatMap(params.get, (current) => put(f(current), true));

  const args: Source<Option.Option<SearchRequest>> = select(params, (current) => {
    if (current.q.trim() === '') return Option.none();
    return Option.some(toRequest(current, CONTEXT));
  });
  const results = yield* followQuery(Search, args);

  const filters = yield* Filters({ params, refine });
  const status = Status({ params, state: results.state });
  const region = yield* ResultsRegion({ params, results, search, refine });

  return (
    <section class="pane">
      <Show when={workspace.panes} is={hasSeveral}>
        <button
          type="button"
          class="closepane"
          aria-label={`Close pane ${String(index + 1)}`}
          onClick={View.event(() => workspace.close(index))}
        >
          ✕
        </button>
      </Show>
      <form class="searchbar" onSubmit={View.submit(() => Effect.flatMap(draft.get, search))}>
        <input
          type="search"
          value={View.bind(draft)}
          placeholder="search the writings…"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          onInput={View.event((event) => typed.set(Option.some(event.value)))}
        />
        <button type="submit" disabled={View.bind(draft, (text) => text.trim() === '')}>
          Search
        </button>
      </form>
      {filters}
      {status}
      <Show
        when={params}
        is={hasQuery}
        fallback={Empty({ params, nonSelective: false, search, refine })}
      >
        {region}
      </Show>
    </section>
  );
});

const hasQuery = (current: SearchParams): boolean => current.q.trim() !== '';

// ---------------------------------------------------------------------------
// The filter panel
// ---------------------------------------------------------------------------

interface FiltersProps {
  readonly params: Source<SearchParams>;
  readonly refine: (f: (current: SearchParams) => SearchParams) => Effect.Effect<void>;
}

const chipClass = (active: boolean): string => {
  if (active) return 'chip on';
  return 'chip';
};

/** One toggle. A `button` with `aria-pressed` rather than a checkbox: these
 *  are filters that take effect immediately, not a form to submit, and the
 *  pressed state is what a screen reader should hear. */
const Chip = (props: {
  readonly label: string;
  readonly active: Source<boolean>;
  readonly onPick: Effect.Effect<void>;
}): Node => (
  <button
    type="button"
    class={View.bind(props.active, chipClass)}
    aria-pressed={View.bind(props.active, String)}
    onClick={View.event(() => props.onPick)}
  >
    {props.label}
  </button>
);

const signedClass = (sign: Sign): string => {
  if (sign === 'off') return 'chip';
  return `chip ${sign}`;
};

const signedTitle = (label: string, sign: Sign): string => {
  if (sign === 'exclude') return `Excluding ${label} — click to clear`;
  if (sign === 'include') return `Only ${label} — click to exclude`;
  return `Click to require ${label}, twice to exclude`;
};

const signedName = (label: string, sign: Sign): string => {
  if (sign === 'exclude') return `${label}, excluded`;
  return label;
};

const signGlyph = (sign: Sign): string => {
  if (sign === 'include') return '✓';
  return '−';
};

const isSigned = (sign: Sign): boolean => sign !== 'off';

/**
 * A chip over one value of a signed axis: off → include → exclude → off.
 *
 * `aria-pressed` cannot say "excluded" — it is a two-state attribute — so the
 * sign is carried in the accessible name instead (`"Devotionals, excluded"`),
 * and `aria-pressed` reports whether the chip is doing anything at all.
 */
const SignedChip = (props: {
  readonly label: string;
  readonly sign: Source<Sign>;
  readonly onPick: Effect.Effect<void>;
}): Node => (
  <button
    type="button"
    class={View.bind(props.sign, signedClass)}
    aria-pressed={View.bind(props.sign, (sign) => String(isSigned(sign)))}
    aria-label={View.bind(props.sign, (sign) => signedName(props.label, sign))}
    title={View.bind(props.sign, (sign) => signedTitle(props.label, sign))}
    onClick={View.event(() => props.onPick)}
  >
    <Show when={props.sign} is={isSigned}>
      <span class="csign" aria-hidden="true">
        {View.bind(props.sign, signGlyph)}
      </span>
    </Show>
    {props.label}
  </button>
);

const FilterRow = (props: { readonly label: string; readonly children: Child }): Node => (
  <div class="frow">
    <span class="flabel">{props.label}</span>
    <div class="fchips">{props.children}</div>
  </div>
);

const toggleLabel = (open: boolean): string => {
  if (open) return '− Filters';
  return '+ Filters';
};

/**
 * Collapsed by default behind a summary, because on a first visit the
 * filters are noise. Once something is set, the summary says what, so a
 * narrowed search never looks like an empty one.
 */
const Filters = Effect.fn('Filters')(function* (props: FiltersProps) {
  const { params, refine } = props;
  const open = yield* Cell.make(false);

  return (
    <div class="filters">
      <div class="fhead">
        <button
          type="button"
          class="ftoggle"
          aria-expanded={View.bind(open.state, String)}
          onClick={View.event(() => open.update((value) => !value))}
        >
          {View.bind(open.state, toggleLabel)}
        </button>
        <Show when={params} is={hasFilters}>
          <button
            type="button"
            class="fclear"
            onClick={View.event(() => refine((current) => ({ ...EMPTY_PARAMS, q: current.q })))}
          >
            clear
          </button>
        </Show>
      </div>

      <Show when={open.state}>
        <div class="fbody">
          <FilterRow label="Library">
            {SECTIONS.map((entry) =>
              SignedChip({
                label: entry.label,
                sign: select(params, (current) => signOf(current.section, entry.value)),
                onPick: refine((current) => toggle(current, 'section', entry.value)),
              }),
            )}
          </FilterRow>

          <FilterRow label="Author">
            {SCOPES.map((entry) =>
              Chip({
                label: entry.label,
                active: select(params, (current) => current.scope === entry.value),
                onPick: refine((current) => ({ ...current, scope: entry.value })),
              }),
            )}
          </FilterRow>

          <FilterRow label="Kind">
            {TYPES.map((entry) =>
              SignedChip({
                label: entry.label,
                sign: select(params, (current) => signOf(current.type, entry.value)),
                onPick: refine((current) => toggle(current, 'type', entry.value)),
              }),
            )}
          </FilterRow>

          <FilterRow label="Form">
            {SELECTABLE_SUBTYPES.map((entry) =>
              SignedChip({
                label: SUBTYPE_LABELS[entry],
                sign: select(params, (current) => signOf(current.subtype, entry)),
                onPick: refine((current) => toggle(current, 'subtype', entry)),
              }),
            )}
          </FilterRow>

          <FilterRow label="Apparatus">
            {Chip({
              label: 'Hide dictionaries & indexes',
              active: select(params, (current) => current.excludeApparatus),
              onPick: refine((current) => ({
                ...current,
                excludeApparatus: !current.excludeApparatus,
              })),
            })}
          </FilterRow>
        </div>
      </Show>
    </div>
  );
});

// ---------------------------------------------------------------------------
// The status line and the results region
// ---------------------------------------------------------------------------

type SearchState = QueryState<SearchResponse, QueryFailure>;

const readyLabel = (query: string, value: SearchResponse, stale: boolean): string => {
  if (stale) return `searching “${query}”…`;
  if (value.nonSelective) return `“${query}” — too common to rank`;
  return `“${query}” — ${pluralResults(value.hits.length)}`;
};

/** What the status line says. The non-selective case must precede the count:
 *  it *has* no count, and "0 results" for a word in half the corpus states
 *  the opposite of what happened. */
const statusLabel = (params: SearchParams, state: SearchState): string => {
  const query = params.q;
  if (query === '') return 'awaiting query';
  return match(state, {
    Loading: () => `searching “${query}”…`,
    Failed: () => `“${query}” — failed`,
    Ready: ({ value, stale }) => readyLabel(query, value, stale),
  });
};

const Status = (props: {
  readonly params: Source<SearchParams>;
  readonly state: Source<SearchState>;
}): Node => {
  const label = zip(props.params, props.state, statusLabel);
  return (
    <div class="status">
      <span>{View.bind(label)}</span>
      <Show when={props.params} is={hasFilters}>
        <span class="filtered">filtered</span>
      </Show>
    </div>
  );
};

/** Nothing to show: no query yet, a query that matched nothing, or a query
 *  too common to rank. Offers the examples in every case, since all three
 *  want the same next step — a different query. */
const Empty = (props: {
  readonly params: Source<SearchParams>;
  readonly nonSelective: boolean;
  readonly search: (value: string) => Effect.Effect<void>;
  readonly refine: (f: (current: SearchParams) => SearchParams) => Effect.Effect<void>;
}): Node => {
  const { params } = props;
  const narrowed = select(params, (current) => current.q !== '' && hasFilters(current));
  const heading = (current: SearchParams): string => {
    if (props.nonSelective) return 'too common to rank';
    if (current.q === '') return 'no query yet';
    return 'no matches';
  };
  return (
    <div class="empty">
      <div>{View.bind(params, heading)}</div>
      <Show when={select(params, () => props.nonSelective)}>
        <div class="hint">
          “{View.bind(params, (current) => current.q)}” appears in a large share of the corpus, so
          ranking it would not surface anything in particular. Add a word or two to narrow it.
        </div>
      </Show>
      <Show
        when={narrowed}
        fallback={
          <div class="examples">
            {EXAMPLES.map((example) => (
              <button type="button" onClick={View.event(() => props.search(example))}>
                {example}
              </button>
            ))}
          </div>
        }
      >
        <div class="examples">
          <button
            type="button"
            onClick={View.event(() =>
              props.refine((current) => ({ ...EMPTY_PARAMS, q: current.q })),
            )}
          >
            clear filters and search again
          </button>
        </div>
      </Show>
    </div>
  );
};

/** First search only: rows in the shape of the answer, so the page does not
 *  jump when results land. Line widths are uneven so it reads as prose. */
const SKELETON_ROWS: readonly (readonly string[])[] = [
  ['92%', '88%', '64%'],
  ['85%', '94%', '71%'],
  ['90%', '79%'],
  ['88%', '91%', '58%'],
];

const Skeleton = (): Node => (
  <ul class="results" aria-busy="true">
    {SKELETON_ROWS.map((lines) => (
      <li class="hit skeleton">
        <div class="meta">
          <span class="sk sk-ref" />
          <span class="sk sk-book" />
        </div>
        <div class="body">
          {lines.map((width) => (
            <span class="sk sk-line" style={`width: ${width}`} />
          ))}
        </div>
      </li>
    ))}
  </ul>
);

/** The failure is typed: every query failure carries a tag, and the ones the
 *  handler raises carry the handler's own message as `detail`. */
const carriesDetail = Predicate.or(
  Predicate.isTagged('QueryFailed'),
  Predicate.isTagged('InvalidQueryArgs'),
);

const describeFailure = (error: QueryFailure): string => {
  if (carriesDetail(error)) return error.detail;
  return error._tag;
};

interface ResultsProps {
  readonly params: Source<SearchParams>;
  readonly results: {
    readonly state: Source<SearchState>;
    readonly refresh: Effect.Effect<void>;
  };
  readonly search: (value: string) => Effect.Effect<void>;
  readonly refine: (f: (current: SearchParams) => SearchParams) => Effect.Effect<void>;
}

const resultsClass = (stale: boolean): string => {
  if (stale) return 'results stale';
  return 'results';
};

interface Row {
  readonly key: string;
  readonly hit: Hit;
}

const isFresh = (state: SearchState): boolean => isReady(state) && !state.stale;

const hasHits = (value: SearchResponse): boolean => value.hits.length > 0;

/**
 * One `Query` over the three states. The first search draws skeletons
 * because there is no value yet; a re-search keeps the old results on
 * screen, dimmed, because `followQuery` carries them as stale; a failure
 * shows one fallback with a retry.
 */
const ResultsRegion = Effect.fn('ResultsRegion')(function* (props: ResultsProps) {
  const { params, results } = props;

  // Which rows the reader has expanded, by position. Reset whenever a
  // fresh answer lands: the rows are a different page then.
  const expanded = yield* Cell.make<ReadonlySet<string>>(new Set());
  yield* Source.on(results.state, (state) => {
    if (isFresh(state)) return expanded.set(new Set());
    return Effect.void;
  });
  const expand = (key: string) => expanded.update((keys) => new Set([...keys, key]));

  return (
    <Query
      state={results.state}
      loading={Skeleton()}
      failed={(error) => (
        <div class="status">
          <span class="err">search failed — {View.bind(error, describeFailure)}</span>
          <button type="button" onClick={View.event(() => results.refresh)}>
            retry
          </button>
        </div>
      )}
      ready={(value, stale) => {
        const rows: Source<ReadonlyArray<Row>> = select(value, (current) =>
          current.hits.map((hit, position) => ({ key: String(position), hit })),
        );
        return (
          <Show
            when={value}
            is={hasHits}
            fallback={Empty({
              params,
              nonSelective: false,
              search: props.search,
              refine: props.refine,
            })}
          >
            <ul class={View.bind(stale, resultsClass)} aria-busy={View.bind(stale, String)}>
              <For each={rows} keyBy={(row: Row) => row.key}>
                {(row) => HitRow({ row, expanded: expanded.state, expand })}
              </For>
            </ul>
          </Show>
        );
      }}
    />
  );
});

// ---------------------------------------------------------------------------
// One hit
// ---------------------------------------------------------------------------

interface RowState {
  readonly hit: Hit;
  readonly key: string;
  readonly expanded: boolean;
}

interface Paragraph {
  readonly key: string;
  readonly para: ContextParagraph;
}

const keyed = (paragraphs: readonly ContextParagraph[]): ReadonlyArray<Paragraph> =>
  paragraphs.map((para, position) => ({ key: String(position), para }));

/** `before` is in reading order and the nearest neighbour is the *last*
 *  entry, so it is reversed to walk outward, trimmed, then reversed back. */
const beforeSide = (state: RowState) => {
  const outward = [...state.hit.before].reverse();
  const side = contextSide(outward, state.expanded, CONTEXT_SHOWN);
  return { shown: [...side.shown].reverse(), more: side.more };
};

const afterSide = (state: RowState) => contextSide(state.hit.after, state.expanded, CONTEXT_SHOWN);

const matchClass = (state: RowState): string => {
  if (state.hit.isHeading) return 'match heading';
  return 'match';
};

/** A reference, linked when the corpus has a link for it. Rows the corpus
 *  stores without a citation show nothing here, so the book title moves up
 *  and the row does not look like a broken link. */
const Reference = (props: {
  readonly className: string;
  readonly refcode: Source<string | null>;
  readonly url: Source<string | null>;
}): Node => (
  <Show when={props.refcode} is={isPresent}>
    {(refcode) => (
      <Show
        when={props.url}
        is={isPresent}
        fallback={<span class={props.className}>{View.bind(refcode)}</span>}
      >
        {(url) => (
          <a
            class={props.className}
            href={View.bind(url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {View.bind(refcode)}
          </a>
        )}
      </Show>
    )}
  </Show>
);

const isPresent = (value: string | null): value is string => value !== null;

const HitRow = (props: {
  readonly row: Source<Row>;
  readonly expanded: Source<ReadonlySet<string>>;
  readonly expand: (key: string) => Effect.Effect<void>;
}): Node => {
  const state: Source<RowState> = zip(props.row, props.expanded, (row, keys) => ({
    hit: row.hit,
    key: row.key,
    expanded: keys.has(row.key),
  }));
  const expandThis = View.event(() =>
    Effect.flatMap(props.row.get, (row) => props.expand(row.key)),
  );

  return (
    <li class="hit">
      <div class="meta">
        {Reference({
          className: 'refcode',
          refcode: select(state, (current) => current.hit.refcode),
          url: select(state, (current) => current.hit.url),
        })}
        <span class="book">{View.bind(state, (current) => current.hit.bookTitle)}</span>
        {/* Says what the row *is*, next to where it came from. */}
        <Show when={state} is={(current) => current.hit.isHeading}>
          <span class="kind">Chapter</span>
        </Show>
      </div>
      <div class="body">
        <Show when={state} is={(current) => beforeSide(current).more > 0}>
          <button type="button" class="expand" onClick={expandThis}>
            Show more
          </button>
        </Show>
        <For
          each={select(state, (current) => keyed(beforeSide(current).shown))}
          keyBy={(paragraph: Paragraph) => paragraph.key}
        >
          {(paragraph) => Context({ paragraph })}
        </For>
        {/* The match carries the accent bar; the neighbours carry nothing. */}
        <div class={View.bind(state, matchClass)}>
          <p class="text">{View.bind(state, (current) => current.hit.text)}</p>
        </div>
        <For
          each={select(state, (current) => keyed(afterSide(current).shown))}
          keyBy={(paragraph: Paragraph) => paragraph.key}
        >
          {(paragraph) => Context({ paragraph })}
        </For>
        <Show when={state} is={(current) => afterSide(current).more > 0}>
          <button type="button" class="expand" onClick={expandThis}>
            Show more
          </button>
        </Show>
      </div>
    </li>
  );
};

const contextClass = (paragraph: Paragraph): string => {
  if (paragraph.para.isHeading) return 'context heading';
  return 'context';
};

/** A neighbouring paragraph: smaller and dimmer than the match, but
 *  addressable in its own right — its reference links into egwwritings
 *  exactly as the match's does. The reference trails the text so the three
 *  paragraphs of a hit all begin on prose. */
const Context = (props: { readonly paragraph: Source<Paragraph> }): Node => {
  const { paragraph } = props;
  return (
    <p class={View.bind(paragraph, contextClass)}>
      {View.bind(paragraph, (current) => current.para.text)}
      {Reference({
        className: 'cref',
        refcode: select(paragraph, (current) => current.para.refcode),
        url: select(paragraph, (current) => current.para.url),
      })}
    </p>
  );
};
