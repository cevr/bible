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
//   path of one, or a prefix of some (`/api/films/<film>/studio/*`); and each
//   route or bare API path a comment cites in the film package's code, its
//   browser tests and the app's;
// - each `film/<rule>` named: registered in the `film` lint plugin, and each
//   registered rule turned on in .oxlintrc.json; a `film/<entry>` of the
//   package or its src (`film/lint`, `film/lab`) is a directory, no rule;
// - each `bun run <script>`, its options before the name: a script of the
//   root, this package, or the app whose scripts run the film commands (its
//   package.json, never its films), or of the package `--cwd` names; a run
//   of a file (`cli.ts`) or of an installed binary (`vite`) names no script;
// - a doc is read as GitHub shows it, through Bun's CommonMark and GFM parser
//   (`Bun.markdown`): its prose (paragraphs, headings, list items, quotes,
//   table rows) apart from its code blocks, wherever a block sits;
// - each path written in a code span of the prose, in these docs and in NORTH_STAR.md,
//   PRIOR_ARTS.md, CLAUDE.md, the design language and the packages' and
//   apps' READMEs, from the repo root or from the doc's own package
//   (`lab/page-shell.tsx`, `src/…`), exists, and each symbol written after it
//   (`tools/review.ts` `Review.read`) is declared in its code, as the parser
//   reads it (`Review` bound by a declaration, a function's local among
//   them, and `read` a member or a key within that declaration's span; a
//   type's member, a key handed to a call and a call declare nothing); an
//   anchor names a symbol, never a `path:line`, so a moved line keeps it and
//   a renamed symbol fails it (a receipt `at <commit>` or a path `deleted`
//   names the tree as it was); in a doc whose every path is under its bases,
//   a first directory under none of them is a mistyped path; and each file a
//   markdown link or image names (`[CRAFT](../CRAFT.md)`, a reference's
//   target; not code in a span or a block that looks like one) is there
//   beside the doc. A symbol written with no path (`Name.member`) names no
//   file, and is left to the sweeps;
// - the design language's §3 block is the player's tokens.css (the mocks'
//   lengths are read in a browser: e2e/design-language/mocks.dom.test.ts);
// - each `--flag` given to a film command written as a command, is declared
//   by a `Flag` in src/tools (`--no-x` by its `x`): `bun run render <film>
//   --stills …` anywhere; `film check --static` in a code span, in a line of
//   prose that starts with the bin (after a `$`; a list's or a quote's mark
//   is the parser's) up to its first span and holding no `;`, or in a code
//   block's line, each of its commands (split at `&&`, `||`, `;`, `|`) that
//   starts with the bin;
// - on a line that runs `check` (`bun run check …  # warns …`, or one that
//   names the run in a span), each finding named is a tagged error in src,
//   or, named in a span mid-line, a name the code (.ts and .tsx) has as
//   nothing else: declares, imports, or reads off a module.
//
// What a sentence claims about the code stays with the sweep's reading.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import { type Node, type Program, Visitor, parseSync } from 'oxc-parser';
import { LabHttpApi } from './core/api.ts';
import { declares as declaresRoute, routesOf } from './core/testing.ts';

/** What the docs are read against. */
interface Code {
  readonly routes: ReadonlySet<string>;
  readonly registered: ReadonlySet<string>;
  readonly enabled: ReadonlySet<string>;
  /** The film package's entries and its src's (`lint`, `lab`): `film/lab` names a directory, never a rule. */
  readonly entries: ReadonlySet<string>;
  /** The binaries installed for the root and each workspace (`vite`, `tsc`): `bun run` runs one that no script names. */
  readonly bins: ReadonlySet<string>;
  /** The scripts of the root, the app and this package: where the docs run scripts from. */
  readonly scripts: ReadonlySet<string>;
  /** Each workspace package's scripts, by its directory (`apps/animations`), for a run in it (`--cwd`). */
  readonly scriptsAt: ReadonlyMap<string, ReadonlySet<string>>;
  /** The scripts that run a film command (`bun cli.ts <command>`). */
  readonly filmCommands: ReadonlySet<string>;
  /** The film commands those scripts run, by the CLI's own name (`film check`). */
  readonly commands: ReadonlySet<string>;
  readonly flags: ReadonlySet<string>;
  readonly tags: ReadonlySet<string>;
  /**
   * Every capitalised name src's code has (`SoundCheck`, `PageShell`,
   * `Schema.TaggedError`): one it declares (a type, a class, a schema, a
   * component), imports (named, a namespace or a default), or reads off a
   * module.
   */
  readonly names: ReadonlySet<string>;
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
const documentedRoutes = (markdown: Markdown): ReadonlyArray<string> =>
  matches(proseOf(markdown), /^\| *(`(?:GET|POST|PUT|DELETE) [^|]*)\|/gm).flatMap((m) =>
    routesInCell(firstGroup(m)),
  );

const routeDrift = (markdown: Markdown, code: Code) =>
  documentedRoutes(markdown)
    .filter((route) => !code.routes.has(route))
    .map((route) => `route ${route} is declared by no API`);

/** A path the lab's API has or once had: under `/api/`, or the old `/review/…` and `/lab/<film>/…`. */
const API_PATH = /^\/(?:api|review)\/|^\/lab\/(?:<film>|:film)\//;

/**
 * Each route written in running text: a span `GET /api/…` is a declared
 * route, and a bare API path (`/api/review/frame`) is the path of one.
 */
const spanDrift = (markdown: Markdown, code: Code) => {
  const paths = new Set(Array.from(code.routes).map((route) => route.replace(/^\S+ /, '')));
  return matches(proseOf(markdown), SPAN).flatMap((m) =>
    Option.toArray(
      Option.fromNullOr(/^(?:(GET|POST|PUT|DELETE) )?(\/\S+)$/.exec(group(m, 2).trim())),
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

/**
 * Each rule a doc names, in the form the plugin registers (`film/no-read-once`,
 * a name of lowercase words joined by hyphens): a `film/<entry>` of the film
 * package or its src (`film/lint`, `film/lab`) names a directory, not a rule.
 */
const ruleDrift = (markdown: Markdown, code: Code) =>
  matches(proseOf(markdown), /`film\/([a-z]+(?:-[a-z]+)*)`/g)
    .map(firstGroup)
    .filter((rule) => !code.registered.has(rule) && !code.entries.has(rule))
    .map((rule) => `rule film/${rule} is not registered`);

/** `bun run`'s options that take a value (`--cwd apps/animations`); any other is a switch. */
const VALUED = '--cwd|--filter|-F|--env-file|--config|-c|--preload|-r';

/**
 * Each `bun run` a text writes, its options before what it runs (runtime
 * flags, `--bun`, `--watch`, among them): the package it runs in (`--cwd`),
 * what it runs (a script, a binary, or a file, `./cli.ts`), and the rest of
 * its command up to a `#` comment or the span's end.
 */
const BUN_RUN = new RegExp(
  `\\bbun run((?:\\s+(?:(?:${VALUED})[= ]\\S+|--?[a-z][\\w-]*))*)\\s+((?:\\.{1,2}/)?[a-z][\\w.:/-]*)([^#\`]*)`,
  'g',
);

interface Run {
  /** Where it runs (`--cwd`, the root's `.` as `''`); none, from any of the places the docs run scripts from. */
  readonly cwd: Option.Option<string>;
  /** What it runs: a script's name, a binary's, or a file's (`cli.ts`). */
  readonly script: string;
  readonly rest: string;
}

/** Each `bun run` a text writes. */
const runsIn = (text: string): ReadonlyArray<Run> =>
  matches(text, BUN_RUN).map((m) => ({
    cwd: Option.map(Option.fromNullOr(/--cwd[= ](\S+)/.exec(group(m, 1))), (cwd) =>
      group(cwd, 1)
        .replace(/^\.(?:\/|$)/, '')
        .replace(/\/$/, ''),
    ),
    // A sentence's stop after it is not its own.
    script: group(m, 2).replace(/[.:]+$/, ''),
    rest: group(m, 3),
  }));

/** The scripts a run can name: its package's (`--cwd`), else those of the places the docs run from. */
const scriptsFor = (run: Run, code: Code): ReadonlySet<string> =>
  Option.match(run.cwd, {
    onNone: () => code.scripts,
    onSome: (cwd) => code.scriptsAt.get(cwd) ?? new Set<string>(),
  });

/**
 * Each `bun run` a doc writes, in its prose or its code, that names a script
 * no package has: not an installed binary (`bun run --bun vite build`), nor a
 * file (`cli.ts`, `src/x.ts`; a name with a dot or a slash that no script has).
 */
const scriptDrift = (markdown: Markdown, code: Code) =>
  runsIn(markdown.lines.map((line) => line.text).join('\n'))
    .filter(
      (run) =>
        !scriptsFor(run, code).has(run.script) &&
        !code.bins.has(run.script) &&
        !/[./]/.test(run.script),
    )
    .map((run) => `bun run ${run.script}: no such script`);

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
  /** A markdown link's target (`[CRAFT](../CRAFT.md#5)`), read from the doc's own directory as a reader's viewer reads it. */
  readonly link: boolean;
}

/**
 * A table row about another repo, its first cell the repo's slug
 * (`cgwire/kitsu`; a `film/<rule>` is a rule): its paths are that repo's.
 */
const ANOTHER_REPO = /^\| `(?!film\/)[\w-]+\/[\w.-]+` +\|/;

/** A line of a doc as its viewer shows it: prose (a paragraph's, a heading's, a list item's, a table row's), or a code block's. */
interface Line {
  readonly text: string;
  readonly code: boolean;
}

/** A doc as the Markdown parser reads it: its lines, and the target of each link and image in its prose. */
interface Markdown {
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

/**
 * A doc as GitHub reads it, through Bun's CommonMark and GFM parser
 * (`Bun.markdown`): each block on lines of its own, the marks of its
 * containers (a quote's `>`, a list item's `-` or `1)`) left out, so a code
 * block in a list or a quote is code too; a code block's lines marked as
 * code (a fence's length, its character and its info string are the
 * parser's); a code span written in backticks; a table's row as
 * `| cell | cell |`; a link's or an image's text in its line, and its
 * target kept. An HTML block (a comment, `<details>`) is a line of prose,
 * as written.
 */
const markdownOf = (text: string): Markdown => {
  const links: Array<string> = [];
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
      return children;
    },
    image: (children, { src }) => {
      links.push(src);
      return children;
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

/** A doc's prose: the lines of its paragraphs, headings, list items and table rows, each code span in backticks. */
const proseOf = (markdown: Markdown) =>
  markdown.lines
    .filter((line) => !line.code)
    .map((line) => line.text)
    .join('\n');

/** A code span in a line of prose (`spanOf`): its text. */
const SPAN = /(`+) ?(.*?) ?\1/g;

/**
 * Each relative link a doc writes (`[x](reference/vision.md#part)`, an
 * image's source, a reference's target), its target without the part: a
 * link the parser reads in its prose, never code that looks like one
 * (`handlers[i](event)`) in a span or a code block. A URL, a link within the
 * doc (`#part`) and a site's path (`/…`) name no file of this tree.
 */
const linksIn = (doc: Doc): ReadonlyArray<Anchor> =>
  markdownOf(doc.text)
    .links.map((target) => target.replace(/[#?].*$/, ''))
    .filter((target) => target !== '' && !/^(?:[a-z][\w+.-]*:|\/)/i.test(target))
    .map((target) => ({
      written: target,
      path: target.replace(/\/$/, ''),
      line: false,
      receipt: false,
      symbols: [],
      link: true,
    }));

/** Each path a doc's prose writes in a code span, with the symbols after it: `path` `A`, `B`. */
const spannedIn = (doc: Doc): ReadonlyArray<Anchor> =>
  proseOf(markdownOf(doc.text))
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
            link: false,
          },
        ];
      }),
    );

/** Each path a doc writes, in backticks with the symbols after it, or as a link's target. */
const anchorsIn = (doc: Doc): ReadonlyArray<Anchor> => [...spannedIn(doc), ...linksIn(doc)];

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

/** A name code declares, and where it starts. */
interface Declared {
  readonly name: string;
  readonly at: number;
  /** A declaration's (a binding's) span, where its members are; none for a member or a key, which binds nothing. */
  readonly spans: Option.Option<{ readonly start: number; readonly end: number }>;
}

/** The name an identifier or a string writes (`read`, `'read'`); none for a computed key or a private one. */
const nameOf = (node: Node): ReadonlyArray<string> => {
  if (node.type === 'Identifier') return [node.name];
  if (node.type === 'Literal' && Predicate.isString(node.value)) return [node.value];
  return [];
};

/** The names a binding pattern binds: `a`, `{ a, b: c }`'s `a` and `c`, `[d, , ...e]`'s `d` and `e`. */
const boundBy = (pattern: Node): ReadonlyArray<string> => {
  if (pattern.type === 'ObjectPattern') return pattern.properties.flatMap(boundBy);
  if (pattern.type === 'Property') return boundBy(pattern.value);
  if (pattern.type === 'ArrayPattern')
    return pattern.elements.flatMap((element) =>
      Option.toArray(Option.fromNullOr(element)).flatMap(boundBy),
    );
  if (pattern.type === 'AssignmentPattern') return boundBy(pattern.left);
  if (pattern.type === 'RestElement') return boundBy(pattern.argument);
  return nameOf(pattern);
};

/**
 * Each name a program declares, read by the parser: a binding (`const`,
 * `let`, a destructure, a function, a class, an interface, a type, an enum
 * and its members, a namespace, an export's name), each with its span; a
 * member of a class or of a type, and an object literal's key, which bind
 * nothing. A call names nothing, and a comment is no code.
 */
const declaredIn = (program: Program): ReadonlyArray<Declared> => {
  const out: Array<Declared> = [];
  const add = (names: ReadonlyArray<string>, at: number, spans: Declared['spans']) =>
    names.forEach((name) => out.push({ name, at, spans }));
  /** A declaration's own name, when it has one (`class {}` has none), over the declaration's span. */
  const id = (name: Option.Option<Node>, node: { readonly start: number; readonly end: number }) =>
    add(Option.toArray(name).flatMap(nameOf), node.start, Option.some(node));
  /** A member's name, written as an identifier or a string (`[key]` names none). */
  const member = (key: Node, computed: boolean, at: number) => {
    if (!computed) add(nameOf(key), at, Option.none());
  };
  new Visitor({
    VariableDeclarator: (node) => add(boundBy(node.id), node.start, Option.some(node)),
    FunctionDeclaration: (node) => id(Option.fromNullOr(node.id), node),
    ClassDeclaration: (node) => id(Option.fromNullOr(node.id), node),
    ClassExpression: (node) => id(Option.fromNullOr(node.id), node),
    TSInterfaceDeclaration: (node) => id(Option.some(node.id), node),
    TSTypeAliasDeclaration: (node) => id(Option.some(node.id), node),
    TSEnumDeclaration: (node) => id(Option.some(node.id), node),
    TSEnumMember: (node) => id(Option.some(node.id), node),
    TSModuleDeclaration: (node) => id(Option.some(node.id), node),
    MethodDefinition: (node) => member(node.key, node.computed, node.start),
    PropertyDefinition: (node) => member(node.key, node.computed, node.start),
    AccessorProperty: (node) => member(node.key, node.computed, node.start),
    TSAbstractMethodDefinition: (node) => member(node.key, node.computed, node.start),
    TSAbstractPropertyDefinition: (node) => member(node.key, node.computed, node.start),
    TSAbstractAccessorProperty: (node) => member(node.key, node.computed, node.start),
    TSPropertySignature: (node) => member(node.key, node.computed, node.start),
    TSMethodSignature: (node) => member(node.key, node.computed, node.start),
    ExportSpecifier: (node) => id(Option.some(node.exported), node),
    ExportAllDeclaration: (node) => id(Option.fromNullOr(node.exported), node),
    ObjectExpression: (node) =>
      node.properties.forEach((p) => {
        if (p.type === 'Property' && !p.computed) add(nameOf(p.key), p.start, Option.none());
      }),
  }).visit(program);
  return out;
};

/** A file's code as `declares` reads it: its text, and its declarations as the parser reads them, once. */
interface Source {
  readonly text: string;
  /** None when the parser cannot read it. */
  readonly declared: Option.Option<ReadonlyArray<Declared>>;
}

const sourceOf = (text: string, file: string): Source => {
  const { program, errors } = parseSync(file, text);
  return {
    text,
    declared: Option.liftPredicate(declaredIn(program), () => errors.length === 0),
  };
};

/**
 * Whether a file's code declares a symbol: `Review` bound in it by a
 * declaration (a key of an object it hands a call, `use({ Review })`, or a
 * member of a type, `interface Deps { Review }`, binds nothing), and for
 * `Review.read` each later part declared within one declaration that binds
 * `Review`, any of them (a local of an earlier function named the same is
 * not the one): a binding, a member, or a key of an object literal of its
 * own (`Schema.Struct({ read })`); a `'lab'` as written.
 */
const declaresIn = (source: Source, symbol: string) => {
  if (symbol.startsWith("'")) {
    // An import names another file's declaration.
    const code = uncommented(source.text).replace(
      /^import\s[\s\S]*?\sfrom\s*['"][^'"]+['"];?/gm,
      '',
    );
    return code.includes(symbol);
  }
  const [head = '', ...members] = symbol.replace(/\(.*\)$/, '').split('.');
  return Option.exists(source.declared, (declared) =>
    declared
      .filter((d) => d.name === head)
      .some((d) =>
        Option.exists(d.spans, (span) =>
          members.every((name) =>
            declared.some((m) => m.name === name && span.start <= m.at && m.at < span.end),
          ),
        ),
      ),
  );
};

/** `declaresIn` over a text; `file` names the dialect (`.tsx`). */
const declares = (text: string, symbol: string, file = 'code.ts') =>
  declaresIn(sourceOf(text, file), symbol);

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
const anchorDrift = (
  found: ReadonlyArray<Found>,
  sourceAt: (file: string, text: string) => Source,
) =>
  found
    .filter(({ anchor, ours }) => ours && !anchor.receipt)
    .flatMap(({ anchor, file, text }) => [
      ...[`${anchor.written}: name a symbol, not a line`].filter(() => anchor.line),
      ...Option.match(file, {
        onNone: () => [`path ${anchor.path} does not exist`],
        onSome: (at) =>
          anchor.symbols
            .filter((symbol) => !Option.exists(text, (t) => declaresIn(sourceAt(at, t), symbol)))
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
      if (anchor.link) {
        // A link is read where the doc is, as a viewer of the doc follows it.
        const at = path.join(path.dirname(doc.path), anchor.path);
        const there = yield* fs.exists(path.join(root, at));
        return {
          anchor,
          ours: true,
          file: Option.liftPredicate(at, () => there),
          text: Option.none(),
        } satisfies Found;
      }
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

/** The `--flag`s in a command's words that no `Flag` declares (`--no-x` by its `x`). */
const undeclaredFlags = (words: string, code: Code) =>
  matches(words, /(?:^|\s|\[)--([a-z][a-z\d-]*)/g)
    .map(firstGroup)
    .filter((flag) => !code.flags.has(flag.replace(/^no-/, '')));

/** A film command run by the CLI's own name (`film check --static --json`), up to a `#` comment. */
const FILM_BIN = /(?:^|[\s(])film ([a-z][\w-]*)([^#]*)/g;

/** Text that starts with the bin, after a shell's prompt (`$ `). */
const AT_BIN = /^\s*(?:\$\s+)?film /;

/**
 * Where a line writes a command. In a code block: each command of the line
 * that starts with the bin, the line split at `&&`, `||`, `;` and `|`
 * (`cd apps/animations && film check …`); a block's comment
 * (`// the film render pass …`) starts with none. In prose (a paragraph's
 * line, a list item's or a quote's, its mark the parser's): each code span,
 * and a line that starts with the bin up to its first span, unless it holds
 * a `;`, a sentence's (`film render writes stills; Vite takes --host`). A
 * sentence that says "film" elsewhere is no command.
 */
const commandsIn = (line: Line): ReadonlyArray<string> => {
  if (line.code) return line.text.split(/&&|\|\|?|;/).filter((command) => AT_BIN.test(command));
  const spans = matches(line.text, SPAN).map((m) => group(m, 2));
  const head = line.text.split('`')[0] ?? '';
  if (!AT_BIN.test(head) || head.includes(';')) return spans;
  return [head, ...spans];
};

/**
 * Each `--flag` given to a film command on a line, before its `#` comment:
 * by its script (`bun run render <film> --stills`) or by the CLI's name
 * (`film check --static`), written as a command.
 */
const flagDrift = (line: Line, code: Code) => [
  ...runsIn(line.text)
    .filter((run) => code.filmCommands.has(run.script))
    .flatMap((run) =>
      undeclaredFlags(run.rest, code).map(
        (flag) => `bun run ${run.script} --${flag}: no command declares the flag`,
      ),
    ),
  ...commandsIn(line)
    .flatMap((command) => matches(command, FILM_BIN))
    .filter((m) => code.commands.has(firstGroup(m)))
    .flatMap((m) =>
      undeclaredFlags(group(m, 2), code).map(
        (flag) => `film ${firstGroup(m)} --${flag}: no command declares the flag`,
      ),
    ),
];

/** A finding's name: a tagged error's (`DeadAir`, `TextOverlap`). */
const FINDING = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;

/**
 * On a line that runs `check`, each finding it names: every name on a
 * command line (`bun run check <film>  # warns VoiceLevel`); on a line that
 * names the run in passing (`` `bun run check <film> --sound` adds
 * `DeadAir` ``), each name in a span the code has as nothing else (a type
 * beside it, `SoundCheck`, a component, `PageShell`, or a name read off a
 * module, `TaggedError`, is not a finding named).
 */
const findingDrift = (line: string, code: Code) => {
  const commandLine = /^\s*(?:bun run|film) check\b/.test(line);
  if (!commandLine && !/`(?:bun run|film) check\b/.test(line)) return [];
  return matches(line, FINDING)
    .filter((m) => commandLine || /`$/.test(line.slice(0, m.index)))
    .map(firstGroup)
    .filter((name) => !code.tags.has(name) && (commandLine || !code.names.has(name)))
    .map((name) => `${name} is no finding`);
};

/** What a doc names that the code does not have, one line each. */
const drift = (doc: Doc, code: Code): ReadonlyArray<string> => {
  const markdown = markdownOf(doc.text);
  return [
    ...routeDrift(markdown, code),
    ...spanDrift(markdown, code),
    ...ruleDrift(markdown, code),
    ...scriptDrift(markdown, code),
    ...markdown.lines.flatMap((line) => [
      ...flagDrift(line, code),
      ...findingDrift(line.text, code),
    ]),
  ].map((what) => `${doc.path}: ${what}`);
};

/** Every declared route documented: the declared routes no table row names. */
const undocumented = (docs: ReadonlyArray<Doc>, code: Code): ReadonlyArray<string> => {
  const documented = new Set(docs.flatMap((doc) => documentedRoutes(markdownOf(doc.text))));
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
        files.filter((f) => /\.tsx?$/.test(f) && !f.includes('node_modules')),
        (f) => read(dir, f),
      ),
    );
  /** A directory's entries; none for a directory that is not there (a package with no binaries). */
  const entriesOf = (dir: string) =>
    Effect.map(Effect.option(fs.readDirectory(at(dir))), (names) =>
      Option.getOrElse(names, (): ReadonlyArray<string> => []),
    );
  const scriptsOf = (dir: string) =>
    Effect.flatMap(read(dir, 'package.json'), Schema.decodeUnknownEffect(Scripts));
  const workspaces = yield* Effect.forEach(['apps', 'packages'], (parent) =>
    Effect.map(fs.readDirectory(at(parent)), (names) => names.map((name) => `${parent}/${name}`)),
  );
  const scriptsAt = new Map(
    yield* Effect.forEach(
      yield* Effect.filter(['', ...workspaces.flat()], (dir) => fs.exists(at(dir, 'package.json'))),
      (dir) => Effect.map(scriptsOf(dir), (p) => [dir, new Set(Object.keys(p.scripts))] as const),
    ),
  );
  const packages = yield* Effect.forEach(['', 'apps/animations', 'packages/film'], scriptsOf);
  const scripts = packages.flatMap((p) => Object.entries(p.scripts));
  const plugin = yield* read('packages/film/lint/plugin.ts');
  const oxlintrc = yield* read('.oxlintrc.json');
  const tools = (yield* sources('packages/film/src/tools')).join('\n');
  const srcFiles = yield* sources('packages/film/src');
  const src = srcFiles.join('\n');
  // Each file's comments left out on its own, so a `/*` in one file's string ends in it.
  const srcCode = srcFiles.map(uncommented).join('\n');
  const entries = yield* Effect.forEach(['packages/film', FILM_SRC], entriesOf);
  const bins = yield* Effect.forEach(['', ...workspaces.flat()], (dir) =>
    entriesOf(path.join(dir, 'node_modules', '.bin')),
  );
  return {
    routes: new Set(routesOf(LabHttpApi).map((r) => `${r.method} ${r.path}`)),
    registered: new Set(matches(plugin, /^ {4}'([a-z-]+)': /gm).map(firstGroup)),
    enabled: new Set(matches(oxlintrc, /"film\/([a-z-]+)": "error"/g).map(firstGroup)),
    entries: new Set(entries.flat()),
    bins: new Set(bins.flat()),
    scripts: new Set(scripts.map(([name]) => name)),
    scriptsAt,
    filmCommands: new Set(
      scripts.filter(([, run]) => run.startsWith('bun cli.ts ')).map(([name]) => name),
    ),
    commands: new Set(
      scripts.flatMap(([, run]) =>
        Option.toArray(Option.fromNullOr(/^bun cli\.ts ([a-z][\w-]*)/.exec(run))).map(firstGroup),
      ),
    ),
    flags: new Set(matches(tools, /Flag\.\w+\(\s*'([a-z][a-z-]*)'/g).map(firstGroup)),
    tags: new Set(matches(src, /TaggedError<(\w+)>/g).map(firstGroup)),
    names: new Set(
      [
        ...matches(srcCode, /\b(?:interface|type|class|const|enum|function)\s+([A-Z]\w*)/g),
        ...matches(srcCode, /\.([A-Z]\w*)\b/g),
        ...matches(srcCode, /^import\s+(?:type\s+)?(?:\w+\s*,\s*)?\{([^}]*)\}/gm).flatMap((m) =>
          matches(firstGroup(m), /(?:^|[\s,])(?:type\s+)?([A-Z]\w*)/g),
        ),
        // A namespace's or a default's binding (`import * as UrlAtom`, `import Foo from`).
        ...matches(srcCode, /^import\s+(?:type\s+)?(?:\w+\s*,\s*)?\*\s+as\s+([A-Z]\w*)/gm),
        ...matches(srcCode, /^import\s+(?:type\s+)?([A-Z]\w*)\s*(?:,|from\b)/gm),
      ].map(firstGroup),
    ),
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

/** What each doc's anchors name that the tree lacks, one line each: each file they name parsed once. */
const anchorsDrift = (root: string, docs: ReadonlyArray<Doc>) => {
  const sources = new Map<string, Source>();
  const sourceAt = (file: string, text: string) =>
    Option.getOrElse(Option.fromUndefinedOr(sources.get(file)), () => {
      const source = sourceOf(text, file);
      sources.set(file, source);
      return source;
    });
  return Effect.map(
    Effect.forEach(docs, (doc) =>
      Effect.map(findAnchors(root, doc), (found) =>
        anchorDrift(found, sourceAt).map((what) => `${doc.path}: ${what}`),
      ),
    ),
    (each) => each.flat(),
  );
};

const ROOT = Effect.map(Path.Path, (path) => path.join(import.meta.dir, '..', '..', '..'));

const TOKENS_CSS = 'packages/film/src/player/tokens.css';

/** The design language's §3 block, as the parser reads it: the first css code block under `## 3. Tokens`. */
const tokenBlock = (doc: string) => {
  let section = '';
  const blocks: Array<string> = [];
  Bun.markdown.render(doc, {
    heading: (children, { level }) => {
      if (level === 2) section = children;
      return children;
    },
    code: (children, meta) => {
      if (section === '3. Tokens' && meta?.language === 'css') blocks.push(children);
      return children;
    },
  });
  return blocks[0] ?? '';
};

/** The player's sheet from its tokens (`:root {`) to the end of their queries, before the ground every page stands on. */
const declaredTokens = (sheet: string) => {
  const start = sheet.indexOf(':root {');
  const end = sheet.indexOf('/* The ground every page');
  return `${sheet.slice(start, end).trimEnd()}\n`;
};

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
 * Where a comment names a bare `/api/…` path, no method before it: not
 * inside a longer path or a URL's host (`http://lab/api/…`), not a word's.
 */
const CITED_PATH = /(?<![\w/.:-])(?=\/api\/[a-z$<:])/g;

/** A method just before a cited path (`GET /api/…`, `` POST `/api/…` ``): the route form reads it. */
const AFTER_METHOD = /\b(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\s+`?$/;

/** What the API declares, as a comment's route or path is read against it. */
interface Api {
  /** Whether it declares `method` at `pathname`. */
  readonly has: (method: string, pathname: string) => boolean;
  /** Whether `pathname` is a route's path under any method, or leads to some (`/api/films/probe`). */
  readonly reaches: (pathname: string) => boolean;
}

/** Whether `pathname`'s segments lead `route`'s: each the route's own, or any for a `:param`, `*` the rest. */
const leads = (pathname: string, route: string) => {
  const cited = pathname.split('/');
  const declared = route.split('/');
  return cited.every(
    (segment, i) =>
      declared.slice(0, i + 1).includes('*') ||
      declared[i] === segment ||
      (declared[i] ?? '').startsWith(':'),
  );
};

const apiOf = (api: typeof LabHttpApi): Api => {
  const routes = routesOf(api);
  return {
    has: declaresRoute(api),
    reaches: (pathname) => routes.some((route) => leads(pathname, route.path)),
  };
};

/**
 * Each route or path a comment in `text` names that the API does not
 * declare, with its file and line: the comments as the parser (oxc) reads
 * them, so a comment after code or a block's unstarred body is read, and a
 * string that looks like one is not. A route (`GET /api/…`) is the method's;
 * a bare path is any method's route, a prefix of some (`/api/`,
 * `/api/films/probe`), or a path the file's own code writes (the routes a
 * test's own server answers, `tools/page-render.test.ts`).
 */
const commentRouteDrift = (file: string, text: string, api: Api): ReadonlyArray<string> => {
  const parsed = parseSync(file, text);
  if (parsed.errors.length > 0) return [`${file}: the parser cannot read it`];
  /** The file's code, its comments left out, joined once: read for a bare path the API lacks. */
  const parts: Array<string> = [];
  let after = 0;
  for (const comment of parsed.comments) {
    parts.push(text.slice(after, comment.start));
    after = comment.end;
  }
  parts.push(text.slice(after));
  const code = parts.join('');
  // A comment's text starts after its `//` or `/*`.
  const lineAt = (comment: { readonly start: number }, at: number) =>
    text.slice(0, comment.start + 2 + at).split('\n').length;
  return parsed.comments.flatMap((comment) => [
    ...matches(comment.value, CITED_ROUTE).flatMap((m) => {
      const method = firstGroup(m);
      const cited = citedPath(comment.value.slice(m.index + m[0].length));
      return Array.of(
        `${file}:${lineAt(comment, m.index)}: ${method} ${cited.written} is declared by no API`,
      ).filter(() => !api.has(method, pathOf(cited.read)));
    }),
    ...matches(comment.value, CITED_PATH)
      .filter((m) => !AFTER_METHOD.test(comment.value.slice(0, m.index)))
      .flatMap((m) => {
        const cited = citedPath(comment.value.slice(m.index));
        const pathname = pathOf(cited.read);
        return Array.of(
          `${file}:${lineAt(comment, m.index)}: ${cited.written} is declared by no API`,
        ).filter(
          () =>
            !api.reaches(pathname.replace(/\/\*?$/, '')) &&
            !code.includes(pathname.replace(/\/$/, '')),
        );
      }),
  ]);
};

describe('the docs', () => {
  it.effect.layer(BunServices.layer)(
    'let no comment in the film package, its browser tests or the app name a route the API does not declare',
    () =>
      Effect.gen(function* () {
        const root = yield* ROOT;
        const fs = yield* FileSystem.FileSystem;
        const api = apiOf(LabHttpApi);
        const files = (yield* Effect.forEach(
          [FILM_SRC, 'packages/film/e2e', 'apps/animations/src'],
          (dir) =>
            Effect.map(fs.readDirectory(`${root}/${dir}`, { recursive: true }), (found) =>
              found
                .filter((f) => /\.tsx?$/.test(f) && !f.includes('node_modules'))
                .map((f) => `${dir}/${f}`),
            ),
        )).flat();
        expect(files.length).toBeGreaterThan(600);
        const drift = yield* Effect.forEach(files, (file) =>
          Effect.map(fs.readFileString(`${root}/${file}`), (text) =>
            commentRouteDrift(file, text, api),
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
              '// polls `/api/review/gone?since=` for a build, and /api/films/<film>/gone/too.',
              '// reads /api/review/index?fresh, under /api/films/probe, every route under /api/ and its own /api/own',
              "const own = new URL('/api/own', 'http://lab');",
              'const doc = `',
              '// GET /api/nowhere/in/a/string',
              ' * POST /api/never',
              '`;',
            ].join('\n'),
            api,
          ),
        ).toEqual([
          'red.ts:1: POST /api/films/<film>/choices/level is declared by no API',
          'red.ts:3: GET /api/review/gone is declared by no API',
          'red.ts:7: POST /api/films/:film/choices/level is declared by no API',
          'red.ts:9: GET /api/review/also-gone is declared by no API',
          'red.ts:11: HEAD /api/review/index is declared by no API',
          'red.ts:11: OPTIONS /api/films/<film>/notes is declared by no API',
          'red.ts:14: POST /api/films/<film>/choices/knob(extra) is declared by no API',
          // A bare path is any method's route, or a prefix of some, or the file's own.
          'red.ts:15: /api/review/gone?since= is declared by no API',
          'red.ts:15: /api/films/<film>/gone/too is declared by no API',
        ]);
        // A file the parser cannot read is red: its comments are not known.
        expect(commentRouteDrift('broken.ts', 'const = ;', api)).toEqual([
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
          spanned.flatMap((doc) =>
            spanDrift(markdownOf(doc.text), code).map((what) => `${doc.path}: ${what}`),
          ),
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
          'Mute it with `film/frobnicate`, after `bun run --cwd apps/animations nothing-here`.',
          '`film check <film> --frobnicate --json`  # the film bin, as `bun run --cwd apps/animations lab` runs it',
          'After a mix, `bun run check <film> --sound` adds `NoSuchFinding`.',
          'See [the gone tool](tools/gone.ts), [a gone reference](reference/none.md#its-part),',
          'and [the README](packages/film/README.md#the-lab), [a site](https://example.com), [here](#here).',
          'Then `bun run --watch nothing-bin`, and read `xs[0](y)` in [the gone guide](guide/gone.md).',
          '```sh',
          'film check <film> --frob-fence',
          '```',
          '$ film check <film> --frob-prompt',
          '- film check <film> --frob-item',
          '````md',
          '```ts',
          'handlers[i](event);',
          '```',
          '````',
          'Read [the gone page](guide/gone-too.md) after the block.',
          // A command and a link are read wherever the parser puts them: a quote, a list item
          // (`1)` too), a code block in either, a command after `cd … &&`, a table's cell, and a
          // link after a tilde block that holds backticks.
          '',
          '> film check <film> --frob-quote',
          '',
          '1) film check <film> --frob-paren',
          '',
          '```sh',
          'cd apps/animations && film check <film> --frob-cd',
          '```',
          '',
          '- Run:',
          '  ```sh',
          '  film check <film> --frob-listed',
          '  ```',
          '',
          '> ```sh',
          '> $ film check <film> --frob-quoted',
          '> ```',
          '',
          '````sh',
          'film check <film> --frob-4',
          '````',
          '',
          '| `x` | [the gone table](guide/gone-table.md) | `y(z)` |',
          '| --- | --- | --- |',
          '',
          '~~~md',
          '```',
          'x',
          '```',
          '~~~',
          'Read [the gone tilde](guide/gone-tilde.md).',
        ].join('\n'),
      };
      expect(drift(stale, code)).toEqual([
        'stale.md: route GET /index.json is declared by no API',
        'stale.md: path /review/frame is no route of the API',
        'stale.md: route POST /review/project/:film/say is declared by no API',
        'stale.md: rule film/no-such-rule is not registered',
        'stale.md: rule film/frobnicate is not registered',
        'stale.md: bun run nothing: no such script',
        'stale.md: bun run nothing-here: no such script',
        'stale.md: bun run nothing-bin: no such script',
        'stale.md: bun run render --tag: no command declares the flag',
        'stale.md: VoiceLevel is no finding',
        'stale.md: film check --frobnicate: no command declares the flag',
        'stale.md: NoSuchFinding is no finding',
        'stale.md: film check --frob-fence: no command declares the flag',
        'stale.md: film check --frob-prompt: no command declares the flag',
        'stale.md: film check --frob-item: no command declares the flag',
        'stale.md: film check --frob-quote: no command declares the flag',
        'stale.md: film check --frob-paren: no command declares the flag',
        'stale.md: film check --frob-cd: no command declares the flag',
        'stale.md: film check --frob-listed: no command declares the flag',
        'stale.md: film check --frob-quoted: no command declares the flag',
        'stale.md: film check --frob-4: no command declares the flag',
      ]);
      expect(yield* anchorsDrift(root, [stale])).toEqual([
        'stale.md: path packages/film/src/tools/gone.ts does not exist',
        'stale.md: packages/film/src/core/api.ts has no pageHrefs',
        'stale.md: packages/film/src/tools/review.ts has no Review.write',
        'stale.md: lab/page-shell.tsx:346: name a symbol, not a line',
        'stale.md: packages/film/src/lab/api.ts has no uniqueId',
        'stale.md: path tools/gone.ts does not exist',
        'stale.md: path reference/none.md does not exist',
        'stale.md: path guide/gone.md does not exist',
        'stale.md: path guide/gone-too.md does not exist',
        'stale.md: path guide/gone-table.md does not exist',
        'stale.md: path guide/gone-tilde.md does not exist',
      ]);
      // What names no rule, script, link, flag or finding is not read as one: a directory of the
      // film package, a binary or a file `bun run` runs, a call in code, a name the code has, and
      // a sentence that says "film" before a flag.
      const correct: Doc = {
        path: 'correct.md',
        bases: ['', FILM_SRC],
        whole: false,
        text: [
          'The rules live in `film/lint`, the lab in `film/lab`.',
          'Build with `bun run --bun vite build`.',
          'Watch it: `bun run --watch cli.ts lab`.',
          '```ts',
          'handlers[i](event);',
          '```',
          'Index it with `xs[0](y)`.',
          'After `bun run check <film>`, the `PageShell` shows `DeadAir`.',
          '`film check <film>` reports each finding as a `TaggedError`.',
          'The film render pass has no bearing on --fix, which belongs to oxlint.',
          '```ts',
          '// the film render pass ignores --fix; oxlint owns it',
          '```',
          '````md',
          '```ts',
          'handlers[i](event);',
          '```',
          '````',
          'After `film check <film>`, `UrlAtom` exposes the selected route.',
          '`bun run --cwd . lint` lints the repo.',
          'A film check run with --frob is not a command here.',
          'film check reads `--static` from its flags.',
          '`bun run lint -- --fix` fixes what it can; run `bun run --filter @bible/film test` first.',
          '',
          // A sentence in a list item that starts with the bin and holds a `;`, code in a quote's
          // or a list item's block, a command in a table, and a link GitHub shows as no link (in
          // an HTML comment, or in a code block that a fence with an info string does not close).
          '- film render writes stills; Vite takes --host, not the CLI.',
          '',
          '> ```ts',
          '> handlers[i](event);',
          '> ```',
          '',
          '- ```ts',
          '  handlers[i](event);',
          '  ```',
          '',
          '| `film check <film> --static` | the static checks |',
          '| --- | --- |',
          '',
          '<!-- See [the draft](guide/draft.md). -->',
          '',
          '```ts',
          'a',
          '```ts',
          'Read [the gone guide](guide/gone.md).',
        ].join('\n'),
      };
      expect(drift(correct, code)).toEqual([]);
      expect(yield* anchorsDrift(root, [correct])).toEqual([]);
      // A symbol is declared by a binding, a class's or a type's member, or a key of its own
      // statement's object; a line that calls it, or a key handed to a call, declares nothing.
      expect(
        [
          ['const run = () => {\n  frobnicate(1);\n};\n', 'frobnicate'],
          ['use({ frobnicate: 1 });\n', 'frobnicate'],
          ['export const api = { read: 1 };\nuse({ write: 2 });\n', 'api.write'],
          ['const { frobnicate } = use();\n', 'frobnicate'],
          ['export class Review {\n  static read() {}\n}\n', 'Review.read'],
          ['interface Api {\n  readonly read: number;\n}\n', 'Api.read'],
          ['export const api = { read: 1, write };\n', 'api.write'],
          ['export const Store = Schema.Struct({ mtime: Schema.Number });\n', 'Store.mtime'],
          // The head is a declaration that binds it, any of them: a member of a type, or a
          // local of another function, named the same, is not the one that holds the member;
          // a member of a type and a key handed to a call bind nothing.
          [
            'interface Deps {\n  readonly Review: unknown;\n}\nexport class Review {\n  static read() {}\n}\n',
            'Review.read',
          ],
          [
            'const f = () => {\n  const Review = 1;\n};\nexport class Review {\n  static read() {}\n}\n',
            'Review.read',
          ],
          [
            'interface Deps {\n  readonly Review: { read: 1 };\n}\nexport class Review {}\n',
            'Review.read',
          ],
          ['use({ Review: { read: 1 } });\n', 'Review.read'],
        ].map(([text = '', symbol = '']) => declares(text, symbol)),
      ).toEqual([false, false, false, true, true, true, true, true, true, true, false, false]);
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
});
