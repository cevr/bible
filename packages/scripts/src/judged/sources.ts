// The repo's items: the items of the judged rules' selectors (`items.ts`)
// in every file of the gate's (`../guard/files.ts`: what git tracks, and new
// files inside a workspace), so a file never committed is read as a
// committed one is, and a folder that is no one's work yet is not read. A file is a
// TypeScript source (no `.d.ts`) that none of the lint's ignore patterns
// names, or a series script's Markdown, which only `scriptBeats` reads. Each
// source is read and parsed once for every rule that reads it. Which of them
// a run asks about is the store's to say (`store.ts`): an item whose text it
// answers is not asked again.

import { Glob } from 'bun';
import { Effect, FileSystem, Path } from 'effect';

import { gateFiles } from '../guard/files.js';
import { type Item, type Selector, itemsOf, markdownBeats, parse, selects } from './items.js';

/** One item of a source: its selector, its file and the item. */
interface SourceItem extends Item {
  readonly selector: Selector;
  readonly file: string;
}

const TYPESCRIPT = /\.[cm]?tsx?$/;

/** Whether the judged lint reads `file`: a TypeScript source (no `.d.ts`) none of the lint's ignore patterns names, or Markdown. */
const linted = (file: string, ignored: ReadonlyArray<Glob>) =>
  (file.endsWith('.md') || (TYPESCRIPT.test(file) && !file.endsWith('.d.ts'))) &&
  !ignored.some((glob) => glob.match(file));

/** The items of `selectors` in one source. */
const itemsIn = (
  file: string,
  text: string,
  selectors: ReadonlyArray<Selector>,
): ReadonlyArray<SourceItem> => {
  const reading = selectors.filter((selector) => selects(selector, file));
  if (reading.length === 0) return [];
  if (file.endsWith('.md'))
    return markdownBeats(text).map((item) => ({ ...item, selector: 'scriptBeats', file }));
  const source = parse(file, text);
  return reading.flatMap((selector) =>
    itemsOf(selector, source).map((item) => ({ ...item, selector, file })),
  );
};

/**
 * The items of `selectors` in every file of the gate's at `root` the judged
 * lint reads, past the lint's `ignorePatterns`.
 */
export const repoItems = Effect.fn('judged.repoItems')(function* (
  root: string,
  ignorePatterns: ReadonlyArray<string>,
  selectors: ReadonlyArray<Selector>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ignored = ignorePatterns.map((pattern) => new Glob(pattern));
  const files = (yield* gateFiles(root)).filter(
    (file) => linted(file, ignored) && selectors.some((selector) => selects(selector, file)),
  );
  const items = yield* Effect.forEach(
    files,
    (file) =>
      Effect.map(fs.readFileString(path.join(root, file)), (text) =>
        itemsIn(file, text, selectors),
      ),
    { concurrency: 8 },
  );
  return items.flat();
});
