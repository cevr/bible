// The render catalogue on disk: `catalogue.json` in a film's project folder
// (`out/<film>`, git-ignored), beside the renders it names. The renderer's
// caller records each render there; the review and the options page list
// renders from it; approvals and comments are written to it, and approvals
// withdrawn from it. The domain (what a render is, when it is current, what
// an approval means, `said`: the one change a say makes) is
// `core/catalogue.ts`.
//
// The catalogue is a `ContentStore` manifest: each update reads the file,
// applies a pure change and writes it back whole, one writer at a time across
// processes (the review, a `film project` child per request, a terminal's
// `project render`), so every approval, comment and render record lands.

import { Context, Effect, Layer, Option, Path, Result, Schema } from 'effect';
import type { Scope } from '../core/address.ts';
import type { PlatformError } from 'effect/PlatformError';
import {
  type Catalogue,
  CatalogueJson,
  type Render,
  type Stamp,
  emptyCatalogue,
  recordRender,
} from '../core/catalogue.ts';
import { ContentStore, type Manifest } from './content-store.ts';
import { CatalogueInvalid } from '../core/refusals.ts';
import { FileInvalid, type StoreLocked } from './errors.ts';
import type { FilmPaths } from './film-repo.ts';
import { RenderJob, type RenderOutput } from './render-plan.ts';

/** The catalogue's file name in a project folder. */
export const CATALOGUE_FILE = 'catalogue.json';

/** A film's project folder: its name and where its renders go. */
type ProjectFolder = Pick<FilmPaths, 'name' | 'out'>;

/**
 * The catalogue's record of `output`, which `job` wrote drawing `scope`'s
 * sources as `stamp` says, at `at`: its files relative to the project folder.
 */
export const renderRecord = (
  project: ProjectFolder,
  job: RenderJob,
  scope: Pick<Scope, 'span'>,
  stamp: Stamp,
  output: RenderOutput,
  at: number,
  path: Path.Path,
): Render => {
  const rel = (file: string) => path.relative(project.out, file);
  return {
    address: job.address,
    variant: job.variant,
    kind: output.kind,
    settings: {
      scale: RenderJob.$match(job, {
        Video: (v) => v.scale,
        Stills: () => 1,
        Contact: () => 1,
        LookBook: () => 1,
      }),
      captions: job.captions,
    },
    stamp,
    span: scope.span,
    files: {
      clip: Option.map(output.clip, rel),
      share: Option.map(output.share, rel),
      captions: Option.map(output.captions, rel),
      chapters: Option.map(output.chapters, rel),
      images: output.images.map(rel),
    },
    sound: output.sound,
    at,
  };
};

export type CatalogueError = CatalogueInvalid | StoreLocked | PlatformError;

interface CatalogueService {
  /** The film's catalogue as it is on disk: empty before its first render. */
  readonly read: (project: ProjectFolder) => Effect.Effect<Catalogue, CatalogueError>;
  /** Apply `change` to the catalogue on disk and write it back; `change` also answers. */
  readonly update: <A>(
    project: ProjectFolder,
    change: (catalogue: Catalogue) => readonly [A, Catalogue],
  ) => Effect.Effect<A, CatalogueError>;
  /**
   * `update`, for a change that may refuse: a refusal fails before anything is
   * encoded or written, so the file stays as it was, byte for byte.
   */
  readonly attempt: <A, E>(
    project: ProjectFolder,
    change: (catalogue: Catalogue) => Result.Result<readonly [A, Catalogue], E>,
  ) => Effect.Effect<A, E | CatalogueError>;
  /** Record `render` in its slot, in place of the one before it. */
  readonly record: (project: ProjectFolder, render: Render) => Effect.Effect<void, CatalogueError>;
}

/** A catalogue that does not read (or write) as its schema says: the catalogue's own refusal. */
const invalid = (error: FileInvalid) =>
  CatalogueInvalid.make({ file: error.file, reason: error.reason });

export class RenderCatalogue extends Context.Service<RenderCatalogue, CatalogueService>()(
  '@bible/film/tools/RenderCatalogue',
) {
  static readonly layer = Layer.effect(
    RenderCatalogue,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const store = yield* ContentStore;

      const manifestOf = (project: ProjectFolder): Manifest<Catalogue> => ({
        file: path.join(project.out, CATALOGUE_FILE),
        codec: CatalogueJson,
        empty: emptyCatalogue(project.name),
      });

      const read = Effect.fn('RenderCatalogue.read')(function* (project: ProjectFolder) {
        return yield* store.read(manifestOf(project)).pipe(Effect.catchTag('FileInvalid', invalid));
      });

      const attempt = <A, E>(
        project: ProjectFolder,
        change: (catalogue: Catalogue) => Result.Result<readonly [A, Catalogue], E>,
      ): Effect.Effect<A, E | CatalogueError> =>
        store
          .transact(manifestOf(project), (catalogue) => Effect.fromResult(change(catalogue)))
          .pipe(
            // The store's own refusal by its schema: `change`'s refusals pass as they are.
            Effect.catchIf(Schema.is(FileInvalid), (error) => Effect.fail(invalid(error))),
            Effect.withSpan('RenderCatalogue.update'),
          );

      const update = <A>(
        project: ProjectFolder,
        change: (catalogue: Catalogue) => readonly [A, Catalogue],
      ) => attempt(project, (catalogue) => Result.succeed(change(catalogue)));

      const record = Effect.fn('RenderCatalogue.record')(function* (
        project: ProjectFolder,
        render: Render,
      ) {
        yield* update(project, (catalogue) => [render, recordRender(catalogue, render)] as const);
        yield* Effect.log(
          `catalogue.record film=${project.name} kind=${render.kind} variant=${render.variant} key=${render.stamp.key.slice(0, 12)}`,
        );
      });

      return RenderCatalogue.of({ read, update, attempt, record });
    }),
  );
}
