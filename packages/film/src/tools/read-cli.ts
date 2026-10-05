// `film read`: what the lab reads of a film, in this process, as the film's
// sources stand on disk. The lab runs these in a fresh process (`FreshFilm`,
// `fresh-film.ts`) because its own imports of the film's script, voice and
// scenes are as they were at its start. Each prints one line of JSON
// (`FreshLine`) on stdout; logs go to stderr. A run that fails answers with
// its failure (`answering`: a refusal as itself, any other as ServerFailed),
// so a film that does not load reads as one sentence.
//
//   film read voice <film>
//       what the studio reads: the voice, how speech-to-text writes the
//       script's names, each beat's line, and the reading sheet
//   film read cue <film> <scene> <cue> [--spans <json>] [--patch <json>]
//       the cue on its scene's clock, as the scene file now declares it (or
//       with `spans` in place of its own: a write the lab has not made yet,
//       and `patch` over the cue's own span when its source computes part of
//       it, so no literal span says it), or why the scene's timeline does not
//       resolve
//   film read sites <film>
//       where each scene's drawing is declared, and what of it the lab may
//       write (`locateHere`), or why a scene is not located
//
// `locateHere` also serves the CLI's own commands (`scenesLocatedHere`):
// each runs in a process of its own, which imports the film as it stands.

import {
  Array as Arr,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import type { LineError, UnknownVoice } from '../core/errors.ts';
import { type Placed, sceneClock, sceneOf } from '../core/layout.ts';
import { FilmUnknown, SceneNotLocated, SourceShared } from '../core/refusals.ts';
import type { CuePatch, Span } from '../core/schema.ts';
import { type Quote, type ScriptLine, sheetBeats } from '../core/sheet.ts';
import type { StudioReading } from '../core/studio.ts';
import { patchSpan, resolveTimeline, writtenPatch } from '../core/timeline.ts';
import { FilmModuleInvalid } from './errors.ts';
import { FilmFolder, FilmRepo, type LoadedFilm, importFilmModule, placeFilm } from './film-repo.ts';
import {
  CuePatchJson,
  CueRead,
  type SceneSite,
  SitesRead,
  TimelineJson,
  VoiceRead,
  answering,
  printLine,
} from './fresh-film.ts';
import { beatsOf } from './narrator.ts';
import { type DrawingSite, drawingSites, parseModule } from './scene-source.ts';
import { type Field, type Located, SceneSources } from './scene-sources.ts';
import { quotesOf } from './script-sheet.ts';

const film = Argument.String('film').pipe(
  Argument.withDescription('the film, a folder under src/films'),
);

/**
 * What the studio reads of `loaded`: its voice, its script's `heardAs`, each
 * beat's line, and the sheet set from `script` (each scene's `say` when the
 * film keeps no `script.ts`) and the film's quotations. Pure.
 */
const studioReading = (
  loaded: LoadedFilm,
  script: Option.Option<ReadonlyArray<ScriptLine>>,
  quotes: ReadonlyArray<Quote>,
): Result.Result<StudioReading, UnknownVoice | LineError> =>
  Result.gen(function* () {
    const lines = Option.getOrElse(script, () =>
      loaded.scenes.map((scene) => ({ ...scene, cite: [] })),
    );
    return {
      voice: loaded.voice,
      heardAs: loaded.heardAs,
      beats: yield* beatsOf(loaded),
      sheet: yield* sheetBeats(lines, quotes),
    };
  });

/** What the studio reads of the film as it is stored now. */
export const readingOf = Effect.fn('film.read.voice.reading')(function* (loaded: LoadedFilm) {
  const script = yield* (yield* FilmRepo).script(loaded.paths.name);
  return yield* Effect.fromResult(studioReading(loaded, script, yield* quotesOf(loaded)));
});

/**
 * The cue's own span as the film plays it with `patch` applied, when `spans`
 * has none for it: its source computes part of it (`until: MARK`), so no
 * literal of the new text says it, and only the film's value, with the write
 * applied as the file will hold it (`writtenPatch`), is the span the write
 * would play.
 */
const patched = (
  timeline: Option.Option<Readonly<Record<string, Span>>>,
  spans: Readonly<Record<string, Span>>,
  cue: string,
  patch: Option.Option<CuePatch>,
): Readonly<Record<string, Span>> =>
  Option.match(
    Option.zipWith(
      Option.filter(patch, () => !Object.hasOwn(spans, cue)),
      Option.flatMap(timeline, (own) => Option.fromUndefinedOr(own[cue])),
      (q, span) => patchSpan(span, writtenPatch(q)),
    ),
    { onNone: () => ({}), onSome: (span) => ({ [cue]: span }) },
  );

/**
 * `cue` on `scene`'s clock among the placed scenes, `spans` over the scene's
 * own and `patch` over the cue's own span where `spans` has none for it
 * (`patched`), or why the scene's timeline does not resolve; neither when the
 * scene or the cue is not there. Pure.
 */
export const cueOf = (
  placed: ReadonlyArray<Placed>,
  scene: string,
  cue: string,
  spans: Readonly<Record<string, Span>>,
  patch: Option.Option<CuePatch>,
): CueRead =>
  Result.match(sceneOf(placed, scene), {
    onFailure: () => CueRead.make({}),
    onSuccess: (p) =>
      Result.match(
        resolveTimeline(
          {
            ...p.spec.timeline,
            ...spans,
            ...patched(Option.fromNullishOr(p.spec.timeline), spans, cue, patch),
          },
          sceneClock(p),
        ),
        {
          onFailure: (e) => CueRead.make({ unresolved: e.message }),
          onSuccess: (cues) =>
            CueRead.make(
              Option.match(Option.fromUndefinedOr(cues.get(cue)), {
                onNone: () => ({}),
                onSome: (r) => ({ resolved: r }),
              }),
            ),
        },
      ),
  });

/**
 * What identifies a drawing: its `timeline` and `knobs` objects. Decoded with
 * `Schema.Unknown`, which passes each value through as the same object, so
 * the identity survives the decode.
 */
const Owner = Schema.Struct({
  timeline: Schema.optionalKey(Schema.Unknown),
  knobs: Schema.optionalKey(Schema.Unknown),
});
/** `scenes/index.ts`: the film's scenes, in order. */
const Registry = Schema.Struct({
  scenes: Schema.Array(Schema.Struct({ id: Schema.String, ...Owner.fields })),
});
const ModuleExports = Schema.Record(Schema.String, Schema.Unknown);

const decodeOwner = Schema.decodeUnknownOption(Owner);
const decodeExports = Schema.decodeUnknownOption(ModuleExports);

const FIELDS: ReadonlyArray<Field> = ['timeline', 'knobs'];

/** Whether the lab may write a field of a scene's drawing: only the literal the scene reads, alone. */
type FieldAccess = SceneSite['access'][Field];

const WRITABLE: FieldAccess = { _tag: 'Writable' };

/** An exported drawing call: the file, one name it is exported under, and where the call starts. */
interface Owned {
  readonly file: string;
  readonly exportName: string;
  readonly at: number;
}

/** The object a drawing (or a scene spread from one) reads as `field`, when it has one. */
const identity = (owner: typeof Owner.Type, field: Field): Option.Option<object> =>
  Option.liftPredicate(owner[field], Predicate.isObject);

/** Per field, the drawing calls that declare each object, keyed by the object itself. */
type Owners = Record<Field, Map<object, Array<Owned>>>;

/** Record under `owners` each drawing `file` exports: its calls, as `exports` evaluates them. */
const addOwners = (
  owners: Owners,
  file: string,
  sites: ReadonlyArray<DrawingSite>,
  exports: Option.Option<typeof ModuleExports.Type>,
): void => {
  for (const site of sites)
    for (const exportName of site.exports) {
      const drawing = Option.flatMap(exports, (m) =>
        Option.flatMap(Option.fromUndefinedOr(m[exportName]), decodeOwner),
      );
      for (const field of FIELDS)
        for (const obj of Option.toArray(Option.flatMap(drawing, (d) => identity(d, field)))) {
          const list = owners[field].get(obj) ?? [];
          list.push({ file, exportName, at: site.at });
          owners[field].set(obj, list);
        }
    }
};

/**
 * Every scene's drawing in `film`'s source, located in this process: the
 * parser lists every exported `drawing({...})` call in the film's folder, the
 * film's modules and its scene registry (`scenes/index.ts`) are imported, and
 * a scene belongs to the call whose exported `timeline` (or `knobs`) is the
 * very object the scene reads. A registry that renames a drawing, or two
 * files that export the same name, cannot point a scene at the wrong literal:
 * either the object is the same, or the scene is not located. The files are
 * parsed as they are now; the imports only prove which export is which
 * scene, so this runs only in a process that imports the film as it stands.
 */
export const locateHere = Effect.fn('film.read.sites.locate')(function* (film: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = yield* FilmFolder;
  const importModule = (file: string) =>
    Effect.tryPromise({
      try: () => importFilmModule(file),
      catch: (cause) =>
        FilmModuleInvalid.make({ film, module: path.basename(file), reason: String(cause) }),
    });
  const dir = folder.paths(film).dir;
  if (!(yield* fs.exists(dir)))
    return yield* FilmUnknown.make({ film, known: yield* folder.names });
  const files = (yield* fs.readDirectory(dir, { recursive: true }))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .map((f) => path.join(dir, f))
    .sort();
  // Every exported drawing({...}) call, by file, as the files read now.
  const parsed = yield* Effect.forEach(
    files,
    (file) =>
      Effect.map(fs.readFileString(file), (source) =>
        Result.match(parseModule(file, source), {
          onFailure: () => ({ file, sites: [] }),
          onSuccess: (program) => ({ file, sites: drawingSites(source, program) }),
        }),
      ),
    { concurrency: 8 },
  );
  const withSites = parsed.filter((p) => p.sites.length > 0);
  // The object each exported name evaluates to as `timeline` and as
  // `knobs`, as this process loaded it: one map per field.
  const owners = {
    timeline: new Map<object, Array<Owned>>(),
    knobs: new Map<object, Array<Owned>>(),
  } satisfies Owners;
  for (const { file, sites } of withSites)
    addOwners(owners, file, sites, decodeExports(yield* importModule(file)));
  const registry = yield* Schema.decodeUnknownEffect(Registry)(
    yield* importModule(path.join(dir, 'scenes', 'index.ts')),
  ).pipe(
    Effect.mapError((error) =>
      FilmModuleInvalid.make({ film, module: 'scenes/index.ts', reason: error.message }),
    ),
  );
  /** The scenes that read the same object as `field` as `scene` does, in registry order. */
  const readers = (field: Field, scene: (typeof registry.scenes)[number]) =>
    registry.scenes
      .filter((s) =>
        Option.exists(identity(scene, field), (obj) => Option.contains(identity(s, field), obj)),
      )
      .map((s) => s.id);
  const sites = new Map<string, SceneSite>();
  const unlocated: Array<SceneNotLocated> = [];
  for (const scene of registry.scenes) {
    const objects = FIELDS.flatMap((field) =>
      Option.toArray(Option.map(identity(scene, field), (obj) => ({ field, obj }))),
    );
    if (objects.length === 0) continue;
    // One drawing may be exported under several names: one call, one literal.
    const calls = Arr.dedupeWith(
      objects.flatMap(({ field, obj }) => owners[field].get(obj) ?? []),
      (a, b) => a.file === b.file && a.at === b.at,
    );
    const found = Option.filter(Arr.head(calls), () => calls.length === 1);
    if (Option.isSome(found)) {
      const { file, exportName, at } = found.value;
      const where = `${path.relative(dir, file)}#${exportName}`;
      const accessOf = (field: Field): FieldAccess =>
        Option.match(identity(scene, field), {
          onNone: () => WRITABLE,
          onSome: (obj): FieldAccess => {
            const own = (owners[field].get(obj) ?? []).some((o) => o.file === file && o.at === at);
            if (!own)
              return {
                _tag: 'Refused',
                error: SceneNotLocated.make({
                  film,
                  scene: scene.id,
                  reason: `the ${field} scene "${scene.id}" reads is not the one ${where} declares (the registry builds or overrides it), so no literal in source is what it plays`,
                }),
              };
            const shared = readers(field, scene);
            if (shared.length > 1)
              return {
                _tag: 'Refused',
                error: SourceShared.make({ film, field, file: where, scenes: shared }),
              };
            return WRITABLE;
          },
        });
      sites.set(scene.id, {
        scene: scene.id,
        file,
        shown: path.relative(dir, file),
        exportName,
        access: { timeline: accessOf('timeline'), knobs: accessOf('knobs') },
      });
      continue;
    }
    const names = calls.map((c) => `${path.relative(dir, c.file)}#${c.exportName}`);
    unlocated.push(
      SceneNotLocated.make({
        film,
        scene: scene.id,
        reason: Option.match(Arr.head(calls), {
          onNone: () =>
            'no exported drawing({...}) in the film folder declares the timeline or knobs it reads',
          onSome: () => `more than one drawing declares it: ${names.join(', ')}`,
        }),
      }),
    );
  }
  yield* Effect.logDebug(
    `scene-sources.locate film=${film} located=${sites.size} unlocated=${unlocated.length}`,
  );
  return { sites, unlocated } satisfies Located;
});

/**
 * SceneSources located in this process (`locateHere`): a CLI command's own,
 * in a process that imports the film as it stands. The lab's is
 * `SceneSources.layer`, which asks a fresh process.
 */
export const scenesLocatedHere = Layer.effect(
  SceneSources,
  Effect.gen(function* () {
    const context = yield* Effect.context<FileSystem.FileSystem | Path.Path | FilmFolder>();
    return yield* SceneSources.over((film) => Effect.provideContext(locateHere(film), context));
  }),
);

const voice = Command.make(
  'voice',
  { film },
  Effect.fn('film.read.voice')(function* (input) {
    const loaded = yield* (yield* FilmRepo).load(input.film);
    yield* printLine(VoiceRead.make({ reading: yield* readingOf(loaded) }));
  }, answering),
).pipe(
  Command.withDescription(
    "What the lab's studio reads of the film (its voice, each beat's line, the reading sheet), as one line of JSON",
  ),
);

const cue = Command.make(
  'cue',
  {
    film,
    scene: Argument.String('scene').pipe(Argument.withDescription('the scene, by id')),
    cue: Argument.String('cue').pipe(Argument.withDescription('the cue, by name')),
    spans: Flag.String('spans').pipe(
      Flag.withSchema(TimelineJson),
      Flag.optional,
      Flag.withDescription("spans (JSON) in place of the scene's own: a write not made yet"),
    ),
    patch: Flag.String('patch').pipe(
      Flag.withSchema(CuePatchJson),
      Flag.optional,
      Flag.withDescription(
        "the write (a CuePatch, JSON) applied to the cue's own span when --spans has none for it",
      ),
    ),
  },
  Effect.fn('film.read.cue')(function* (input) {
    const placed = yield* placeFilm(yield* (yield* FilmRepo).load(input.film));
    const spans = Option.getOrElse(input.spans, () => ({}));
    yield* printLine(cueOf(placed, input.scene, input.cue, spans, input.patch));
  }, answering),
).pipe(
  Command.withDescription(
    "A cue on its scene's clock as the scene file declares it (or with --spans in its place, and --patch over its own span), or why its timeline does not resolve, as one line of JSON",
  ),
);

const sites = Command.make(
  'sites',
  { film },
  Effect.fn('film.read.sites')(function* (input) {
    const located = yield* locateHere(input.film);
    yield* printLine(
      SitesRead.make({ sites: [...located.sites.values()], unlocated: located.unlocated }),
    );
  }, answering),
).pipe(
  Command.withDescription(
    "Where each scene's drawing is declared and what of it the lab may write, or why a scene is not located, as one line of JSON",
  ),
);

/** `film read`, run fresh by the lab. */
export const read = Command.make('read').pipe(
  Command.withDescription(
    'What the lab reads of a film, fresh from disk, as one line of JSON (the lab runs these)',
  ),
  Command.withSubcommands([voice, cue, sites]),
);
