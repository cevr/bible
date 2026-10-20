/**
 * Where the reader left each list: the search's query and each list's scroll
 * offset, kept in the app's registry for as long as the app runs. On the web
 * a screen is mounted anew when the reader comes back to it (the browser's
 * Back rebuilds every route from the history entry, and a tab or a pushed
 * hymn shows in its screen's place), so a screen reads its place from here,
 * never from its own state.
 */

import * as Atom from 'effect/reactivity/Atom';

/** The search field's text. */
export const searchQuery = Atom.make('').pipe(Atom.keepAlive);

/** The Hymns list's scroll offset, in points from its top. */
export const hymnsOffset = Atom.make(0).pipe(Atom.keepAlive);

/** The search results' scroll offset, in points from their top. */
export const searchOffset = Atom.make(0).pipe(Atom.keepAlive);
