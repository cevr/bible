// A film's journal: what was seen, heard or measured while the film was made,
// kept beside its sources in `src/films/<film>/journal.md` and committed with
// them. One rule, written at the top of the file: observations, never
// instructions. A decision lands in the source; a request is a lab note; the
// journal holds what someone noticed (a mass that reads, a word that lands
// late, a still that was judged), dated and placed, so a later pass reads the
// film's history instead of re-discovering it.
//
// Two calls: `note` appends one entry (its ISO time, its scene or the whole
// film, its text on one line) and refuses an empty one; `read` answers the
// newest entries, of one scene or all, at most `last` and at most `cap`
// characters as printed, oldest first, saying how many it left out.

import { Array as Arr, DateTime, Effect, FileSystem, Option, Path, Schema } from 'effect';
import { FilmFolder, type FilmName } from './film-repo.ts';

/** A note with no words. */
class JournalEmpty extends Schema.TaggedError<JournalEmpty>()('JournalEmpty', {}) {
  override get message() {
    return 'a journal note needs words: what was seen, heard or measured';
  }
}

/** The journal's file name in a film's folder. */
const JOURNAL_FILE = 'journal.md';

/** The rule at the top of every journal. */
export const JOURNAL_RULE =
  'Observations, never instructions: what was seen, heard or measured while making this film, each dated and placed. A decision lands in the source and a request is a lab note; an entry says what is, never what to do.';

/** The heading of a new journal. */
const header = (film: string) => `# Journal: ${film}\n\n${JOURNAL_RULE}\n`;

/** Where an entry is said: a scene by its id, or the whole film. */
const FILM_WIDE = 'film';

/** One entry: when, where, and what was observed. */
export interface JournalEntry {
  /** ISO 8601, to the second, UTC. */
  readonly at: string;
  /** The scene's id, or `film` for the whole film. */
  readonly scene: string;
  readonly text: string;
}

/** The longest `read` answers, as printed: a reader's tool result stays under 8,000 characters. */
const JOURNAL_CAP = 7_000;

/** How many entries `read` answers unless asked. */
export const JOURNAL_LAST = 20;

/** An entry's heading line: `## <at> · <scene>`. */
const HEADING = /^## (\S+) · (\S+)$/;

/** Words as one line: whitespace runs made one space; a leading `#` escaped so it stays text. */
const oneLine = (text: string) => text.trim().replace(/\s+/g, ' ').replace(/^#/, '\\#');

/** An entry as the file holds it. */
const entryBlock = (entry: JournalEntry) => `\n## ${entry.at} · ${entry.scene}\n\n${entry.text}\n`;

/** The entries of a journal's text, in file order. */
export const entriesOf = (text: string): ReadonlyArray<JournalEntry> => {
  const entries: Array<JournalEntry> = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const [, at = '', scene = FILM_WIDE] of Option.toArray(
      Option.fromNullishOr(HEADING.exec(line)),
    )) {
      const text = Arr.takeWhile(lines.slice(i + 1), (next) => !HEADING.test(next))
        .join(' ')
        .trim()
        .replace(/^\\#/, '#');
      entries.push({ at, scene, text });
    }
  });
  return entries;
};

/** An entry as `read` prints it: one line. */
export const entryLine = (entry: JournalEntry) => `${entry.at} scene=${entry.scene} ${entry.text}`;

/** What `read` answers: the lines, oldest first, and how many matching entries it left out. */
interface JournalPage {
  readonly lines: ReadonlyArray<string>;
  readonly left: number;
}

/**
 * The newest of `entries` in `scene` (all, without one): at most `last`, then
 * as many of those as fit in `cap` characters printed, newest kept first.
 */
export const pageOf = (
  entries: ReadonlyArray<JournalEntry>,
  scene: Option.Option<string>,
  last: number,
  cap: number,
): JournalPage => {
  const matching = Option.match(scene, {
    onNone: () => entries,
    onSome: (id) => entries.filter((e) => e.scene === id),
  });
  const newest = Arr.reverse(matching).slice(0, Math.max(0, last));
  const kept: Array<string> = [];
  let used = 0;
  for (const entry of newest) {
    const line = entryLine(entry);
    if (used + line.length + 1 > cap) break;
    kept.push(line);
    used += line.length + 1;
  }
  return { lines: Arr.reverse(kept), left: matching.length - kept.length };
};

/** The journal's file for `film`. */
const fileOf = Effect.fn('journal.file')(function* (film: FilmName) {
  const folder = yield* FilmFolder;
  const path = yield* Path.Path;
  return path.join(folder.paths(film).dir, JOURNAL_FILE);
});

/** The journal's text, empty when the film has none yet. */
const textOf = Effect.fn('journal.text')(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(file))) return '';
  return yield* fs.readFileString(file);
});

/**
 * Append an observation to `film`'s journal, said of `scene` (the whole film
 * without one), at the time now: the file and its rule made first when the
 * film has none. Empty words are refused.
 */
export const note = Effect.fn('journal.note')(function* (
  film: FilmName,
  words: string,
  scene: Option.Option<string>,
) {
  const text = oneLine(words);
  if (text === '') return yield* JournalEmpty.make({});
  const fs = yield* FileSystem.FileSystem;
  const file = yield* fileOf(film);
  const at = DateTime.formatIso(yield* DateTime.now).replace(/\.\d+Z$/, 'Z');
  const entry: JournalEntry = { at, scene: Option.getOrElse(scene, () => FILM_WIDE), text };
  // Made only if no one has made it (`wx`, one maker among notes at once), then appended,
  // never rewritten: two notes at once both land, under one header.
  yield* fs.writeFileString(file, header(film), { flag: 'wx' }).pipe(
    Effect.catchIf(
      (error) => error.reason._tag === 'AlreadyExists',
      () => Effect.void,
    ),
  );
  yield* fs.writeFileString(file, entryBlock(entry), { flag: 'a' });
  yield* Effect.log(`journal.note film=${film} scene=${entry.scene} chars=${text.length}`);
  return { file, entry };
});

/** The newest entries of `film`'s journal (`pageOf`), and its file. */
export const read = Effect.fn('journal.read')(function* (
  film: FilmName,
  scene: Option.Option<string>,
  last: number = JOURNAL_LAST,
  cap: number = JOURNAL_CAP,
) {
  const file = yield* fileOf(film);
  return { file, ...pageOf(entriesOf(yield* textOf(file)), scene, last, cap) };
});
