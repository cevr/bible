// Where each scene's `timeline` and `knobs` live in source: the file and the
// `drawing({...})` call the lab edits (the writes are SceneWriter's).
//
// Locating is by identity, not by name: a scene belongs to the exported
// `drawing({...})` call whose `timeline` (or `knobs`) is the very object the
// scene reads. Proving that imports the film's modules, so it runs in a
// process that imports them as they stand: `locateHere` (`read-cli.ts`) is
// that proof, run by `film read sites` and by the CLI's own commands
// (`scenesLocatedHere`). The lab runs for days and Bun keeps a module as it
// first imported it, so the lab's `SceneSources.layer` asks a fresh process
// (`FreshFilm.sites`), and keeps the answer only while the film's source
// stamp (`FilmFolder.stamp`) stands: a scene added, renamed or made to share
// a drawing while the lab runs is located as the files now say.
//
// Each field is then writable on its own terms: cues only when the scene's
// timeline is the drawing's own object, knobs only when its knobs are. A
// scene that spreads a drawing and overrides its timeline plays a timeline no
// file declares as a literal, so its cues are refused (its knobs may still be
// written); a literal two scenes read (both spread one drawing) is refused for
// both, since a write for one would move the other.

import {
  Array as Arr,
  Cache,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  type Result,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import {
  type FilmUnknown,
  SceneNotLocated,
  type SourceRefused,
  type SourceShared,
} from '../core/refusals.ts';
import type { FilmModuleInvalid } from './errors.ts';
import { FilmFolder, Stamped, filmNamed, keptWhenMade } from './film-repo.ts';
import { type FreshError, FreshFilm, type SceneSite } from './fresh-film.ts';
import { type Editable, editable, sceneCode } from './scene-source.ts';

export type { SceneSite } from './fresh-film.ts';

/** A drawing's field the lab writes: `timeline` for cues, `knobs` for knobs. */
export type Field = 'timeline' | 'knobs';

/** Every scene with a timeline or knobs: located, or why not. */
export interface Located {
  readonly sites: ReadonlyMap<string, SceneSite>;
  readonly unlocated: ReadonlyArray<SceneNotLocated>;
}

/** Why a film's scenes could not be located: the film, a module that does not load, a fresh run, a read. */
export type LocateError = FilmUnknown | FilmModuleInvalid | FreshError | PlatformError;

interface SceneSourcesService {
  /** Find every scene's drawing in the film's source. */
  readonly locate: (film: string) => Effect.Effect<Located, LocateError>;
  /** One scene's drawing, or why it has none the lab can edit. */
  readonly site: (
    film: string,
    scene: string,
  ) => Effect.Effect<SceneSite, LocateError | SceneNotLocated>;
  /** One scene's drawing where the lab may write `field`, or why it may not. */
  readonly writable: (
    film: string,
    scene: string,
    field: Field,
  ) => Effect.Effect<SceneSite, LocateError | SceneNotLocated | SourceShared>;
  /**
   * Which of the scene's cues and knobs are literals the lab can rewrite, read
   * from the file now; a field the lab may not write lists none, and `refused`
   * says why.
   */
  readonly editable: (
    film: string,
    scene: string,
  ) => Effect.Effect<
    Editable & {
      readonly refused: ReadonlyArray<{ readonly field: Field; readonly reason: string }>;
      readonly site: SceneSite;
    },
    LocateError | SceneNotLocated | SourceRefused
  >;
  /**
   * One scene's file as it stands now, and where in it each cue, knob and mark
   * is written and read (`sceneCode`); read-only, so a field the lab may not
   * write is listed all the same.
   */
  readonly code: (
    film: string,
    scene: string,
  ) => Effect.Effect<
    ReturnType<typeof sceneCode> extends Result.Result<infer R, unknown>
      ? R & { readonly text: string; readonly site: SceneSite }
      : never,
    LocateError | SceneNotLocated | SourceRefused
  >;
}

const FIELDS: ReadonlyArray<Field> = ['timeline', 'knobs'];

/** How many films' sites the lab keeps: one film, a few stamps of it. */
const SITES_KEPT = 8;

export class SceneSources extends Context.Service<SceneSources, SceneSourcesService>()(
  '@bible/film/tools/SceneSources',
) {
  /** The service over a way to locate a film's scenes: each scene's site, and what of it is writable. */
  static readonly over = Effect.fn('SceneSources.over')(function* (
    locate: SceneSourcesService['locate'],
  ) {
    const fs = yield* FileSystem.FileSystem;

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

    const writable = Effect.fn('SceneSources.writable')(function* (
      film: string,
      scene: string,
      field: Field,
    ) {
      const at = yield* site(film, scene);
      const access = at.access[field];
      if (access._tag === 'Refused') return yield* access.error;
      return at;
    });

    const readEditable = Effect.fn('SceneSources.editable')(function* (
      film: string,
      scene: string,
    ) {
      const at = yield* site(film, scene);
      const source = yield* fs.readFileString(at.file);
      const found = yield* Effect.fromResult(editable(at.shown, source, at.exportName));
      // Only the fields the lab may write: a refused one lists nothing, and says why.
      const refused = FIELDS.flatMap((field) => {
        const access = at.access[field];
        if (access._tag === 'Writable') return [];
        return [{ field, reason: access.error.message }];
      });
      const open = (field: Field) => at.access[field]._tag === 'Writable';
      return {
        cues: found.cues.filter(() => open('timeline')),
        knobs: found.knobs.filter(() => open('knobs')),
        refused,
        site: at,
      };
    });

    const readCode = Effect.fn('SceneSources.code')(function* (film: string, scene: string) {
      const at = yield* site(film, scene);
      const text = yield* fs.readFileString(at.file);
      const found = yield* Effect.fromResult(sceneCode(at.shown, text, at.exportName));
      return { ...found, text, site: at };
    });

    return SceneSources.of({ locate, site, writable, editable: readEditable, code: readCode });
  });

  /**
   * The lab's: each film's scenes located by a fresh process (`film read
   * sites`), kept under the film's source stamp, so a locate costs a fresh
   * process only after a file under the film changed. A failed read is not
   * kept.
   */
  static readonly layer = Layer.effect(
    SceneSources,
    Effect.gen(function* () {
      const fresh = yield* FreshFilm;
      const folder = yield* FilmFolder;
      const read = yield* Cache.makeWith((at: Stamped) => fresh.sites(at.film), {
        capacity: SITES_KEPT,
        timeToLive: keptWhenMade,
      });
      const locate = Effect.fn('SceneSources.locate')(function* (film: string) {
        const name = yield* filmNamed(film);
        const stamp = yield* folder.stamp(name);
        const found = yield* Cache.get(read, new Stamped({ film: name, stamp }));
        return {
          sites: new Map(found.sites.map((s) => [s.scene, s])),
          unlocated: found.unlocated,
        };
      });
      return yield* SceneSources.over((film) =>
        locate(film).pipe(Effect.provideService(FilmFolder, folder)),
      );
    }),
  );
}
