// Where each scene's `timeline` and `knobs` live in source: the file and the
// `drawing({...})` call the lab edits (the writes are SceneWriter's).
//
// Locating is by identity, not by name. The parser lists every exported
// `drawing({...})` call in the film's folder; the film's own scene registry
// (`scenes/index.ts`) is imported; and a scene belongs to the call whose
// exported object's `timeline` (or `knobs`) is the very object the scene
// reads. A registry that renames a drawing, or two files that export the same
// name, cannot point a scene at the wrong literal: either the object is the
// same, or the scene is not located. The files are parsed as they are now;
// the imports only prove which export is which scene, and export names do not
// change when the lab writes a value.

import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { FilmModuleInvalid, FilmNotFound, SceneNotLocated, type SourceRefused } from './errors.ts';
import { FilmRepo, importFilmModule } from './film-repo.ts';
import { type Editable, drawingSites, editable, parseModule } from './scene-source.ts';

/** Where a scene's drawing is declared: the file, and a name the file exports it under. */
export interface SceneSite {
  readonly scene: string;
  readonly file: string;
  readonly exportName: string;
}

/** Every scene with a timeline or knobs: located, or why not. */
export interface Located {
  readonly sites: ReadonlyMap<string, SceneSite>;
  readonly unlocated: ReadonlyArray<SceneNotLocated>;
}

/** An exported drawing call: the file, one name it is exported under, and where the call starts. */
interface Owned {
  readonly file: string;
  readonly exportName: string;
  readonly at: number;
}

export type LocateError = FilmNotFound | FilmModuleInvalid | PlatformError;

export interface SceneSourcesService {
  /** Find every scene's drawing in the film's source. */
  readonly locate: (film: string) => Effect.Effect<Located, LocateError>;
  /** One scene's drawing, or why it has none the lab can edit. */
  readonly site: (
    film: string,
    scene: string,
  ) => Effect.Effect<SceneSite, LocateError | SceneNotLocated>;
  /** Which of the scene's cues and knobs are literals the lab can rewrite, read from the file now. */
  readonly editable: (
    film: string,
    scene: string,
  ) => Effect.Effect<
    Editable & { readonly site: SceneSite },
    LocateError | SceneNotLocated | SourceRefused
  >;
}

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

/** The objects that identify a drawing (or a scene spread from one). */
const identities = (owner: typeof Owner.Type): ReadonlyArray<object> =>
  [owner.timeline, owner.knobs].filter(Predicate.isObject);

export class SceneSources extends Context.Service<SceneSources, SceneSourcesService>()(
  '@bible/film/tools/SceneSources',
) {
  static readonly layer = Layer.effect(
    SceneSources,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const repo = yield* FilmRepo;

      const importModule = (film: string, file: string) =>
        Effect.tryPromise({
          try: () => importFilmModule(file),
          catch: (cause) =>
            FilmModuleInvalid.make({ film, module: path.basename(file), reason: String(cause) }),
        });

      const locate = Effect.fn('SceneSources.locate')(function* (film: string) {
        const dir = repo.paths(film).dir;
        if (!(yield* fs.exists(dir))) return yield* FilmNotFound.make({ film, dir });
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
        // The object each exported name evaluates to, as this process loaded it.
        const owners = new Map<object, Array<Owned>>();
        for (const { file, sites } of withSites) {
          const exports = decodeExports(yield* importModule(film, file));
          for (const site of sites)
            for (const exportName of site.exports) {
              const drawing = Option.flatMap(exports, (m) =>
                Option.flatMap(Option.fromUndefinedOr(m[exportName]), decodeOwner),
              );
              for (const obj of Option.match(drawing, { onNone: () => [], onSome: identities })) {
                const list = owners.get(obj) ?? [];
                list.push({ file, exportName, at: site.at });
                owners.set(obj, list);
              }
            }
        }
        const registry = yield* Schema.decodeUnknownEffect(Registry)(
          yield* importModule(film, path.join(dir, 'scenes', 'index.ts')),
        ).pipe(
          Effect.mapError((error) =>
            FilmModuleInvalid.make({ film, module: 'scenes/index.ts', reason: error.message }),
          ),
        );
        const sites = new Map<string, SceneSite>();
        const unlocated: Array<SceneNotLocated> = [];
        for (const scene of registry.scenes) {
          const objects = identities(scene);
          if (objects.length === 0) continue;
          // One drawing may be exported under several names: one call, one literal.
          const calls = Arr.dedupeWith(
            objects.flatMap((o) => owners.get(o) ?? []),
            (a, b) => a.file === b.file && a.at === b.at,
          );
          const found = Option.filter(Arr.head(calls), () => calls.length === 1);
          if (Option.isSome(found)) {
            const { file, exportName } = found.value;
            sites.set(scene.id, { scene: scene.id, file, exportName });
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
        return { sites, unlocated };
      });

      const site = Effect.fn('SceneSources.site')(function* (film: string, scene: string) {
        const located = yield* locate(film);
        const found = Option.fromUndefinedOr(located.sites.get(scene));
        if (Option.isSome(found)) return found.value;
        const why = Arr.findFirst(located.unlocated, (u) => u.scene === scene);
        return yield* Option.match(why, {
          onSome: Effect.fail,
          onNone: () =>
            Effect.fail(
              SceneNotLocated.make({
                film,
                scene,
                reason: 'the film has no such scene with a timeline or knobs',
              }),
            ),
        });
      });

      const readEditable = Effect.fn('SceneSources.editable')(function* (
        film: string,
        scene: string,
      ) {
        const at = yield* site(film, scene);
        const source = yield* fs.readFileString(at.file);
        const found = yield* Effect.fromResult(editable(at.file, source, at.exportName));
        return { ...found, site: at };
      });

      return SceneSources.of({ locate, site, editable: readEditable });
    }),
  );
}
