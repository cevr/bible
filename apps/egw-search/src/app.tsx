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
 * result on screen, marked stale, while the next one loads; `Loading` draws
 * the skeleton only until a first value exists; `Errored` routes a failure
 * to one fallback with a retry. Nothing here holds a pending flag.
 *
 * **Four fixed pane slots, not a list.** A `For` row cannot run setup — it
 * receives a `Source` and returns a `Node` — and a pane needs setup: its own
 * query, its own draft, its own filter panel. So the page sets four panes up
 * once and shows as many as the URL names. A pane *is* its position, which
 * is also what keeps its local state when a neighbour opens or closes.
 */

import type { LocalActorRef, QueryState, SetValue, Source } from 'effect-frame/actor/client';
import { Behavior, followQuery, modify, select, spawn, zip } from 'effect-frame/actor/client';
import type { RouteProps } from 'effect-frame/router';
import { Router } from 'effect-frame/router';
import type { Capabilities, Child, Node, ReadyValue } from 'effect-frame/view';
import { Errored, For, Loading, Show, View, orErrored, readyWithStale } from 'effect-frame/view';
import { Effect, Option, Predicate, Stream } from 'effect';

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

const EMPTY_RESPONSE: SearchResponse = {
  hits: [],
  scope: 'all',
  vector: 'idle',
  nonSelective: false,
};

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
// Local actor helpers
// ---------------------------------------------------------------------------

/** Write a local actor's value. `ActorStopped` means the view is gone, and a
 *  write to a gone view has nothing left to do. */
function set<A>(ref: LocalActorRef<A, SetValue<A>>, value: A): Effect.Effect<void> {
  return modify(ref, () => value).pipe(Effect.catchTag('ActorStopped', () => Effect.void));
}

function update<A>(ref: LocalActorRef<A, SetValue<A>>, f: (current: A) => A): Effect.Effect<void> {
  return modify(ref, f).pipe(Effect.catchTag('ActorStopped', () => Effect.void));
}

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

const SLOTS: readonly number[] = Array.from({ length: MAX_PANES }, (_, index) => index);

const pluralResults = (count: number): string => {
  if (count === 1) return '1 result';
  return `${String(count)} results`;
};

export const SearchPage = View.make((props: RouteProps<unknown, Workspace>) =>
  Effect.gen(function* () {
    const view = yield* View.Context;
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

    const slots = yield* Effect.forEach(SLOTS, (index) =>
      Pane.setup({ index, workspace, view, router }),
    );

    return (
      <div class="shell">
        <header class="masthead">
          <h1>EGW&nbsp;Search</h1>
          <Show when={select(count, (n) => n < MAX_PANES)}>
            <button type="button" class="addpane" onClick={view.event(() => addPane)}>
              + pane
            </button>
          </Show>
        </header>
        <div class="panes" data-count={view.bind(count, String)}>
          {slots.map((slot, index) => (
            <Show when={select(count, (n) => n > index)}>{slot}</Show>
          ))}
        </div>
      </div>
    );
  }),
);

// ---------------------------------------------------------------------------
// One pane
// ---------------------------------------------------------------------------

interface PaneProps {
  readonly index: number;
  readonly workspace: WorkspaceProps;
  readonly view: Capabilities;
  readonly router: Router['Service'];
}

const Pane = View.make((props: PaneProps) =>
  Effect.gen(function* () {
    const { view, router, workspace, index } = props;

    /** This pane's slice of the workspace. Every read below goes through it,
     *  so a pane never sees another pane's query. A slot the URL does not
     *  name reads the empty params and asks nothing. */
    const params: Source<SearchParams> = select(workspace.panes, (list) =>
      Option.getOrElse(Option.fromNullishOr(list[index]), () => EMPTY_PARAMS),
    );

    /** The text in the box, uncommitted — the only state not in the URL,
     *  because a half-typed query is not a place anyone wants to link to.
     *  `None` means "nothing typed since the last navigation", which is what
     *  makes the box follow the back button. */
    const typed = yield* spawn(Behavior.value(Option.none<string>()));
    yield* Effect.forkScoped(
      Stream.runForEach(router.navigations.changes, () => set(typed, Option.none())),
    );
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

    const hasQuery = select(params, (current) => current.q.trim() !== '');
    const args: Source<Option.Option<SearchRequest>> = select(params, (current) => {
      if (current.q.trim() === '') return Option.none();
      return Option.some(toRequest(current, CONTEXT));
    });
    const results = yield* followQuery(Search, args);

    const filters = yield* Filters.setup({ view, params, refine });
    const status = Status({ view, params, state: results.state });
    const region = yield* ResultsRegion.setup({ view, params, results, search, refine });

    return (
      <section class="pane">
        <Show when={select(workspace.panes, (list) => list.length > 1)}>
          <button
            type="button"
            class="closepane"
            aria-label={`Close pane ${String(index + 1)}`}
            onClick={view.event(() => workspace.close(index))}
          >
            ✕
          </button>
        </Show>
        <form class="searchbar" onSubmit={view.submit(() => Effect.flatMap(draft.get, search))}>
          <input
            type="search"
            value={view.bind(draft)}
            placeholder="search the writings…"
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            onInput={view.event((event) => set(typed, Option.some(event.value)))}
          />
          <button type="submit" disabled={view.bind(draft, (text) => text.trim() === '')}>
            Search
          </button>
        </form>
        {filters}
        {status}
        <Show when={select(hasQuery, (has) => !has)}>
          {Empty({ view, params, nonSelective: false, search, refine })}
        </Show>
        <Show when={hasQuery}>{region}</Show>
      </section>
    );
  }),
);

// ---------------------------------------------------------------------------
// The filter panel
// ---------------------------------------------------------------------------

interface FiltersProps {
  readonly view: Capabilities;
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
  readonly view: Capabilities;
  readonly label: string;
  readonly active: Source<boolean>;
  readonly onPick: Effect.Effect<void>;
}): Node => (
  <button
    type="button"
    class={props.view.bind(props.active, chipClass)}
    aria-pressed={props.view.bind(props.active, String)}
    onClick={props.view.event(() => props.onPick)}
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

/**
 * A chip over one value of a signed axis: off → include → exclude → off.
 *
 * `aria-pressed` cannot say "excluded" — it is a two-state attribute — so the
 * sign is carried in the accessible name instead (`"Devotionals, excluded"`),
 * and `aria-pressed` reports whether the chip is doing anything at all.
 */
const SignedChip = (props: {
  readonly view: Capabilities;
  readonly label: string;
  readonly sign: Source<Sign>;
  readonly onPick: Effect.Effect<void>;
}): Node => (
  <button
    type="button"
    class={props.view.bind(props.sign, signedClass)}
    aria-pressed={props.view.bind(props.sign, (sign) => String(sign !== 'off'))}
    aria-label={props.view.bind(props.sign, (sign) => signedName(props.label, sign))}
    title={props.view.bind(props.sign, (sign) => signedTitle(props.label, sign))}
    onClick={props.view.event(() => props.onPick)}
  >
    <Show when={select(props.sign, (sign) => sign !== 'off')}>
      <span class="csign" aria-hidden="true">
        {props.view.bind(props.sign, signGlyph)}
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
const Filters = View.make((props: FiltersProps) =>
  Effect.gen(function* () {
    const { view, params, refine } = props;
    const open = yield* spawn(Behavior.value(false));
    const active = select(params, hasFilters);

    return (
      <div class="filters">
        <div class="fhead">
          <button
            type="button"
            class="ftoggle"
            aria-expanded={view.bind(open.state, String)}
            onClick={view.event(() => update(open, (value) => !value))}
          >
            {view.bind(open.state, toggleLabel)}
          </button>
          <Show when={active}>
            <button
              type="button"
              class="fclear"
              onClick={view.event(() => refine((current) => ({ ...EMPTY_PARAMS, q: current.q })))}
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
                  view,
                  label: entry.label,
                  sign: select(params, (current) => signOf(current.section, entry.value)),
                  onPick: refine((current) => toggle(current, 'section', entry.value)),
                }),
              )}
            </FilterRow>

            <FilterRow label="Author">
              {SCOPES.map((entry) =>
                Chip({
                  view,
                  label: entry.label,
                  active: select(params, (current) => current.scope === entry.value),
                  onPick: refine((current) => ({ ...current, scope: entry.value })),
                }),
              )}
            </FilterRow>

            <FilterRow label="Kind">
              {TYPES.map((entry) =>
                SignedChip({
                  view,
                  label: entry.label,
                  sign: select(params, (current) => signOf(current.type, entry.value)),
                  onPick: refine((current) => toggle(current, 'type', entry.value)),
                }),
              )}
            </FilterRow>

            <FilterRow label="Form">
              {SELECTABLE_SUBTYPES.map((entry) =>
                SignedChip({
                  view,
                  label: SUBTYPE_LABELS[entry],
                  sign: select(params, (current) => signOf(current.subtype, entry)),
                  onPick: refine((current) => toggle(current, 'subtype', entry)),
                }),
              )}
            </FilterRow>

            <FilterRow label="Apparatus">
              {Chip({
                view,
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
  }),
);

// ---------------------------------------------------------------------------
// The status line and the results region
// ---------------------------------------------------------------------------

type SearchState = QueryState<SearchResponse, unknown>;

/** What the status line says, as a guard chain. The non-selective case must
 *  precede the count: it *has* no count, and "0 results" for a word in half
 *  the corpus states the opposite of what happened. */
const statusLabel = (params: SearchParams, state: SearchState): string => {
  const query = params.q;
  if (query === '') return 'awaiting query';
  if (state._tag === 'Loading') return `searching “${query}”…`;
  if (state._tag === 'Failed') return `“${query}” — failed`;
  if (state.stale) return `searching “${query}”…`;
  if (state.value.nonSelective) return `“${query}” — too common to rank`;
  return `“${query}” — ${pluralResults(state.value.hits.length)}`;
};

const Status = (props: {
  readonly view: Capabilities;
  readonly params: Source<SearchParams>;
  readonly state: Source<SearchState>;
}): Node => {
  const label = zip(props.params, props.state, statusLabel);
  return (
    <div class="status">
      <span>{props.view.bind(label)}</span>
      <Show when={select(props.params, hasFilters)}>
        <span class="filtered">filtered</span>
      </Show>
    </div>
  );
};

/** Nothing to show: no query yet, a query that matched nothing, or a query
 *  too common to rank. Offers the examples in every case, since all three
 *  want the same next step — a different query. */
const Empty = (props: {
  readonly view: Capabilities;
  readonly params: Source<SearchParams>;
  readonly nonSelective: boolean;
  readonly search: (value: string) => Effect.Effect<void>;
  readonly refine: (f: (current: SearchParams) => SearchParams) => Effect.Effect<void>;
}): Node => {
  const { view, params } = props;
  const narrowed = select(params, (current) => current.q !== '' && hasFilters(current));
  const heading = (current: SearchParams): string => {
    if (props.nonSelective) return 'too common to rank';
    if (current.q === '') return 'no query yet';
    return 'no matches';
  };
  return (
    <div class="empty">
      <div>{view.bind(params, heading)}</div>
      <Show when={select(params, () => props.nonSelective)}>
        <div class="hint">
          “{view.bind(params, (current) => current.q)}” appears in a large share of the corpus, so
          ranking it would not surface anything in particular. Add a word or two to narrow it.
        </div>
      </Show>
      <Show when={narrowed}>
        <div class="examples">
          <button
            type="button"
            onClick={view.event(() =>
              props.refine((current) => ({ ...EMPTY_PARAMS, q: current.q })),
            )}
          >
            clear filters and search again
          </button>
        </div>
      </Show>
      <Show when={select(narrowed, (value) => !value)}>
        <div class="examples">
          {EXAMPLES.map((example) => (
            <button type="button" onClick={view.event(() => props.search(example))}>
              {example}
            </button>
          ))}
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

const describeFailure = (error: Option.Option<unknown>): string =>
  Option.match(error, {
    onNone: () => '',
    onSome: (cause) => {
      if (Predicate.hasProperty(cause, 'message') && Predicate.isString(cause.message)) {
        return cause.message;
      }
      if (Predicate.hasProperty(cause, '_tag') && Predicate.isString(cause._tag)) {
        return cause._tag;
      }
      return String(cause);
    },
  });

interface ResultsProps {
  readonly view: Capabilities;
  readonly params: Source<SearchParams>;
  readonly results: {
    readonly state: Source<QueryState<SearchResponse, unknown>>;
    readonly refresh: Effect.Effect<void>;
  };
  readonly search: (value: string) => Effect.Effect<void>;
  readonly refine: (f: (current: SearchParams) => SearchParams) => Effect.Effect<void>;
}

const resultsClass = (ready: ReadyValue<SearchResponse>): string => {
  if (ready.stale) return 'results stale';
  return 'results';
};

interface Row {
  readonly key: string;
  readonly hit: Hit;
}

/**
 * `Errored` outside `Loading`: a failure shows one fallback with a retry,
 * and the loading fallback lets go. Inside, `readyWithStale` is the whole
 * loading strategy — the first search draws skeletons because there is no
 * value yet, and a re-search keeps the old results on screen, dimmed,
 * because there is.
 */
const ResultsRegion = View.make((props: ResultsProps) =>
  Effect.gen(function* () {
    const { view, params, results } = props;
    return yield* Errored({
      fallback: (error) => (
        <div class="status">
          <span class="err">search failed — {view.bind(error, describeFailure)}</span>
          <button type="button" onClick={view.event(() => results.refresh)}>
            retry
          </button>
        </div>
      ),
      children: Loading({
        fallback: Skeleton(),
        children: Effect.gen(function* () {
          const ready = yield* readyWithStale(yield* orErrored(results.state), EMPTY_RESPONSE);
          const rows: Source<ReadonlyArray<Row>> = select(ready, (current) =>
            current.value.hits.map((hit, position) => ({ key: String(position), hit })),
          );
          const none = select(ready, (current) => current.value.hits.length === 0);

          // Which rows the reader has expanded, by position. Reset whenever a
          // fresh answer lands: the rows are a different page then.
          const expanded = yield* spawn(Behavior.value<ReadonlySet<string>>(new Set()));
          yield* Effect.forkScoped(
            Stream.runForEach(
              Stream.filter(
                results.state.changes,
                (state) => state._tag === 'Ready' && !state.stale,
              ),
              () => set(expanded, new Set()),
            ),
          );
          const expand = (key: string) => update(expanded, (keys) => new Set([...keys, key]));

          return (
            <>
              <Show when={none}>
                {Empty({
                  view,
                  params,
                  nonSelective: false,
                  search: props.search,
                  refine: props.refine,
                })}
              </Show>
              <Show when={select(none, (value) => !value)}>
                <ul
                  class={view.bind(ready, resultsClass)}
                  aria-busy={view.bind(ready, (current) => String(current.stale))}
                >
                  <For each={rows} keyBy={(row: Row) => row.key}>
                    {(row) => HitRow({ view, row, expanded: expanded.state, expand })}
                  </For>
                </ul>
              </Show>
            </>
          );
        }),
      }).setup({}),
    }).setup({});
  }),
);

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

const textOf = (value: string | null): string => value ?? '';

const HitRow = (props: {
  readonly view: Capabilities;
  readonly row: Source<Row>;
  readonly expanded: Source<ReadonlySet<string>>;
  readonly expand: (key: string) => Effect.Effect<void>;
}): Node => {
  const { view } = props;
  const state: Source<RowState> = zip(props.row, props.expanded, (row, keys) => ({
    hit: row.hit,
    key: row.key,
    expanded: keys.has(row.key),
  }));
  const expandThis = view.event(() =>
    Effect.flatMap(props.row.get, (row) => props.expand(row.key)),
  );
  const hasRefcode = select(state, (current) => current.hit.refcode !== null);
  const hasUrl = select(state, (current) => current.hit.url !== null);

  return (
    <li class="hit">
      <div class="meta">
        {/* No refcode at all for the rows the corpus stores without a
            citation. The slot is dropped rather than rendered empty, so the
            book title moves up and the row does not look like a broken link. */}
        <Show when={hasRefcode}>
          <>
            <Show when={hasUrl}>
              <a
                class="refcode"
                href={view.bind(state, (current) => textOf(current.hit.url))}
                target="_blank"
                rel="noopener noreferrer"
              >
                {view.bind(state, (current) => textOf(current.hit.refcode))}
              </a>
            </Show>
            <Show when={select(hasUrl, (value) => !value)}>
              <span class="refcode">
                {view.bind(state, (current) => textOf(current.hit.refcode))}
              </span>
            </Show>
          </>
        </Show>
        <span class="book">{view.bind(state, (current) => current.hit.bookTitle)}</span>
        {/* Says what the row *is*, next to where it came from. */}
        <Show when={select(state, (current) => current.hit.isHeading)}>
          <span class="kind">Chapter</span>
        </Show>
      </div>
      <div class="body">
        <Show when={select(state, (current) => beforeSide(current).more > 0)}>
          <button type="button" class="expand" onClick={expandThis}>
            Show more
          </button>
        </Show>
        <For
          each={select(state, (current) => keyed(beforeSide(current).shown))}
          keyBy={(paragraph: Paragraph) => paragraph.key}
        >
          {(paragraph) => Context({ view, paragraph })}
        </For>
        {/* The match carries the accent bar; the neighbours carry nothing. */}
        <div class={view.bind(state, matchClass)}>
          <p class="text">{view.bind(state, (current) => current.hit.text)}</p>
        </div>
        <For
          each={select(state, (current) => keyed(afterSide(current).shown))}
          keyBy={(paragraph: Paragraph) => paragraph.key}
        >
          {(paragraph) => Context({ view, paragraph })}
        </For>
        <Show when={select(state, (current) => afterSide(current).more > 0)}>
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
const Context = (props: {
  readonly view: Capabilities;
  readonly paragraph: Source<Paragraph>;
}): Node => {
  const { view, paragraph } = props;
  const hasRefcode = select(paragraph, (current) => current.para.refcode !== null);
  const hasUrl = select(paragraph, (current) => current.para.url !== null);
  return (
    <p class={view.bind(paragraph, contextClass)}>
      {view.bind(paragraph, (current) => current.para.text)}
      <Show when={hasRefcode}>
        <>
          <Show when={hasUrl}>
            <a
              class="cref"
              href={view.bind(paragraph, (current) => textOf(current.para.url))}
              target="_blank"
              rel="noopener noreferrer"
            >
              {view.bind(paragraph, (current) => textOf(current.para.refcode))}
            </a>
          </Show>
          <Show when={select(hasUrl, (value) => !value)}>
            <span class="cref">
              {view.bind(paragraph, (current) => textOf(current.para.refcode))}
            </span>
          </Show>
        </>
      </Show>
    </p>
  );
};
