// The render catalogue on disk: `catalogue.json` in a film's project folder
// (`out/<film>`, git-ignored), beside the renders it names. The renderer's
// caller records each render there; the review and the options page list
// renders from it; approvals and comments are written to it. The domain (what
// a render is, when it is current, what an approval means) is
// `core/catalogue.ts`.
//
// Each update reads the file, applies a pure change and writes it back whole
// (to a temporary name, then renamed over), one update at a time in this
// process. Two processes updating one film's catalogue at the same instant
// can still lose the earlier write.

import { Context, Effect, FileSystem, Layer, Option, Path, Schema, Semaphore } from 'effect';
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
import { CatalogueInvalid } from './errors.ts';
import type { FilmPaths } from './film-repo.ts';
import { RenderJob, type RenderOutput } from './render-plan.ts';

/** The catalogue's file name in a project folder. */
export const CATALOGUE_FILE = 'catalogue.json';

/** A film's project folder: its name and where its renders go. */
export type ProjectFolder = Pick<FilmPaths, 'name' | 'out'>;

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
    at,
  };
};

export type CatalogueError = CatalogueInvalid | PlatformError;

export interface CatalogueService {
  /** The film's catalogue as it is on disk: empty before its first render. */
  readonly read: (project: ProjectFolder) => Effect.Effect<Catalogue, CatalogueError>;
  /** Apply `change` to the catalogue on disk and write it back; `change` also answers. */
  readonly update: <A>(
    project: ProjectFolder,
    change: (catalogue: Catalogue) => readonly [A, Catalogue],
  ) => Effect.Effect<A, CatalogueError>;
  /** Record `render` in its slot, in place of the one before it. */
  readonly record: (project: ProjectFolder, render: Render) => Effect.Effect<void, CatalogueError>;
}

const decode = Schema.decodeEffect(CatalogueJson);
const encode = Schema.encodeEffect(CatalogueJson);

export class RenderCatalogue extends Context.Service<RenderCatalogue, CatalogueService>()(
  '@bible/film/tools/RenderCatalogue',
) {
  static readonly layer = Layer.effect(
    RenderCatalogue,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const one = yield* Semaphore.make(1);

      const fileOf = (project: ProjectFolder) => path.join(project.out, CATALOGUE_FILE);

      const read = Effect.fn('RenderCatalogue.read')(function* (project: ProjectFolder) {
        const file = fileOf(project);
        if (!(yield* fs.exists(file))) return emptyCatalogue(project.name);
        return yield* decode(yield* fs.readFileString(file)).pipe(
          Effect.mapError((error) => CatalogueInvalid.make({ file, reason: error.message })),
        );
      });

      const write = Effect.fn('RenderCatalogue.write')(function* (
        project: ProjectFolder,
        catalogue: Catalogue,
      ) {
        const file = fileOf(project);
        const text = yield* encode(catalogue).pipe(
          Effect.mapError((error) => CatalogueInvalid.make({ file, reason: error.message })),
        );
        yield* fs.makeDirectory(project.out, { recursive: true });
        const partial = `${file}.partial`;
        yield* fs.writeFileString(partial, `${text}\n`);
        yield* fs.rename(partial, file);
      });

      const update = <A>(
        project: ProjectFolder,
        change: (catalogue: Catalogue) => readonly [A, Catalogue],
      ) =>
        Semaphore.withPermits(
          one,
          1,
        )(
          Effect.gen(function* () {
            const [answer, next] = change(yield* read(project));
            yield* write(project, next);
            return answer;
          }),
        ).pipe(Effect.withSpan('RenderCatalogue.update'));

      const record = Effect.fn('RenderCatalogue.record')(function* (
        project: ProjectFolder,
        render: Render,
      ) {
        yield* update(project, (catalogue) => [render, recordRender(catalogue, render)] as const);
        yield* Effect.log(
          `catalogue.record film=${project.name} kind=${render.kind} variant=${render.variant} key=${render.stamp.key.slice(0, 12)}`,
        );
      });

      return RenderCatalogue.of({ read, update, record });
    }),
  );
}
