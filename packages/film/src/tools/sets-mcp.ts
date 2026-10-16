// The lab MCP's sets (`lab-mcp.ts` serves them): the sets under the review
// roots as the review walks them (`sets`), one montage's `review.json`
// (`set`), a project folder's catalogue (`catalogue`), and the writes into
// them, each through the store the page and the CLI write through
// (`ContentStore`, `RenderCatalogue`): a set published (`publish_set`) and a
// render recorded (`record_render`). Each write drops the review's index, so
// its next read sees what was written.

import {
  Array as Arr,
  Clock,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Result,
  Schema,
  Struct,
} from 'effect';
import { McpServer, Tool, Toolkit } from 'effect/ai';
import { pageHref } from '../core/api.ts';
import { Catalogue, CatalogueJson, Render } from '../core/catalogue.ts';
import { LabLinks, linksAt } from '../core/lab-events.ts';
import { setNamed } from '../core/production.ts';
import { ReviewManifest, ReviewManifestJson } from '../core/review.ts';
import { repoJson } from '../core/schema.ts';
import { Segment } from '../core/segment.ts';
import { CATALOGUE_FILE, RenderCatalogue } from './catalogue.ts';
import { ContentStore, type Manifest, writeWholeWith } from './content-store.ts';
import { FilmFolder, filmNamed, filmsOut } from './film-repo.ts';
import { LabRefused, type LabMcpOptions, inside, refused } from './lab-mcp-parts.ts';
import { logged } from './mcp-calls.ts';
import { Review, filesInMontage, pathOf, recordsUnder, refOf } from './review.ts';

// ---------------------------------------------------------------------------
// What the tools answer

export const SetRead = Schema.Struct({
  /** Its ref: what `set`, `catalogue` and the lab's `/sets/<ref>` name it by. */
  set: Schema.String,
  kind: Schema.Literals(['montage', 'project']),
  title: Schema.optionalKey(Schema.String),
  links: LabLinks,
  /** Where it is on this machine. */
  dir: Schema.String,
});

const CatalogueRead = Schema.Struct({
  set: Schema.String,
  links: LabLinks,
  catalogue: Catalogue,
});

const SetManifestRead = Schema.Struct({
  set: Schema.String,
  links: LabLinks,
  dir: Schema.String,
  manifest: ReviewManifest,
});

/** A file put into a set: from a path on this machine to a path in the set's folder. */
const SetFile = Schema.Struct({
  from: Schema.String.annotate({ description: 'An absolute path on this machine.' }),
  to: Schema.String.annotate({
    description:
      'Where it goes in the set, relative (`images/1-k1.png`); the file name when left out.',
  }).pipe(Schema.optionalKey),
});

/**
 * What a publish says of the manifest, as `review.json` writes it: each key
 * given replaces the one there; one left out is kept, a key this lab does
 * not know too. The whole is checked as the review reads it.
 */
const ManifestPatch = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  blurb: Schema.optionalKey(Schema.String),
  docs: Schema.optionalKey(Schema.Array(Schema.String)),
  images: Schema.optionalKey(Schema.Array(Schema.String)),
  videos: Schema.optionalKey(Schema.Array(Schema.String)),
  downloads: Schema.optionalKey(Schema.Array(Schema.String)),
  sets: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Json).annotate({
      description:
        'Comparison sets by clip: `{ title?, order?, start?, moments?, variants: { <id>: { label?, tag?, verdict?, notes?, file? } } }`; a variant with no `file` is `<clip>.<id>.share.mp4` or `<clip>.<id>.mp4` beside it.',
    }),
  ),
});

/** `review.json` as the publish reads and writes it: its keys as they are, two-space JSON. */
const ManifestJson = repoJson(Schema.Record(Schema.String, Schema.Json));

/** A set's folder name: one segment, as the dated sets are (`storyboard-2026-10-14`). */
const SetName = Segment.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9._-]*$/, {
    message: 'a folder name of lower case, digits, `.`, `_` and `-`',
  }),
);

/** The files a set may carry: what the review shows (images, videos, docs, captions) or offers to download. */
const SET_FILE = /\.(png|jpe?g|webp|gif|svg|mp4|webm|mov|m4a|mp3|wav|vtt|md|txt|json|pdf|zip)$/i;

/** A `review.json` with nothing in it, as the review reads one. */
const emptyManifest = Schema.decodeSync(ReviewManifestJson)('{}');

// ---------------------------------------------------------------------------
// The tools

const CatalogueTool = Tool.make('catalogue', {
  description:
    "A project folder's render catalogue: its renders, and the owner's approvals and comments on them. Name the folder by `set` (a ref from `sets`), or a film's own by `film`.",
  parameters: Schema.Struct({
    film: Schema.optionalKey(Schema.String),
    set: Schema.optionalKey(Schema.String),
  }),
  success: CatalogueRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

export const Sets = Tool.make('sets', {
  description:
    'Every set the lab lists, by ref: montages (a `review.json`) and project folders (a `catalogue.json`), each with its title, lab link and folder.',
  success: Schema.Struct({ sets: Schema.Array(SetRead) }),
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const SetTool = Tool.make('set', {
  description: "A montage set's `review.json`, its lab link and its folder.",
  parameters: Schema.Struct({ set: Schema.String }),
  success: SetManifestRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const PublishSet = Tool.make('publish_set', {
  description:
    "Publish a set into the lab, or update one: its folder `name` in the lab's own `out/` (never a project folder, a film's or one a catalogue keeps: a render is recorded there with `record_render`), the files copied in (each `from` an absolute path, `to` its place in the folder), and its `review.json` written with the keys given (each replaces the one there; a key left out is kept). List each file the set shows under `images`, `videos`, `docs`, `downloads` or a comparison set's variants (and their `notes`), by its path in the folder: each must be there once the files are in, a variant with no `file` as its share copy or its master. Answers the set's ref and link: the owner sees it at once.",
  parameters: Schema.Struct({
    name: SetName,
    files: Schema.optionalKey(Schema.Array(SetFile)),
    manifest: ManifestPatch,
  }),
  success: SetManifestRead,
  failure: LabRefused,
});

const RecordRender = Tool.make('record_render', {
  description:
    "Record a render in a film's catalogue (its project folder, `out/<film>`), in place of the one before it at the same address and variant, so the review lists it. `film render` records its own; use this for a render made another way. Every file it names must be in the project folder, named relative to it.",
  parameters: Schema.Struct({
    film: Schema.String,
    render: Schema.Struct(Struct.omit(Render.fields, ['at'])),
  }),
  success: Schema.Struct({ set: Schema.String, links: LabLinks }),
  failure: LabRefused,
});

const SetsToolkit = Toolkit.make(CatalogueTool, Sets, SetTool, PublishSet, RecordRender);

// ---------------------------------------------------------------------------
// The reads and writes, over the review's roots

/** The sets as the tools, the overview and the asks read and write them. */
export const setsReads = Effect.fn('LabMcp.setsReads')(function* (options: LabMcpOptions) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = yield* FilmFolder;
  const review = yield* Review;
  const store = yield* ContentStore;
  const catalogues = yield* RenderCatalogue;
  const films = yield* Effect.context<FilmFolder>();
  const platform = yield* Effect.context<FileSystem.FileSystem | Path.Path>();
  const out = yield* filmsOut;

  const linksOf = (at: string) => linksAt(options.links, at);
  const named = (film: string) => refused(filmNamed(film).pipe(Effect.provideContext(films)));

  /**
   * The sets under the roots, as the review walks them (`recordsUnder`: every
   * level, a folder with a catalogue a project, one with a manifest alone a
   * montage), each whose record decodes as the review reads it.
   */
  const sets = Effect.gen(function* () {
    const listed = yield* recordsUnder(review.roots).pipe(Effect.provideContext(platform));
    const found = yield* Effect.forEach(
      listed,
      (f) =>
        Effect.gen(function* () {
          const text = yield* fs.readFileString(f.file).pipe(Effect.option);
          // The record decoded: some title or none when it does; nothing when it does not.
          const decoded = Match.value(f.kind).pipe(
            Match.when('montage', () =>
              Option.map(
                Option.flatMap(text, Schema.decodeOption(ReviewManifestJson)),
                (m) => m.title,
              ),
            ),
            Match.orElse(() =>
              Option.map(Option.flatMap(text, Schema.decodeOption(CatalogueJson)), () =>
                Option.none<string>(),
              ),
            ),
          );
          return Option.map(decoded, (t): typeof SetRead.Type => ({
            set: f.ref,
            kind: f.kind,
            ...Option.match(t, { onNone: () => ({}), onSome: (named) => ({ title: named }) }),
            links: linksOf(pageHref.folder(f.ref)),
            dir: f.dir,
          }));
        }),
      { concurrency: 8 },
    );
    return Arr.getSomes(found);
  });

  /** A set's ref and folder: by its ref, or a film's own project folder. */
  const folderOf = Effect.fn('LabMcp.folderOf')(function* (
    film: Option.Option<string>,
    set: Option.Option<string>,
  ) {
    if (Option.isSome(set)) {
      const dir = yield* Effect.fromOption(pathOf(review.roots, set.value, path), () =>
        LabRefused.make({ reason: `no set ${set.value} under the lab's roots (see \`sets\`)` }),
      );
      return { ref: set.value, dir, name: path.basename(dir) };
    }
    if (Option.isNone(film))
      return yield* LabRefused.make({ reason: 'name the folder: a `set` ref, or a `film`' });
    const dir = folder.paths(yield* named(film.value)).out;
    const ref = yield* Effect.fromOption(refOf(review.roots, dir, path), () =>
      LabRefused.make({
        reason: `film ${film.value}'s folder ${dir} is under none of the lab's roots`,
      }),
    );
    return { ref, dir, name: film.value };
  });

  const catalogueOf = Effect.fn('LabMcp.catalogue')(function* (
    film: Option.Option<string>,
    set: Option.Option<string>,
  ) {
    const at = yield* folderOf(film, set);
    const catalogue = yield* refused(catalogues.read({ name: at.name, out: at.dir }));
    return { set: at.ref, links: linksOf(pageHref.folder(at.ref)), catalogue };
  });

  /** A montage's manifest file, as the publish writes it. */
  const manifestAt = (dir: string): Manifest<{ readonly [k: string]: Schema.Json }> => ({
    file: path.join(dir, 'review.json'),
    codec: ManifestJson,
    empty: {},
  });

  const setOf = Effect.fn('LabMcp.set')(function* (ref: string) {
    const at = yield* folderOf(Option.none(), Option.some(ref));
    const file = path.join(at.dir, 'review.json');
    if (!(yield* refused(fs.exists(file))))
      return yield* LabRefused.make({
        reason: `set ${ref} has no review.json: read it with \`catalogue\``,
      });
    const manifest = yield* refused(
      store.read({ file, codec: ReviewManifestJson, empty: emptyManifest }),
    );
    return { set: ref, links: linksOf(pageHref.folder(ref)), dir: at.dir, manifest };
  });

  // A write drops the review's index (`written`), refused or not, so its next read sees the folder as it is.
  const publishSet = Effect.fn('LabMcp.publishSet')(function* (
    name: string,
    files: ReadonlyArray<typeof SetFile.Type>,
    patch: typeof ManifestPatch.Type,
  ) {
    const dir = path.join(out, name);
    const ref = yield* Effect.fromOption(refOf(review.roots, dir, path), () =>
      LabRefused.make({ reason: `the lab's out/ (${out}) is under none of its review roots` }),
    );
    // A project folder is a film's renders: the review reads it by its catalogue, never as a montage.
    const elsewhere =
      'publish the set under another name, and record a render there with `record_render`';
    if ((yield* folder.names).includes(name))
      return yield* LabRefused.make({
        reason: `${name} is film ${name}'s project folder, where its renders are recorded: ${elsewhere}`,
      });
    if (yield* fs.exists(path.join(dir, CATALOGUE_FILE)).pipe(Effect.orElseSucceed(() => false)))
      return yield* LabRefused.make({
        reason: `${name} is a project folder (its ${CATALOGUE_FILE}): ${elsewhere}`,
      });
    // Every file checked before anything is written.
    const copies = yield* Effect.forEach(files, (f) =>
      Effect.gen(function* () {
        if (!path.isAbsolute(f.from))
          return yield* LabRefused.make({
            reason: `${f.from}: name the file by its absolute path`,
          });
        const info = yield* refused(fs.stat(f.from));
        if (info.type !== 'File')
          return yield* LabRefused.make({ reason: `${f.from} is not a file` });
        const rel = f.to ?? path.basename(f.from);
        if (!SET_FILE.test(rel))
          return yield* LabRefused.make({
            reason: `${rel}: a set carries images, videos, sound, docs and captions`,
          });
        const to = yield* Effect.fromOption(inside(path, dir, rel), () =>
          LabRefused.make({ reason: `${rel} is not a place in the set's folder` }),
        );
        return { from: f.from, to };
      }),
    );
    const written = yield* refused(
      store.transact(manifestAt(dir), (current) =>
        Effect.gen(function* () {
          for (const copy of copies) {
            yield* fs.makeDirectory(path.dirname(copy.to), { recursive: true });
            // Copied whole: the review never lists half a video.
            yield* writeWholeWith(
              fs,
              copy.to,
              (partial) => fs.copyFile(copy.from, partial),
              (partial) => fs.rename(partial, copy.to),
            );
          }
          const next = { ...current, ...patch };
          const manifest = yield* Schema.decodeUnknownEffect(ReviewManifest)(next).pipe(
            Effect.mapError((e) => LabRefused.make({ reason: `review.json: ${e.message}` })),
          );
          // Every file it names as the review finds it: a variant with no `file`, by either copy.
          const there = (name: string) =>
            Option.match(inside(path, dir, name), {
              onNone: () => Effect.succeed(false),
              onSome: (at) => fs.exists(at),
            });
          const missing = yield* Effect.filter(filesInMontage(manifest), (names) =>
            Effect.map(Effect.forEach(names, there), (found) => !found.includes(true)),
          );
          if (missing.length > 0)
            return yield* LabRefused.make({
              reason: `review.json names what the folder lacks: ${missing.map((names) => names.join(' or ')).join(', ')}`,
            });
          return [manifest, next] as const;
        }),
      ),
    );
    yield* Effect.log(`lab.mcp.publish set=${ref} files=${copies.length}`);
    return { set: ref, links: linksOf(pageHref.folder(ref)), dir, manifest: written };
  }, Effect.ensuring(review.written));

  // As for a set: the catalogue written, the review's index is dropped.
  const recordRender = Effect.fn('LabMcp.recordRender')(function* (
    name: string,
    given: Omit<Render, 'at'>,
  ) {
    const at = yield* folderOf(Option.some(name), Option.none());
    const files = [
      ...Option.toArray(given.files.clip),
      ...Option.toArray(given.files.share),
      ...Option.toArray(given.files.captions),
      ...Option.toArray(given.files.chapters),
      ...given.files.images,
    ];
    const missing = yield* Effect.filter(files, (file) =>
      Option.match(inside(path, at.dir, file), {
        onNone: () => Effect.succeed(true),
        onSome: (where) =>
          Effect.map(fs.exists(where).pipe(Effect.orElseSucceed(() => false)), (there) => !there),
      }),
    );
    if (missing.length > 0)
      return yield* LabRefused.make({
        reason: `the render names files its project folder ${at.dir} lacks: ${missing.join(', ')}`,
      });
    const render: Render = { ...given, at: yield* Clock.currentTimeMillis };
    yield* refused(catalogues.record({ name: at.name, out: at.dir }, render));
    return { set: at.ref, links: linksOf(pageHref.folder(at.ref)) };
  }, Effect.ensuring(review.written));

  /** The folder a timeline names the set `given` by (`setNamed`): by its ref or by its folder, held by one root. */
  const folderNamed = Effect.fn('LabMcp.folderNamed')(function* (given: string) {
    const named = setNamed(
      (yield* sets).map((listed) => listed.set),
      given,
    );
    if (Result.isFailure(named))
      return yield* LabRefused.make({
        reason: `${named.failure.folder} is a folder in more than one root (${named.failure.refs.join(', ')}), and a production's timeline names a set by its folder alone: rename one, or leave out \`set\``,
      });
    return yield* Option.match(named.success, {
      onNone: () =>
        Effect.fail(
          LabRefused.make({
            reason: `no set ${given}: \`sets\` lists them by ref (a folder under its root names one too)`,
          }),
        ),
      onSome: (set) => Effect.succeed(set.folder),
    });
  });

  return { sets, setOf, catalogueOf, publishSet, recordRender, folderNamed };
});

/** The sets' tools, served by the lab's MCP server. */
export const setsMcp = (options: LabMcpOptions) =>
  McpServer.toolkit(SetsToolkit).pipe(
    Layer.provideMerge(
      SetsToolkit.toLayer(
        Effect.map(setsReads(options), (lab) =>
          SetsToolkit.of({
            catalogue: logged('catalogue', ({ film, set }) =>
              lab.catalogueOf(Option.fromUndefinedOr(film), Option.fromUndefinedOr(set)),
            ),
            sets: logged('sets', () => Effect.map(lab.sets, (sets) => ({ sets }))),
            set: logged('set', ({ set }) => lab.setOf(set)),
            publish_set: logged('publish_set', ({ name, files, manifest }) =>
              lab.publishSet(name, files ?? [], manifest),
            ),
            record_render: logged('record_render', ({ film, render }) =>
              lab.recordRender(film, render),
            ),
          }),
        ),
      ),
    ),
  );
