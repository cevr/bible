import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path } from 'effect';

const test = it.effect.layer(BunServices.layer);

/**
 * Words and turns that make the site read as if no one wrote it (owner,
 * 2026-10-20, `docs/lessons.md` `ai-sounding-site-copy`). The first row is
 * the owner's own never-words (`.claude/skills/film/reference/owner-voice.md`
 * section 6); the rest are stock phrases of web copy.
 */
const STOCK: ReadonlyArray<RegExp> = [
  /\b(?:amazing|awesome|wonderful|beautiful|journey|wow)\b/i,
  /\b(?:dive into|delve|unlock|embark|empower|tapestry|game-changer|stay tuned)\b/i,
  /\b(?:coming soon|grow with us|join us|so much more|every step of the way)\b/i,
  /\b(?:one step at a time|deepest truths|at its heart|whether you're)\b/i,
  /a little, and then a little more/i,
];

/** The "not X but Y" turn, said either way round, and its "not just" cousin. */
const TURNS: ReadonlyArray<RegExp> = [
  /\bnot\b[^.?!;:]{1,60}?\bbut\b/i,
  /,\s(?:not|never)\s(?:a|an|the)\s\w+/i,
  /\b(?:is|are|isn't|aren't) not (?:just|only|merely)\b|\bmore than just\b/i,
];

const DASHES: ReadonlyArray<RegExp> = [/—/, /\s--\s/];

/** The books of the KJV, as a reference names them. */
const BOOKS: ReadonlyArray<string> = [
  ...['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth'],
  ...['1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra'],
  ...['Nehemiah', 'Esther', 'Job', 'Psalm', 'Psalms', 'Proverbs', 'Ecclesiastes'],
  ...['Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea'],
  ...['Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai'],
  ...['Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans'],
  ...['1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians'],
  ...['1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon'],
  ...['Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude'],
  'Revelation',
];

/** A Scripture reference as the site writes one: Mark 4:28, 1 John 3:2, Psalm 37:3-5, Song of Solomon 2:1. */
const REFERENCE = String.raw`(?:${BOOKS.join('|')}) \d+:\d+(?:-\d+)?`;

const STRING = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

/**
 * A Verse (an object with `text` and a Scripture `ref`, in either order) is
 * Scripture quoted word for word, so its text is blanked: the KJV may say
 * "Wonderful" where the site may not. An object whose `ref` is no Scripture
 * reference keeps its text.
 */
const blankVerses = (code: string) =>
  code.replace(/\{[^{}]*\}/g, (object) =>
    Option.match(
      Option.liftPredicate(object, (found) =>
        new RegExp(String.raw`\bref:\s*["'\`]${REFERENCE}["'\`]`).test(found),
      ),
      {
        onNone: () => object,
        onSome: (verse) =>
          verse.replace(
            /\btext:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/,
            'text: ""',
          ),
      },
    ),
  );

/**
 * The words of a source file: each string, template and JSX text, as Bun's
 * transpiler gives them (comments gone, JSX lines joined), with its
 * whitespace collapsed and every Verse's text left out.
 */
const sourceWords =
  (loader: 'ts' | 'tsx') =>
  (text: string): ReadonlyArray<string> =>
    (blankVerses(new Bun.Transpiler({ loader }).transformSync(text)).match(STRING) ?? []).map(
      collapse,
    );

/**
 * The words of a Markdown page: each paragraph, list item and table row, whitespace
 * collapsed, with each quoted verse and its reference ("..." Mark 4:28) left
 * out.
 */
const markdownWords = (text: string): ReadonlyArray<string> =>
  text
    .split(/\n\s*\n|\n(?=\||\s*(?:-|\d+\.) )/)
    .map((block) =>
      collapse(block.replace(new RegExp(String.raw`"[^"]+"\s+${REFERENCE}`, 'g'), '')),
    );

const collapse = (words: string) => words.replace(/\\n|\s+/g, ' ').trim();

/** How the words of each kind of file are read, by its extension. */
const READERS = {
  '.ts': sourceWords('ts'),
  '.tsx': sourceWords('tsx'),
  '.md': markdownWords,
} satisfies Readonly<Record<string, (text: string) => ReadonlyArray<string>>>;

const wordsOf = (file: string, text: string): ReadonlyArray<string> =>
  Option.match(
    Option.fromNullishOr(
      Object.entries(READERS).find(([extension]) => file.endsWith(extension))?.[1],
    ),
    {
      onNone: () => [],
      onSome: (read) => read(text),
    },
  );

/** What a string breaks of the copy rules, if anything. */
const breaches = (words: string): ReadonlyArray<string> =>
  [...STOCK, ...TURNS, ...DASHES].flatMap((pattern) =>
    Option.toArray(Option.fromNullishOr(pattern.exec(words)?.[0])),
  );

/** The site's source files and the channel kit's pages, by path from the app. */
const copyFiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const app = path.dirname(import.meta.dir);
  const source = (yield* fs.readDirectory(import.meta.dir, { recursive: true }))
    .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.test.ts'))
    .map((file) => path.join('src', file));
  const kit = (yield* fs.readDirectory(path.join(app, 'kit')))
    .filter((file) => file.endsWith('.md'))
    .map((file) => path.join('kit', file));
  const files = [...source, ...kit];
  return yield* Effect.forEach(files, (file) =>
    Effect.map(fs.readFileString(path.join(app, file)), (text) => ({
      file,
      words: wordsOf(file, text),
    })),
  );
});

describe('the site’s copy', () => {
  test("the site's words hold no stock phrase, no not-X-but-Y turn and no em-dash", () =>
    Effect.gen(function* () {
      const files = yield* copyFiles;
      const names = files.map(({ file }) => file);
      expect(names).toContain('src/content.ts');
      expect(names).toContain('src/views.tsx');
      expect(names).toContain('kit/channel.md');
      const found = files.flatMap(({ file, words }) =>
        words.flatMap((line) => breaches(line).map((match) => `${file}: ${match}`)),
      );
      expect(found).toEqual([]);
    }));

  test('the checks catch what they are for', () =>
    Effect.sync(() => {
      const caught = (file: string, text: string) =>
        wordsOf(file, text).some((words) => breaches(words).length > 0);
      const ts = (text: string) => caught('a.ts', text);
      expect(ts("'The name comes from a promise, not a program.'")).toBe(true);
      expect(ts("'It is not a rule but a gift.'")).toBe(true);
      expect(ts("'First films coming soon'")).toBe(true);
      expect(ts("'Short films — and talks'")).toBe(true);
      expect(ts("'from its first principles to its deepest truths'")).toBe(true);
      expect(ts("'Every verse is quoted from the King James Version.'")).toBe(false);
      expect(ts("/** not a word here, but a comment */ const a = 'plain';")).toBe(false);
      expect(ts("const url = 'https://www.youtube.com/@firsttheblade';")).toBe(false);
      expect(ts("const a = 'a /* mark */ and then — a dash';")).toBe(true);
      expect(ts("const a = 'see // here: coming soon';")).toBe(true);
      expect(
        caught('a.tsx', 'const A = () => (\n  <p>\n    Come and grow with\n    us\n  </p>\n);'),
      ).toBe(true);
      expect(
        ts("const v = { text: 'and his name shall be called Wonderful', ref: 'Isaiah 9:6' };"),
      ).toBe(false);
      expect(
        ts("const v = { ref: 'Isaiah 9:6', text: 'and his name shall be called Wonderful' };"),
      ).toBe(false);
      expect(ts("const v = { text: 'a wonderful film', ref: 'the trailer' };")).toBe(true);
      expect(ts("const v = { text: 'a wonderful film', ref: 'Trailer 1:1' };")).toBe(true);
      expect(
        ts("const v = { ref: 'Song of Solomon 6:4', text: 'Thou art beautiful, O my love' };"),
      ).toBe(false);
      expect(ts("const a = 'a wonderful film';")).toBe(true);
      expect(caught('a.md', '"How beautiful upon the mountains" Isaiah 52:7\n\nPlain words.')).toBe(
        false,
      );
      expect(caught('a.md', 'A plain line.\n\nWhat a\njourney.')).toBe(true);
      expect(caught('a.md', '| `Row` | Short films — and talks |')).toBe(true);
    }));
});
