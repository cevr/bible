// The film's composition root: the services every `film` command and the lab
// run with, the lab's pages, and the lab's start, built in one place. Its
// consumers are the CLI (`runFilmCli`, `cli.ts`) and the app's studio
// harness (`apps/animations/studio-harness.ts`), which drives this same lab
// over a copy of a film with a fake ElevenLabs. A consumer that built these
// layers itself would drift from the lab it means to be
// (`film-services.test.ts` names the two and sweeps for a third).

import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, type FileSystem, Layer, Option, type Path } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { type Allowed, type BesideRoutes, type LabAt, labServer, serveLab } from './api-server.ts';
import { Browser } from './browser.ts';
import { RenderCatalogue } from './catalogue.ts';
import { Choices } from './choices.ts';
import { Composer } from './composer.ts';
import { ContentStore } from './content-store.ts';
import { Easel } from './easel.ts';
import type { ElevenLabs } from './elevenlabs.ts';
import { FilmRepo } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { labHandler } from './lab.ts';
import { LabPage, type LabPageSpec, PageBundler } from './lab-page.ts';
import { SoundLibrary } from './library.ts';
import { Media } from './media.ts';
import { Mixer } from './mixer.ts';
import { Narrator } from './narrator.ts';
import { NotesStore } from './notes-store.ts';
import { PageRenderer } from './page-render.ts';
import { PrivateStore } from './private-store.ts';
import { scenesLocatedHere } from './read-cli.ts';
import { Review, type ReviewRoot } from './review.ts';
import { SceneHead } from './scene-head.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter } from './scene-writer.ts';
import { SourceWriter } from './source-writer.ts';
import { Stamps } from './stamp.ts';
import { StudioReadings } from './studio.ts';
import { Takes } from './takes.ts';

/** What the film's services are built over: the app's folders, and how it reads a film fresh. */
interface FilmServicesSpec {
  /** The films folder (`<film>/scenes`, `<film>/narration`, ...). */
  readonly films: string;
  /** The app's sound library folder (`library.ts`, its lock, `files/`, `public/`). */
  readonly sounds: string;
  /**
   * The app's folders for what a run makes (`FILMS_OUT`) and the lab's notes
   * (`FILMS_LAB`); the environment's value wins when it names one.
   */
  readonly folders: { readonly out: string; readonly lab: string };
  /** The command that runs the app's CLI: the lab reads, checks and mixes a film through it, fresh (`FreshFilm`). */
  readonly self: ReadonlyArray<string>;
  /** The roots of the renders the lab reviews when `FILM_REVIEW_ROOTS` names none. */
  readonly roots: Effect.Effect<
    ReadonlyArray<ReviewRoot>,
    never,
    FileSystem.FileSystem | Path.Path
  >;
  /**
   * ElevenLabs: the real one (`ElevenLabs.layer`), or a fixture's fake, which
   * may read the film and its media (the studio harness hears each take as
   * its line).
   */
  readonly elevenLabs: Layer.Layer<ElevenLabs, never, FilmRepo | Media | BunServices.BunServices>;
}

/**
 * The services every `film` command and the lab run with: the films and their
 * notes, a film's source (read, written, stepped, its scenes located fresh
 * for the lab and in process for a command's stamps), the paid tools and the
 * media, the sound library and its private store, the narrator, composer and
 * mixer, the renders' catalogue and the review over the roots, the choices,
 * the takes and the studio's readings, under the app's folders.
 */
export const filmServices = (spec: FilmServicesSpec) => {
  const Platform = BunServices.layer;
  // The app's folders under the environment's: FILMS_OUT and FILMS_LAB, when set, win.
  const Folders = ConfigProvider.layerAdd(
    ConfigProvider.fromUnknown({ FILMS_OUT: spec.folders.out, FILMS_LAB: spec.folders.lab }),
  );
  const Store = ContentStore.layer.pipe(Layer.provide(Platform));
  const Repo = FilmRepo.layer(spec.films, Option.some(spec.sounds)).pipe(
    Layer.provide([Store, Platform]),
  );
  const Tools = spec.elevenLabs.pipe(
    Layer.provideMerge(Media.layer),
    Layer.provide([Repo, Platform]),
  );
  const Notes = NotesStore.layer.pipe(Layer.provide([Store, Platform]));
  // The lab checks each write, and the review reads a film's options, keeps its takes and
  // makes its mixes, through the app's CLI in a fresh process.
  const Fresh = FreshFilm.layer(spec.self).pipe(Layer.provide(Platform));
  // The lab locates a scene's drawing fresh (`film read sites`); a command's
  // stamps locate it in the command's own process, which imports the film as it stands.
  const Source = Layer.mergeAll(
    Layer.mergeAll(SceneWriter.layer, SceneHead.layer).pipe(Layer.provideMerge(SceneSources.layer)),
    Stamps.layer.pipe(Layer.provide(scenesLocatedHere)),
  ).pipe(Layer.provideMerge(SourceWriter.layer), Layer.provide([Repo, Store, Fresh, Platform]));
  // Each film's project folder: its renders, and the owner's approvals and comments on them.
  const Catalogue = RenderCatalogue.layer.pipe(Layer.provide([Store, Platform]));
  const Private = PrivateStore.layer(spec.sounds).pipe(
    Layer.provide([FetchHttpClient.layer, Platform]),
  );
  const Library = SoundLibrary.layer(spec.sounds).pipe(
    Layer.provide([Store, Tools, Private, Platform]),
  );
  const Reviewed = Review.layerConfig(spec.roots).pipe(
    Layer.provideMerge(BunHttpPlatform.layer),
    // Its lengths, frames and phone copies are the Media service's; a say on a
    // set is written to its folder's catalogue.
    Layer.provide([Tools, Catalogue, Platform]),
  );
  return Layer.mergeAll(Choices.layer, StudioReadings.layer).pipe(
    // The review hears each option in the mix, and writes a pick through the source writer;
    // the lab's studio reads the film's script and voice fresh.
    Layer.provideMerge(
      Layer.mergeAll(Narrator.layer, Takes.layer, Composer.layer, Mixer.layer).pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            Repo,
            Notes,
            Source,
            Library,
            Private,
            Store,
            Tools,
            Reviewed,
            Catalogue,
            Fresh,
            Platform,
          ),
        ),
      ),
    ),
    Layer.provideMerge(Folders),
  );
};

/**
 * The lab's pages, built from the app's entries and watched while the lab
 * runs (`LabPage`), and the easel's warm pages over them, in this process's
 * Chrome (`Easel`; Chrome starts only for a look).
 */
export const labPages = (spec: LabPageSpec) =>
  Easel.layer.pipe(
    Layer.provideMerge(LabPage.layer(spec)),
    Layer.provide(Layer.mergeAll(PageBundler.layer, PageRenderer.layer, Browser.layer)),
  );

/**
 * The lab served at `at` until the scope closes: its handler behind the gate
 * with `allowed` (a fixture's own routes, `beside`, behind it too), then the
 * easel's pages, which are the lab's own, served where it is bound. The
 * address it is bound at.
 */
export const startLab = Effect.fn('film.lab.start')(function* (
  at: LabAt,
  allowed: Allowed,
  beside: BesideRoutes = Layer.empty,
) {
  const handler = yield* labHandler(allowed, beside);
  const server = yield* Layer.build(labServer(at));
  const url = yield* serveLab(handler).pipe(Effect.provideContext(server));
  yield* (yield* Easel).serve(url);
  return url;
});
