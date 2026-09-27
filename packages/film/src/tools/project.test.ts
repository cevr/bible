// FilmProject over a real folder, with Rive and media faked: what a first sync
// creates, what a later one leaves alone, and what a render refuses. The fake
// Rive reads each `<Artboard name="…">` in `scenes/*.rml` as a nestable
// artboard, and the project's font from `assets.rml`.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, Exit, FileSystem, Layer, Option } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { silence } from '../core/audio.ts';
import { layout } from '../core/layout.ts';
import { MIX_RATE } from '../core/mix.ts';
import { hashText, voiceKey } from '../core/narration.ts';
import type { RiveDocument, SceneBoard } from '../core/rive.ts';
import type { Timed, Timings } from '../core/schema.ts';
import { filmEnd } from '../core/sound.ts';
import type { LoadedFilm } from './film-repo.ts';
import { masterFile } from './master.ts';
import { Media } from './media.ts';
import { collect } from './process.ts';
import { FilmProject, projectPaths } from './project.ts';
import { Rive } from './rive.ts';
import { testFilm, testVoice } from './testing.ts';

const scenes: ReadonlyArray<Timed & { readonly picture: string }> = [
  { id: 'open', say: 'Once upon a time.', picture: 'IDEA: a door' },
  { id: 'close', min: 3, picture: 'STORY: the end' },
];
const noTakes: Timings = { voice: '', scenes: {} };
const recorded: Timings = {
  voice: voiceKey(testVoice),
  scenes: {
    open: { hash: hashText('Once upon a time.'), file: 'open.mp3', duration: 2, words: [] },
  },
};

/** The test film, living in `dir`. */
const filmIn = (dir: string, timings: Timings = noTakes): LoadedFilm => {
  const film = testFilm(scenes, timings);
  return {
    ...film,
    paths: { ...film.paths, dir, narration: `${dir}/narration`, rive: `${dir}/rive` },
  };
};

interface RiveCalls {
  builds: number;
  pulls: number;
  pushes: number;
}

const board = (name: string): SceneBoard => ({
  name,
  id: `${name}:1`,
  width: 1920,
  height: 1080,
  x: 0,
  y: 0,
  main: Option.some({ id: `${name}:2`, fps: 60, frames: 240, seconds: 4 }),
  events: [],
  unkeyed: [],
  runs: [],
  storyboard: true,
  component: true,
});

const fakeRive = (calls: RiveCalls) =>
  Layer.effect(
    Rive,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const inspect = (dir: string) =>
        Effect.gen(function* () {
          const scenesDir = `${dir}/scenes`;
          const files = yield* fs.readDirectory(scenesDir).pipe(Effect.orElseSucceed(() => []));
          const sources = yield* Effect.forEach(
            files.filter((f) => f.endsWith('.rml')),
            (f) => fs.readFileString(`${scenesDir}/${f}`),
          );
          const names = sources.flatMap((source) =>
            [...source.matchAll(/<Artboard\b[^>]*\sname="([^"]+)"/g)].map((m) => m[1] ?? ''),
          );
          const hasFont = yield* fs.exists(`${dir}/assets.rml`);
          const doc: RiveDocument = {
            boards: new Map(names.map((n): readonly [string, SceneBoard] => [n, board(n)])),
            fonts: Arr.filter([{ id: '881888:30', name: 'Inter' }], () => hasFont),
            problems: [],
          };
          return doc;
        }).pipe(Effect.orDie);
      return Rive.of({
        version: Effect.succeed('1.2.0'),
        whoami: Effect.succeed(Option.none()),
        inspect,
        build: (dir) =>
          Effect.sync(() => {
            calls.builds += 1;
            return { riv: `${dir}/build/test.riv`, bytes: 1, warnings: [] };
          }),
        pull: () => Effect.sync(() => void (calls.pulls += 1)).pipe(Effect.as('')),
        push: () => Effect.sync(() => void (calls.pushes += 1)).pipe(Effect.as('')),
      });
    }),
  );

/** Media whose master measures `length` seconds; WAVs written are listed in `wrote`. */
const fakeMedia = (length: number, wrote: Array<string>) =>
  Layer.succeed(
    Media,
    Media.of({
      duration: () => Effect.succeed(length),
      decode: () => Effect.succeed(silence(MIX_RATE, MIX_RATE, 2)),
      writeWav: (file) => Effect.sync(() => void wrote.push(file)),
      join: () => Effect.void,
    }),
  );

const setup = (length = 0) => {
  const calls: RiveCalls = { builds: 0, pulls: 0, pushes: 0 };
  const wrote: Array<string> = [];
  const layer = FilmProject.layer.pipe(
    Layer.provide([fakeRive(calls), fakeMedia(length, wrote)]),
    Layer.provideMerge(BunServices.layer),
  );
  return { calls, wrote, layer };
};

const tempDir = Effect.gen(function* () {
  return yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();
});

const options = { pull: false, push: false, project: Option.none(), name: Option.none() };

describe('FilmProject.sync', () => {
  const { calls, layer } = setup();

  it.effect.layer(layer)(
    'a first sync creates the project, seeds a storyboard per beat, writes the Film and builds',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const film = filmIn(yield* tempDir);
          const at = projectPaths(film.paths);
          const placed = layout(film.scenes, film.timings);
          const synced = yield* (yield* FilmProject).sync(film, placed, options);
          expect(synced.seeded).toEqual(['open', 'close']);
          expect(synced.soundtrack).toBe(false);
          expect(yield* fs.readFileString(at.yaml)).toBe('name: test\nmain: "Film"\n');
          expect(yield* fs.exists(`${at.dir}/fonts/Inter-400.ttf`)).toBe(true);
          const open = yield* fs.readFileString(`${at.scenes}/open.rml`);
          expect(open).toContain('IDEA: a door');
          const written = yield* fs.readFileString(at.film);
          expect(written).toContain('name="Film"');
          expect(written).not.toContain('AudioAsset');
          expect(calls.builds).toBe(1);

          // A second sync finds both scenes and seeds nothing; the Film is current.
          const again = yield* (yield* FilmProject).sync(film, placed, options);
          expect(again.seeded).toEqual([]);
          const state = yield* (yield* FilmProject).state(film, placed);
          expect(Option.map(state, (s) => s.current)).toEqual(Option.some(true));
        }),
      ),
  );

  it.effect.layer(layer)(
    'reports artboards that are no beat, and never writes over a scene file that holds another',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const film = filmIn(yield* tempDir);
          const at = projectPaths(film.paths);
          const placed = layout(film.scenes, film.timings);
          yield* fs.makeDirectory(at.scenes, { recursive: true });
          yield* fs.writeFileString(`${at.scenes}/prop.rml`, '<Artboard name="prop"/>');
          const synced = yield* (yield* FilmProject).sync(film, placed, options);
          expect(synced.extra).toEqual(['prop']);
          // `open` renamed in its file: its beat has no artboard, and its file is taken.
          const drawn = '<Artboard name="opening"/>';
          yield* fs.writeFileString(`${at.scenes}/open.rml`, drawn);
          const exit = yield* Effect.exit((yield* FilmProject).sync(film, placed, options));
          expect(Exit.findErrorOption(exit).pipe(Option.map((e) => e._tag))).toEqual(
            Option.some('SceneFileTaken'),
          );
          expect(yield* fs.readFileString(`${at.scenes}/open.rml`)).toBe(drawn);
        }),
      ),
  );

  it.effect.layer(layer)('a pull is refused while git lacks the project’s changes', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const dir = yield* tempDir;
        const film = filmIn(dir);
        const placed = layout(film.scenes, film.timings);
        yield* fs.makeDirectory(`${dir}/rive`, { recursive: true });
        yield* fs.writeFileString(`${dir}/rive/rive.yaml`, 'name: test\n');
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        yield* collect(spawner, ChildProcess.make('git', ['-C', dir, 'init', '-q']));
        const exit = yield* Effect.exit(
          (yield* FilmProject).sync(film, placed, { ...options, pull: true }),
        );
        expect(Exit.findErrorOption(exit).pipe(Option.map((e) => e._tag))).toEqual(
          Option.some('ProjectDirty'),
        );
        expect(calls.pulls).toBe(0);
      }),
    ),
  );
});

describe('FilmProject.build', () => {
  it.effect.layer(setup().layer)(
    'refuses a film never synced, and a Film out of date with the script',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const project = yield* FilmProject;
          const film = filmIn(yield* tempDir);
          const placed = layout(film.scenes, film.timings);
          const tagOf = (exit: Exit.Exit<unknown, { readonly _tag: string }>) =>
            Exit.findErrorOption(exit).pipe(Option.map((e) => e._tag));
          expect(tagOf(yield* Effect.exit(project.build(film, placed)))).toEqual(
            Option.some('ProjectMissing'),
          );
          yield* project.sync(film, placed, options);
          const built = yield* project.build(film, placed);
          expect(built.riv.endsWith('/build/test.riv')).toBe(true);
          const retimed = layout(
            film.scenes.map((s) => ({ ...s, lead: 2 })),
            film.timings,
          );
          expect(tagOf(yield* Effect.exit(project.build(film, retimed)))).toEqual(
            Option.some('FilmStale'),
          );
        }),
      ),
  );

  const scored = setup(filmEnd(layout(scenes, recorded)));
  it.effect.layer(scored.layer)(
    'once every take is recorded and the master covers the film, the Film plays a soundtrack',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const film = filmIn(yield* tempDir, recorded);
          const at = projectPaths(film.paths);
          const placed = layout(film.scenes, film.timings);
          yield* fs.makeDirectory(film.paths.narration, { recursive: true });
          yield* fs.writeFileString(masterFile(film.paths), 'wav');
          const synced = yield* (yield* FilmProject).sync(film, placed, options);
          expect(synced.soundtrack).toBe(true);
          expect(scored.wrote).toEqual([at.soundtrack]);
          expect(yield* fs.readFileString(at.film)).toContain('file="soundtrack.wav"');
        }),
      ),
  );
});
