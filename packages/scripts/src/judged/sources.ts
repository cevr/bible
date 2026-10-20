// The repo's items: the items of the judged rules' selectors (`items.ts`)
// in every file of the gate's (`../guard/files.ts`: what git tracks, and new
// files inside a workspace), so a file never committed is read as a
// committed one is, and a folder that is no one's work yet is not read. A file is a
// TypeScript source (no `.d.ts`) that none of the lint's ignore patterns
// names, or a series script's Markdown, which only `scriptBeats` reads. Each
// source is read and parsed once for every rule that reads it, and each item
// is keyed for each rule that reads it by its key in the store
// (`store.ts`'s `cacheKey`). Which of them a run asks about is the store's
// to say: an item whose key it answers is not asked again.
//
// The checkout keeps a memo of its files' items (`items.json` in
// `settings.judged.checkout`): each file's text by its hash, and each item
// of it by its rule, its line, its offset and its key, no text. A file that
// hashes as the memo has it is not parsed again; the texts of the items a
// run asks about are read again from their files (`textsOf`). The memo holds
// the form it was made in: a hash of the model, each rule's id, selector and
// words, and the code that makes the items and their keys (this module,
// `items.ts`, `store.ts` and the parser's version), so a memo made any other
// way is read as none. A missing or unreadable memo is none; it is written
// whole, through a temporary file renamed over it, when the run read a file
// it did not hold or no longer reads one it held, and a memo that cannot be
// written is said on one line and never fails the run.

import { Glob } from 'bun';
import { Console, Effect, FileSystem, Option, Path, Schema } from 'effect';

import { gateFiles } from '../guard/files.js';
import { textHash } from './findings.js';
import { type Item, type Selector, itemsOf, markdownBeats, parse, selects } from './items.js';
import { type JudgedRule, ruleKey } from './rule.js';
import { cacheKey } from './store.js';

/** One item of a source: its selector, its file and the item. */
interface SourceItem extends Item {
  readonly selector: Selector;
  readonly file: string;
}

/** An item a rule reads, keyed for that rule: its rule, its file, its first line and offset, and its key in the store. */
interface TreeItem {
  readonly rule: JudgedRule;
  readonly file: string;
  readonly line: number;
  readonly start: number;
  readonly key: string;
}

/** An item the memo holds: its rule by id, its line and offset, and its key in the store. */
const MemoItem = Schema.Struct({
  rule: Schema.String,
  line: Schema.Finite,
  start: Schema.Finite,
  key: Schema.String,
});

const Memo = Schema.fromJsonString(
  Schema.Struct({
    form: Schema.String,
    files: Schema.Record(
      Schema.String,
      Schema.Struct({ hash: Schema.String, items: Schema.Array(MemoItem) }),
    ),
  }),
);

type Memo = typeof Memo.Type;

/** A file's text no longer holds an item the run read in it: the file changed during the run. */
class ItemsMoved extends Schema.TaggedError<ItemsMoved>()('ItemsMoved', { file: Schema.String }) {
  override get message() {
    return `${this.file} changed while the judged lint read it`;
  }
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

/** The code that makes the items and their keys, by its files beside this one: a memo made by other code is none. */
const MAKERS = ['sources.ts', 'items.ts', 'store.ts'];

/** The form of a memo made for `rules` on `model` by this code: a hash of them all. */
const formOf = Effect.fn('judged.memoForm')(function* (
  rules: ReadonlyArray<JudgedRule>,
  model: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const code = yield* Effect.forEach(
    [
      ...MAKERS.map((file) => path.join(import.meta.dir, file)),
      Bun.resolveSync('oxc-parser/package.json', import.meta.dir),
    ],
    (file) => fs.readFileString(file),
  );
  return textHash(
    [
      model,
      ...rules.flatMap((rule) => [rule.id, rule.selector, ruleKey(rule)]),
      ...code.map(textHash),
    ].join('\0'),
  );
});

/** The memo at `file` if it was made in `form`; none when it is missing, does not read, or was made otherwise. */
const readMemo = (file: string, form: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(file);
    return yield* Schema.decodeEffect(Memo)(text);
  }).pipe(
    Effect.option,
    Effect.map((memo) => Option.filter(memo, (read) => read.form === form)),
  );

/** Writes `memo` to `file` whole: a temporary file beside it, renamed over it. */
const writeMemo = (file: string, memo: Memo) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    yield* fs.writeFileString(temporary, yield* Schema.encodeEffect(Memo)(memo));
    yield* fs.rename(temporary, file);
  });

/** Whether `next` holds other files, or a file of another text, than `memo`. */
const memoChanged = (memo: Option.Option<Memo>, next: Memo) =>
  Option.match(memo, {
    onNone: () => true,
    onSome: (kept) => {
      const files = Object.keys(next.files);
      return (
        files.length !== Object.keys(kept.files).length ||
        files.some((file) => kept.files[file]?.hash !== next.files[file]?.hash)
      );
    },
  });

/**
 * The items `rules` read in every file of the gate's at `root` the judged
 * lint reads, past the lint's `ignorePatterns`, each keyed for its rule on
 * `model`; a file the memo at `memoFile` holds by its hash is not parsed.
 */
export const repoItems = Effect.fn('judged.repoItems')(function* (
  root: string,
  ignorePatterns: ReadonlyArray<string>,
  rules: ReadonlyArray<JudgedRule>,
  memo: { readonly model: string; readonly file: string },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const selectors = [...new Set(rules.map((rule) => rule.selector))];
  const ignored = ignorePatterns.map((pattern) => new Glob(pattern));
  const files = (yield* gateFiles(root)).filter(
    (file) => linted(file, ignored) && selectors.some((selector) => selects(selector, file)),
  );
  const form = yield* formOf(rules, memo.model);
  const kept = yield* readMemo(memo.file, form);
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const ruleKeys = new Map(rules.map((rule) => [rule.id, ruleKey(rule)]));
  /** Each rule's items of a file's source items, keyed for it. */
  const keyed = (found: ReadonlyArray<SourceItem>) =>
    rules.flatMap((rule) =>
      found
        .filter((item) => item.selector === rule.selector)
        .map((item) => ({
          tree: {
            rule,
            file: item.file,
            line: item.line,
            start: item.start,
            key: cacheKey(ruleKeys.get(rule.id) ?? ruleKey(rule), memo.model, item.key),
          },
          text: item.text,
        })),
    );
  const texts = new Map<string, string>();
  const read = yield* Effect.forEach(
    files,
    (file) =>
      Effect.map(fs.readFileString(path.join(root, file)), (text) => {
        const hash = textHash(text);
        const held = Option.flatMap(kept, (memoOf) =>
          Option.filter(Option.fromUndefinedOr(memoOf.files[file]), (entry) => entry.hash === hash),
        );
        const items = Option.match(held, {
          onSome: (entry) =>
            entry.items.flatMap((item) =>
              Option.toArray(
                Option.map(Option.fromUndefinedOr(byId.get(item.rule)), (rule): TreeItem => ({
                  ...item,
                  rule,
                  file,
                })),
              ),
            ),
          onNone: () =>
            keyed(itemsIn(file, text, selectors)).map(({ tree, text: itemText }) => {
              texts.set(tree.key, itemText);
              return tree;
            }),
        });
        return { file, hash, items };
      }),
    { concurrency: 8 },
  );
  const next: Memo = {
    form,
    files: Object.fromEntries(
      read.map(({ file, hash, items }) => [
        file,
        {
          hash,
          items: items.map(({ rule, line, start, key }) => ({ rule: rule.id, line, start, key })),
        },
      ]),
    ),
  };
  if (memoChanged(kept, next))
    yield* writeMemo(memo.file, next).pipe(
      Effect.catch((error) => Console.error(`[judged] memo not kept detail=${error._tag}`)),
    );
  /** The texts of a file's items, by key, read again from the file. */
  const textsIn = (file: string) =>
    Effect.map(
      fs.readFileString(path.join(root, file)),
      (text) =>
        new Map(keyed(itemsIn(file, text, selectors)).map(({ tree, text: t }) => [tree.key, t])),
    );
  return {
    items: read.flatMap(({ items }) => items),
    files: read.map(({ file, hash }) => ({ file, hash })),
    textsOf: (items: ReadonlyArray<TreeItem>) =>
      Effect.gen(function* () {
        const unread = [
          ...new Set(items.filter((item) => !texts.has(item.key)).map((item) => item.file)),
        ];
        const reread = yield* Effect.forEach(unread, textsIn, { concurrency: 8 });
        for (const found of reread) for (const [key, text] of found) texts.set(key, text);
        return yield* Effect.forEach(items, (item) =>
          Effect.fromOption(Option.fromUndefinedOr(texts.get(item.key)), () =>
            ItemsMoved.make({ file: item.file }),
          ),
        );
      }),
  };
});
