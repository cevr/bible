// The lab's scene-source routes as the page calls them, over a film on disk:
// a cue write lands in the scene file and answers with the span as the file
// now declares it, the cue resolved on the scene's clock and the fresh check;
// a knob write answers with the knob; a computed value is a 422 with the file
// untouched; undo puts the file back byte for byte, and a second undo is a 409.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Path, Schema } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { HeadSource, LabWrite, SceneSource } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { FilmModuleInvalid } from './errors.ts';
import { FilmRepo } from './film-repo.ts';
import { labHandler } from './lab.ts';
import { NotesStore } from './notes-store.ts';
import { collect } from './process.ts';
import { SceneHead } from './scene-head.ts';
import { SceneSources } from './scene-sources.ts';
import { SceneWriter } from './scene-writer.ts';
import { SourceWriter } from './source-writer.ts';
import { StaticCheck } from './static-check.ts';
import { sceneFixture } from './testing.ts';

/** The fixture's hand scene file. */
class HandFile extends Context.Service<HandFile, string>()('test/HandFile') {}

/** A check that reports one warning, and counts its runs. */
const checks: Array<string> = [];
const fakeCheck = Layer.succeed(
  StaticCheck,
  StaticCheck.of({
    run: (film) =>
      Effect.sync(() => {
        checks.push(film);
        return [{ level: 'warning', tag: 'AssetMissing', message: 'sound "coins" is missing' }];
      }),
  }),
);

/** The film repo over `films`, but loading the film fails (its paths still resolve). */
const brokenRepo = (films: string) =>
  Layer.effect(
    FilmRepo,
    Effect.map(FilmRepo, (repo) =>
      FilmRepo.of({
        paths: repo.paths,
        load: (film) =>
          Effect.fail(
            FilmModuleInvalid.make({ film, module: 'voice.ts', reason: 'broken for the test' }),
          ),
        script: repo.script,
        scores: repo.scores,
        names: repo.names,
      }),
    ),
  ).pipe(Layer.provide(FilmRepo.layer(films)));

const fixtureWith = (repoOver: (films: string) => ReturnType<typeof FilmRepo.layer>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const films = yield* sceneFixture(root);
      return Layer.mergeAll(
        Layer.mergeAll(SceneWriter.layer, SceneHead.layer).pipe(
          Layer.provideMerge(SourceWriter.layer),
          Layer.provideMerge(SceneSources.layer),
          Layer.provideMerge(repoOver(films)),
        ),
        NotesStore.layer,
        fakeCheck,
        Layer.succeed(HandFile, path.join(films, 'f', 'scenes', 'hand.ts')),
      ).pipe(Layer.provideMerge(ContentStore.layer));
    }),
  ).pipe(Layer.provideMerge(BunServices.layer));

const fixture = fixtureWith(FilmRepo.layer);

/** Where the lab server listens: the only host the routes answer to. */
const bound = { hostname: '127.0.0.1', port: 4401 } as const;
const at = (path: string) => `http://127.0.0.1:4401${path}`;

const post = (path: string, body: string) =>
  new Request(at(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });

const get = (path: string) => new Request(at(path));

const read = Effect.fn('test.read')(function* () {
  return yield* (yield* FileSystem.FileSystem).readFileString(yield* HandFile);
});

describe('lab source routes', () => {
  it.effect(
    'a cue write lands in the file and answers with the span, its timing and the check',
    () =>
      Effect.gen(function* () {
        const lab = yield* labHandler('f');
        const before = yield* read();
        const source = yield* Effect.promise(() =>
          lab(new Request(at('/lab/f/scenes/hand/source')), bound).then((r) => r.json()),
        );
        expect(yield* Schema.decodeUnknownEffect(SceneSource)(source)).toMatchObject({
          file: 'scenes/hand.ts',
          knobs: [{ name: 'palm', state: 'literal' }],
        });
        const res = yield* Effect.promise(() =>
          lab(post('/lab/f/cues/hand/topple', '{"offset":0.4}'), bound),
        );
        expect(res.status).toBe(200);
        const written = yield* Schema.decodeUnknownEffect(LabWrite)(
          yield* Effect.promise(() => res.json()),
        );
        expect(written).toMatchObject({
          scene: 'hand',
          file: 'scenes/hand.ts',
          target: 'cue topple offset',
          span: { mark: 'earns', offset: 0.4, dur: 1.8 },
          findings: [{ level: 'warning', tag: 'AssetMissing' }],
        });
        // Resolved on the scene's clock: the mark, plus the new offset, lasting its dur.
        expect(written.resolved?.dur).toBeCloseTo(1.8);
        expect(yield* read()).toBe(before.replace('offset: 0.1,', 'offset: 0.4,'));
        expect(checks).toContain('f');
      }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('a knob write answers with the knob; a computed value is a 422, file untouched', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const knob = yield* Effect.promise(() =>
        lab(post('/lab/f/knobs/hand/palm', '{"value":[1000,760]}'), bound).then((r) => r.json()),
      );
      expect(knob).toMatchObject({ target: 'knob palm', knob: [1000, 760] });
      const after = yield* read();
      const refused = yield* Effect.promise(() =>
        lab(post('/lab/f/cues/hand/late', '{"offset":1}'), bound),
      );
      expect(refused.status).toBe(422);
      expect(yield* Effect.promise(() => refused.text())).toContain('`GAP * 2`, not a literal');
      expect(yield* read()).toBe(after);
      const status = (req: Request) => Effect.promise(() => lab(req, bound).then((r) => r.status));
      expect(yield* status(post('/lab/f/cues/nope/topple', '{"dur":1}'))).toBe(404);
      expect(yield* status(post('/lab/f/cues/hand/topple', '{}'))).toBe(400);
      expect(yield* status(post('/lab/f/cues/hand/topple', '{"ease":"bouncy"}'))).toBe(400);
      // A timing the timeline would not resolve with: refused as the panel shows it.
      const unresolved = yield* Effect.promise(() =>
        lab(post('/lab/f/cues/hand/topple', '{"until":"earns"}'), bound),
      );
      expect(unresolved.status).toBe(422);
      expect(yield* Effect.promise(() => unresolved.text())).toContain('TimelineUnresolved: ');
      expect(yield* read()).toBe(after);
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect('undo and redo walk the writes back and forth; check answers the last of them', () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const json = (req: Request) => Effect.promise(() => lab(req, bound).then((r) => r.json()));
      const status = (req: Request) => Effect.promise(() => lab(req, bound).then((r) => r.status));
      const before = yield* read();
      yield* Effect.promise(() => lab(post('/lab/f/cues/hand/topple', '{"ease":"inQuad"}'), bound));
      const written = yield* read();
      expect(written).not.toBe(before);
      expect(yield* json(post('/lab/f/undo', '{}'))).toMatchObject({
        target: 'undo cue topple ease',
      });
      expect(yield* read()).toBe(before);
      expect(yield* status(post('/lab/f/undo', '{}'))).toBe(409);
      // The page the undo reloaded asks what happened, and what Redo would do.
      expect(yield* json(get('/lab/f/check'))).toMatchObject({
        latest: { target: 'undo cue topple ease', file: 'scenes/hand.ts' },
        redo: { target: 'cue topple ease' },
      });
      expect(yield* json(post('/lab/f/redo', '{}'))).toMatchObject({
        target: 'redo cue topple ease',
      });
      expect(yield* read()).toBe(written);
      expect(yield* status(post('/lab/f/redo', '{}'))).toBe(409);
      const report = yield* json(get('/lab/f/check'));
      expect(report).toMatchObject({
        latest: { target: 'redo cue topple ease' },
        undo: { target: 'cue topple ease' },
      });
      expect(report).not.toHaveProperty('redo');
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect("head answers HEAD's data, and says when the code changed since", () =>
    Effect.gen(function* () {
      const lab = yield* labHandler('f');
      const fs = yield* FileSystem.FileSystem;
      const file = yield* HandFile;
      const dir = (yield* Path.Path).dirname(file);
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const git = (...args: ReadonlyArray<string>) =>
        collect(spawner, ChildProcess.make('git', [...args], { cwd: dir }));
      const request = () =>
        Effect.promise(() => lab(new Request(at('/lab/f/scenes/hand/head')), bound));
      const head = Effect.fn('test.head')(function* () {
        const res = yield* request();
        return yield* Schema.decodeUnknownEffect(HeadSource)(
          yield* Effect.promise(() => res.json()),
        );
      });
      // Not in a repository yet: nothing to compare with.
      expect((yield* request()).status).toBe(404);
      yield* git('init', '-q');
      yield* git('add', '.');
      yield* git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'scenes');
      expect(yield* head()).toMatchObject({
        file: 'scenes/hand.ts',
        codeChanged: false,
        sameData: true,
        knobs: { palm: [960, 800] },
      });
      // A lab write changes data only; HEAD still has the old offset, and the computed cue is left out.
      yield* Effect.promise(() => lab(post('/lab/f/cues/hand/topple', '{"offset":0.4}'), bound));
      const moved = yield* head();
      expect(moved).toMatchObject({
        codeChanged: false,
        sameData: false,
        timeline: { topple: { mark: 'earns', offset: 0.1, dur: 1.8 } },
      });
      expect(Object.keys(moved.timeline)).toEqual(['topple']);
      // Code outside the literals changed: the compare can show data only.
      const now = yield* fs.readFileString(file);
      yield* fs.writeFileString(file, now.replace('const GAP = 0.2;', 'const GAP = 0.3;'));
      expect(yield* head()).toMatchObject({ codeChanged: true });
    }).pipe(Effect.scoped, Effect.provide(fixture)),
  );

  it.effect(
    'a cue that lands but does not resolve says why, instead of leaving it out silently',
    () =>
      Effect.gen(function* () {
        const lab = yield* labHandler('f');
        const res = yield* Effect.promise(() =>
          lab(post('/lab/f/cues/hand/topple', '{"offset":0.4}'), bound),
        );
        expect(res.status).toBe(200);
        const written = yield* Schema.decodeUnknownEffect(LabWrite)(
          yield* Effect.promise(() => res.json()),
        );
        expect(written.span).toEqual({ mark: 'earns', offset: 0.4, dur: 1.8 });
        expect(written.resolved).toBeUndefined();
        expect(written.unresolved).toContain('FilmModuleInvalid');
        expect(written.unresolved).toContain('broken for the test');
      }).pipe(Effect.scoped, Effect.provide(fixtureWith(brokenRepo))),
  );
});
