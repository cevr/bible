// The docs name what the code has: each doc that teaches the film framework
// (its README, the `film` skill and the loop's) is read against the source,
// so a route, a rule, a script, a path, a flag or a finding renamed or removed
// in the code fails here instead of waiting for a sweep to read it. Read:
//
// - the route tables in packages/film/README.md: each row is a route the lab's
//   API declares (`routesOf`), and each declared route has a
//   row. A cell may list more than one: `POST /api/films/<film>/undo`, `/redo` (a
//   sibling of the path before), `GET /api/films/<film>/project`; `POST …/say`
//   (below it);
// - each route in running text, here and in NORTH_STAR.md and the app's
//   README: a `GET /api/…` span is a declared route, and a bare API path
//   (`/api/review/frame`, or an old `/review/…` or `/lab/<film>/…`) is the
//   path of one, or a prefix of some (`/api/films/<film>/studio/*`);
// - each `film/<rule>` named: registered in the `film` lint plugin, and each
//   registered rule turned on in .oxlintrc.json;
// - each `bun run <script>`: a script of the root, this package, or the app
//   whose scripts run the film commands (its package.json, never its films);
// - each path written in backticks, in these docs and in NORTH_STAR.md,
//   PRIOR_ARTS.md, CLAUDE.md, the design language and the packages' and
//   apps' READMEs, from the repo root or from the doc's own package
//   (`lab/page-shell.tsx`, `src/…`), exists, and each symbol written after it
//   (`tools/review.ts` `Review.read`) is declared in its code (`read` a
//   member of `Review`'s declaration); an anchor names a symbol, never a
//   `path:line`, so a moved line keeps it and a renamed symbol fails it
//   (a receipt `at <commit>` or a path `deleted` names the tree as it was);
//   in a doc whose every path is under its bases, a first directory under
//   none of them is a mistyped path;
// - the design language's §3 block is the player's tokens.css, and no mock
//   writes a token: each wears tokens.css and the kit;
// - each `--flag` given to a film command (`bun run render <film> --stills …`)
//   is declared by a `Flag` in src/tools (`--no-x` by its `x`);
// - on a command line that runs `check` (`bun run check …  # warns …`), each
//   finding named is a tagged error in src.
//
// What a sentence claims about the code stays with the sweep's reading.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { parseSync } from 'oxc-parser';
import { LabHttpApi, declares as declaresRoute, routesOf } from './core/api.ts';

/** What the docs are read against. */
interface Code {
  readonly routes: ReadonlySet<string>;
  readonly registered: ReadonlySet<string>;
  readonly enabled: ReadonlySet<string>;
  readonly scripts: ReadonlySet<string>;
  /** The scripts that run a film command (`bun cli.ts <command>`). */
  readonly filmCommands: ReadonlySet<string>;
  readonly flags: ReadonlySet<string>;
  readonly tags: ReadonlySet<string>;
}

interface Doc {
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

const matches = (text: string, pattern: RegExp): ReadonlyArray<RegExpExecArray> =>
  Array.from(text.matchAll(pattern));

const firstGroup = (m: RegExpExecArray) => Option.getOrElse(Option.fromUndefinedOr(m[1]), () => '');

/** `/api/films/<film>/choices/mix?point=&variant=` as declared: `/api/films/:film/choices/mix`; a `<ref>` is the rest of the path. */
const declaredPath = (written: string) =>
  written
    .replace(/\[?\?.*$/, '')
    .replaceAll('<ref>', '*')
    .replace(/<(\w+)>/g, ':$1');

const group = (m: RegExpExecArray, n: number) =>
  Option.getOrElse(Option.fromUndefinedOr(m[n]), () => '');

/** The path a span writes, read against the path before it: `…/say` below it, `/redo` beside it. */
const pathAfter = (before: string, written: string) => {
  if (written.startsWith('…/')) return `${before}${written.slice(1)}`;
  if (/^\/[^/]+$/.test(written) && before !== '')
    return `${before.slice(0, before.lastIndexOf('/'))}${written}`;
  return written;
};

/** A route row's first cell read into `METHOD path`s, each span against the one before. */
const routesInCell = (cell: string): ReadonlyArray<string> => {
  const out: Array<string> = [];
  let method = '';
  let path = '';
  for (const span of matches(cell, /`([^`]+)`/g).map(firstGroup))
    for (const parts of Option.toArray(
      Option.fromNullOr(/^(?:(GET|POST|PUT|DELETE) )?(\S+)$/.exec(span.trim())),
    )) {
      method = group(parts, 1) || method;
      path = pathAfter(path, group(parts, 2));
      out.push(`${method} ${declaredPath(path)}`);
    }
  return out;
};

/** Every route the doc's tables document: rows whose first cell starts with a method. */
const documentedRoutes = (doc: Doc): ReadonlyArray<string> =>
  matches(doc.text, /^\| *(`(?:GET|POST|PUT|DELETE) [^|]*)\|/gm).flatMap((m) =>
    routesInCell(firstGroup(m)),
  );

const routeDrift = (doc: Doc, code: Code) =>
  documentedRoutes(doc)
    .filter((route) => !code.routes.has(route))
    .map((route) => `route ${route} is declared by no API`);

/** A path the lab's API has or once had: under `/api/`, or the old `/review/…` and `/lab/<film>/…`. */
const API_PATH = /^\/(?:api|review)\/|^\/lab\/(?:<film>|:film)\//;

/**
 * Each route written in running text: a span `GET /api/…` is a declared
 * route, and a bare API path (`/api/review/frame`) is the path of one.
 */
const spanDrift = (doc: Doc, code: Code) => {
  const paths = new Set(Array.from(code.routes).map((route) => route.replace(/^\S+ /, '')));
  return matches(doc.text, /`([^`\n]+)`/g).flatMap((m) =>
    Option.toArray(
      Option.fromNullOr(/^(?:(GET|POST|PUT|DELETE) )?(\/\S+)$/.exec(firstGroup(m).trim())),
    ).flatMap((parts) => {
      const method = group(parts, 1);
      const path = declaredPath(group(parts, 2));
      if (!API_PATH.test(path)) return [];
      if (method === '') {
        // A prefix (`/api/`, `/api/films/<film>/studio/*`) names the routes under it.
        const prefix = path.replace(/\*$/, '');
        if (
          paths.has(path) ||
          (prefix.endsWith('/') && [...paths].some((p) => p.startsWith(prefix)))
        )
          return [];
        return [`path ${path} is no route of the API`];
      }
      if (code.routes.has(`${method} ${path}`)) return [];
      return [`route ${method} ${path} is declared by no API`];
    }),
  );
};

const ruleDrift = (doc: Doc, code: Code) =>
  matches(doc.text, /`film\/([a-z]+(?:-[a-z]+)+)`/g)
    .map(firstGroup)
    .filter((rule) => !code.registered.has(rule))
    .map((rule) => `rule film/${rule} is not registered`);

const scriptDrift = (doc: Doc, code: Code) =>
  matches(doc.text, /\bbun run ([a-z][\w:-]*)/g)
    .map(firstGroup)
    .filter((script) => !code.scripts.has(script))
    .map((script) => `bun run ${script}: no such script`);

/**
 * A path a doc writes in backticks, read from one of the doc's bases, and the
 * symbols written after it (`lab/page-shell.tsx` `partHref`, `Review.read`).
 */
interface Anchor {
  readonly written: string;
  /** The path without a `:line`, a trailing `/` or a call's `(…)`. */
  readonly path: string;
  /** Written as `path:line`, which a moved line breaks without a sound. */
  readonly line: boolean;
  /** A receipt that names the tree as it was: `… at \`<commit>\`` or `… deleted`. */
  readonly receipt: boolean;
  readonly symbols: ReadonlyArray<string>;
}

/**
 * A table row about another repo, its first cell the repo's slug
 * (`cgwire/kitsu`; a `film/<rule>` is a rule): its paths are that repo's.
 */
const ANOTHER_REPO = /^\| `(?!film\/)[\w-]+\/[\w.-]+` +\|/;

/** Each path a doc writes, with the symbols after it: `path` `A`, `B`. */
const anchorsIn = (doc: Doc): ReadonlyArray<Anchor> =>
  doc.text
    .split('\n')
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
          },
        ];
      }),
    );

/** An anchor as the tree has it: the file it names under the doc's bases, and that file's text. */
interface Found {
  readonly anchor: Anchor;
  /** Under none of the doc's bases (its first directory is none of theirs): another tree's path. */
  readonly ours: boolean;
  readonly file: Option.Option<string>;
  readonly text: Option.Option<string>;
}

/** A file's code without its comments, which may still name what the code dropped. */
const uncommented = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|(?<![:'"`\w])\/\/.*$/gm, '');

/**
 * Where code declares `name`: a binding, a function, a class, a type; an
 * object's key or a class's member; or an export's name. A word used is not
 * one declared.
 */
const declaration = (name: string) => {
  const n = name.replaceAll('$', '\\$');
  const end = '(?![\\w$])';
  const modifiers =
    '(?:(?:export|readonly|static|async|get|set|public|private|protected|declare|abstract|override)\\s+)*';
  return new RegExp(
    [
      `\\b(?:const|let|var|function\\*?|class|interface|type|enum|namespace)\\s+${n}${end}`,
      `^\\s*${modifiers}['"]?${n}['"]?\\??\\s*[:(=<]`,
      `[{,]\\s*['"]?${n}['"]?\\??\\s*[:(]`,
      `[{,]\\s*${n}\\s*(?=[,}])`,
      `\\bexport\\s*\\{[^}]*(?<![\\w$])${n}${end}[^}]*\\}`,
      `\\bexport\\s*\\*\\s*as\\s+${n}${end}`,
    ].join('|'),
    'm',
  );
};

/** The top-level statement that starts at `at`: up to the next line that starts at the margin. */
const statementAt = (code: string, at: number) => {
  const rest = code.slice(at);
  const next = rest.slice(1).search(/\n(?![\s})\]])/);
  return Option.match(
    Option.filter(Option.some(next), (n) => n >= 0),
    { onNone: () => rest, onSome: (n) => rest.slice(0, n + 1) },
  );
};

/**
 * Whether a file's code declares a symbol: `Review` declared, and for
 * `Review.read` each later part declared within `Review`'s statement; a
 * `'lab'` as written.
 */
const declares = (text: string, symbol: string) => {
  // An import names another file's declaration.
  const code = uncommented(text).replace(/^import\s[\s\S]*?\sfrom\s*['"][^'"]+['"];?/gm, '');
  if (symbol.startsWith("'")) return code.includes(symbol);
  const [head = '', ...members] = symbol.replace(/\(.*\)$/, '').split('.');
  return Option.match(Option.fromNullishOr(declaration(head).exec(code)), {
    onNone: () => false,
    onSome: (found) => {
      const statement = statementAt(code, found.index);
      return members.every((member) => declaration(member).test(statement));
    },
  });
};

/** A package's name (`@bible/url-state`), written as a path: no file of this tree. */
const PACKAGE_NAME = /^@[\w-]+\/[\w.-]+/;

/** The directories the repo's root `.gitignore` names (`tmp/`, `**\/test-results/`): output, never in the tree. */
const ignoredDirectories = (gitignore: string): ReadonlySet<string> =>
  new Set(
    gitignore
      .split('\n')
      .map((line) =>
        line
          .trim()
          .replace(/^\*\*\//, '')
          .replace(/\/$/, ''),
      )
      .filter((line) => /^[\w.-]+$/.test(line)),
  );

/**
 * What a doc's anchors name that the tree lacks: a path that is gone, a
 * symbol its file no longer declares, or a `path:line` (a line moves under
 * an edit and still resolves; a symbol fails when it is renamed). A receipt
 * at a commit or of a deletion names the tree as it was, so it is not read.
 */
const anchorDrift = (found: ReadonlyArray<Found>) =>
  found
    .filter(({ anchor, ours }) => ours && !anchor.receipt)
    .flatMap(({ anchor, file, text }) => [
      ...[`${anchor.written}: name a symbol, not a line`].filter(() => anchor.line),
      ...Option.match(file, {
        onNone: () => [`path ${anchor.path} does not exist`],
        onSome: (at) =>
          anchor.symbols
            .filter((symbol) => !Option.exists(text, (t) => declares(t, symbol)))
            .map((symbol) => `${at} has no ${symbol}`),
      }),
    ]);

/**
 * Each anchor looked up under the doc's bases: the first base that has its
 * first directory reads it. Under none, it is another tree's path, unless the
 * doc is whole and it is neither a package's (`@bible/url-state`, an
 * installed `effect/Schema`) nor ignored output (`tmp/logs`).
 */
const findAnchors = Effect.fn('test.docs.findAnchors')(function* (root: string, doc: Doc) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const isDirectory = (at: string) =>
    Effect.map(
      Effect.option(fs.stat(path.join(root, at))),
      Option.exists((info) => info.type === 'Directory'),
    );
  const ignored = ignoredDirectories(yield* fs.readFileString(path.join(root, '.gitignore')));
  const elsewhere = (anchor: Anchor, first: string) =>
    Effect.map(
      isDirectory(path.join('node_modules', first)),
      (installed) => installed || PACKAGE_NAME.test(anchor.path) || ignored.has(first),
    );
  return yield* Effect.forEach(anchorsIn(doc), (anchor) =>
    Effect.gen(function* () {
      const first = anchor.path.split('/')[0] ?? '';
      const bases = yield* Effect.filter(doc.bases, (base) => isDirectory(path.join(base, first)));
      const under = yield* Effect.filter(bases, (base) =>
        fs.exists(path.join(root, base, anchor.path)),
      );
      const file = Option.map(Option.fromUndefinedOr(under[0]), (base) =>
        path.join(base, anchor.path),
      );
      // Read only when a symbol is to be found in it.
      const read = Option.filter(file, () => anchor.symbols.length > 0);
      return {
        anchor,
        ours: bases.length > 0 || (doc.whole && !(yield* elsewhere(anchor, first))),
        file,
        text: yield* Option.match(read, {
          onNone: () => Effect.succeed(Option.none<string>()),
          onSome: (at) => Effect.option(fs.readFileString(path.join(root, at))),
        }),
      } satisfies Found;
    }),
  );
});

/** Each `--flag` given to a film command on a line, before its `#` comment. */
const flagDrift = (line: string, code: Code) =>
  matches(line, /\bbun run ([a-z][\w:-]*)([^#`]*)/g)
    .filter((m) => code.filmCommands.has(firstGroup(m)))
    .flatMap((m) =>
      matches(group(m, 2), /(?:^|\s|\[)--([a-z][a-z-]*)/g)
        .map(firstGroup)
        .filter((flag) => !code.flags.has(flag.replace(/^no-/, '')))
        .map((flag) => `bun run ${firstGroup(m)} --${flag}: no command declares the flag`),
    );

/** On a `bun run check` command line, each finding it names. */
const findingDrift = (line: string, code: Code) => {
  if (!/^\s*bun run check\b/.test(line)) return [];
  return matches(line, /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g)
    .map(firstGroup)
    .filter((name) => !code.tags.has(name))
    .map((name) => `${name} is no finding`);
};

/** What a doc names that the code does not have, one line each. */
const drift = (doc: Doc, code: Code): ReadonlyArray<string> =>
  [
    ...routeDrift(doc, code),
    ...spanDrift(doc, code),
    ...ruleDrift(doc, code),
    ...scriptDrift(doc, code),
    ...doc.text
      .split('\n')
      .flatMap((line) => [...flagDrift(line, code), ...findingDrift(line, code)]),
  ].map((what) => `${doc.path}: ${what}`);

/** Every declared route documented: the declared routes no table row names. */
const undocumented = (docs: ReadonlyArray<Doc>, code: Code): ReadonlyArray<string> => {
  const documented = new Set(docs.flatMap(documentedRoutes));
  return Array.from(code.routes).filter((route) => !documented.has(route));
};

const Scripts = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) }),
);

/** The repo's code as the docs name it. */
const readCode = Effect.fn('test.docs.readCode')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const at = (...parts: ReadonlyArray<string>) => path.join(root, ...parts);
  const read = (...parts: ReadonlyArray<string>) => fs.readFileString(at(...parts));
  const sources = (dir: string) =>
    Effect.flatMap(fs.readDirectory(at(dir), { recursive: true }), (files) =>
      Effect.forEach(
        files.filter((f) => f.endsWith('.ts') && !f.includes('node_modules')),
        (f) => read(dir, f),
      ),
    );
  const packages = yield* Effect.forEach(
    ['package.json', 'apps/animations/package.json', 'packages/film/package.json'],
    (file) => Effect.flatMap(read(file), Schema.decodeUnknownEffect(Scripts)),
  );
  const scripts = packages.flatMap((p) => Object.entries(p.scripts));
  const plugin = yield* read('packages/film/lint/plugin.ts');
  const oxlintrc = yield* read('.oxlintrc.json');
  const tools = (yield* sources('packages/film/src/tools')).join('\n');
  const src = (yield* sources('packages/film/src')).join('\n');
  return {
    routes: new Set(routesOf(LabHttpApi).map((r) => `${r.method} ${r.path}`)),
    registered: new Set(matches(plugin, /^ {4}'([a-z-]+)': /gm).map(firstGroup)),
    enabled: new Set(matches(oxlintrc, /"film\/([a-z-]+)": "error"/g).map(firstGroup)),
    scripts: new Set(scripts.map(([name]) => name)),
    filmCommands: new Set(
      scripts.filter(([, run]) => run.startsWith('bun cli.ts ')).map(([name]) => name),
    ),
    flags: new Set(matches(tools, /Flag\.\w+\(\s*'([a-z][a-z-]*)'/g).map(firstGroup)),
    tags: new Set(matches(src, /TaggedError<(\w+)>/g).map(firstGroup)),
  } satisfies Code;
});

const FILM_SRC = 'packages/film/src';
const DESIGN_LANGUAGE = 'design-language/design-language.md';

/** The docs that teach the framework, read in full against the code. */
const readDocs = Effect.fn('test.docs.readDocs')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const skills = yield* Effect.forEach(
    ['.claude/skills/film', '.claude/skills/film-architecture-loop'],
    (dir) =>
      Effect.map(fs.readDirectory(path.join(root, dir), { recursive: true }), (files) =>
        files.filter((f) => f.endsWith('.md')).map((f) => [`${dir}/${f}`, ['', FILM_SRC]] as const),
      ),
  );
  return yield* readEach(
    root,
    [['packages/film/README.md', ['', 'packages/film', FILM_SRC]], ...skills.flat()],
    false,
  );
});

/** The docs that name the code in passing: their routes and anchors are read. */
const SPANNED: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['NORTH_STAR.md', ['', FILM_SRC]],
  ['PRIOR_ARTS.md', ['', FILM_SRC]],
  ['apps/animations/README.md', ['', 'apps/animations', 'apps/animations/src', FILM_SRC]],
];

/**
 * The docs read for their anchors alone: they teach another package, or the
 * studio's look. Each is whole: every path it writes is under its bases.
 */
const ANCHORED: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['CLAUDE.md', ['', 'packages/core']],
  ['packages/ui/README.md', ['', 'packages/ui']],
  ['packages/url-state/README.md', ['', 'packages/url-state']],
  ['packages/atom-solid/README.md', ['', 'packages/atom-solid']],
  ['apps/egw-search/README.md', ['', 'apps/egw-search']],
  [DESIGN_LANGUAGE, ['', FILM_SRC]],
];

const readEach = Effect.fn('test.docs.readEach')(function* (
  root: string,
  docs: ReadonlyArray<readonly [string, ReadonlyArray<string>]>,
  whole: boolean,
) {
  const fs = yield* FileSystem.FileSystem;
  return yield* Effect.forEach(docs, ([file, bases]) =>
    Effect.map(fs.readFileString(`${root}/${file}`), (text): Doc => ({
      path: file,
      text,
      bases,
      whole,
    })),
  );
});

/** What each doc's anchors name that the tree lacks, one line each. */
const anchorsDrift = (root: string, docs: ReadonlyArray<Doc>) =>
  Effect.map(
    Effect.forEach(docs, (doc) =>
      Effect.map(findAnchors(root, doc), (found) =>
        anchorDrift(found).map((what) => `${doc.path}: ${what}`),
      ),
    ),
    (each) => each.flat(),
  );

const ROOT = Effect.map(Path.Path, (path) => path.join(import.meta.dir, '..', '..', '..'));

const TOKENS_CSS = 'packages/film/src/player/tokens.css';
const MOCKS = 'design-language/mocks';

/** The design language's §3 block: the css it shows as the tokens. */
const tokenBlock = (doc: string) =>
  Option.getOrElse(
    Option.fromNullishOr(/^## 3\. Tokens\n[\s\S]*?^```css\n([\s\S]*?)^```/m.exec(doc)?.[1]),
    () => '',
  );

/** The player's sheet from its tokens (`:root {`) to the end of their queries, before the ground every page stands on. */
const declaredTokens = (sheet: string) => {
  const start = sheet.indexOf(':root {');
  const end = sheet.indexOf('/* The ground every page');
  return `${sheet.slice(start, end).trimEnd()}\n`;
};

/** Each custom property the player's sheet declares. */
const tokenNames = (sheet: string): ReadonlySet<string> =>
  new Set(matches(sheet, /(--[\w-]+)\s*:/g).map(firstGroup));

/** A scale of the player's sheet: the properties it sets, and the px its tokens give. */
interface Scale {
  readonly what: string;
  readonly property: RegExp;
  readonly steps: ReadonlySet<number>;
}

/** The px of each token in the sheet whose name `name` matches (`--s-2: 8px` is 8). */
const stepsOf = (sheet: string, name: RegExp): ReadonlySet<number> =>
  new Set(
    matches(declaredTokens(sheet), /(--[\w-]+)\s*:\s*(\d+(?:\.\d+)?)px/g)
      .filter((m) => name.test(m[1] ?? ''))
      .map((m) => Number(m[2])),
  );

/**
 * The space, type and radius scales of the player's sheet, each over every
 * property that sets it: a side's or a logical side's margin and padding, a
 * gap, a corner's radius.
 */
const scalesOf = (sheet: string): ReadonlyArray<Scale> => [
  {
    what: 'space',
    property:
      /^(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$|^(?:row-|column-)?gap$/,
    steps: stepsOf(sheet, /^--s-/),
  },
  { what: 'type size', property: /^font-size$/, steps: stepsOf(sheet, /^--fs-/) },
  { what: 'line height', property: /^line-height$/, steps: stepsOf(sheet, /^--lh-/) },
  {
    what: 'radius',
    property: /^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/,
    steps: stepsOf(sheet, /^--r-/),
  },
];

/**
 * A value's words as CSS reads them: split at the spaces outside any
 * parentheses, and a slash outside them a word of its own, so a function
 * (`calc(var(--lh-2) + 3px)`) is one word, whole.
 */
const wordsOf = (value: string): ReadonlyArray<string> => {
  const words: Array<string> = [];
  let word = '';
  let depth = 0;
  const end = () => {
    if (word !== '') words.push(word);
    word = '';
  };
  for (const c of value) {
    if (depth === 0 && /\s/.test(c)) end();
    else if (depth === 0 && c === '/') {
      end();
      words.push('/');
    } else {
      if (c === '(') depth += 1;
      if (c === ')' && depth > 0) depth -= 1;
      word += c;
    }
  }
  end();
  return words;
};

/** A declaration as its longhands: the `font` shorthand's size and line height (`15px/19px mono`), else itself. */
const longhands = (property: string, value: string): ReadonlyArray<readonly [string, string]> => {
  if (property !== 'font') return [[property, value]];
  // The size is all before the slash; the line height, the one word after it, whole.
  const words = wordsOf(value);
  const slash = words.indexOf('/');
  if (slash < 0) return [['font-size', value]];
  return [
    ['font-size', words.slice(0, slash).join(' ')],
    ['line-height', words[slash + 1] ?? ''],
  ];
};

/**
 * Each declaration a mock writes, as longhands: in its sheets' rules and in
 * its elements' `style` attributes, comments left out.
 */
const declarationsOf = (text: string): ReadonlyArray<readonly [string, string]> => {
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  return [
    ...matches(bare, /\{([^{}]*)\}/g).map(firstGroup),
    ...matches(bare, /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/g).map((m) => m[1] ?? m[2] ?? ''),
  ].flatMap((body) =>
    matches(body, /(?<![\w-])([a-z][a-z-]*)\s*:\s*([^;]+)/g).flatMap((declaration) =>
      longhands(declaration[1] ?? '', declaration[2] ?? ''),
    ),
  );
};

/**
 * Each px length a mock writes for a space, type or radius that no step of
 * the scale gives. A length derived from one the rule names (a dot's margin
 * of half its size, `calc(var(--dot) / -2)`) writes no px of its own.
 */
const scaleDrift = (file: string, text: string, scales: ReadonlyArray<Scale>) =>
  declarationsOf(text).flatMap(([property, value]) =>
    scales
      .filter((scale) => scale.property.test(property))
      .flatMap((scale) =>
        matches(value, /(-?\d*\.?\d+)px/g)
          .map((length) => Number(length[1]))
          .filter((px) => !scale.steps.has(px))
          .map((px) => `${file}: ${property} ${px}px is no ${scale.what} step`),
      ),
  );

/**
 * What a mock does that the kit owns: writes a token, wears no tokens.css or
 * kit.css (nor lab.css, a Lab mock), or sets a space, type or radius off the
 * scales.
 */
const mockDrift = (
  file: string,
  text: string,
  tokens: ReadonlySet<string>,
  scales: ReadonlyArray<Scale>,
) => [
  ...['tokens.css', 'kit.css', ...['lab.css'].filter(() => /^lab[-.]/.test(file))]
    .filter((sheet) => file.endsWith('.html') && !new RegExp(`href="[^"]*${sheet}"`).test(text))
    .map((sheet) => `${file}: links no ${sheet}`),
  ...Array.from(new Set(matches(text, /(--[\w-]+)\s*:/g).map(firstGroup)))
    .filter((name) => tokens.has(name))
    .map((name) => `${file}: writes ${name}`),
  ...scaleDrift(file, text, scales),
];

/**
 * Where a comment names a `METHOD /api/…`: the method, and the path just
 * after it. A path that starts with no name (`/api/…`) stands for every
 * route, and names none.
 */
const CITED_ROUTE = /\b(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\s+`?(?=\/api\/[a-z$<:])/g;

/** The bracket that opens each closing one. */
const OPENER = { ')': '(', ']': '[', '}': '{' } as const;

const closes = (c: string): c is keyof typeof OPENER => c in OPENER;

/** Whether `c` ends a path whose brackets `open` are open: a space, a quote, a backtick, or a bracket the path did not open. */
const endsPath = (c: string, open: ReadonlyArray<string>) =>
  /[\s'"`]/.test(c) || (closes(c) && open.at(-1) !== OPENER[c]);

/** Where the `${…}` at `at` in `text` ends: just past the brace that closes it, whatever it holds. */
const templateEnd = (text: string, at: number): number => {
  let depth = 0;
  for (let i = at + 1; i < text.length; i += 1) {
    depth += Number(text.charAt(i) === '{') - Number(text.charAt(i) === '}');
    if (depth === 0) return i + 1;
  }
  return text.length;
};

/** A path a comment cites: as written, and as read (each `${…}` in it `${}`). */
interface Cited {
  readonly written: string;
  readonly read: string;
}

/**
 * The path written at the start of `text`, whole. It runs to a space, a
 * quote, a backtick, or a bracket it did not open (a parenthesis around
 * it); a bracket it opens is its own (`knob(extra)`), a `${…}` is read to
 * the brace that closes it, and the stops that end a sentence (`.,;:`) are
 * not its own.
 */
const citedPath = (text: string): Cited => {
  const open: Array<string> = [];
  let read = '';
  let at = 0;
  while (at < text.length && !endsPath(text.charAt(at), open)) {
    const c = text.charAt(at);
    if (text.startsWith('${', at)) {
      at = templateEnd(text, at);
      read += '${}';
    } else {
      if (closes(c)) open.pop();
      if ('([{'.includes(c)) open.push(c);
      read += c;
      at += 1;
    }
  }
  const stops = read.length - read.replace(/[.,;:]+$/, '').length;
  return {
    written: text.slice(0, at - stops),
    read: read.slice(0, read.length - stops),
  };
};

/** A cited path as the API matches it: each parameter (`<x>`, `:x`, `${…}`) one segment, no query or hash. */
const pathOf = (read: string) =>
  read
    .replace(/\$\{\}|<[^>\s]+>|(?<=\/):\w+/g, 'x')
    .split(/[?#]/)
    .at(0) ?? '';

/**
 * Each route a comment in `text` names that the API does not declare, with
 * its file and line: the comments as the parser (oxc) reads them, so a
 * comment after code or a block's unstarred body is read, and a string that
 * looks like one is not.
 */
const commentRouteDrift = (
  file: string,
  text: string,
  has: (method: string, pathname: string) => boolean,
): ReadonlyArray<string> => {
  const parsed = parseSync(file, text);
  if (parsed.errors.length > 0) return [`${file}: the parser cannot read it`];
  return parsed.comments.flatMap((comment) =>
    // A comment's text starts after its `//` or `/*`.
    matches(comment.value, CITED_ROUTE).flatMap((m) => {
      const method = firstGroup(m);
      const cited = citedPath(comment.value.slice(m.index + m[0].length));
      const line = text.slice(0, comment.start + 2 + m.index).split('\n').length;
      return Array.of(`${file}:${line}: ${method} ${cited.written} is declared by no API`).filter(
        () => !has(method, pathOf(cited.read)),
      );
    }),
  );
};

describe('the docs', () => {
  it.effect.layer(BunServices.layer)(
    'let no comment in the film package name a route the API does not declare',
    () =>
      Effect.gen(function* () {
        const root = yield* ROOT;
        const fs = yield* FileSystem.FileSystem;
        const has = declaresRoute(LabHttpApi);
        const files = (yield* fs.readDirectory(`${root}/${FILM_SRC}`, { recursive: true })).filter(
          (f) => /\.tsx?$/.test(f) && !f.includes('node_modules'),
        );
        expect(files.length).toBeGreaterThan(100);
        const drift = yield* Effect.forEach(files, (file) =>
          Effect.map(fs.readFileString(`${root}/${FILM_SRC}/${file}`), (text) =>
            commentRouteDrift(file, text, has),
          ),
        );
        expect(drift.flat()).toEqual([]);
        // A comment that names a route the API lacks is red, wherever the comment sits: its
        // own line, after code, a block's unstarred body; HEAD and OPTIONS too. A declared
        // route is not, its parameters written as `<x>`, `:x` or `${…}`; nor is a string.
        expect(
          commentRouteDrift(
            'red.ts',
            [
              '// POST /api/films/<film>/choices/level moved a knob',
              '/**',
              ' * GET /api/review/gone',
              ' */',
              '// POST /api/films/<film>/choices/knob and GET /api/review/index',
              "const url = 'GET /api/nowhere';",
              'const a = 1; // POST /api/films/:film/choices/level after code',
              '/*',
              '  GET /api/review/also-gone',
              '*/',
              '// HEAD /api/review/index, OPTIONS /api/films/<film>/notes',
              '// GET /api/films/${encodeURIComponent(film)}/notes/wait, POST /api/films/:film/notes/:id/reply.',
              '// GET /api/films/${encodeURIComponent({ name: film }.name)}/notes/wait (GET /api/review/index).',
              '// `POST /api/films/<film>/choices/knob(extra)` takes no knob',
              'const doc = `',
              '// GET /api/nowhere/in/a/string',
              ' * POST /api/never',
              '`;',
            ].join('\n'),
            has,
          ),
        ).toEqual([
          'red.ts:1: POST /api/films/<film>/choices/level is declared by no API',
          'red.ts:3: GET /api/review/gone is declared by no API',
          'red.ts:7: POST /api/films/:film/choices/level is declared by no API',
          'red.ts:9: GET /api/review/also-gone is declared by no API',
          'red.ts:11: HEAD /api/review/index is declared by no API',
          'red.ts:11: OPTIONS /api/films/<film>/notes is declared by no API',
          'red.ts:14: POST /api/films/<film>/choices/knob(extra) is declared by no API',
        ]);
        // A file the parser cannot read is red: its comments are not known.
        expect(commentRouteDrift('broken.ts', 'const = ;', has)).toEqual([
          'broken.ts: the parser cannot read it',
        ]);
      }),
  );

  it.effect.layer(BunServices.layer)(
    'name only routes, rules, scripts, paths, symbols, flags and findings the code has',
    () =>
      Effect.gen(function* () {
        const root = yield* ROOT;
        const [code, docs, spanned, anchored] = yield* Effect.all([
          readCode(root),
          readDocs(root),
          readEach(root, SPANNED, false),
          readEach(root, ANCHORED, true),
        ]);
        expect(docs.flatMap((doc) => drift(doc, code))).toEqual([]);
        // The owner's runbook, the prior arts and the app's README name routes too.
        expect(
          spanned.flatMap((doc) => spanDrift(doc, code).map((what) => `${doc.path}: ${what}`)),
        ).toEqual([]);
        expect(yield* anchorsDrift(root, [...docs, ...spanned, ...anchored])).toEqual([]);
        expect(undocumented(docs, code)).toEqual([]);
        // Each registered rule is on for the paths it guards.
        expect(Array.from(code.registered).filter((rule) => !code.enabled.has(rule))).toEqual([]);
      }),
  );

  it.effect.layer(BunServices.layer)('fail a doc that names what the code no longer has', () =>
    Effect.gen(function* () {
      const root = yield* ROOT;
      const code = yield* readCode(root);
      const stale: Doc = {
        path: 'stale.md',
        bases: ['', FILM_SRC],
        whole: false,
        text: [
          '| `GET /index.json` | the old index |',
          'Mute a take with `film/no-such-rule`, then `bun run nothing`.',
          'See `packages/film/src/tools/gone.ts`.',
          'bun run render <film> --tag p7   # render a tagged variant',
          'bun run check <film>             # warns VoiceLevel, SeamLong',
          'Its frame is `/review/frame`; say it with `POST /review/project/<film>/say`.',
          'Every page a Place (`packages/film/src/core/api.ts` `Places`, `pageHrefs`).',
          'The review is read by `tools/review.ts` `Review.write`, the bar at `lab/page-shell.tsx:346`.',
          'A request is made in `lab/api.ts` `uniqueId`, which it imports and calls.',
          'Mistyped (`pacakges/film/src/core/time.ts` `frameAtOrAfter`), in a doc that is not whole.',
          'Gone with its links (`player/lookbook.ts` deleted, `packages/ui/src/tabs/TabsRoot.tsx:101` at `4a471dae`).',
          '| `cgwire/kitsu` | its routes in `packages/kitsu/src/router.js` |',
        ].join('\n'),
      };
      expect(drift(stale, code)).toEqual([
        'stale.md: route GET /index.json is declared by no API',
        'stale.md: path /review/frame is no route of the API',
        'stale.md: route POST /review/project/:film/say is declared by no API',
        'stale.md: rule film/no-such-rule is not registered',
        'stale.md: bun run nothing: no such script',
        'stale.md: bun run render --tag: no command declares the flag',
        'stale.md: VoiceLevel is no finding',
      ]);
      expect(yield* anchorsDrift(root, [stale])).toEqual([
        'stale.md: path packages/film/src/tools/gone.ts does not exist',
        'stale.md: packages/film/src/core/api.ts has no pageHrefs',
        'stale.md: packages/film/src/tools/review.ts has no Review.write',
        'stale.md: lab/page-shell.tsx:346: name a symbol, not a line',
        'stale.md: packages/film/src/lab/api.ts has no uniqueId',
      ]);
      // A whole doc: a first directory under no base is a mistyped path,
      // a package's name, an installed module and ignored output are not.
      const whole: Doc = {
        path: 'whole.md',
        bases: ['', FILM_SRC],
        whole: true,
        text: 'Its time (`pacakges/film/src/core/time.ts` `frameAtOrAfter`), through `@bible/url-state`, `effect/Schema` and `tmp/logs/latest`.',
      };
      expect(yield* anchorsDrift(root, [whole])).toEqual([
        'whole.md: path pacakges/film/src/core/time.ts does not exist',
      ]);
    }),
  );

  it.effect.layer(BunServices.layer)(
    "show the design language's tokens as the player's sheet declares them",
    () =>
      Effect.gen(function* () {
        const root = yield* ROOT;
        const fs = yield* FileSystem.FileSystem;
        const [doc, sheet] = yield* Effect.all([
          fs.readFileString(`${root}/${DESIGN_LANGUAGE}`),
          fs.readFileString(`${root}/${TOKENS_CSS}`),
        ]);
        expect(tokenBlock(doc)).toEqual(declaredTokens(sheet));
        expect(tokenBlock(doc).length).toBeGreaterThan(0);
      }),
  );

  it.effect.layer(BunServices.layer)(
    'let no mock write a token: each wears the sheet and the kit',
    () =>
      Effect.gen(function* () {
        const root = yield* ROOT;
        const fs = yield* FileSystem.FileSystem;
        const sheet = yield* fs.readFileString(`${root}/${TOKENS_CSS}`);
        const tokens = tokenNames(sheet);
        const scales = scalesOf(sheet);
        const files = (yield* fs.readDirectory(`${root}/${MOCKS}`)).filter((f) =>
          /\.(?:html|css)$/.test(f),
        );
        const mocks = yield* Effect.forEach(files, (file) =>
          Effect.map(fs.readFileString(`${root}/${MOCKS}/${file}`), (text) => ({ file, text })),
        );
        expect(mocks.length).toBeGreaterThan(1);
        expect(scales.every((s) => s.steps.size > 0)).toBe(true);
        expect(mocks.flatMap(({ file, text }) => mockDrift(file, text, tokens, scales))).toEqual(
          [],
        );
        // A mock that writes a token, or wears neither sheet, is red.
        expect(
          mockDrift(
            'red.html',
            '<style>:root { --accent: #f00; } .x { --s-2 : 3px; --own: 1px; }</style>',
            tokens,
            scales,
          ),
        ).toEqual([
          'red.html: links no tokens.css',
          'red.html: links no kit.css',
          'red.html: writes --accent',
          'red.html: writes --s-2',
        ]);
        // A Lab mock wears the Lab's sheet too.
        expect(
          mockDrift(
            'lab-red.html',
            '<link href="tokens.css"><link href="kit.css">',
            tokens,
            scales,
          ),
        ).toEqual(['lab-red.html: links no lab.css']);
        // A space, type or radius off its scale is red, in a rule or a `style` attribute, a
        // shorthand, a logical side or a corner, with nothing let off: not a 1px, not a negative
        // margin beside a width. A step, a var and a dot's margin derived from its size are not.
        expect(
          mockDrift(
            'scale.html',
            `<link href="tokens.css"><link href="kit.css"><style>
              .a { padding: 6px var(--s-2) 8px; gap: 12px; padding-inline-start: 6px; margin-block-end: 8px; }
              .b { font: 15px/19px monospace; font-size: 1px; line-height: 1px; border-top-left-radius: 3px; border-radius: 4px; }
              .panel { width: 34px; height: 100px; margin-bottom: -17px }
              .dot { --dot: 34px; width: var(--dot); margin: calc(var(--dot) / -2) 0 0 calc(var(--dot) / -2); font: var(--w-3) var(--fs-2) / var(--lh-2) var(--font); }
              .c { font: 12px/calc(var(--lh-2) + 3px) monospace; }
            </style><p style="margin:6px; padding: 4px">x</p>`,
            tokens,
            scales,
          ),
        ).toEqual([
          'scale.html: padding 6px is no space step',
          'scale.html: padding-inline-start 6px is no space step',
          'scale.html: font-size 15px is no type size step',
          'scale.html: line-height 19px is no line height step',
          'scale.html: font-size 1px is no type size step',
          'scale.html: line-height 1px is no line height step',
          'scale.html: border-top-left-radius 3px is no radius step',
          'scale.html: margin-bottom -17px is no space step',
          'scale.html: line-height 3px is no line height step',
          'scale.html: margin 6px is no space step',
        ]);
      }),
  );
});
