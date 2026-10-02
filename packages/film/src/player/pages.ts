// The lab server's pages for a film: the player (`/player`, the page the
// renderer loads, which never loads Solid), the lab (`/lab`), which mounts
// the same preview under its panels, and the review (`/`, `lab/review/`).
// Each links the others by these.

/** The lab's page for `film`. */
export const labUrl = (film: string): string => `/lab?film=${encodeURIComponent(film)}`;

/** The player's look-book page for `film`: every scene's stills and the palette. */
export const lookbookUrl = (film: string): string =>
  `/player?film=${encodeURIComponent(film)}&lookbook`;
