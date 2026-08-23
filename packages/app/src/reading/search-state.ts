/** The search surface's decisions, as one plan (§9, Milestone 8).
 *
 *  Four questions the surface has to answer, none of which are about markup:
 *  which groups it draws and in what order, what each row says about *why* it is
 *  present, whether a locate-route jump target replaces the ranking, and what to
 *  tell the reader when the vector leg did not run. They live here rather than
 *  in `bible-search.tsx` for the reason `lookup-panel-state.ts` and
 *  `study-pane-state.ts` do: this package's tests run under plain Bun with no
 *  DOM, so a rule taken inside a component is a rule no unit test can state.
 *  What the *markup* draws is asserted against the compiled component in
 *  `apps/desktop/e2e/search-hybrid.spec.ts`.
 *
 *  **One plan, built from one read of the result.** Solid compiles every read of
 *  a live accessor into its own tracked access, so a component that read the
 *  result once per branch could draw a group's *count* from the old value beside
 *  the new value's *rows* — two results that are each internally correct,
 *  rendered as one that never existed. `lookup-panel-state.ts` documents that
 *  bug in full; this module is built to the shape that prevents it, so the
 *  component reads `searchView` once inside a `createMemo` and every branch
 *  below draws that value.
 *
 *  **§9.4's pinned group is structural here, not a CSS rule.** Topics are their
 *  own field on the result and their own group in this plan, above the
 *  paragraphs and never inside them. A surface that fused them would have to go
 *  out of its way.
 */

import type { SearchParagraphHit, SearchResult, VectorAbsenceReason } from '@bible/core/search';
import { Reference as WritingsReference } from '@bible/core/writings';
import { Option } from 'effect';

import type { AppRoute } from '../route/index.js';
import { encodeRoute } from '../route/index.js';

/** Why a paragraph is in the list, in the terms §9.4 ranks it by.
 *
 *  `SearchParagraphHit` carries `lexicalRank` and `vectorRank` as `Option`s
 *  precisely so a reader can be told *why* a row surfaced — a row that only the
 *  vector leg proposed is a different kind of answer from one the text index
 *  ranked first, and collapsing them loses the thing hybrid search added. */
export type HitProvenance = 'both' | 'lexical' | 'vector';

/** One paragraph, in the form the surface draws it. */
export interface SearchHitView {
  readonly paragraphId: string;
  readonly refcode: string;
  readonly bookTitle: string;
  readonly author: string;
  readonly snippet: string;
  readonly provenance: HitProvenance;
  /** The route a click opens, or `None` for a paragraph the corpus stores with
   *  no addressable id.
   *
   *  An `Option` rather than a string, because the alternative this replaces is
   *  exactly the bug: the surface used to *always* produce an href, formatting
   *  one out of the two fields it had, and every one of them was a path the
   *  route decoder rejects (round-2 B2). A paragraph with no `para_id` has no
   *  route, and saying so is what stops a broken link from being drawn. */
  readonly href: Option.Option<string>;
}

/** One topic page in §9.4's pinned group. */
export interface SearchTopicView {
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly href: string;
}

/** What the surface says about the vector leg.
 *
 *  §9.6 makes the absence a typed value carrying *which* absence, and
 *  `model.ts` is explicit that each reason calls for a different message: "no
 *  index installed" is a thing the reader can fix, "the top hit was decisive" is
 *  not a degradation at all. Collapsing them to one "degraded" badge throws away
 *  the distinction the type exists to carry. */
export interface VectorNoticeView {
  /** Whether to draw the notice at all. A leg that ran, or one the router never
   *  reached, is not something to interrupt the reader about. */
  readonly show: boolean;
  readonly message: string;
}

/** Everything the surface draws for one result. */
export interface SearchView {
  readonly query: string;
  /** §9.3's route, so the surface can present a `locate` jump differently from
   *  a ranking without re-deriving the classification the service already made. */
  readonly route: SearchResult['route'];
  readonly scope: SearchResult['scope'];
  /** A refcode query's jump target, above everything else when present. */
  readonly locate: Option.Option<{ readonly label: string; readonly href: string }>;
  /** §9.4's pinned group. Its own field, never merged into `hits`. */
  readonly topics: readonly SearchTopicView[];
  readonly hits: readonly SearchHitView[];
  readonly vector: VectorNoticeView;
  /** True when the query was answered and found nothing — distinct from a
   *  surface that has not searched yet, which never builds a view at all. */
  readonly empty: boolean;
}

/** What to tell the reader about each §9.6 absence.
 *
 *  A record over the union rather than a branch, so a sixth reason added to
 *  `VectorAbsenceReason` fails to typecheck here instead of rendering as a blank
 *  notice. `show` is false for the two reasons that are not degradations: the
 *  router never sent the query to the vector leg, or the lexical top hit was
 *  decisive enough that §9.4 short-circuited it deliberately. */
const ABSENCE = {
  absent: { show: true, message: 'Searching text only — the meaning index is not installed.' },
  fingerprint: {
    show: true,
    message: 'Searching text only — the installed meaning index was built by a different model.',
  },
  embedder: {
    show: true,
    message: 'Searching text only — this device cannot run the meaning model.',
  },
  'short-circuit': { show: false, message: '' },
  route: { show: false, message: '' },
} satisfies Record<VectorAbsenceReason, VectorNoticeView>;

/** Whether a typed query is worth asking the search service about.
 *
 *  An empty or whitespace-only box is not a search that returns nothing — it is
 *  not a search. Sending it anyway costs an RPC, an FTS query and a vector scan
 *  per keystroke as the reader clears the field, and answers with a "No writings
 *  matched" for a query the reader never made. The trimmed text is the same
 *  string §9.3's router would receive, so this predicate and the router agree by
 *  construction about what "empty" means.
 */
export const isSearchable = (text: string): boolean => text.trim().length > 0;

/** The one search form's own state, as a plan (round-2 B3).
 *
 *  §10 asks for "one search surface, shared query/scope/book URL state", and the
 *  route already carries all three. What was missing was the *form*: `/search`
 *  swapped `BibleSearch` for `WritingsSearch` on `scope`, `WritingsSearch`
 *  rendered results only, and the application menu offered a single "Search
 *  Scripture" entry — so a reader on `/search` had no way to reach the writings
 *  side at all except by hand-editing the URL.
 *
 *  These live here rather than in the component for this package's usual reason:
 *  a rule taken inside JSX is a rule no DOM-less unit test can state. What the
 *  markup does with them is asserted in `apps/desktop/e2e/search-hybrid.spec.ts`.
 */
export type SearchCorpusChoice = 'bible' | 'writings';

/** One scope control: what it says, whether it is the current one, and the route
 *  it navigates to.
 *
 *  The *route*, not a callback — the control is a link in the reader's history,
 *  which is what makes a scope switch shareable and back-navigable, and what
 *  `route.test.ts` can then decode. */
export interface SearchScopeOption {
  readonly id: SearchCorpusChoice;
  readonly label: string;
  readonly active: boolean;
  readonly route: SearchRoute;
}

/** The `/search` route, narrowed. Declared here rather than imported from the
 *  component so the plan and the route model share one name. */
export type SearchRoute = Extract<AppRoute, { readonly _tag: 'search' }>;

/** Which corpus the current route asks. `all` is the Bible side, which is what
 *  `/search` has always defaulted to. */
export const corpusChoice = (route: SearchRoute): SearchCorpusChoice => {
  if (route.scope === 'writings') return 'writings';
  return 'bible';
};

/** The scope controls for one route.
 *
 *  Switching corpus **keeps the query and drops the narrowings that do not
 *  belong to the destination**: Bible book numbers are meaningless to the
 *  writings search and a writings `bookCode`/`corpus` is meaningless to the
 *  Bible search, so carrying either across would put a filter in the URL that
 *  the destination silently ignores — a link that says it is narrowed and is
 *  not. The query is the one thing both sides mean the same way. */
export const scopeOptions = (route: SearchRoute): readonly SearchScopeOption[] => {
  const current = corpusChoice(route);
  return [
    {
      id: 'bible',
      label: 'Scripture',
      active: current === 'bible',
      route: {
        _tag: 'search',
        query: route.query,
        scope: 'bible',
        books: route.books,
        corpus: Option.none(),
        bookCode: Option.none(),
      },
    },
    {
      id: 'writings',
      label: 'Writings',
      active: current === 'writings',
      route: {
        _tag: 'search',
        query: route.query,
        scope: 'writings',
        books: [],
        corpus: route.corpus,
        bookCode: route.bookCode,
      },
    },
  ];
};

/** The route a submitted query navigates to: the same scope and narrowings, the
 *  new text, trimmed.
 *
 *  Trimmed here rather than in the component so the URL and `isSearchable` agree
 *  about what was asked — a route carrying `q=%20%20` would encode a query the
 *  guard then refuses to run, which reads to the user as a search box that
 *  silently does nothing. */
export const submittedRoute = (route: SearchRoute, text: string): SearchRoute => ({
  _tag: 'search',
  query: text.trim(),
  scope: route.scope,
  books: route.books,
  corpus: route.corpus,
  bookCode: route.bookCode,
});

/** What the empty box says, per corpus. Two sentences rather than one, because
 *  the two sides accept different things: §9's router takes a phrase, a refcode
 *  or a question, and the Bible search takes words. */
export const searchPrompt = (route: SearchRoute): string => {
  if (corpusChoice(route) === 'writings') {
    return 'Search the writings — a phrase in quotes, a reference like GC 425, or a question.';
  }
  return 'Enter a word or phrase to find it in Scripture.';
};

/** Which legs proposed a hit. */
export const provenanceOf = (hit: SearchParagraphHit): HitProvenance => {
  if (Option.isSome(hit.lexicalRank) && Option.isSome(hit.vectorRank)) return 'both';
  if (Option.isSome(hit.vectorRank)) return 'vector';
  return 'lexical';
};

/** The reader route for a writings paragraph, built through the codec.
 *
 *  `encodeRoute` over a `WritingsReference.paragraph`, not a template string.
 *  The template this replaces produced `/writings/<bookCode>?paragraph=<key>`,
 *  and every part of it was wrong for the decoder: the first segment must parse
 *  as a positive integer (a `bookCode` never does), the paragraph lives in a
 *  `/p/` segment rather than a query parameter, and the id must be the corpus's
 *  raw `para_id` rather than the `bookCode:para_id` join key the vector index
 *  fuses on. Going through the codec means the link cannot drift from the
 *  decoder again — `route.test.ts` decodes every link this produces.
 *
 *  `None` when the paragraph carries no raw id: there is no route to that
 *  paragraph, and drawing an anchor to a 404 is worse than drawing none. */
const paragraphPath = (input: {
  readonly publicationId: number;
  readonly rawParaId: Option.Option<string>;
}): Option.Option<string> =>
  Option.map(input.rawParaId, (paraId) =>
    encodeRoute({
      _tag: 'writings',
      reference: WritingsReference.paragraph(input.publicationId, paraId),
    }),
  );

/** The whole plan, from one read of one result. */
export const searchView = (result: SearchResult): SearchView => ({
  query: result.query,
  route: result.route,
  scope: result.scope,
  // The jump target is only an *answer* when it can be opened: a located
  // paragraph with no route is not a destination. `flatMap` collapses the two
  // absences — no locate route, and a locate route with nowhere to go — into
  // the one thing the surface can act on.
  locate: Option.flatMap(result.locate, (target) =>
    Option.map(paragraphPath(target), (href) => ({
      label: `${target.refcode} — ${target.bookTitle}`,
      href,
    })),
  ),
  topics: result.topics.map((topic): SearchTopicView => ({
    slug: String(topic.slug),
    title: topic.title,
    status: topic.status,
    // Through the codec, for the reason `paragraphPath` is: the wiki route
    // brands its slug, so the encoder is also the check that the slug is one
    // `/wiki/<slug>` can carry.
    href: encodeRoute({ _tag: 'wiki', slug: topic.slug }),
  })),
  hits: result.paragraphs.map((hit): SearchHitView => ({
    paragraphId: hit.paragraphId,
    refcode: hit.refcode,
    bookTitle: hit.bookTitle,
    author: hit.author,
    snippet: hit.snippet,
    provenance: provenanceOf(hit),
    href: paragraphPath(hit),
  })),
  vector: vectorNotice(result),
  // A `locate` answer is not empty even with no ranking behind it: the jump
  // target *is* the answer to a refcode query.
  empty:
    result.paragraphs.length === 0 && result.topics.length === 0 && Option.isNone(result.locate),
});

/** §9.6's absence, as the one sentence the reader needs. */
const vectorNotice = (result: SearchResult): VectorNoticeView => {
  if (result.vector._tag === 'ran') return { show: false, message: '' };
  return ABSENCE[result.vector.reason];
};
