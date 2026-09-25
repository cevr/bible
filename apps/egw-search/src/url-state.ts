/* oxlint-disable effect/noTernary -- parsing a URL is a chain of defaulting
   decisions over a `string | null` API; `Option.match` per field triples the
   length of a total parser without changing what it does. */
/* oxlint-disable effect/noNullish -- `URLSearchParams.get` returns `string |
   null`. That is the platform's signature, not a modelling choice. */

/**
 * The URL *is* the search state.
 *
 * Not a mirror of it. There is no second copy of the query or the scope held
 * anywhere and pushed to the address bar on change — the address bar holds
 * them, and the app reads them back out. That ordering is what makes every
 * state the app can be in reachable by pasting a link, and it is why the back
 * button works without any code that knows what "back" means: a history entry
 * restores a previous URL, the location signal changes (`./history.ts`), and
 * each pane's query re-runs.
 *
 * This module is pure: the two inverse functions between a query string and
 * a workspace, and the operations on one pane's state. `./history.ts` owns
 * the browser's location and the writes to it.
 */

import {
  type BookSubtype,
  type BookType,
  type CorpusScope,
  type CorpusSection,
  EXCLUDE_PREFIX,
  isBookSubtype,
  isBookType,
  isCorpusScope,
  isCorpusSection,
  NO_SELECTION,
  type SearchRequest,
} from '../server/api.js';

/** One axis as the client holds it: the same `{ include, exclude }` the server
 *  decodes to, so a chip's three states map onto membership of one list, the
 *  other, or neither. */
export interface Selection<A> {
  readonly include: readonly A[];
  readonly exclude: readonly A[];
}

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

/** Everything a result page depends on. If it changes what is shown, it is
 *  here, and therefore in the link. */
export interface SearchParams {
  readonly q: string;
  readonly scope: CorpusScope;
  readonly section: Selection<CorpusSection>;
  readonly type: Selection<BookType>;
  readonly subtype: Selection<BookSubtype>;
  readonly excludeApparatus: boolean;
  readonly limit: number;
}

export const DEFAULT_LIMIT = 40;

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
  pane === 0 ? name : `${name}${String(pane + 1)}`;

/** A repeated key (`?type=book&type=periodical`) rather than one comma-joined
 *  value: it is what `URLSearchParams` produces natively, what a server reads
 *  without splitting, and what survives a value that ever contains a comma. */
const multi = <A extends string>(
  url: URLSearchParams,
  key: string,
  is: (value: string) => value is A,
): Selection<A> => {
  const include: A[] = [];
  const exclude: A[] = [];
  for (const raw of url.getAll(key)) {
    const negated = raw.startsWith(EXCLUDE_PREFIX);
    const bare = negated ? raw.slice(EXCLUDE_PREFIX.length) : raw;
    if (!is(bare)) continue;
    if (negated) exclude.push(bare);
    else include.push(bare);
  }
  return { include, exclude };
};

/** One axis back onto the query string, signs and all. */
const appendSelection = <A extends string>(
  url: URLSearchParams,
  key: string,
  selection: Selection<A>,
): void => {
  for (const value of selection.include) url.append(key, value);
  for (const value of selection.exclude) url.append(key, `${EXCLUDE_PREFIX}${value}`);
};

/** Read one pane's state out of a query string.
 *
 *  Total: a hand-edited or truncated link degrades to the default for the field
 *  it broke rather than failing the page. `?scope=banana` searches everything,
 *  and `?type=book&type=nonsense` keeps `book` and drops the rest — the answer
 *  least likely to hide results from someone who does not know why their link
 *  was wrong. */
export const parseParams = (search: string, pane = 0): SearchParams => {
  const url = new URLSearchParams(search);
  const key = (name: string): string => paneKey(name, pane);
  const scope = url.get(key('scope')) ?? '';
  const limit = Number(url.get(key('limit')));
  return {
    q: url.get(key('q')) ?? '',
    scope: isCorpusScope(scope) ? scope : 'all',
    section: multi(url, key('section'), isCorpusSection),
    type: multi(url, key('type'), isBookType),
    subtype: multi(url, key('subtype'), isBookSubtype),
    excludeApparatus: url.get(key('noref')) === '1',
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 100) : DEFAULT_LIMIT,
  };
};

/** Write one pane's fields, omitting defaults, so the common case produces
 *  `?q=latter+rain` rather than `?q=latter+rain&scope=all&limit=40`.
 *
 *  `force` marks a pane that is entirely at its defaults — a freshly added,
 *  unfiltered, unqueried pane writes no keys at all, and a pane the URL does
 *  not mention is a pane that does not exist when the link is re-read. Writing
 *  its empty `q` is the smallest thing that makes it real. Pane 0 never needs
 *  it: a single empty pane is the app's initial state. */
const writeParams = (
  url: URLSearchParams,
  params: SearchParams,
  pane: number,
  force = false,
): void => {
  const key = (name: string): string => paneKey(name, pane);
  if (params.q !== '') url.set(key('q'), params.q);
  else if (force && pane > 0) url.set(key('q'), '');
  if (params.scope !== 'all') url.set(key('scope'), params.scope);
  appendSelection(url, key('section'), params.section);
  appendSelection(url, key('type'), params.type);
  appendSelection(url, key('subtype'), params.subtype);
  if (params.excludeApparatus) url.set(key('noref'), '1');
  if (params.limit !== DEFAULT_LIMIT) url.set(key('limit'), String(params.limit));
};

export const toSearchString = (params: SearchParams): string => {
  const url = new URLSearchParams();
  writeParams(url, params, 0);
  const query = url.toString();
  return query === '' ? '/' : `/?${query}`;
};

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

/** How many panes the URL describes.
 *
 *  A pane exists if the URL carries *any* of its keys, not just its `q`. An
 *  added pane starts with an empty query and the previous pane's filters, so
 *  it is present as `subtype3=…` with no `q3` at all.
 *
 *  The walk still stops at the first gap, so a link carrying pane 3's keys but
 *  none of pane 2's opens two panes rather than three with a hole in the
 *  middle. `MAX_PANES` guards against a hand-edited link asking for hundreds
 *  of concurrent searches. */
export const MAX_PANES = 4;

/** Every key one pane can contribute. Kept beside `writeParams`, which is the
 *  only thing that writes them. */
const PANE_FIELDS = [
  'q',
  'scope',
  'section',
  'type',
  'subtype',
  'noref',
  'limit',
] satisfies readonly string[];

const countPanes = (url: URLSearchParams): number => {
  const present = (pane: number): boolean =>
    PANE_FIELDS.some((field) => url.has(paneKey(field, pane)));
  let count = 0;
  while (count < MAX_PANES && present(count)) count += 1;
  return Math.max(count, 1);
};

/** Every pane's parameters, in order. The workspace is the unit of state; a
 *  single-pane workspace is the ordinary case rather than a special one. */
export const parseWorkspace = (search: string): readonly SearchParams[] => {
  const url = new URLSearchParams(search);
  return Array.from({ length: countPanes(url) }, (_, pane) => parseParams(search, pane));
};

/** The whole workspace as an href — every pane, in order. */
export const toWorkspaceString = (panes: readonly SearchParams[]): string => {
  const url = new URLSearchParams();
  panes.forEach((params, pane) => {
    writeParams(url, params, pane, true);
  });
  const query = url.toString();
  return query === '' ? '/' : `/?${query}`;
};
