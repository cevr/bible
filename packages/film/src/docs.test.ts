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
// - each path written from the repo root (`packages/…`, `apps/…`, `.claude/…`,
//   `.github/…`) exists;
// - each `--flag` given to a film command (`bun run render <film> --stills …`)
//   is declared by a `Flag` in src/tools (`--no-x` by its `x`);
// - on a command line that runs `check` (`bun run check …  # warns …`), each
//   finding named is a tagged error in src.
//
// What a sentence claims about the code stays with the sweep's reading.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { LabHttpApi, routesOf } from './core/api.ts';

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
  readonly exists: (repoPath: string) => boolean;
}

interface Doc {
  readonly path: string;
  readonly text: string;
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

const pathDrift = (doc: Doc, code: Code) =>
  matches(doc.text, /`((?:packages|apps|\.claude|\.github)\/[^`\s]+)`/g)
    .map((m) => firstGroup(m).replace(/:\d.*$/, ''))
    .filter((path) => !/[<*{…]/.test(path) && !code.exists(path))
    .map((path) => `path ${path} does not exist`);

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
    ...pathDrift(doc, code),
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
  const tracked = new Set(
    yield* Effect.forEach(['packages', 'apps', '.claude', '.github'], (dir) =>
      Effect.map(fs.readDirectory(at(dir), { recursive: true }), (files) =>
        files.filter((f) => !f.includes('node_modules')).map((f) => `${dir}/${f}`),
      ),
    ).pipe(Effect.map((all) => all.flat())),
  );
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
    exists: (repoPath: string) => tracked.has(repoPath.replace(/\/$/, '')),
  } satisfies Code;
});

/** The docs that teach the framework. */
const readDocs = Effect.fn('test.docs.readDocs')(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const skills = yield* Effect.forEach(
    ['.claude/skills/film', '.claude/skills/film-architecture-loop'],
    (dir) =>
      Effect.map(fs.readDirectory(path.join(root, dir), { recursive: true }), (files) =>
        files.filter((f) => f.endsWith('.md')).map((f) => `${dir}/${f}`),
      ),
  );
  return yield* Effect.forEach(['packages/film/README.md', ...skills.flat()], (file) =>
    Effect.map(fs.readFileString(path.join(root, file)), (text) => ({ path: file, text })),
  );
});

const ROOT = Effect.map(Path.Path, (path) => path.join(import.meta.dir, '..', '..', '..'));

describe('the docs', () => {
  it.effect.layer(BunServices.layer)(
    'name only routes, rules, scripts, paths, flags and findings the code has',
    () =>
      Effect.gen(function* () {
        const root = yield* ROOT;
        const [code, docs] = yield* Effect.all([readCode(root), readDocs(root)]);
        expect(docs.flatMap((doc) => drift(doc, code))).toEqual([]);
        // The owner's runbook, the prior arts and the app's README name routes too.
        const fs = yield* FileSystem.FileSystem;
        const others = yield* Effect.forEach(
          ['NORTH_STAR.md', 'PRIOR_ARTS.md', 'apps/animations/README.md'],
          (file) =>
            Effect.map(fs.readFileString(`${root}/${file}`), (text) => ({ path: file, text })),
        );
        expect(
          others.flatMap((doc) => spanDrift(doc, code).map((what) => `${doc.path}: ${what}`)),
        ).toEqual([]);
        expect(undocumented(docs, code)).toEqual([]);
        // Each registered rule is on for the paths it guards.
        expect(Array.from(code.registered).filter((rule) => !code.enabled.has(rule))).toEqual([]);
      }),
  );

  it.effect.layer(BunServices.layer)('fail a doc that names what the code no longer has', () =>
    Effect.gen(function* () {
      const code = yield* readCode(yield* ROOT);
      const stale: Doc = {
        path: 'stale.md',
        text: [
          '| `GET /index.json` | the old index |',
          'Mute a take with `film/no-such-rule`, then `bun run nothing`.',
          'See `packages/film/src/tools/gone.ts`.',
          'bun run render <film> --tag p7   # render a tagged variant',
          'bun run check <film>             # warns VoiceLevel, SeamLong',
          'Its frame is `/review/frame`; say it with `POST /review/project/<film>/say`.',
        ].join('\n'),
      };
      expect(drift(stale, code)).toEqual([
        'stale.md: route GET /index.json is declared by no API',
        'stale.md: path /review/frame is no route of the API',
        'stale.md: route POST /review/project/:film/say is declared by no API',
        'stale.md: rule film/no-such-rule is not registered',
        'stale.md: bun run nothing: no such script',
        'stale.md: path packages/film/src/tools/gone.ts does not exist',
        'stale.md: bun run render --tag: no command declares the flag',
        'stale.md: VoiceLevel is no finding',
      ]);
    }),
  );
});
