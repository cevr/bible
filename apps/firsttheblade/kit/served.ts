/**
 * Every image the site serves, read from what the app serves: each image
 * file (by its extension, `IMAGE`) under `public/`, which the build copies
 * whole into `dist/`, and under `src/`, whose images the build emits when a
 * module names them; and each image a module under `src/` names, wherever
 * its file lies. A script names an image by an `import` or `export … from`
 * statement (not a type-only one), a dynamic `import()` of a string, or a
 * `new URL(<string>, import.meta.url)`, as the build's own parser (Vite's
 * `parseSync`) reads it; a stylesheet by a `url()` or an `@import`, as
 * lightningcss reads it. Tests and type declarations are not served, so a
 * `.test.` module and a `.d.ts` file are not read.
 *
 * `OUTSIDE` names the images outside the stills rule (`./approval.ts`), each
 * with why; every other served image is a still the record holds.
 */
import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import { transform } from 'lightningcss';
import { type ESTree, parseSync, Visitor } from 'vite';

/** The extensions of an image file, in any case. */
export const IMAGE = /\.(?:webp|png|jpe?g|avif|gif|svg|ico)$/i;

/** The folders whose files the site serves, from the app. */
export const SERVED_FOLDERS = ['public', 'src'] as const;

/** An image the site serves outside the stills rule, by its path from the app, and why it is outside. */
export interface Outside {
  readonly image: string;
  readonly why: string;
}

const NIGHT =
  "the night: round 4's painting in palette 09, not drawn from the field, and no kit step writes it";
const MARK = "the mark: round 4's painting, not drawn from the field, and no kit step writes it";
const EMBLEM = "a series emblem: round 3's drawing, laid in the page as markup, not a painting";
const ICON = 'an icon `bun run kit` draws from the mark, not from the field';

/** The images the site serves outside the stills rule, each with why. */
export const OUTSIDE: ReadonlyArray<Outside> = [
  { image: 'public/apple-touch-icon.png', why: ICON },
  { image: 'public/favicon.ico', why: ICON },
  { image: 'public/icon-192.png', why: ICON },
  { image: 'public/icon-512.png', why: ICON },
  { image: 'src/art/emblem-land.svg', why: EMBLEM },
  { image: 'src/art/emblem-path.svg', why: EMBLEM },
  { image: 'src/art/emblem-remedies.svg', why: EMBLEM },
  { image: 'src/art/emblem-taught.svg', why: EMBLEM },
  { image: 'src/art/mark-112.webp', why: MARK },
  { image: 'src/art/mark-320.webp', why: MARK },
  { image: 'src/art/night-1536.webp', why: NIGHT },
  { image: 'src/art/night-768.webp', why: NIGHT },
];

/** The scripts the build's parser reads, by extension. */
const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;

/** A specifier without its query or fragment (`?raw`, `?url`, `#x`). */
const bare = (specifier: string) => specifier.replace(/[?#].*$/s, '');

/** A string literal's value, if the expression is one. */
const stringOf = (node: ESTree.Expression | ESTree.Argument) =>
  Option.liftPredicate(
    node,
    (given): given is ESTree.StringLiteral =>
      given.type === 'Literal' && Predicate.isString(given.value),
  ).pipe(Option.map((literal) => literal.value));

/** Whether an argument is `import.meta.url`. */
const isMetaUrl = (node: ESTree.Argument) =>
  node.type === 'MemberExpression' &&
  node.object.type === 'MetaProperty' &&
  node.property.type === 'Identifier' &&
  node.property.name === 'url';

/** A script the build's parser cannot read. */
class ScriptUnread extends Schema.TaggedError<ScriptUnread>()('ScriptUnread', {
  file: Schema.String,
  reason: Schema.String,
}) {}

/**
 * Every specifier a script names a module or file by, as the build's parser
 * reads it: an `import` or `export … from` that is not type-only, an
 * `import()` of a string, a `new URL(<string>, import.meta.url)`.
 */
const scriptNames = Effect.fn('Served.scriptNames')(function* (file: string, code: string) {
  const { program, errors } = parseSync(file, code);
  if (errors.length > 0)
    return yield* ScriptUnread.make({
      file,
      reason: errors.map(({ message }) => message).join('; '),
    });
  const found: Array<string> = [];
  const add = (name: Option.Option<string>) => Option.map(name, (given) => found.push(given));
  new Visitor({
    ImportDeclaration: (node) => {
      if (node.importKind !== 'type') found.push(node.source.value);
    },
    ExportAllDeclaration: (node) => {
      if (node.exportKind !== 'type') found.push(node.source.value);
    },
    ExportNamedDeclaration: (node) => {
      if (node.exportKind !== 'type') add(Option.flatMap(Option.fromNullOr(node.source), stringOf));
    },
    ImportExpression: (node) => {
      add(stringOf(node.source));
    },
    NewExpression: (node) => {
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'URL' &&
        Option.exists(Option.fromUndefinedOr(node.arguments[1]), isMetaUrl)
      )
        add(Option.flatMap(Option.fromUndefinedOr(node.arguments[0]), stringOf));
    },
  }).visit(program);
  return found;
});

/** Every `url()` and `@import` a stylesheet names, as lightningcss reads it. */
const styleNames = (file: string, code: string) =>
  (
    transform({
      filename: file,
      code: new TextEncoder().encode(code),
      analyzeDependencies: true,
    }).dependencies ?? []
  )
    .filter((dependency) => dependency.type === 'url' || dependency.type === 'import')
    .map((dependency) => dependency.url);

/** Whether the build reads a file under `src/` as a module: a script or a stylesheet, not a test or a type declaration. */
const isModule = (file: string) =>
  (SCRIPT.test(file) || file.endsWith('.css')) &&
  !file.includes('.test.') &&
  !file.endsWith('.d.ts');

/** What a module under `src/` names: each specifier the build's parser (a script) or lightningcss (a stylesheet) finds in it. */
const readNames = (file: string, code: string) =>
  Effect.suspend(() => {
    if (file.endsWith('.css')) return Effect.succeed(styleNames(file, code));
    return scriptNames(file, code);
  });

/** Each module's names, by its path and text: a module read once is not parsed again until its text changes. */
const read = new Map<string, { readonly code: string; readonly names: ReadonlyArray<string> }>();

const named = Effect.fn('Served.named')(function* (file: string, code: string) {
  const known = read.get(file);
  if (known?.code === code) return known.names;
  const names = yield* readNames(file, code);
  read.set(file, { code, names });
  return names;
});

/** The file a specifier in `module` names: a root path (`/x.webp`) from `public/`, a relative one from the module, else as Bun resolves a package. */
const fileOf = (app: string, module: string, specifier: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    if (specifier.startsWith('/')) return path.join(app, 'public', specifier);
    if (specifier.startsWith('.')) return path.join(path.dirname(module), specifier);
    return Bun.resolveSync(specifier, path.dirname(module));
  });

/** Every file under the served folders, by its absolute path. */
const servedFiles = Effect.fn('Served.files')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files: Array<{ readonly folder: string; readonly file: string }> = [];
  for (const folder of SERVED_FOLDERS) {
    const root = path.join(app, folder);
    if (!(yield* fs.exists(root))) continue;
    for (const entry of yield* fs.readDirectory(root, { recursive: true }))
      files.push({ folder, file: path.join(root, entry) });
  }
  return files;
});

/** Every image file a module names that exists. */
const namedImages = Effect.fn('Served.namedImages')(function* (app: string, module: string) {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* named(module, yield* fs.readFileString(module));
  const images: Array<string> = [];
  for (const specifier of names.map(bare).filter((name) => IMAGE.test(name))) {
    const file = yield* fileOf(app, module, specifier);
    if (yield* fs.exists(file)) images.push(file);
  }
  return images;
});

/**
 * Every image the site serves, by its path from the app (one outside it
 * starts `../`), sorted: every image file under the served folders, and
 * every image file a module under `src/` names (a root path, `/x.webp`,
 * from `public/`). A name with no file behind it serves nothing: the build
 * refuses it.
 */
export const servedImages = Effect.fn('Served.images')(function* (app: string) {
  const path = yield* Path.Path;
  const fromApp = (file: string) => path.relative(app, file).split(path.sep).join('/');
  const files = yield* servedFiles(app);
  const modules = files.filter(({ folder, file }) => folder === 'src' && isModule(file));
  const named = yield* Effect.forEach(modules, ({ file }) => namedImages(app, file));
  const found = new Set([
    ...files.filter(({ file }) => IMAGE.test(file)).map(({ file }) => fromApp(file)),
    ...named.flat().map(fromApp),
  ]);
  return [...found].toSorted();
});
