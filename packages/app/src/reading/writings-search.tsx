/** §9's hybrid search over the writings — the one surface web and desktop share.
 *
 *  Distinct from `bible-search.tsx`, which searches Bible verses: this is the
 *  writings box §9 describes, where a natural-language question, a quoted
 *  phrase and a refcode all go into the same field and the router decides what
 *  each one meant.
 *
 *  Every decision this file *could* have taken lives in `search-state.ts`
 *  instead — which groups exist, what each row says about why it is present,
 *  what to tell a reader whose vector leg did not run. What is left here is
 *  markup, which is the half a DOM-less unit test cannot state and
 *  `apps/desktop/e2e/search-hybrid.spec.ts` therefore asserts against the
 *  compiled component.
 *
 *  **One read, inside one memo.** `searchView` is called once per result and
 *  every branch below draws that value. `lookup-panel-state.ts` documents in
 *  full why the alternative — reading the live accessor once per branch — draws
 *  one group's count beside another result's rows.
 */

import type { CorpusScope } from '@bible/core/writings';
import { Option } from 'effect';
import { For, Show, createMemo } from 'solid-js';

import { useSearch } from '../runtime/index.js';
import { isSearchable, searchView, type HitProvenance, type SearchView } from './search-state.js';

export interface WritingsSearchProps {
  readonly query: string;
  readonly scope: Option.Option<CorpusScope>;
  readonly bookCode: Option.Option<string>;
}

/** What each provenance is called on screen. A record over the union rather
 *  than a branch, so a fourth provenance fails to typecheck here instead of
 *  rendering as a blank badge. */
const PROVENANCE_LABEL = {
  both: 'text + meaning',
  lexical: 'text',
  vector: 'meaning',
} satisfies Record<HitProvenance, string>;

/** §9.4's pinned group, drawn above the ranking and never inside it. */
const PinnedTopics = (props: { readonly view: SearchView }) => (
  <Show when={props.view.topics.length > 0}>
    <section class="bible-search__topics" data-group="topics" aria-label="Topics">
      <h2 class="bible-search__group-heading">
        <span>Topics</span>
        <small>{props.view.topics.length}</small>
      </h2>
      <ul class="bible-search__topic-list">
        <For each={props.view.topics}>
          {(topic) => (
            <li>
              <a href={topic.href} data-topic={topic.slug}>
                {topic.title}
              </a>
              <small>{topic.status}</small>
            </li>
          )}
        </For>
      </ul>
    </section>
  </Show>
);

const Hits = (props: { readonly view: SearchView }) => (
  <section class="bible-search__hits" data-group="paragraphs" aria-label="Passages">
    <h2 class="bible-search__group-heading">
      <span>Passages</span>
      <small>{props.view.hits.length}</small>
    </h2>
    <ol class="bible-search__list">
      <For each={props.view.hits}>
        {(hit) => (
          <li class="bible-search__hit" data-provenance={hit.provenance}>
            {/* A paragraph the corpus stores with no addressable id has no
                route, so it is drawn as plain text rather than as an anchor to
                a path the router rejects. */}
            <Show when={Option.getOrUndefined(hit.href)} fallback={<span>{hit.refcode}</span>}>
              {(href) => <a href={href()}>{hit.refcode}</a>}
            </Show>
            <small class="bible-search__source">
              {hit.bookTitle} — {hit.author}
            </small>
            {/* Why this row is here, which is the distinction hybrid search
                added and the one a fused single score would have hidden. */}
            <small class="bible-search__provenance">{PROVENANCE_LABEL[hit.provenance]}</small>
            <p class="bible-search__snippet">{hit.snippet}</p>
          </li>
        )}
      </For>
    </ol>
  </section>
);

/** The results, for a query worth running.
 *
 *  Split from `WritingsSearch` so that `useSearch` is *mounted* behind the
 *  guard rather than called and ignored. A hook cannot be called conditionally,
 *  so a check inside this component could only discard the answer — the RPC, the
 *  FTS query and the vector scan would still run on every keystroke that empties
 *  the box.
 */
const SearchResults = (props: WritingsSearchProps) => {
  const result = useSearch(() => ({
    text: props.query,
    scope: props.scope,
    bookCode: props.bookCode,
  }));
  // The single read. Everything below draws this one value.
  const plan = createMemo((): SearchView => searchView(result()));

  return (
    <article class="bible-search bible-search--writings">
      {/* §9.6's absence, as the one sentence the reader can act on. Drawn above
          the results because it changes what the results below it mean. */}
      <Show when={plan().vector.show}>
        <p class="bible-search__notice" data-vector="unavailable" role="status">
          {plan().vector.message}
        </p>
      </Show>

      {/* §9.3's locate route: a refcode query's jump target is the answer, so it
          sits above the ranking rather than inside it. */}
      <Show when={Option.getOrUndefined(plan().locate)}>
        {(target) => (
          <p class="bible-search__locate" data-route="locate">
            <a href={target().href}>{target().label}</a>
          </p>
        )}
      </Show>

      <Show
        when={!plan().empty}
        fallback={<p class="bible-search__empty">No writings matched “{plan().query}”.</p>}
      >
        <div class="bible-search__results" aria-live="polite">
          <PinnedTopics view={plan()} />
          <Hits view={plan()} />
        </div>
      </Show>
    </article>
  );
};

export const WritingsSearch = (props: WritingsSearchProps) => (
  // §9.3's router never sees an empty query, because an empty box is not a
  // search. `Show` unmounts `SearchResults` entirely, so no request is made —
  // which is the difference between not searching and searching for nothing.
  <Show when={isSearchable(props.query)}>
    <SearchResults query={props.query} scope={props.scope} bookCode={props.bookCode} />
  </Show>
);
