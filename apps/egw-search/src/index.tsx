/* oxlint-disable effect/noNullish -- the wire shape is JSON (see ./search.ts); `null` is what an absent refcode, rank or link arrives as. */
/* oxlint-disable effect/noAsyncFunction -- Solid 2's async `createMemo` *is* the resource primitive: it takes an async callback and surfaces its pending and failed states through the boundaries below. */
/* oxlint-disable effect/noTernary -- these are JSX render branches, not domain matches; `Match.value` in an attribute position reads worse and builds a matcher per render. */

/**
 * EGW searcher — Solid 2 + Effect 4.
 *
 * The reactive shape is Solid 2's async model, not 1.x's: an async
 * `createMemo` *is* the request. It re-runs when the submitted query changes,
 * reads as pending through `createLoadingBoundary` while in flight, and throws
 * into `createErrorBoundary` when it fails. There is no `loading` signal, no
 * `error` signal and no stale-response guard, because the runtime owns all
 * three.
 *
 * The typing is Solid 2's `action(function* ...)` transaction: the submit
 * writes the query and the seeded generation in one atomic step, so the UI
 * never renders a half-applied search.
 */

import { render } from '@solidjs/web';
import {
  action,
  createErrorBoundary,
  createLoadingBoundary,
  createMemo,
  createSignal,
  For,
  Show,
} from 'solid-js';

import {
  runQuery,
  searchEffect,
  type ContextParagraph,
  type Hit,
  type SearchOutcome,
} from './search.js';
import './styles.css';

const SEED = 48173;
const LIMIT = 40;
/** Paragraphs shown on each side of a match. One is usually the sentence that
 *  makes the hit land; more turns the results page into a reader. */
const CONTEXT = 1;

const EXAMPLES = [
  'walk through the fire',
  'time of trouble',
  'latter rain',
  'the shaking',
  'loud cry',
];

const App = () => {
  const [draft, setDraft] = createSignal('');
  const [submitted, setSubmitted] = createSignal('');

  /** One transaction per submit: the draft is normalised and promoted to the
   *  submitted query in a single atomic write, so no intermediate state is
   *  ever observable. */
  const submit = action(function* (raw: string) {
    const next = raw.trim();
    yield;
    setSubmitted(next);
    return next;
  });

  /** The request itself. Async memos are Solid 2's resource: this re-runs on
   *  every change to `submitted`, and its pending/error states are surfaced by
   *  the boundaries below rather than by signals here. */
  const outcome = createMemo(async (): Promise<SearchOutcome> => {
    const query = submitted();
    if (query === '') return { hits: [], vector: 'idle' };
    return runQuery(searchEffect(query, LIMIT, CONTEXT), AbortSignal.timeout(40_000));
  });

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    void submit(draft());
  };

  return (
    <div class="shell">
      <header class="masthead">
        <h1>EGW&nbsp;Search</h1>
        <div class="sub">
          <span>Ellen G. White corpus</span>
          <span>local index</span>
          <span class="seed-tag">seed {SEED}</span>
        </div>
      </header>

      <form class="searchbar" onSubmit={onSubmit}>
        <input
          type="search"
          value={draft()}
          placeholder="search the writings…"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          onInput={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit" disabled={draft().trim() === ''}>
          Search
        </button>
      </form>

      <Results
        query={submitted}
        outcome={outcome}
        onExample={(value) => {
          setDraft(value);
          void submit(value);
        }}
      />
    </div>
  );
};

/** The results region owns both boundaries, so a failed or in-flight search
 *  replaces only the list — the header and the input stay live. */
const Results = (props: {
  readonly query: () => string;
  readonly outcome: () => SearchOutcome;
  readonly onExample: (value: string) => void;
}) => {
  const hits = (): readonly Hit[] => props.outcome().hits;

  const body = createErrorBoundary(
    () =>
      createLoadingBoundary(
        () => (
          <>
            <div class="status">
              <span>
                {props.query() === ''
                  ? 'awaiting query'
                  : `“${props.query()}” — ${String(hits().length)} result${
                      hits().length === 1 ? '' : 's'
                    }`}
              </span>
              <span>{props.outcome().vector}</span>
            </div>

            <Show
              when={hits().length > 0}
              fallback={
                <div class="empty">
                  <div>{props.query() === '' ? 'no query yet' : 'no matches'}</div>
                  <div class="examples">
                    <For each={EXAMPLES}>
                      {(example) => (
                        <button type="button" onClick={() => props.onExample(example)}>
                          {example}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              }
            >
              <ul class="results">
                <For each={hits()}>{(hit) => <HitRow hit={hit} />}</For>
              </ul>
            </Show>
          </>
        ),
        () => (
          <div class="status">
            <span>searching…</span>
            <span>seed {SEED}</span>
          </div>
        ),
      ),
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
      <span class="legs">
        {props.hit.lexicalRank !== null && props.hit.vectorRank !== null
          ? 'text + meaning'
          : props.hit.vectorRank !== null
            ? 'meaning'
            : 'text'}
      </span>
    </div>
    <div class="body">
      <For each={props.hit.before}>{(para) => <Context para={para} />}</For>
      <p class="text">{props.hit.text}</p>
      <For each={props.hit.after}>{(para) => <Context para={para} />}</For>
    </div>
  </li>
);

/** A neighbouring paragraph: same measure as the match, recessed so the eye
 *  still lands on the hit first. */
const Context = (props: { readonly para: ContextParagraph }) => (
  <p class="context">
    <Show when={props.para.refcode}>{(ref) => <span class="cref">{ref()}</span>}</Show>
    {props.para.text}
  </p>
);

const root = document.getElementById('root');
if (root !== null) render(() => <App />, root);
