import { bookNumber } from '@bible/core/bible';
import { useNavigate } from '@solidjs/router';
import { Errored, For, Loading, Show } from '@solidjs/web';
import { Option } from 'effect';
import { createMemo } from 'solid-js';

import type { AppRoute } from '../route/index.js';
import { encodeRoute } from '../route/index.js';
import { useBibleSearch } from '../runtime/index.js';
import { Button } from '../ui/index.js';
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
  // This surface searches the Bible, so §9's writings narrowings are absent
  // rather than defaulted: they belong to the writings search, and a value
  // spelled here would put a corpus filter in the URL of a Bible query.
  corpus: Option.none(),
  bookCode: Option.none(),
});

export const BibleSearch = (props: BibleSearchProps) => {
  const navigate = useNavigate();
  const books = createMemo(() => props.route.books.map((book) => bookNumber(book)));
  const query = createMemo(() => {
    const selectedBooks = books();
    if (selectedBooks.length > 0) {
      return { query: props.route.query, books: selectedBooks, limit: PAGE_SIZE };
    }
    return { query: props.route.query, limit: PAGE_SIZE };
  });
  const results = useBibleSearch(query);
  const emptyPrompt = (): string => {
    if (props.route.query.length > 0) return 'Type at least two characters to search.';
    return 'Enter a word or phrase to find it in Scripture.';
  };
  const resultCountLabel = (): string => {
    if (results().total === 1) return 'result';
    return 'results';
  };

  const apply = (nextQuery: string, nextBooks = props.route.books) => {
    navigate(encodeRoute(searchRoute(nextQuery.trim(), nextBooks)));
  };

  return (
    <article class="bible-search">
      <header class="bible-reader__heading bible-search__heading">
        <p class="bible-reader__eyebrow">Find a passage</p>
        <h1>Search Scripture</h1>
      </header>
      {/* The query box and the scope controls are `SearchForm`, drawn once by
          the route above both corpora. What stays here is the book-range filter,
          which is a Bible-only narrowing and has no writings counterpart. */}
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
        fallback={<p class="bible-search__empty">{emptyPrompt()}</p>}
      >
        <Errored fallback={(error) => <ReaderFailure error={error()} />}>
          <Loading fallback={<ReaderLoading label="Searching Scripture" />}>
            <section class="bible-search__results" aria-live="polite">
              <p class="bible-search__summary">
                {results().total} {resultCountLabel()} for “{props.route.query}”
              </p>
              <Show
                when={results().hits.length > 0}
                fallback={<p class="bible-search__empty">No matching verses were found.</p>}
              >
                <ol>
                  <For each={results().hits}>
                    {(hit) => (
                      <li>
                        <a
                          href={`/bible/${String(hit.verse.reference.book)}/${String(hit.verse.reference.chapter)}/${String(hit.verse.reference.verse)}`}
                        >
                          <strong>
                            {hit.book.name} {hit.verse.reference.chapter}:
                            {hit.verse.reference.verse}
                          </strong>
                          <span>{hit.verse.text}</span>
                        </a>
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
}) => {
  const pressed = (): 'true' | 'false' => {
    if (props.active) return 'true';
    return 'false';
  };
  return (
    <Button aria-pressed={pressed()} onClick={props.select}>
      {props.label}
    </Button>
  );
};
