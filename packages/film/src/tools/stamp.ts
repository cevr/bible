// What a render drew, as a key: each scene's sources as they stand on disk,
// so a render is known stale once its scene changes, and a scene that did
// not change is not rendered again.
//
// A scene's key hashes the files its frames are drawn from and the data its
// frames read:
//
// - its own module (`SceneSources` locates the drawing by identity) and
//   every module it imports, followed through relative and workspace
//   imports (a package from the registry is not followed);
// - the film's frame: `film.ts`, the scene registry and all they import
//   (the lights, the script, the kit, the engine) and the export page's
//   engine (`@bible/film/player`), with the registry's imports of the
//   other scenes' modules cut, so an edit to one scene leaves the others'
//   keys alone;
// - its beat as laid out: its declaration (`say`, `enter`, timeline,
//   knobs), its take's timing, its start and length;
// - for a scene that enters on a transition, the previous scene's own
//   modules, which that transition draws.
//
// Files are hashed by content and named relative to the films folder, so two
// checkouts of the same sources agree. Anything else a frame reads at run
// time (a font or image fetched by URL) is not in the key.

import { createRequire } from 'node:module';
import {
  Array as Arr,
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Record as Rec,
  Schema,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { parseSync } from 'oxc-parser';
import { type Scope, addressKey, sceneAddress } from '../core/address.ts';
import type { Stamp } from '../core/catalogue.ts';
import type { Placed } from '../core/layout.ts';
import { Short, Timed, type Timings, VoiceTiming } from '../core/schema.ts';
import { sha256Hex } from './digest.ts';
import type { FilmPaths } from './film-repo.ts';
import { collectWithin } from './process.ts';
import { type LocateError, SceneSources } from './scene-sources.ts';

/** The key of each of a film's scenes now, and the commit its checkout is at. */
export interface SceneKeys {
  readonly commit: Option.Option<string>;
  /** By scene id, every scene of the film. */
  readonly keys: ReadonlyMap<string, string>;
}

/** A film as its keys are read: where it lives, its layout and its takes' timings. */
export interface Keyed {
  readonly paths: Pick<FilmPaths, 'name' | 'dir'>;
  readonly timings: Timings;
}

export type StampError = LocateError | PlatformError | Schema.SchemaError;

const SOURCE = ['.ts', '.tsx', '.js', '.mjs'];
const GIT_LIMIT = Duration.seconds(10);

/** Files by their path relative to the films folder, each with its content's hash. */
const Files = Schema.Array(Schema.Tuple([Schema.String, Schema.String]));

/** What a scene's key is the hash of, as JSON. */
const SceneKeyInput = Schema.fromJsonString(
  Schema.Struct({
    files: Files,
    /** The previous scene's own modules, which a transition into this one draws. */
    entered: Files,
    beat: Timed,
    timing: Schema.OptionFromOptionalKey(VoiceTiming),
    voice: Schema.String,
    start: Schema.Finite,
    dur: Schema.Finite,
  }),
);

/** What an address's key is the hash of, as JSON. */
const AddressKeyInput = Schema.fromJsonString(
  Schema.Struct({
    address: Schema.String,
    short: Schema.OptionFromOptionalKey(Short),
    scenes: Schema.Array(Schema.String),
  }),
);

/** `spec` as the node resolver finds it from `from`, when it does. */
const resolveFrom = Option.liftThrowable((spec: string, from: string) =>
  createRequire(from).resolve(spec),
);

/** The modules `source` imports or re-exports from, as written. */
export const importsOf = (file: string, source: string): ReadonlyArray<string> => {
  const { module } = parseSync(file, source, { lang: 'ts', sourceType: 'module' });
  return Arr.dedupe([
    ...module.staticImports.map((i) => i.moduleRequest.value),
    ...module.staticExports
      .flatMap((e) =>
        e.entries.flatMap((entry) => Option.toArray(Option.fromNullishOr(entry.moduleRequest))),
      )
      .map((request) => request.value),
  ]);
};

/**
 * `stamp` for the part of the film `scope` covers: one key over its scenes'
 * keys (and its short, which cuts them), at the commit the keys were read at.
 */
export const stampOf = (
  keys: SceneKeys,
  scope: Pick<Scope, 'address' | 'short' | 'scenes'>,
): Stamp => ({
  commit: keys.commit,
  key: sha256Hex(
    Schema.encodeSync(AddressKeyInput)({
      address: addressKey(scope.address),
      short: scope.short,
      scenes: scope.scenes.flatMap((p) =>
        Option.toArray(Option.fromUndefinedOr(keys.keys.get(p.spec.id))),
      ),
    }),
  ),
});

/** Each scene's own stamp (its address `--scene <id>`), in film order: what the project lists. */
export const sceneStamps = (
  keys: SceneKeys,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<{ readonly scene: string; readonly stamp: Stamp }> =>
  placed.map((p) => ({
    scene: p.spec.id,
    stamp: stampOf(keys, { address: sceneAddress(p.spec.id), short: Option.none(), scenes: [p] }),
  }));

export interface StampsService {
  /** Every scene's key, its sources read as they stand now. */
  readonly scenes: (
    film: Keyed,
    placed: ReadonlyArray<Placed>,
  ) => Effect.Effect<SceneKeys, StampError>;
}

export class Stamps extends Context.Service<Stamps, StampsService>()('@bible/film/tools/Stamps') {
  static readonly layer = Layer.effect(
    Stamps,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const sources = yield* SceneSources;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const isFile = (file: string) =>
        fs.stat(file).pipe(
          Effect.map((info) => info.type === 'File'),
          Effect.orElseSucceed(() => false),
        );

      /** A relative import as the file it names: as written, or with a source extension or an index. */
      const relative = Effect.fn('Stamps.relative')(function* (spec: string, from: string) {
        const at = path.resolve(path.dirname(from), spec);
        const candidates = [at, ...SOURCE.map((ext) => `${at}${ext}`), path.join(at, 'index.ts')];
        return yield* Effect.findFirst(candidates, isFile);
      });

      /** A package import as its file, when it is a workspace's (not under node_modules). */
      const workspace = (spec: string, from: string) =>
        Option.match(resolveFrom(spec, from), {
          onNone: () => Effect.succeedNone,
          onSome: (file) =>
            fs.realPath(file).pipe(
              Effect.map((real) =>
                Option.liftPredicate(real, (r) => !r.split(path.sep).includes('node_modules')),
              ),
              Effect.orElseSucceed(() => Option.none<string>()),
            ),
        });

      const resolve = (spec: string, from: string) => {
        if (spec.startsWith('.') || spec.startsWith('/')) return relative(spec, from);
        return workspace(spec, from);
      };

      /**
       * Every file reached from `roots` through their imports, each hashed,
       * except where `cut(from, to)` says an import is not followed. `hashes`
       * keeps a file's hash across calls.
       */
      const closure = Effect.fn('Stamps.closure')(function* (
        roots: ReadonlyArray<string>,
        cut: (from: string, to: string) => boolean,
        hashes: Map<string, string>,
      ) {
        const seen = new Set<string>();
        let queue = [...roots];
        while (queue.length > 0) {
          const next: Array<string> = [];
          for (const file of queue) {
            if (seen.has(file) || !(yield* isFile(file))) continue;
            seen.add(file);
            const source = yield* fs.readFileString(file);
            if (!hashes.has(file)) hashes.set(file, sha256Hex(source));
            if (!SOURCE.includes(path.extname(file))) continue;
            for (const spec of importsOf(file, source)) {
              const to = yield* resolve(spec, file);
              if (Option.isSome(to) && !cut(file, to.value)) next.push(to.value);
            }
          }
          queue = next;
        }
        return [...seen];
      });

      const commitAt = (dir: string) =>
        collectWithin(
          spawner,
          'git rev-parse',
          ChildProcess.make('git', ['rev-parse', 'HEAD'], { cwd: dir }),
          GIT_LIMIT,
        ).pipe(
          Effect.map((done) =>
            Option.liftPredicate(done.stdout.trim(), (sha) => done.exitCode === 0 && sha !== ''),
          ),
          Effect.orElseSucceed(() => Option.none<string>()),
        );

      const scenes = Effect.fn('Stamps.scenes')(function* (
        film: Keyed,
        placed: ReadonlyArray<Placed>,
      ) {
        const dir = film.paths.dir;
        const films = path.dirname(dir);
        const hashes = new Map<string, string>();
        const located = yield* sources.locate(film.paths.name);
        const sceneFiles = new Set([...located.sites.values()].map((s) => s.file));
        const registry = path.join(dir, 'scenes', 'index.ts');
        const player = yield* workspace('@bible/film/player', path.join(dir, 'film.ts'));
        const frame = yield* closure(
          [path.join(dir, 'film.ts'), registry, ...Option.toArray(player)],
          (from, to) => from === registry && sceneFiles.has(to),
          hashes,
        );
        /** A scene's own modules: its drawing's file and all it imports. */
        const own = (id: string) =>
          Option.match(Option.fromUndefinedOr(located.sites.get(id)), {
            onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
            onSome: (site) => closure([site.file], () => false, hashes),
          });
        const digest = (files: ReadonlyArray<string>) =>
          Arr.dedupe(files)
            .flatMap((file) =>
              Option.toArray(
                Option.map(
                  Option.fromUndefinedOr(hashes.get(file)),
                  (hash) => [path.relative(films, file), hash] as const,
                ),
              ),
            )
            .toSorted(([a], [b]) => a.localeCompare(b));
        const keys = new Map<string, string>();
        for (const p of placed) {
          const mine = yield* own(p.spec.id);
          const before = Option.fromUndefinedOr(placed[p.index - 1]);
          const entered = Option.filter(before, () =>
            Option.exists(Option.fromUndefinedOr(p.spec.enter), (enter) => enter.kind !== 'cut'),
          );
          const drawn = yield* Option.match(entered, {
            onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
            onSome: (prev) => own(prev.spec.id),
          });
          keys.set(
            p.spec.id,
            sha256Hex(
              yield* Schema.encodeEffect(SceneKeyInput)({
                files: digest([...frame, ...mine]),
                entered: digest(drawn),
                beat: p.spec,
                timing: Rec.get(film.timings.scenes, p.spec.id),
                voice: film.timings.voice,
                start: p.start,
                dur: p.dur,
              }),
            ),
          );
        }
        return { commit: yield* commitAt(dir), keys } satisfies SceneKeys;
      });

      return Stamps.of({ scenes });
    }),
  );
}
