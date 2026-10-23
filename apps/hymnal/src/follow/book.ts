/**
 * The app's one timing book: each hymn's timeline from the bundle
 * (`virtual:hymnal-timing`), decoded once, for the score clock and follow.
 */

import bundled from 'virtual:hymnal-timing';

import { timingBook } from './timeline';

export const book = timingBook(bundled);
