// The docs' anchor reader: which docs teach the code, each read as GitHub
// shows it (Bun's CommonMark and GFM parser), and each path a doc writes in
// backticks (with the symbols after it) or as a link's target. One reader for
// the docs test (`src/docs.slow.test.ts`: every anchor names what the tree has) and
// for a review request (`fixtures/doc-lines.ts`: every doc line that names a file the
// diff changed), so both read a doc's anchors the same way.

import { Boolean as Bool, Effect, FileSystem, Option, Path } from 'effect';
import { Glob } from 'bun';

/** A doc read against the code. */
export interface Doc {
  readonly path: string;
  readonly text: string;
  /** Where a relative path in it is read from, first match wins; `''` is the repo's root. */
  readonly bases: ReadonlyArray<string>;
  /**
   * Every path it writes is under its bases, so a first directory under none
   * of them is a mistyped path; a doc that writes a film's own paths
   * (`narration/full.wav`, `scenes/index.ts`) is not whole.
   */
  readonly whole: boolean;
}

/** Each match of `pattern` (global) in `text`. */
export const matches = (text: string, pattern: RegExp): ReadonlyArray<RegExpExecArray> =>
  Array.from(text.matchAll(pattern));

/** A match's first group, `''` when it took none. */
export const firstGroup = (m: RegExpExecArray) =>
  Option.getOrElse(Option.fromUndefinedOr(m[1]), () => '');

/** A match's `n`th group, `''` when it took none. */
export const group = (m: RegExpExecArray, n: number) =>
  Option.getOrElse(Option.fromUndefinedOr(m[n]), () => '');

/**
 * A path a doc writes in backticks, read from one of the doc's bases, and the
 * symbols written after it (`lab/page-shell.tsx` `partHref`, `Review.read`).
 */
export interface Anchor {
  readonly written: string;
  /** The path without a `:line`, a trailing `/` or a call's `(…)`. */
  readonly path: string;
  /** Written as `path:line`, which a moved line breaks without a sound. */
  readonly line: boolean;
  /** A receipt that names the tree as it was: `… at \`<commit>\`` or `… deleted`. */
  readonly receipt: boolean;
  readonly symbols: ReadonlyArray<string>;
  /** A markdown link's target (`[CRAFT](../CRAFT.md#5)`), read from the doc's own directory as a reader's viewer reads it. */
  readonly link: boolean;
}

/**
 * A table row about another repo, its first cell the repo's slug
 * (`cgwire/kitsu`; a `film/<rule>` is a rule): its paths are that repo's.
 */
export const ANOTHER_REPO = /^\| `(?!film\/)[\w-]+\/[\w.-]+` +\|/;

/** A line of a doc as its viewer shows it: prose (a paragraph's, a heading's, a list item's, a table row's), or a code block's. */
export interface Line {
  readonly text: string;
  readonly code: boolean;
}

/** A doc as the Markdown parser reads it: its lines, and the target of each link and image in its prose. */
export interface Markdown {
  readonly lines: ReadonlyArray<Line>;
  readonly links: ReadonlyArray<string>;
}

/** What starts a code block's line in the parser's output. */
const CODE = '\u0000';

/** A code span as the parser's output writes it: in a run of backticks longer than any it holds (`` `xs[0](y)` ``, ``` `` a`b `` ```). */
const spanOf = (text: string) => {
  const fence = '`'.repeat(Math.max(0, ...matches(text, /`+/g).map((m) => m[0].length)) + 1);
  // A span that starts or ends with a backtick is written with a space inside its run.
  const pad = ' '.repeat(Number(text.startsWith('`') || text.endsWith('`')));
  return `${fence}${pad}${text}${pad}${fence}`;
};

/** A block of the parser's output: on lines of its own. */
const block = (children: string) => `\n${children}\n`;

/** A link's target that is a URL (`https://…`, `mailto:…`): another site's, never a file of this tree. */
const URL_TARGET = /^[a-z][\w+.-]*:/i;

/**
 * A doc as GitHub reads it, through Bun's CommonMark and GFM parser
 * (`Bun.markdown`): each block on lines of its own, the marks of its
 * containers (a quote's `>`, a list item's `-` or `1)`) left out, so a code
 * block in a list or a quote is code too; a code block's lines marked as
 * code (a fence's length, its character and its info string are the
 * parser's); a code span written in backticks; a table's row as
 * `| cell | cell |`; a link's or an image's text in its line (left out of
 * a link to a URL when `linkText` is `'local'`), and its target kept. An
 * HTML block (a comment, `<details>`) is a line of prose, as written.
 */
export const markdownOf = (text: string, linkText: 'all' | 'local' = 'all'): Markdown => {
  const links: Array<string> = [];
  const shown = (children: string, target: string) => {
    if (linkText === 'local' && URL_TARGET.test(target)) return '';
    return children;
  };
  const out = Bun.markdown.render(text, {
    heading: block,
    paragraph: block,
    listItem: block,
    table: block,
    html: block,
    hr: block,
    tr: (cells) => `\n|${cells}\n`,
    th: (cell) => ` ${cell} |`,
    td: (cell) => ` ${cell} |`,
    code: (lines) =>
      block(
        lines
          .replace(/\n$/, '')
          .split('\n')
          .map((line) => `${CODE}${line}`)
          .join('\n'),
      ),
    codespan: spanOf,
    link: (children, { href }) => {
      links.push(href);
      return shown(children, href);
    },
    image: (children, { src }) => {
      links.push(src);
      return shown(children, src);
    },
  });
  return {
    lines: out
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => ({ text: line.replace(CODE, ''), code: line.startsWith(CODE) })),
    links,
  };
};

/**
 * Each relative link a doc writes (`[x](reference/vision.md#part)`, an
 * image's source, a reference's target), its target without the part: a
 * link the parser reads in its prose, never code that looks like one
 * (`handlers[i](event)`) in a span or a code block. A URL, a link within the
 * doc (`#part`) and a site's path (`/…`) name no file of this tree.
 */
const linksIn = (markdown: Markdown): ReadonlyArray<Anchor> =>
  markdown.links
    .map((target) => target.replace(/[#?].*$/, ''))
    .filter((target) => target !== '' && !URL_TARGET.test(target) && !target.startsWith('/'))
    .map((target) => ({
      written: target,
      path: target.replace(/\/$/, ''),
      line: false,
      receipt: false,
      symbols: [],
      link: true,
    }));

/**
 * Each path a doc writes in backticks, with the symbols after it: `path`
 * `A`, `B`; in its prose's code spans and in its code blocks' lines alike (a
 * fenced template an agent pastes names the tree as surely as a sentence).
 */
const spannedIn = (markdown: Markdown): ReadonlyArray<Anchor> =>
  markdown.lines
    .map((line) => line.text)
    .filter((line) => !ANOTHER_REPO.test(line))
    .flatMap((line) =>
      matches(
        line,
        /`([\w@-][\w.@-]*\/[^`\s]*)`((?:\s+`[^`\n]+`(?:,\s+`[^`\n]+`)*)?)(\s+(?:at\s+`[0-9a-f]{7,40}`|deleted\b))?/g,
      ).flatMap((m) => {
        const written = firstGroup(m);
        if (/[<*{…]/.test(written)) return [];
        const path = written.replace(/:[\d,-]+$/, '').replace(/\/$/, '');
        return [
          {
            written,
            path,
            line: path !== written.replace(/\/$/, ''),
            receipt: group(m, 3) !== '',
            // A directory's list (`tools/` `lab*.ts`, `api-server.ts`) names files, not symbols.
            symbols: matches(group(m, 2), /`([^`]+)`/g)
              .map(firstGroup)
              .filter(
                (symbol) =>
                  /\.\w+$/.test(path) && /^(?:'[\w-]+'|[A-Za-z_$][\w$.]*(?:\(.*\))?)$/.test(symbol),
              ),
            link: false,
          },
        ];
      }),
    );

/** Each path a doc writes, in backticks with the symbols after it, or as a link's target. */
export const anchorsIn = (doc: Doc): ReadonlyArray<Anchor> => {
  const markdown = markdownOf(doc.text);
  return [...spannedIn(markdown), ...linksIn(markdown)];
};

export const FILM_SRC = 'packages/film/src';
export const DESIGN_LANGUAGE = 'design-language/design-language.md';

/** The docs that name the code in passing: their routes and anchors are read. */
export const SPANNED: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['NORTH_STAR.md', ['', FILM_SRC]],
  ['PRIOR_ARTS.md', ['', FILM_SRC]],
  ['apps/animations/README.md', ['', 'apps/animations', 'apps/animations/src', FILM_SRC]],
];

/**
 * The docs read for their anchors alone: they teach another package, or the
 * studio's look. Each is whole: every path it writes is under its bases.
 */
export const ANCHORED: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['CLAUDE.md', ['', 'packages/core']],
  ['packages/ui/README.md', ['', 'packages/ui']],
  ['packages/url-state/README.md', ['', 'packages/url-state']],
  ['packages/atom-solid/README.md', ['', 'packages/atom-solid']],
  ['apps/egw-search/README.md', ['', 'apps/egw-search']],
  [DESIGN_LANGUAGE, ['', FILM_SRC]],
];

/** The skills that teach the framework: every `.md` under them is read in full against the code. */
export const SKILL_DIRS = ['.claude/skills/film', '.claude/skills/film-architecture-loop'];

/**
 * The verify skills, each with the app it drives: every `.md` under one is
 * whole, read for its anchors from the repo root or the app, and for its
 * `bun run`s, each a script of the package its `--cwd` names.
 */
export const VERIFY_SKILLS: ReadonlyArray<readonly [string, string]> = [
  ['.claude/skills/verify-firsttheblade', 'apps/firsttheblade'],
  ['.claude/skills/verify-hymnal', 'apps/hymnal'],
];

/**
 * A doc the docs test reads, before its text: `framework` (the film README
 * and its skills, read in full against the code), `spanned` (it names the
 * code in passing), `anchored` (its anchors alone are read) or `verify` (a
 * verify skill's: its anchors and its scripts).
 */
export interface DocPlace extends Omit<Doc, 'text'> {
  readonly role: 'framework' | 'spanned' | 'anchored' | 'verify';
}

/**
 * Every doc the docs test reads, as the tree under `root` stands. Listed at
 * once (a skill's docs by a synchronous glob), so the docs test declares a
 * test for each doc as it loads.
 */
export const docPlaces = (root: string): ReadonlyArray<DocPlace> => [
  {
    path: 'packages/film/README.md',
    bases: ['', 'packages/film', FILM_SRC],
    whole: false,
    role: 'framework',
  },
  ...SKILL_DIRS.flatMap((dir) =>
    Array.from(new Glob('**/*.md').scanSync({ cwd: `${root}/${dir}` }))
      .sort()
      .map((file): DocPlace => ({
        path: `${dir}/${file}`,
        bases: ['', FILM_SRC],
        whole: false,
        role: 'framework',
      })),
  ),
  ...SPANNED.map(([path, bases]): DocPlace => ({ path, bases, whole: false, role: 'spanned' })),
  ...ANCHORED.map(([path, bases]): DocPlace => ({ path, bases, whole: true, role: 'anchored' })),
  ...VERIFY_SKILLS.flatMap(([dir, app]) =>
    Array.from(new Glob('**/*.md').scanSync({ cwd: `${root}/${dir}` }))
      .sort()
      .map((file): DocPlace => ({
        path: `${dir}/${file}`,
        bases: ['', app],
        whole: true,
        role: 'verify',
      })),
  ),
];

/** The doc at `place`, read from `root`. */
export const readDoc = Effect.fn('docs.readDoc')(function* (root: string, place: DocPlace) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(`${root}/${place.path}`);
  return { path: place.path, text, bases: place.bases, whole: place.whole } satisfies Doc;
});

/** Every doc whose anchors are read (`docPlaces`), each read from `root`. */
export const readAllDocs = (root: string) =>
  Effect.forEach(docPlaces(root), (place) => readDoc(root, place), { concurrency: 8 });

/** What follows a path written as a receipt: `at \`<commit>\`` or `deleted`. */
const RECEIPT = /^(?:\s+`[^`\n]+`(?:,\s+`[^`\n]+`)*)?\s+(?:at\s+`[0-9a-f]{7,40}`|deleted\b)/;

/** A doc's line that names a file a diff changed: where it stands (1-based), the files it names, and its text. */
export interface DocLine {
  readonly doc: string;
  readonly line: number;
  readonly files: ReadonlyArray<string>;
  readonly text: string;
}

/**
 * Each line of each doc that writes an anchor naming one of `changed` (repo
 * paths): the anchor read from each of the doc's bases (a link from the
 * doc's own folder), so `tools/review.ts` in the film README names
 * `packages/film/src/tools/review.ts`. A line is found by the anchor as
 * written: its path in backticks, or a link's target. In the docs' order,
 * each doc's lines in order, one entry a line.
 */
export const docLines = (docs: ReadonlyArray<Doc>, changed: ReadonlySet<string>) =>
  Effect.map(Path.Path, (path): ReadonlyArray<DocLine> =>
    docs.flatMap((doc) => {
      const lines = doc.text.split('\n');
      const named = new Map<number, Set<string>>();
      // A receipt names the tree as it was: a change since leaves it true.
      for (const anchor of anchorsIn(doc).filter((a) => !a.receipt)) {
        const { froms, written } = Bool.match(anchor.link, {
          onTrue: () => ({
            froms: [path.join(path.dirname(doc.path), anchor.path)],
            written: `](${anchor.written}`,
          }),
          onFalse: () => ({
            froms: doc.bases.map((base) => path.join(base, anchor.path)),
            written: `\`${anchor.written}\``,
          }),
        });
        const files = froms.filter((file) => changed.has(file));
        if (files.length === 0) continue;
        lines.forEach((text, i) => {
          // Another repo's row, and the same path written as a receipt, name no file of this tree as it stands.
          if (!text.includes(written) || ANOTHER_REPO.test(text)) return;
          if (RECEIPT.test(text.slice(text.indexOf(written) + written.length))) return;
          const on = named.get(i) ?? new Set<string>();
          for (const file of files) on.add(file);
          named.set(i, on);
        });
      }
      return Array.from(named, ([i, files]) => ({
        doc: doc.path,
        line: i + 1,
        files: Array.from(files).sort(),
        text: lines[i]?.trim() ?? '',
      })).sort((a, b) => a.line - b.line);
    }),
  );
