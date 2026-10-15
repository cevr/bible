// The film's composition root: the services every `film` command and the lab
// run with, the lab's pages, and the lab's start, built in one place. Its
// consumers are the CLI (`runFilmCli`, `cli.ts`) and the app's studio
// harness (`apps/animations/studio-harness.ts`), which drives this same lab
// over a copy of a film with a fake ElevenLabs. A consumer that built these
// layers itself would drift from the lab it means to be
// (`film-services.test.ts` names the two and sweeps for a third).

import { AskStore } from './ask-store.ts';
import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import {
  Config,
  ConfigProvider,
  Context,
  Duration,
  Effect,
  type FileSystem,
  Layer,
  Match,
  Option,
  type Path,
} from 'effect';
import { FetchHttpClient } from 'effect/http';
import {
  type Allowed,
  type BesideRoutes,
  type LabAt,
  boundUrl,
  labServer,
  serveLab,
} from './api-server.ts';
import { Browser } from './browser.ts';
import { RenderCatalogue } from './catalogue.ts';
import { Choices } from './choices.ts';
import { Composer } from './composer.ts';
import { ContentStore } from './content-store.ts';
import { Easel } from './easel.ts';
import type { ElevenLabs } from './elevenlabs.ts';
import { FilmRepo } from './film-repo.ts';
import { FootageLibrary } from './footage.ts';
import { FootageMedia } from './footage-media.ts';
import { FreshFilm } from './fresh-film.ts';
import { labHandler, labLink } from './lab.ts';
import { LabEvents } from './lab-events.ts';
import { type LabMcpNeeds, labMcp } from './lab-mcp.ts';
import { LabPage, type LabPageSpec, PageBundler } from './lab-page.ts';
import { SoundLibrary } from './library.ts';
import { Media } from './media.ts';
import { Mixer } from './mixer.ts';
import { Narrator } from './narrator.ts';
import { NotesStore } from './notes-store.ts';
import { ProductionStore } from './production-store.ts';
import { BoardStore } from './board-store.ts';
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
import { ScriptVoices } from './script-voice.ts';
import { SeriesDrafts } from './series-drafts.ts';
import { StagingCache } from './staging.ts';
import { Takes } from './takes.ts';

/** What the film's services are built over: the app's folders, and how it reads a film fresh. */
interface FilmServicesSpec {
  /** The films folder (`<film>/scenes`, `<film>/narration`, ...). */
  readonly films: string;
  /** The app's sound library folder (`library.ts`, its lock, `files/`, `public/`). */
  readonly sounds: string;
  /** The app's footage library folder (its lock, `transcripts/`, `files/`), shared by its talks. */
  readonly footage: string;
  /**
   * The app's folders for what a run makes (`FILMS_OUT`), the lab's notes
   * (`FILMS_LAB`) and the productions' ledgers (`FILMS_PRODUCTIONS`); the
   * environment's value wins when it names one.
   */
  readonly folders: { readonly out: string; readonly lab: string; readonly productions: string };
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
  /**
   * The private store the sound and footage libraries keep their originals
   * in: none given, the one the app's `sounds/library.ts` declares (built
   * here, `PrivateStore.layer`); a test gives a folder of its own, so it
   * never builds the live one.
   */
  readonly privateStore: Option.Option<
    Layer.Layer<PrivateStore, never, FileSystem.FileSystem | Path.Path>
  >;
  /**
   * The folder staging takes and the day's spend are kept in: none given,
   * the one every checkout shares (`StagingCache.fromConfig`,
   * `~/.cache/bible-film/staging`), so the daily cap holds across them; a
   * test gives a folder of its own.
   */
  readonly staging: Option.Option<string>;
  /**
   * The app's series folder (`<series>/scripts/<draft>.md`), whose drafts the
   * lab reads and marks beside its films (`SeriesDrafts`); none given, it
   * lists no series.
   */
  readonly series: Option.Option<string>;
}

/**
 * The services every `film` command and the lab run with: the films and their
 * notes, a film's source (read, written, stepped, its scenes located fresh
 * for the lab and in process for a command's stamps), the paid tools and the
 * media, the sound library, the footage library and their private store, the narrator, composer and
 * mixer, the renders' catalogue and the review over the roots, the choices,
 * the takes and the studio's readings, under the app's folders.
 */
export const filmServices = (spec: FilmServicesSpec) => {
  const Platform = BunServices.layer;
  // The app's folders under the environment's: FILMS_OUT, FILMS_LAB and FILMS_PRODUCTIONS, when set, win.
  const Folders = ConfigProvider.layerAdd(
    ConfigProvider.fromUnknown({
      FILMS_OUT: spec.folders.out,
      FILMS_LAB: spec.folders.lab,
      FILMS_PRODUCTIONS: spec.folders.productions,
    }),
  );
  const Store = ContentStore.layer.pipe(Layer.provide(Platform));
  const Repo = FilmRepo.layer(spec.films, Option.some(spec.sounds), Option.some(spec.footage)).pipe(
    Layer.provide([Store, Platform]),
  );
  const Tools = spec.elevenLabs.pipe(
    Layer.provideMerge(Media.layer),
    Layer.provide([Repo, Platform]),
  );
  // Staging takes by what was asked for, and the day's characters against the cap.
  const Staging = Option.match(spec.staging, {
    onNone: () => StagingCache.fromConfig,
    onSome: (dir) => StagingCache.layer(dir),
  }).pipe(Layer.provide([Store, Platform]));
  const Notes = NotesStore.layer.pipe(Layer.provide([Store, Platform]));
  // Each production's ledger, a small committed JSON file in the app's `productions/`.
  const Productions = ProductionStore.layer.pipe(Layer.provide([Store, Platform]));
  // Each film's storyboard: its record beside the film, its images in the film's board folder.
  const Board = BoardStore.layer.pipe(Layer.provide([Store, Repo, Platform]));
  // The agents' asks: a decision page each, kept under the lab's folder; a board try one shows is found on its board.
  const Asks = AskStore.layer.pipe(Layer.provide([Board, Store, Repo, Platform]));
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
  const Private = Option.match(spec.privateStore, {
    onNone: () => PrivateStore.layer(spec.sounds).pipe(Layer.provide(FetchHttpClient.layer)),
    onSome: (given) => given,
  }).pipe(Layer.provide(Platform));
  const Library = SoundLibrary.layer(spec.sounds).pipe(
    Layer.provide([Store, Tools, Private, Platform]),
  );
  // The footage library's originals sync with the same private store; its copies are made
  // over the media service's coders.
  const Footage = FootageLibrary.layer(spec.footage).pipe(
    Layer.provide(FootageMedia.layer.pipe(Layer.provide([Tools, Platform]))),
    Layer.provide([Store, Tools, Private, Platform]),
  );
  const Reviewed = Review.layerConfig(spec.roots).pipe(
    Layer.provideMerge(BunHttpPlatform.layer),
    // Its lengths, frames and phone copies are the Media service's; a say on a
    // set is written to its folder's catalogue.
    Layer.provide([Tools, Catalogue, Platform]),
  );
  // The series drafts the lab reads beside the films, a mark written into the draft's Markdown.
  const Drafts = SeriesDrafts.layer(spec.series).pipe(Layer.provide([Store, Platform]));
  // The Script reader's staging takes, over the studio's readings, the drafts and the narrator.
  return ScriptVoices.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(Choices.layer, StudioReadings.layer, Drafts)),
    // The review hears each option in the mix, and writes a pick through the source writer;
    // the lab's studio reads the film's script and voice fresh.
    Layer.provideMerge(
      Layer.mergeAll(Narrator.layer, Takes.layer, Composer.layer, Mixer.layer).pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            Repo,
            Notes,
            Productions,
            Board,
            Asks,
            Source,
            Library,
            Footage,
            Private,
            Store,
            Staging,
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

/** How often the lab's change feed reads the files it watches. */
const FEED_EVERY = Duration.seconds(2);

/**
 * The lab's routes with its MCP beside `beside`: links at `base` (and the
 * owner's phone, `FILM_LAB_PHONE_URL`), over a change feed kept while the
 * scope is open.
 */
const mcpRoutes = Effect.fn('film.lab.mcp')(function* (
  base: string,
  local: string,
  beside: BesideRoutes,
) {
  // The lab from the owner's phone (the tailnet's address), for an ask's links.
  const phone = yield* Config.option(Config.String('FILM_LAB_PHONE_URL'));
  const events = yield* Layer.build(LabEvents.layer({ base, every: FEED_EVERY }));
  const services = yield* Effect.context<LabMcpNeeds>();
  return Layer.merge(
    beside,
    labMcp({
      base,
      local,
      ...Option.match(phone, { onNone: () => ({}), onSome: (p) => ({ phone: p }) }),
    }).pipe(Layer.provide(Layer.succeedContext(Context.merge(services, events)))),
  );
});

/**
 * The lab served at `at` until the scope closes: its handler behind the gate
 * with `allowed` (a fixture's own routes, `beside`, behind it too), then the
 * easel's pages, which are the lab's own, served where it is bound. With
 * `mcp`, the lab is also an MCP server at `/mcp` for agents, over a change
 * feed the lab keeps while it runs (`lab-mcp.ts`). The address it is bound at.
 */
export const startLab = Effect.fn('film.lab.start')(function* (
  at: LabAt,
  allowed: Allowed,
  beside: BesideRoutes = Layer.empty,
  mcp: 'mcp' | 'no mcp' = 'no mcp',
) {
  const server = yield* Layer.build(labServer(at));
  const bound = yield* boundUrl.pipe(Effect.provideContext(server));
  const routes = yield* Match.value(mcp).pipe(
    Match.when('no mcp', () => Effect.succeed(beside)),
    Match.orElse(() => mcpRoutes(labLink(bound, allowed), bound, beside)),
  );
  const handler = yield* labHandler(allowed, routes);
  const url = yield* serveLab(handler).pipe(Effect.provideContext(server));
  yield* (yield* Easel).serve(url);
  return url;
});
