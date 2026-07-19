import { bookNumber } from '@bible/core/bible';
import type { AppRoute } from '../route/index.js';
import { encodeRoute } from '../route/index.js';
import { A, useNavigate } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { createMemo, createSignal } from 'solid-js';

import { useReadingData } from '../runtime/index.js';
import { Button, Input } from '../ui/index.js';
import { ReaderFailure, ReaderLoading } from './bible-reader.js';

type SearchRoute = Extract<AppRoute, { readonly _tag: 'search' }>;

export interface BibleSearchProps {
  readonly route: SearchRoute;
}

const PAGE_SIZE = 20;
const OLD_TESTAMENT = Array.from({ length: 39 }, (_, index) => index + 1);
const NEW_TESTAMENT = Array.from({ length: 27 }, (_, index) => index + 40);

const searchRoute = (query: string, books: readonly number[]): SearchRoute => ({
  _tag: 'search',
  query,
  scope: 'bible',
  books,
});

export const BibleSearch = (props: BibleSearchProps) => {
  const navigate = useNavigate();
  const data = useReadingData();
  const [draft, setDraft] = createSignal(props.route.query);
  const books = createMemo(() => props.route.books.map((book) => bookNumber(book)));
  const query = createMemo(() => ({
    query: props.route.query,
    books: books().length > 0 ? books() : undefined,
    limit: PAGE_SIZE,
  }));
  const results = () => data.bibleSearch.get(query())();

  const apply = (nextQuery: string, nextBooks = props.route.books) => {
    navigate(encodeRoute(searchRoute(nextQuery.trim(), nextBooks)));
  };

  return (
    <article class="bible-search">
      <header class="bible-reader__heading bible-search__heading">
        <p class="bible-reader__eyebrow">Find a passage</p>
        <h1>Search Scripture</h1>
      </header>
      <form
        class="bible-search__form"
        onSubmit={(event) => {
          event.preventDefault();
          apply(draft());
        }}
      >
        <Input
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          placeholder="Search the Bible…"
          aria-label="Search the Bible"
          autofocus
        />
        <Button type="submit" tone="accent">
          Search
        </Button>
      </form>
      <nav class="bible-search__filters" aria-label="Book range">
        <SearchFilter
          label="All"
          active={props.route.books.length === 0}
          select={() => apply(props.route.query, [])}
        />
        <SearchFilter
          label="Old Testament"
          active={
            props.route.books.length === OLD_TESTAMENT.length &&
            props.route.books.every((book) => book <= 39)
          }
          select={() => apply(props.route.query, OLD_TESTAMENT)}
        />
        <SearchFilter
          label="New Testament"
          active={
            props.route.books.length === NEW_TESTAMENT.length &&
            props.route.books.every((book) => book >= 40)
          }
          select={() => apply(props.route.query, NEW_TESTAMENT)}
        />
      </nav>
      <Show
        when={props.route.query.trim().length >= 2}
        fallback={
          <p class="bible-search__empty">
            {props.route.query.length > 0
              ? 'Type at least two characters to search.'
              : 'Enter a word or phrase to find it in Scripture.'}
          </p>
        }
      >
        <Errored fallback={(error) => <ReaderFailure error={error()} />}>
          <Loading fallback={<ReaderLoading label="Searching Scripture" />}>
            <section class="bible-search__results" aria-live="polite">
              <p class="bible-search__summary">
                {results().total} {results().total === 1 ? 'result' : 'results'} for “
                {props.route.query}”
              </p>
              <Show
                when={results().hits.length > 0}
                fallback={<p class="bible-search__empty">No matching verses were found.</p>}
              >
                <ol>
                  <For each={results().hits}>
                    {(hit) => (
                      <li>
                        <A
                          href={`/bible/${String(hit.verse.reference.book)}/${String(hit.verse.reference.chapter)}/${String(hit.verse.reference.verse)}`}
                        >
                          <strong>
                            {hit.book.name} {hit.verse.reference.chapter}:
                            {hit.verse.reference.verse}
                          </strong>
                          <span>{hit.verse.text}</span>
                        </A>
                      </li>
                    )}
                  </For>
                </ol>
              </Show>
            </section>
          </Loading>
        </Errored>
      </Show>
    </article>
  );
};

const SearchFilter = (props: {
  readonly label: string;
  readonly active: boolean;
  readonly select: () => void;
}) => (
  <Button aria-pressed={props.active ? 'true' : 'false'} onClick={props.select}>
    {props.label}
  </Button>
);
