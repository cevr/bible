/**
 * Bible Database Module
 *
 * Exports the BibleDatabase service and the types its readers take for
 * accessing Bible data stored in SQLite.
 */

export { BibleDatabase, type StrongsEntry, type ConcordanceHit } from './bible-database.js';

export { BibleCorpus } from './bible-corpus.js';
export { BibleCorpusArchive, decodeBibleCorpusArchive } from './archive.js';
