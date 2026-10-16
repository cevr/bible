// FilmRepo reads films from the one root the app hands it, the same folder its
// player page imports; no environment variable can point the tools elsewhere.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { BoardFileJson, BoardName } from '../core/board.ts';
import { BoardStore } from './board-store.ts';
import { ContentStore } from './content-store.ts';
import { Segment } from '../core/segment.ts';
import { FilmFolder, FilmName, FilmRepo, placeFilm } from './film-repo.ts';
import { memoryFileSystem, storeLayer, testFilm, text } from './testing.ts';

const files = new Map<string, Uint8Array>();
const env = ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_DIR: '/elsewhere' }));
const repo = FilmRepo.layer('/app/src/films').pipe(
  Layer.provide([storeLayer(files), memoryFileSystem(files), Path.layer, env]),
);

describe('FilmRepo', () => {
  it.effect('reads films from the root it is given, whatever FILMS_DIR says', () =>
    Effect.gen(function* () {
      const paths = (yield* FilmFolder).paths('test');
      expect(paths.dir).toBe('/app/src/films/test');
    }).pipe(Effect.provide(repo)),
  );

  it.effect('a film with no script.ts has no script', () => {
    files.set('/app/src/films/bare/scenes/index.ts', new Uint8Array());
    return Effect.gen(function* () {
      expect(Option.isNone(yield* (yield* FilmRepo).script('bare'))).toBe(true);
    }).pipe(Effect.provide(repo));
  });

  // A synthetic film on disk (`fixtures/films/sample`): its modules are
  // imported as a real film's are, and no real film's script pins the test.
  const sample = FilmRepo.layer(`${import.meta.dir}/fixtures/films`).pipe(
    Layer.provide(ContentStore.layer),
    Layer.provideMerge(BunServices.layer),
  );

  it.effect.layer(sample)("reads a film's sound alone, and names a film that is not there", () =>
    Effect.gen(function* () {
      const repo = yield* FilmRepo;
      const sound = Option.getOrThrow(yield* repo.sound('sample'));
      expect(sound.effects).toEqual({
        knock: { sound: 'wood.knock', sync: 'hit', at: [{ scene: 'open', at: 'speech' }] },
      });
      const missing = yield* Effect.flip(repo.sound('nowhere'));
      expect(missing).toMatchObject({ _tag: 'FilmUnknown', film: 'nowhere', known: ['sample'] });
    }),
  );

  it.effect.layer(sample)("reads a film's script: each beat's line and its sources", () =>
    Effect.gen(function* () {
      const script = Option.getOrThrow(yield* (yield* FilmRepo).script('sample'));
      const open = script.find((beat) => beat.id === 'open');
      expect(open?.cite).toEqual(['Job 9:2', 'Romans 4:5']);
      expect(open?.say).toContain('and its answer');
      expect(script.find((beat) => beat.id === 'title')?.say).toBeUndefined();
      expect(script.find((beat) => beat.id === 'title')?.cite).toEqual([]);
      // It lists no heardAs names, so the take check has none.
      const loaded = yield* (yield* FilmRepo).load('sample');
      expect(loaded.heardAs).toEqual({});
      // Its film.ts declares the look: two acts, the first from the opening.
      const look = Option.getOrThrow(loaded.look);
      expect(look.acts.map((act) => act.from)).toEqual(['open', 'title']);
    }),
  );

  // A version folder (`sample/v3/`) is read from its own files with the same
  // loader: its scenes, takes, acts and score, and the film's voice where it
  // keeps none of its own.
  it.effect.layer(sample)("reads a version folder's own scenes, takes, acts and score", () =>
    Effect.gen(function* () {
      const loaded = yield* (yield* FilmRepo).load('sample', Segment.make('v3'));
      expect(loaded.scenes.map((s) => s.id)).toEqual(['seed', 'end']);
      expect(Object.keys(loaded.timings.scenes)).toEqual(['seed']);
      expect(Option.getOrThrow(loaded.look).acts.map((act) => String(act.name))).toEqual([
        'sowing',
      ]);
      const score = Option.getOrThrow(loaded.sound).score;
      expect(score?.options['piano']?.movements.map((m) => m.from)).toEqual(['seed']);
      expect(Option.getOrThrow(loaded.voice)).toMatchObject({ voiceId: 'sample-voice' });
    }),
  );

  // The app's library, written beside the sample film for the test: the knock
  // its sound.ts places is a code sound.
  const KNOCK = `export const library = {
  'wood.knock': {
    kind: 'code',
    sound: { play: { _tag: 'Partials', pitch: 'E5', set: 'glass', secs: 0.1 } },
    variants: 2,
    use: 'one-shot',
  },
};
export const store = { kind: 'folder', folder: 'files' };
`;

  // The repo is built with no sound renderer: a load that rendered or
  // measured a sound would not build, so what reads no sound pays for none.
  const withLibrary = Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-repo-sounds-' });
      yield* fs.writeFileString(`${dir}/library.ts`, KNOCK);
      return FilmRepo.layer(`${import.meta.dir}/fixtures/films`, Option.some(dir));
    }),
  ).pipe(Layer.provide(ContentStore.layer), Layer.provideMerge(BunServices.layer));

  it.effect.layer(withLibrary)(
    "loads a film's code sound resolved, with no sound renderer: a load measures nothing",
    () =>
      Effect.gen(function* () {
        const loaded = yield* (yield* FilmRepo).load('sample');
        expect(Option.getOrThrow(loaded.sound).effects['knock']?.sound).toBe('wood.knock');
        expect([...loaded.sounds.code.keys()]).toEqual(['wood.knock']);
      }),
  );
});

describe('BoardStore', () => {
  it.effect("reads a version folder's own board.json beside the film's", () => {
    const disk = new Map<string, Uint8Array>();
    const board = (beat: string) =>
      text(
        Schema.encodeSync(BoardFileJson)({
          film: 'f',
          panels: [
            {
              id: `${beat}.start`,
              beat: BoardName.make(beat),
              at: BoardName.make('start'),
              tries: [],
            },
          ],
          approvals: [],
        }),
      );
    disk.set('/app/src/films/f/board.json', board('a'));
    disk.set('/app/src/films/f/v2/board.json', board('b'));
    return Effect.gen(function* () {
      const boards = yield* BoardStore;
      const ids = (file: { readonly panels: ReadonlyArray<{ readonly id: string }> }) =>
        file.panels.map((p) => p.id);
      const f = FilmName.make('f');
      expect(ids(yield* boards.read(f))).toEqual(['a.start']);
      expect(ids(yield* boards.read(f, Segment.make('v2')))).toEqual(['b.start']);
      expect(ids(yield* boards.read(f, Segment.make('v3')))).toEqual([]);
    }).pipe(
      Effect.provide(
        BoardStore.layer.pipe(
          Layer.provide(FilmFolder.layer('/app/src/films')),
          Layer.provide([storeLayer(disk), memoryFileSystem(disk), Path.layer]),
        ),
      ),
    );
  });
});

describe('FilmFolder.stamp', () => {
  // A film and the app's sound library on disk, each file dated by hand, so
  // the stamp is read from the dates alone: the film's newest is 1000 s, the
  // lock's 2000 s, the library module's 3000 s.
  const dated = Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'film-stamp-' });
      const sounds = `${root}/sounds`;
      yield* fs.makeDirectory(`${root}/films/f/scenes`, { recursive: true });
      yield* fs.makeDirectory(sounds);
      const at = (file: string, seconds: number) =>
        fs.writeFileString(file, '').pipe(Effect.andThen(fs.utimes(file, seconds, seconds)));
      yield* at(`${root}/films/f/scenes/index.ts`, 1_000);
      yield* at(`${sounds}/library.lock.json`, 2_000);
      yield* at(`${sounds}/library.ts`, 3_000);
      yield* fs.utimes(`${root}/films/f/scenes`, 1_000, 1_000);
      return FilmFolder.layer(`${root}/films`, Option.some(sounds));
    }),
  ).pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
    Layer.provideMerge(BunServices.layer),
  );

  it.effect.layer(dated)("moves when the library's module changes, as when its lock does", () =>
    Effect.gen(function* () {
      expect(yield* (yield* FilmFolder).stamp('f')).toBe(3_000_000);
    }),
  );
});

describe('placeFilm', () => {
  const empty = { voice: '', scenes: {} };
  const pinned = (word: string) =>
    testFilm(
      [
        {
          id: 'gift',
          say: '{gift}And even that faith is a gift.',
          timeline: { lit: { mark: 'gift', word, dur: 0.6 } },
        },
      ],
      empty,
    );

  it.effect('lays out a word pin on a word the line says', () =>
    Effect.gen(function* () {
      const [p] = yield* placeFilm(pinned('faith'));
      const faith = p?.voice.words.find((w) => w.text === 'faith');
      expect(p?.cues.get('lit')?.start).toBe((p?.speechStart ?? NaN) + (faith?.start ?? NaN));
    }),
  );

  it.effect('fails with WordMissing, typed, when the line never says the word', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(placeFilm(pinned('hope')));
      expect(error._tag).toBe('WordMissing');
      expect(error).toMatchObject({ scene: 'gift', by: 'cue "lit"', mark: 'gift', word: 'hope' });
    }),
  );

  it.effect('fails with the authoring error itself, naming its scene and cue', () =>
    Effect.gen(function* () {
      const film = testFilm([{ id: 'a', timeline: { x: { after: 'nope' } } }], empty);
      expect(yield* Effect.flip(placeFilm(film))).toMatchObject({
        _tag: 'UnknownCue',
        scene: 'a',
        cue: 'nope',
        by: 'cue "x"',
      });
    }),
  );
});
