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

/** What a mock does that the kit owns: writes a token, or wears no tokens.css or kit.css. */
const mockDrift = (file: string, text: string, tokens: ReadonlySet<string>) => [
  ...['tokens.css', 'kit.css']
    .filter((sheet) => file.endsWith('.html') && !new RegExp(`href="[^"]*${sheet}"`).test(text))
    .map((sheet) => `${file}: links no ${sheet}`),
  ...Array.from(new Set(matches(text, /(--[\w-]+)\s*:/g).map(firstGroup)))
    .filter((name) => tokens.has(name))
    .map((name) => `${file}: writes ${name}`),
];

/** A `METHOD /api/…` a comment names, its path as written (a `<x>` or `:x` is one segment). */
const CITED_ROUTE = /\b(GET|POST|PUT|PATCH|DELETE)\s+`?(\/api\/[a-z][^\s`'",)]*)/g;

/**
 * Each route a comment in `text` (a line that is a comment) names that the
 * API does not declare, with its file and line.
 */
const commentRouteDrift = (
  file: string,
  text: string,
  has: (method: string, pathname: string) => boolean,
) =>
  text.split('\n').flatMap((line, i) => {
    const t = line.trim();
    if (!(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))) return [];
    return matches(t, CITED_ROUTE).flatMap((m) => {
      const method = Option.getOrElse(Option.fromUndefinedOr(m[1]), () => '');
      const cited = Option.getOrElse(Option.fromUndefinedOr(m[2]), () => '');
      const pathname = cited
        .replace(/[.;:]+$/, '')
        .replace(/<[^>]+>/g, 'x')
        .replace(/:\w+/g, 'x')
        .split('?')[0];
      return Array.of(`${file}:${i + 1}: ${method} ${cited} is declared by no API`).filter(
        () => !has(method, pathname ?? ''),
      );
    });
  });

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
        // A comment that names a route the API lacks is red; code and declared routes are not.
        expect(
          commentRouteDrift(
            'red.ts',
            [
              '// POST /api/films/<film>/choices/level moved a knob',
              ' * GET /api/review/gone',
              '// POST /api/films/<film>/choices/knob and GET /api/review/index',
              "const url = 'GET /api/nowhere';",
            ].join('\n'),
            has,
          ),
        ).toEqual([
          'red.ts:1: POST /api/films/<film>/choices/level is declared by no API',
          'red.ts:2: GET /api/review/gone is declared by no API',
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
        const tokens = tokenNames(yield* fs.readFileString(`${root}/${TOKENS_CSS}`));
        const files = (yield* fs.readDirectory(`${root}/${MOCKS}`)).filter((f) =>
          /\.(?:html|css)$/.test(f),
        );
        const mocks = yield* Effect.forEach(files, (file) =>
          Effect.map(fs.readFileString(`${root}/${MOCKS}/${file}`), (text) => ({ file, text })),
        );
        expect(mocks.length).toBeGreaterThan(1);
        expect(mocks.flatMap(({ file, text }) => mockDrift(file, text, tokens))).toEqual([]);
        // A mock that writes a token, or wears neither sheet, is red.
        expect(
          mockDrift(
            'red.html',
            '<style>:root { --accent: #f00; } .x { --s-2 : 3px; --own: 1px; }</style>',
            tokens,
          ),
        ).toEqual([
          'red.html: links no tokens.css',
          'red.html: links no kit.css',
          'red.html: writes --accent',
          'red.html: writes --s-2',
        ]);
      }),
  );
});
