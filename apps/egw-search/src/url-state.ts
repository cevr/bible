/* oxlint-disable effect/noTernary -- parsing a URL is a chain of defaulting
   decisions over a `string | null` API; `Option.match` per field triples the
   length of a total parser without changing what it does. */
/* oxlint-disable effect/noNullish -- `URLSearchParams.get` returns `string |
   null` and `history.pushState` takes `null` for its unused state argument.
   Both are the platform's signature, not a modelling choice. */

/**
 * The URL *is* the search state.
 *
 * Not a mirror of it. There is no second copy of the query or the scope held in
 * a signal and pushed to the address bar on change — the address bar holds
 * them, and the app reads them back out. That ordering is what makes every
 * state the app can be in reachable by pasting a link, and it is why the back
 * button works without any code that knows what "back" means: a history entry
 * restores a previous URL, the location signal changes, and the derived query
 * re-runs. The alternative — signals as truth, URL as an effect — has two
 * sources that drift the moment the user navigates, and the usual fix for that
 * drift is a popstate handler that writes the signals back, which is the same
 * state twice with a synchroniser between.
 *
 * One parse function and one serialise function, inverse to each other, so a
 * link this app produces is a link this app can read.
 */

import { createSignal, type Accessor } from 'solid-js';

import {
  type BookSubtype,
  type BookType,
  type CorpusScope,
  type CorpusSection,
  isBookSubtype,
  isBookType,
  isCorpusScope,
  isCorpusSection,
} from '../server/api.js';

/** Everything a result page depends on. If it changes what is shown, it is
 *  here, and therefore in the link. */
export interface SearchParams {
  readonly q: string;
  readonly scope: CorpusScope;
  readonly section: readonly CorpusSection[];
  readonly type: readonly BookType[];
  readonly subtype: readonly BookSubtype[];
  readonly excludeApparatus: boolean;
  readonly limit: number;
}

export const DEFAULT_LIMIT = 40;

export const EMPTY_PARAMS: SearchParams = {
  q: '',
  scope: 'all',
  section: [],
  type: [],
  subtype: [],
  excludeApparatus: false,
  limit: DEFAULT_LIMIT,
};

/** A repeated key (`?type=book&type=periodical`) rather than one comma-joined
 *  value: it is what `URLSearchParams` produces natively, what a server reads
 *  without splitting, and what survives a value that ever contains a comma. */
const multi = <A extends string>(
  url: URLSearchParams,
  key: string,
  is: (value: string) => value is A,
): readonly A[] => url.getAll(key).filter(is);

/** Read the state out of a query string.
 *
 *  Total: a hand-edited or truncated link degrades to the default for the field
 *  it broke rather than failing the page. `?scope=banana` searches everything,
 *  and `?type=book&type=nonsense` keeps `book` and drops the rest — the answer
 *  least likely to hide results from someone who does not know why their link
 *  was wrong. */
export const parseParams = (search: string): SearchParams => {
  const url = new URLSearchParams(search);
  const scope = url.get('scope') ?? '';
  const limit = Number(url.get('limit'));
  return {
    q: url.get('q') ?? '',
    scope: isCorpusScope(scope) ? scope : 'all',
    section: multi(url, 'section', isCorpusSection),
    type: multi(url, 'type', isBookType),
    subtype: multi(url, 'subtype', isBookSubtype),
    excludeApparatus: url.get('noref') === '1',
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 100) : DEFAULT_LIMIT,
  };
};

/** Serialise state back to a query string.
 *
 *  Defaults are *omitted*, so the common case produces `?q=latter+rain` rather
 *  than `?q=latter+rain&scope=all&limit=40`. A link a reader might paste into a
 *  message should carry what they chose, not the settings they left alone. */
export const toSearchString = (params: SearchParams): string => {
  const url = new URLSearchParams();
  if (params.q !== '') url.set('q', params.q);
  if (params.scope !== 'all') url.set('scope', params.scope);
  for (const value of params.section) url.append('section', value);
  for (const value of params.type) url.append('type', value);
  for (const value of params.subtype) url.append('subtype', value);
  if (params.excludeApparatus) url.set('noref', '1');
  if (params.limit !== DEFAULT_LIMIT) url.set('limit', String(params.limit));
  const query = url.toString();
  return query === '' ? '/' : `?${query}`;
};

/**
 * The same state, as the API's query object.
 *
 * Exhaustive by construction: it destructures every field of `SearchParams`,
 * so adding an axis above and forgetting it here is a compile error rather
 * than a filter that silently stops being sent. That is not hypothetical — the
 * four classification axes were added to `SearchParams` while the request
 * builder still listed `q`, `limit`, `context` and `scope`, so the URL said
 * `?section=pioneer-library` and every request went out unfiltered. The UI
 * showed unchanged results and looked like a reactivity bug.
 *
 * `context` is not here because it is a rendering choice, not search state:
 * the caller supplies it.
 */
export const toQuery = ({
  q,
  scope,
  section,
  type,
  subtype,
  excludeApparatus,
  limit,
}: SearchParams) => ({
  q: q.trim(),
  scope,
  section,
  type,
  subtype,
  noref: excludeApparatus ? '1' : undefined,
  limit,
});

/** True when nothing but the query text is set — what the UI reads to decide
 *  whether to offer a "clear filters" affordance. */
export const hasFilters = (params: SearchParams): boolean =>
  params.scope !== 'all' ||
  params.section.length > 0 ||
  params.type.length > 0 ||
  params.subtype.length > 0 ||
  params.excludeApparatus;

/** Toggle one value of a multi-select axis, returning the new params. */
export const toggle = <K extends 'section' | 'type' | 'subtype'>(
  params: SearchParams,
  key: K,
  value: SearchParams[K][number],
): SearchParams => {
  const current: readonly string[] = params[key];
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
  return { ...params, [key]: next };
};

/**
 * The live location, as a signal.
 *
 * `popstate` covers the back and forward buttons; `pushState` and
 * `replaceState` do not fire it, so the two writers below notify explicitly.
 * Wrapping them once here — rather than at each call site — is what keeps
 * "navigate" and "update the signal" from ever being done separately.
 */
const [search, setSearch] = createSignal(window.location.search);

/** Bumped on every navigation, including a back or forward. A consumer holding
 *  transient state that a navigation should discard — the half-typed text in
 *  the search box — reads this to know a navigation happened, which the parsed
 *  params alone cannot tell it: going back to a URL whose query is the same as
 *  the current one changes no field, yet is still a navigation. */
const [epoch, setEpoch] = createSignal(0);

export const navigationEpoch: Accessor<number> = epoch;

const commit = (): void => {
  setSearch(window.location.search);
  setEpoch((value) => value + 1);
};

window.addEventListener('popstate', commit);

/** The current parameters. Every reader of search state reads this. */
export const currentParams: Accessor<SearchParams> = () => parseParams(search());

/**
 * Navigate to a new state.
 *
 * `replace` is for a refinement of the same search — changing scope on results
 * already on screen — so the back button returns to the previous *query*
 * rather than walking back through each toggle the reader tried. A new query
 * pushes, because that is a place they may want to come back to.
 */
export const navigate = (params: SearchParams, options?: { readonly replace?: boolean }): void => {
  const next = toSearchString(params);
  if (next === (window.location.search === '' ? '/' : window.location.search)) return;
  if (options?.replace === true) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
  commit();
};
