/* oxlint-disable effect/noTernary -- the browser test's routes, plain paths. */

/**
 * The browser test's routes (`app.tsx`): the two lists, each at its path,
 * and a hymn opened from a list at `<list>/<n>` (`/hymns/<n>`, `/search/<n>`).
 * Kept apart from the app so the test reads them without loading it.
 */

/** The two lists: where each is, and its title. */
export const lists = {
  hymns: { path: '/', title: 'Hymns' },
  search: { path: '/search', title: 'Search' },
} as const;

export type ListName = keyof typeof lists;

/** The list a path belongs to: its own path, or a hymn opened from it. */
export const listOf = (path: string): ListName => (path.startsWith('/search') ? 'search' : 'hymns');
