// The lab with its studio, for a live drive of the recording panel without a
// paid call or a write to the real films: the film is copied into a temp
// folder under `out/` (git-ignored, removed when the harness stops), the lab
// and its studio run over that copy with the real media (in-process) and mixer,
// and ElevenLabs is a fake whose speech-to-text hears each beat's own line,
// timed evenly across the take, or, for a beat it is told to mis-hear,
// something else. A fixture, not a product flag: `bun run lab` never runs it.
//
//   HARNESS_FILM=<film> bun studio-harness.ts   (from apps/animations)
//
// The lab is at http://127.0.0.1:$HARNESS_PORT (4411) /films/<film>/lab. Its
// control sits beside the lab's routes, behind the lab's gate (a write is
// JSON from the lab's own origin, or a tool's: `curl -H 'content-type:
// application/json' -d '{}'`): `POST /harness/mishear/<beat>` (hear that beat
// as something else from now on), `POST /harness/hear/<beat>` (hear it right
// again) and `GET /harness/root` (the copy's films folder, to read what the
// studio wrote); `POST /harness/stop` stops it, removing the copy.

import { BunRuntime, BunServices } from '@effect/platform-bun';
import {
  ApiKeyMissing,
  ElevenLabs,
  FilmRepo,
  Media,
  beatsOf,
  filmServices,
  labPages,
  pageHref,
  startLab,
} from '@bible/film/tools';
import { Config, Deferred, Effect, Exit, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { FOLDERS, SOUNDS } from './cli.ts';
import { FILMS, LAB_PAGES, LAB_SERVERS } from './server.ts';

/** What the fake hears for a beat it is told to mis-hear. */
const MISHEARD = 'the quick brown fox jumps over the lazy dog';

/** Where the control's routes sit: outside the lab's API and its pages. */
const CONTROL = '/harness/';

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

/** Resolved by `POST /harness/stop`: the harness then closes its server and its copy. */
const stopped = Deferred.makeUnsafe<void>();

/**
 * The harness's control, a route beside the lab's behind its gate: mis-hear a
 * beat, hear it again, name the copy, or stop.
 */
const control = (misheard: Set<string>, root: string) =>
  HttpRouter.add(
    '*',
    `${CONTROL}*`,
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const path = request.url.split('?')[0] ?? '';
      const [verb = '', beat = ''] = path.slice(CONTROL.length).split('/');
      if (verb === 'mishear') misheard.add(beat);
      if (verb === 'hear') misheard.delete(beat);
      yield* Effect.when(Deferred.done(stopped, Exit.void), Effect.succeed(verb === 'stop'));
      return HttpServerResponse.jsonUnsafe({
        root,
        misheard: [...misheard],
        stopping: verb === 'stop',
      });
    }),
  );

/** The lab over a copy of the film, served until the harness is stopped. */
const Harness = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const film = yield* Config.String('HARNESS_FILM').pipe(
      Config.withDefault('righteousness-by-faith'),
    );
    const port = yield* Config.Int('HARNESS_PORT').pipe(Config.withDefault(4411));
    const out = path.join(import.meta.dir, 'out', 'studio-harness');
    yield* fs.makeDirectory(out, { recursive: true });
    const root = yield* fs.makeTempDirectoryScoped({ directory: out, prefix: 'films-' });
    yield* fs.copy(path.join(FILMS, film), path.join(root, film));
    const misheard = new Set<string>();

    // The film CLI over the copy, for the lab's fresh check, reading and mix: they never touch
    // the real films.
    const cli = path.join(root, 'cli.ts');
    const [appAt, rootAt, soundsAt] = yield* Effect.forEach(
      [path.join(import.meta.dir, 'cli.ts'), root, SOUNDS],
      (at) => Schema.encodeEffect(Schema.fromJsonString(Schema.String))(at),
    );
    yield* fs.writeFileString(
      cli,
      `import { appCli } from ${appAt};\nappCli(${rootAt}, ${soundsAt}, import.meta.path);\n`,
    );
    // The lab's own services and pages (`filmServices`, `labPages`, as `film lab` runs them)
    // over the copy, read fresh through the CLI over the copy, reviewing no render roots, with
    // an ElevenLabs that only hears.
    const Services = labPages({ pages: LAB_PAGES, servers: LAB_SERVERS, films: root }).pipe(
      Layer.provideMerge(
        filmServices({
          films: root,
          sounds: SOUNDS,
          folders: FOLDERS,
          self: ['bun', cli],
          roots: Effect.succeed([]),
          elevenLabs: harnessElevenLabs(film, misheard),
        }),
      ),
    );

    const Server = Layer.effectDiscard(
      Effect.gen(function* () {
        yield* (yield* FilmRepo).load(film);
        const at = { hostname: '127.0.0.1', port };
        const url = yield* startLab(at, { hosts: [] }, control(misheard, root));
        yield* Effect.log(`harness.ready url=${new URL(pageHref.lab(film), url)} root=${root}`);
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
