// The lab with its studio, for a live drive of the recording panel without a
// paid call or a write to the real films: the film is copied into a temp
// folder under `out/` (git-ignored, removed when the harness stops), the lab
// and its studio run over that copy with the real media (ffmpeg) and mixer,
// and ElevenLabs is a fake whose speech-to-text hears each beat's own line,
// timed evenly across the take, or, for a beat it is told to mis-hear,
// something else. A fixture, not a product flag: `bun run lab` never runs it.
//
//   HARNESS_FILM=<film> bun test/fixtures/studio-harness.ts   (from apps/animations)
//
// The lab is at http://127.0.0.1:$HARNESS_PORT (4411) /lab?film=<film>. Its
// control sits beside the lab's routes: `POST /lab/harness/mishear/<beat>`
// (hear that beat as something else from now on), `POST
// /lab/harness/hear/<beat>` (hear it right again) and `GET /lab/harness/root`
// (the copy's films folder, to read what the studio wrote); `POST
// /lab/harness/stop` stops it, removing the copy.

import { BunHttpPlatform, BunRuntime, BunServices } from '@effect/platform-bun';
import {
  ApiKeyMissing,
  ContentStore,
  ElevenLabs,
  FilmRepo,
  FreshFilm,
  type LabHandler,
  Media,
  Mixer,
  NotesStore,
  SceneHead,
  SceneSources,
  SceneWriter,
  SourceWriter,
  Takes,
  beatsOf,
  labHandler,
} from '@bible/film/tools';
import { Config, Deferred, Effect, Exit, FileSystem, Layer, Option, Path } from 'effect';
import { serve } from '../../server.ts';

/** What the fake hears for a beat it is told to mis-hear. */
const MISHEARD = 'the quick brown fox jumps over the lazy dog';

const CONTROL = '/lab/harness/';

/** A beat's id from its take's file name (`<beat>.<hash>.flac`). */
const beatOf = (file: string) => file.slice(file.lastIndexOf('/') + 1).split('.')[0] ?? '';

/** `said`'s words spread evenly across `duration` seconds, as a transcript times them. */
const timed = (said: string, duration: number) => {
  const words = said.split(/\s+/).filter((w) => w.length > 0);
  const step = Math.max(duration - 0.2, 0.1) / Math.max(words.length, 1);
  return words.map((text, i) => ({
    text,
    start: 0.1 + i * step,
    end: 0.1 + i * step + step * 0.8,
    type: 'word',
  }));
};

/** ElevenLabs for the harness: speech-to-text only, hearing `film`'s lines unless told to mis-hear one. */
const harnessElevenLabs = (film: string, misheard: Set<string>) =>
  Layer.effect(
    ElevenLabs,
    Effect.gen(function* () {
      const repo = yield* FilmRepo;
      const media = yield* Media;
      const none = (op: string) =>
        Effect.die(`the studio harness makes no ElevenLabs call but speech-to-text (${op})`);
      return ElevenLabs.of({
        tts: () => none('tts'),
        dialogue: () => none('dialogue'),
        composeMusic: () => none('music'),
        soundEffect: () => none('sound effect'),
        ready: Effect.void,
        apiKey: Effect.fail(ApiKeyMissing.make({})),
        stt: (file) =>
          Effect.gen(function* () {
            const loaded = yield* Effect.orDie(repo.load(film));
            const beats = yield* Effect.orDie(Effect.fromResult(beatsOf(loaded)));
            const beat = beatOf(file);
            const line = Option.getOrElse(
              Option.map(Option.fromUndefinedOr(beats.find((b) => b.id === beat)), (b) => b.text),
              () => '',
            );
            const said = Option.getOrElse(
              Option.filter(Option.some(MISHEARD), () => misheard.has(beat)),
              () => line,
            );
            const duration = yield* Effect.orDie(media.duration(file));
            yield* Effect.log(`harness.stt beat=${beat} misheard=${misheard.has(beat)}`);
            return { text: said, words: timed(said, duration) };
          }),
      });
    }),
  );

/** Resolved by `POST /lab/harness/stop`: the harness then closes its server and its copy. */
const stopped = Deferred.makeUnsafe<void>();

/** The harness's control, in front of the lab: mis-hear a beat, hear it again, name the copy, or stop. */
const withControl =
  (misheard: Set<string>, root: string, lab: LabHandler): LabHandler =>
  (request, server) => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(CONTROL)) return lab(request, server);
    const [verb = '', beat = ''] = path.slice(CONTROL.length).split('/');
    if (verb === 'mishear') misheard.add(beat);
    if (verb === 'hear') misheard.delete(beat);
    const stop = Effect.when(Deferred.done(stopped, Exit.void), Effect.succeed(verb === 'stop'));
    return Effect.runPromise(
      stop.pipe(
        Effect.as(Response.json({ root, misheard: [...misheard], stopping: verb === 'stop' })),
      ),
    );
  };

/** The lab over a copy of the film, served until the harness is stopped. */
const Harness = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const film = yield* Config.String('HARNESS_FILM').pipe(
      Config.withDefault('righteousness-by-faith'),
    );
    const port = yield* Config.Int('HARNESS_PORT').pipe(Config.withDefault(4411));
    const app = path.join(import.meta.dir, '..', '..');
    const out = path.join(app, 'out', 'studio-harness');
    yield* fs.makeDirectory(out, { recursive: true });
    const root = yield* fs.makeTempDirectoryScoped({ directory: out, prefix: 'films-' });
    yield* fs.copy(path.join(app, 'src', 'films', film), path.join(root, film));
    const misheard = new Set<string>();

    const Platform = BunHttpPlatform.layer.pipe(Layer.provideMerge(BunServices.layer));
    const Store = ContentStore.layer.pipe(Layer.provide(Platform));
    const sounds = Option.some(path.join(app, 'sounds'));
    const Repo = FilmRepo.layer(root, sounds).pipe(Layer.provide([Store, Platform]));
    const Notes = NotesStore.layer.pipe(Layer.provide([Store, Platform]));
    const Source = Layer.mergeAll(SceneWriter.layer, SceneHead.layer).pipe(
      Layer.provideMerge(SourceWriter.layer),
      Layer.provideMerge(SceneSources.layer),
      Layer.provide([Repo, Store, Platform]),
    );
    const Check = FreshFilm.layer(['bun', path.join(app, 'cli.ts')]).pipe(Layer.provide(Platform));
    const Heard = harnessElevenLabs(film, misheard).pipe(
      Layer.provideMerge(Media.layer),
      Layer.provide([Repo, Platform]),
    );
    const Services = Layer.mergeAll(Takes.layer, Mixer.layer).pipe(
      Layer.provideMerge(Layer.mergeAll(Repo, Notes, Source, Check, Store, Heard, Platform)),
    );

    const Server = Layer.effectDiscard(
      Effect.gen(function* () {
        yield* (yield* FilmRepo).load(film);
        const lab = yield* labHandler(film);
        const server = yield* Effect.acquireRelease(
          Effect.sync(() => serve(port, true, withControl(misheard, root, lab), root)),
          (s) => Effect.promise(() => s.stop(true)),
        );
        yield* Effect.log(`harness.ready url=${server.url}lab?film=${film} root=${root}`);
      }),
    );
    return Server.pipe(Layer.provide(Services));
  }),
);

/** The harness until it is told to stop (or interrupted): the scope then removes the copy. */
const main = Layer.build(Harness).pipe(
  Effect.andThen(Deferred.await(stopped)),
  Effect.andThen(Effect.log('harness.stopped')),
  Effect.scoped,
);

BunRuntime.runMain(main.pipe(Effect.provide(BunServices.layer)));
