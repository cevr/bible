/**
 * The URL *is* the search state.
 *
 * Not a mirror of it. There is no second copy of the query or the scope held
 * anywhere and pushed to the address bar on change — the address bar holds
 * them, and the app reads them back out. That ordering is what makes every
 * state the app can be in reachable by pasting a link, and it is why the back
 * button works without any code that knows what "back" means: a history entry
 * restores a previous URL, the workspace atom changes, and each pane's query
 * re-runs.
 *
 * This module declares the workspace as a `@bible/url-state` place: what each
 * key means, its default, and how a change to it enters history. Reading and
 * writing are that one declaration run in either direction, so a link this app
 * writes is a link it reads, by construction. The operations on one pane's
 * state live here too. `./app.tsx` reads and writes the place through its atom.
 */

import { Codec, Field, Place } from '@bible/url-state';
import { Array as Arr, Option, Schema } from 'effect';

import {
  BookSubtype,
  BookType,
  CorpusScope,
  CorpusSection,
  NO_SELECTION,
  type SearchRequest,
  type Signed,
  SignedFromStrings,
} from '../server/api.js';

/** One axis as the client holds it: the `{ include, exclude }` of core's
 *  `Signed`, which the server decodes to, so a chip's three states map onto
 *  membership of one list, the other, or neither. */
type Selection<A> = ReturnType<typeof Signed<Schema.Codec<A>>>['Type'];

/** A chip's state, which is the only thing the UI needs to know about an
 *  axis. `'off'` is absence from both lists. */
export type Sign = 'include' | 'exclude' | 'off';

export const signOf = <A>(selection: Selection<A>, value: A): Sign => {
  if (selection.include.includes(value)) return 'include';
  if (selection.exclude.includes(value)) return 'exclude';
  return 'off';
};

/** The tri-state cycle: off → include → exclude → off.
 *
 *  Include first because it is the common intent; a reader who wants "no
 *  devotionals" clicks twice, and one who wants "devotionals only" clicks
 *  once. */
const NEXT = {
  off: 'include',
  include: 'exclude',
  exclude: 'off',
} satisfies Record<Sign, Sign>;

export const cycle = <A>(selection: Selection<A>, value: A): Selection<A> => {
  const next = NEXT[signOf(selection, value)];
  const without = {
    include: selection.include.filter((entry) => entry !== value),
    exclude: selection.exclude.filter((entry) => entry !== value),
  };
  if (next === 'off') return without;
  if (next === 'include') return { ...without, include: [...without.include, value] };
  return { ...without, exclude: [...without.exclude, value] };
};

export const DEFAULT_LIMIT = 40;

/** How many rows a pane asks for: a whole number from 1 to 100. A value that
 *  is not a number, or truncates to below 1, reads as the default. */
const Limit = Codec.Finite.pipe(
  Codec.truncate,
  (whole) => whole.check(Schema.isGreaterThan(0)),
  Codec.clamp({ max: 100 }),
);

/**
 * One pane: everything a result page depends on. If it changes what is shown,
 * it is here, and therefore in the link.
 *
 * Each key is total: a hand-edited or truncated link degrades to the default
 * for the key it broke rather than failing the page. `?scope=banana` searches
 * everything, and `?type=book&type=nonsense` keeps `book` and drops the rest —
 * the answer least likely to hide results from someone who does not know why
 * their link was wrong. Defaults are left out, so the common case is
 * `?q=latter+rain` rather than `?q=latter+rain&scope=all&limit=40`.
 *
 * A new query pushes a history entry, because it is a place the reader may
 * want to come back to. A filter or the limit replaces it: a refinement of
 * the same search, so Back returns to the previous *query* rather than
 * walking back through each toggle the reader tried.
 *
 * The axes are repeated keys with a sign (`?type=book&type=-periodical`), the
 * same codec the API's query parameters are declared with.
 */
const Pane = Field.struct(
  {
    q: Field.key(Codec.Text, { default: '', history: 'push' }),
    scope: Field.key(Codec.literals(CorpusScope.literals), { default: 'all' }),
    section: Field.keys(SignedFromStrings(CorpusSection)),
    type: Field.keys(SignedFromStrings(BookType)),
    subtype: Field.keys(SignedFromStrings(BookSubtype)),
    excludeApparatus: Field.key(Codec.Flag, { default: false }),
    limit: Field.key(Limit, { default: DEFAULT_LIMIT }),
  },
  { keys: { excludeApparatus: 'noref' } },
);

export type SearchParams = typeof Pane.Type;

export const EMPTY_PARAMS: SearchParams = {
  q: '',
  scope: 'all',
  section: NO_SELECTION,
  type: NO_SELECTION,
  subtype: NO_SELECTION,
  excludeApparatus: false,
  limit: DEFAULT_LIMIT,
};

/**
 * The query key one pane uses for one field.
 *
 * Pane 0 is *unsuffixed*, so a one-pane workspace produces exactly the URLs
 * this app produced before panes existed — `?q=latter+rain&section=bible` —
 * and every link already shared keeps working, opening as a single pane. The
 * suffix is the pane's 1-based position, so a second pane reads `q2`,
 * `section2`, `noref2`.
 */
export const paneKey = (name: string, pane: number): string =>
  Option.match(
    Option.liftPredicate(pane, (index) => index > 0),
    { onNone: () => name, onSome: (index) => `${name}${String(index + 1)}` },
  );

/** The most panes a link opens: a guard against a hand-edited link asking for
 *  hundreds of concurrent searches. */
export const MAX_PANES = 4;

/**
 * The workspace: every pane, in order, on the app's one address.
 *
 * A pane exists if the URL carries *any* of its keys, not just its `q`; an
 * added pane starts with an empty query and the previous pane's filters. Every
 * pane after the first writes its `q`, empty or not (`?q=a&q2=`), so a pane
 * at its defaults is still a pane when the link is re-read. The walk stops at
 * the first gap, so a link carrying pane 3's keys but none of pane 2's opens
 * two panes rather than three with a hole in the middle.
 *
 * Any other path is not this place: the not-found page.
 */
export const Workspace = Place.make({
  path: '/',
  query: Field.indexed(Pane, { max: MAX_PANES, key: paneKey, marker: 'q' }),
});

/** Every pane's parameters, in order, from a query string (with or without
 *  its `?`). */
export const parseWorkspace = (search: string): readonly SearchParams[] =>
  Option.match(Place.decode(Workspace, `/?${search.replace(/^\?/, '')}`), {
    onNone: () => [EMPTY_PARAMS],
    onSome: (workspace) => workspace.query,
  });

/** The whole workspace as an href — every pane, in order, up to
 *  {@link MAX_PANES}. No panes is the empty workspace, `/`. */
export const toWorkspaceString = (panes: readonly SearchParams[]): string =>
  Arr.match(Arr.take(panes, MAX_PANES), {
    onEmpty: () => '/',
    onNonEmpty: (query) => Place.href(Workspace, { path: {}, query, hash: {} }),
  });

/**
 * The same state, as the query's arguments.
 *
 * Exhaustive by construction: it destructures every field of `SearchParams`,
 * so adding an axis above and forgetting it here is a compile error rather
 * than a filter that silently stops being sent.
 */
export const toRequest = (
  { q, scope, section, type, subtype, excludeApparatus, limit }: SearchParams,
  context: number,
): SearchRequest => ({
  q: q.trim(),
  scope,
  section,
  type,
  subtype,
  excludeApparatus,
  limit,
  context,
});

/** True when anything but the query text is set — what the UI reads to decide
 *  whether to offer a "clear filters" affordance. */
const anySign = (selection: Selection<unknown>): boolean =>
  selection.include.length > 0 || selection.exclude.length > 0;

export const hasFilters = (params: SearchParams): boolean =>
  params.scope !== 'all' ||
  anySign(params.section) ||
  anySign(params.type) ||
  anySign(params.subtype) ||
  params.excludeApparatus;

/** Advance one value of one axis through the tri-state cycle, returning the
 *  new params. The chip does not decide which state comes next — `cycle` does,
 *  in one place, so every axis cycles identically. */
export const toggle = <K extends 'section' | 'type' | 'subtype'>(
  params: SearchParams,
  key: K,
  value: SearchParams[K]['include'][number],
): SearchParams => ({
  ...params,
  // `cycle` is generic in the value type and only ever compares values for
  // equality, so widening both sides of the pair to `string` loses nothing it
  // uses. The caller's `K` still ties the key to the value it is given.
  [key]: cycle<string>(params[key], value),
});
