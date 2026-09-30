// The lab runs for hours and Bun keeps a module as it first imported it, so
// a line fixed in a film's scenes while `film lab` is open must still reach
// the studio: its sheet, the take state, and a take recorded now. These run
// the lab's handler over a copy of the fixture film and edit the copy's
// files while it runs; a cue write is judged on the clock those files give
// now. No paid call: ElevenLabs refuses everything here.

import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import { LabWrite, StudioBeats } from '@bible/film/core';
import {
  ContentStore,
  ElevenLabs,
  ElevenLabsFailed,
  FilmRepo,
  FreshFilm,
  Media,
  NotesStore,
  SceneHead,
  SceneSources,
  SceneWriter,
  SourceWriter,
  StudioReadings,
  Takes,
  labHandler,
} from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Schema,
} from 'effect';
import { spawnBudget } from './cli-run.ts';

/** ElevenLabs that refuses everything: nothing here may reach a paid API. */
const refusing = Layer.succeed(
  ElevenLabs,
  ElevenLabs.of({
    tts: () => Effect.fail(ElevenLabsFailed.make({ op: 'tts', exitCode: -1, reason: 'no' })),
    dialogue: () =>
      Effect.fail(ElevenLabsFailed.make({ op: 'dialogue', exitCode: -1, reason: 'no' })),
    stt: () => Effect.fail(ElevenLabsFailed.make({ op: 'stt', exitCode: -1, reason: 'no' })),
    composeMusic: () =>
      Effect.fail(ElevenLabsFailed.make({ op: 'music', exitCode: -1, reason: 'no' })),
    soundEffect: () =>
      Effect.fail(ElevenLabsFailed.make({ op: 'sfx', exitCode: -1, reason: 'no' })),
    ready: Effect.void,
    apiKey: Effect.succeed(Redacted.make('never used')),
  }),
);

/** Where one test's copy of the films lives. */
class Copy extends Context.Service<Copy, string>()('test/LabCopy') {}

/** The copy's scene list, which a test edits while the lab runs. */
const SCENES = 'films/tiny/scenes/index.ts';

/**
 * The lab's services over a copy of the fixture films, made under the app's
 * `out/` (so its modules import the framework), with a `cli.ts` beside it
 * that runs the film CLI over the copy.
 */
const fixture = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const app = path.join(import.meta.dir, '..');
    const parent = path.join(app, 'out', 'lab-fresh-test');
    yield* fs.makeDirectory(parent, { recursive: true });
    const root = yield* fs.makeTempDirectoryScoped({ directory: parent, prefix: 'copy-' });
    const films = path.join(root, 'films');
    const sounds = path.join(root, 'sounds');
    const out = path.join(root, 'out');
    yield* fs.copy(path.join(import.meta.dir, 'fixtures', 'films'), films);
    yield* fs.copy(path.join(import.meta.dir, 'fixtures', 'sounds'), sounds);
    yield* fs.writeFileString(path.join(films, 'index.ts'), 'export const films = {};\n');
    const cli = path.join(root, 'cli.ts');
    const [appAt, filmsAt, soundsAt, outAt] = yield* Effect.forEach(
      [path.join(app, 'cli.ts'), films, sounds, out],
      (at) => Schema.encodeEffect(Schema.fromJsonString(Schema.String))(at),
    );
    yield* fs.writeFileString(
      cli,
      [
        `import { appCli } from ${appAt};`,
        `process.env.FILMS_OUT = ${outAt};`,
        `appCli(${filmsAt}, ${soundsAt}, import.meta.path);`,
        '',
      ].join('\n'),
    );
    const Platform = BunHttpPlatform.layer.pipe(Layer.provideMerge(BunServices.layer));
    const Store = ContentStore.layer.pipe(Layer.provide(Platform));
    const Outputs = ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: out }));
    const Repo = FilmRepo.layer(films, Option.some(sounds)).pipe(
      Layer.provide([Store, Platform, Outputs]),
    );
    const Tools = Layer.mergeAll(refusing, Media.layer).pipe(Layer.provide(Platform));
    const Fresh = FreshFilm.layer(['bun', cli]).pipe(Layer.provide(Platform));
    const Source = Layer.mergeAll(SceneWriter.layer, SceneHead.layer).pipe(
      Layer.provideMerge(SourceWriter.layer),
      Layer.provideMerge(SceneSources.layer),
      Layer.provide([Repo, Store, Fresh, Platform]),
    );
    const Notes = NotesStore.layer.pipe(Layer.provide([Store, Platform]));
    return Layer.mergeAll(Takes.layer, StudioReadings.layer).pipe(
      Layer.provideMerge(Layer.mergeAll(Repo, Fresh, Source, Notes, Tools, Store, Platform)),
      Layer.merge(Layer.succeed(Copy, root)),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

/** Where the lab listens: the only host its routes answer. */
const bound = { hostname: '127.0.0.1', port: 4401 } as const;

/** The studio's beats, as the lab's page reads them. */
const beats = Effect.gen(function* () {
  const lab = yield* labHandler('tiny');
  const res = yield* Effect.promise(() =>
    lab(new Request('http://127.0.0.1:4401/lab/tiny/studio/beats'), bound),
  );
  expect(res.status).toBe(200);
  return yield* Schema.decodeUnknownEffect(StudioBeats)(yield* Effect.promise(() => res.json()));
});

describe('the lab reads the film as it stands', () => {
  it.live(
    "a line fixed while the lab runs is on the studio's sheet at the next read, its take stale",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const file = (yield* Path.Path).join(yield* Copy, SCENES);
        const close = (listed: StudioBeats) => listed.beats.find((b) => b.id === 'close');
        expect(close(yield* beats)?.parts).toEqual([{ kind: 'line', text: 'And it ends.' }]);
        // The agent fixes the line; the lab keeps running.
        const before = yield* fs.readFileString(file);
        yield* fs.writeFileString(file, before.replace('And it ends.', 'And so it ends.'));
        const fixed = close(yield* beats);
        expect(fixed?.parts).toEqual([{ kind: 'line', text: 'And so it ends.' }]);
        expect([fixed?.state, fixed?.staleReason]).toEqual(['stale', 'text changed']);
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    spawnBudget(2),
  );

  it.live(
    'a cue written after a line moved its mark resolves on the clock the files now give',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const file = (yield* Path.Path).join(yield* Copy, SCENES);
        const lab = yield* labHandler('tiny');
        const write = Effect.gen(function* () {
          const res = yield* Effect.promise(() =>
            lab(
              new Request('http://127.0.0.1:4401/lab/tiny/cues/turn/fold', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{"offset":0.1}',
              }),
              bound,
            ),
          );
          expect(res.status).toBe(200);
          return yield* Schema.decodeUnknownEffect(LabWrite)(
            yield* Effect.promise(() => res.json()),
          );
        });
        const before = yield* write;
        // The agent moves the mark a word on; the lab keeps running.
        const text = yield* fs.readFileString(file);
        yield* fs.writeFileString(
          file,
          text.replace('Then the {page}page turns over.', 'Then the page {page}turns over.'),
        );
        const after = yield* write;
        expect(after.resolved?.start).toBeGreaterThan(before.resolved?.start ?? Infinity);
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    spawnBudget(3),
  );

  it.live(
    'a cue write is judged on the clock the files now give: a renamed mark its cue follows is no refusal',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* Copy;
        const lab = yield* labHandler('tiny');
        const write = Effect.promise(() =>
          lab(
            new Request('http://127.0.0.1:4401/lab/tiny/cues/turn/fold', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{"offset":0.1}',
            }),
            bound,
          ),
        );
        // The lab imports the film as it stands.
        expect((yield* write).status).toBe(200);
        // The agent renames the mark, and the cue with it; the lab keeps running.
        const scenes = path.join(root, SCENES);
        const beats = path.join(root, 'films/tiny/scenes/beats.ts');
        yield* fs.writeFileString(
          scenes,
          (yield* fs.readFileString(scenes)).replace('{page}page', '{leaf}page'),
        );
        yield* fs.writeFileString(
          beats,
          (yield* fs.readFileString(beats)).replace("mark: 'page'", "mark: 'leaf'"),
        );
        const res = yield* write;
        expect([res.status, yield* Effect.promise(() => res.text())]).toEqual([
          200,
          expect.stringContaining('"resolved"'),
        ]);
      }).pipe(Effect.scoped, Effect.provide(fixture)),
    spawnBudget(3),
  );
});
