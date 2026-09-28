// The app's two pages for a film: the player (`/`), which the renderer loads
// and which never loads Solid, and the lab (`/lab`, `film lab`), which mounts
// the same preview under its panels. Each links the other by these.

/** The lab's page for `film`. */
export const labUrl = (film: string): string => `/lab?film=${encodeURIComponent(film)}`;

/** The player's look-book page for `film`: every scene's stills and the palette. */
export const lookbookUrl = (film: string): string => `/?film=${encodeURIComponent(film)}&lookbook`;
