// The review over a synthetic tree: sets found by name (a share copy standing
// in for its master), a manifest's say, refs that never leave their root, and
// derived files (lengths, frames, phone copies) made once, whole, through a
// stand-in for ffmpeg and ffprobe that copies and prints instead.

import { BunServices } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import {
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schedule,
  Schema,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { ReviewManifestJson } from '../core/schema.ts';
import {
  type Found,
  Review,
  assembleFolder,
  kindOf,
  parseRoots,
  pathOf,
  refOf,
  splitName,
} from './review.ts';

const found = (name: string, mtime = 1, size = 10): Found => ({
  path: `/r/art/${name}`,
  ref: `out/art/${name}`,
  name,
  size,
  mtime,
});

describe('review names', () => {
  test('reads a clip, its variant and whether it is a share copy', () => {
    expect(splitName('roof.A-current.share.mp4')).toEqual({
      clip: 'roof',
      variant: Option.some('A-current'),
      share: true,
    });
    expect(splitName('roof.B.v2.mp4')).toEqual({
      clip: 'roof',
      variant: Option.some('B.v2'),
      share: false,
    });
    expect(splitName('film.share.mp4')).toEqual({
      clip: 'film',
      variant: Option.none(),
      share: true,
    });
  });

  test('shows videos, images, docs and chapter lists; not logs or partial files', () => {
    expect(kindOf('a.mp4')).toEqual(Option.some('video'));
    expect(kindOf('a.PNG')).toEqual(Option.some('image'));
    expect(kindOf('notes.md')).toEqual(Option.some('doc'));
    expect(kindOf('film.chapters.txt')).toEqual(Option.some('doc'));
    expect(kindOf('render.log.txt')).toEqual(Option.none());
    expect(kindOf('film.part.mp4')).toEqual(Option.none());
    expect(kindOf('film.json')).toEqual(Option.none());
  });
});

describe('review roots and refs', () => {
  it.effect('labels roots, and a collision by its parent', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      expect(parseRoots('m=/x/montages, /a/co/out ,/b/other/out,', path)).toEqual([
        { label: 'm', path: '/x/montages' },
        { label: 'co-out', path: '/a/co/out' },
        { label: 'other-out', path: '/b/other/out' },
      ]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('names a file by its innermost root, and a ref never leaves its root', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const roots = [
        { label: 'sp', path: '/sp' },
        { label: 'montages', path: '/sp/montages' },
      ];
      expect(refOf(roots, '/sp/montages/a/b.mp4', path)).toEqual(Option.some('montages/a/b.mp4'));
      expect(refOf(roots, '/sp/x.md', path)).toEqual(Option.some('sp/x.md'));
      expect(refOf(roots, '/elsewhere/x.md', path)).toEqual(Option.none());
      expect(refOf(roots, '/spare/x.md', path)).toEqual(Option.none());
      expect(pathOf(roots, 'montages/a/b.mp4', path)).toEqual(Option.some('/sp/montages/a/b.mp4'));
      expect(pathOf(roots, 'montages/../../etc/passwd', path)).toEqual(Option.none());
      expect(pathOf(roots, 'nowhere/a.mp4', path)).toEqual(Option.none());
    }).pipe(Effect.provide(BunServices.layer)),
  );
});

const MANIFEST = `{
  "title": "Art 3",
  "blurb": "six looks",
  "docs": ["../brief.md"],
  "sets": {
    "roof": {
      "title": "The roof",
      "order": ["C", "B"],
      "start": 2,
      "moments": [1, 3],
      "variants": {
        "B": { "label": "Bold", "tag": "ink", "verdict": "keep", "notes": "b.md" },
        "C": { "file": "../other/roof.C.mp4" }
      }
    },
    "lone": {}
  }
}`;

describe('a review folder', () => {
  test('sets videos by clip, a share copy standing in for its master, the rest listed newest first', () => {
    const folder = assembleFolder({
      ref: 'out/art',
      found: [
        found('roof.A.mp4', 1),
        found('roof.A.share.mp4', 2),
        found('roof.B.mp4', 3),
        found('lone.X.mp4', 4),
        found('film.mp4', 5),
        found('still.png', 6),
        found('notes.md', 7),
      ],
      manifest: Option.none(),
      named: new Map(),
      phone: () => 'none',
    });
    expect(folder.sets.map((s) => [s.clip, s.variants.map((v) => [v.id, v.video.name])])).toEqual([
      [
        'roof',
        [
          ['A', 'roof.A.share.mp4'],
          ['B', 'roof.B.mp4'],
        ],
      ],
    ]);
    // A clip with one variant is no set: it is listed with the folder.
    expect(folder.videos.map((v) => v.name)).toEqual(['film.mp4', 'lone.X.mp4']);
    expect(folder.images.map((i) => i.name)).toEqual(['still.png']);
    expect(folder.docs.map((d) => d.name)).toEqual(['notes.md']);
    expect(folder.mtime).toBe(7);
    expect(folder.title).toEqual(Option.none());
  });

  test('follows its manifest: titles, order, labels, verdicts, notes and a variant from elsewhere', () => {
    const manifest = Schema.decodeSync(ReviewManifestJson)(MANIFEST);
    const elsewhere: Found = {
      ...found('roof.C.mp4'),
      path: '/r/other/roof.C.mp4',
      ref: 'out/other/roof.C.mp4',
    };
    const folder = assembleFolder({
      ref: 'out/art',
      found: [found('roof.A.mp4'), found('roof.B.mp4'), found('lone.X.mp4'), found('b.md')],
      manifest: Option.some(manifest),
      named: new Map([
        ['../other/roof.C.mp4', elsewhere],
        ['b.md', found('b.md')],
        ['../brief.md', { ...found('brief.md'), path: '/r/brief.md', ref: 'out/brief.md' }],
      ]),
      phone: (v) => {
        if (v.name === 'roof.B.mp4') return 'ready';
        return 'none';
      },
    });
    expect(folder.title).toEqual(Option.some('Art 3'));
    expect(folder.blurb).toEqual(Option.some('six looks'));
    const [lone, roof] = folder.sets;
    // A manifest entry makes a set of one.
    expect(lone?.variants.map((v) => v.id)).toEqual(['X']);
    expect(roof?.title).toBe('The roof');
    expect(roof?.start).toBe(2);
    expect(roof?.moments).toEqual(Option.some([1, 3]));
    expect(roof?.variants.map((v) => [v.id, v.label, v.video.ref, v.video.phone])).toEqual([
      ['C', 'C', 'out/other/roof.C.mp4', 'none'],
      ['B', 'Bold', 'out/art/roof.B.mp4', 'ready'],
      ['A', 'A', 'out/art/roof.A.mp4', 'none'],
    ]);
    const bold = roof?.variants[1];
    expect(bold?.tag).toEqual(Option.some('ink'));
    expect(bold?.verdict).toEqual(Option.some('keep'));
    expect(Option.map(bold?.notes ?? Option.none(), (n) => n.ref)).toEqual(
      Option.some('out/art/b.md'),
    );
    expect(folder.videos).toEqual([]);
    expect(folder.docs.map((d) => d.ref).toSorted()).toEqual(['out/art/b.md', 'out/brief.md']);
  });
});

/** Every child process the review started, as the stand-in saw it. */
class Spawned extends Context.Service<Spawned, Array<string>>()('test/Spawned') {}
class Root extends Context.Service<Root, string>()('test/Root') {}

/**
 * The review over a fresh tree (`out/art` with a set of two, a big lone
 * video, a manifest; `out/elsewhere`), ffprobe answering 12.5 s and ffmpeg
 * copying its input to its output.
 */
const fixture = (phoneCopies: boolean) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const real = yield* ChildProcessSpawner.ChildProcessSpawner;
      const dir = yield* fs.makeTempDirectoryScoped();
      const out = path.join(dir, 'out');
      yield* fs.makeDirectory(path.join(out, 'art', 'stills'), { recursive: true });
      yield* fs.makeDirectory(path.join(out, 'elsewhere'), { recursive: true });
      yield* fs.writeFileString(path.join(out, 'art', 'roof.A.mp4'), 'a'.repeat(10));
      yield* fs.writeFileString(path.join(out, 'art', 'roof.B.mp4'), 'b'.repeat(10));
      yield* fs.writeFileString(path.join(out, 'art', 'big.mp4'), 'x'.repeat(200));
      yield* fs.writeFileString(path.join(out, 'art', 'stills', 'roof.C.mp4'), 'c');
      yield* fs.writeFileString(path.join(out, 'elsewhere', 'roof.D.mp4'), 'd'.repeat(10));
      yield* fs.writeFileString(path.join(dir, 'secret.mp4'), 's');
      yield* fs.writeFileString(
        path.join(out, 'art', 'review.json'),
        '{ "title": "Art", "sets": { "roof": { "variants": { "D": { "file": "../elsewhere/roof.D.mp4" } } } } }',
      );
      const spawned: Array<string> = [];
      const spawner = ChildProcessSpawner.make((command) => {
        if (command._tag !== 'StandardCommand') return real.spawn(command);
        spawned.push([command.command, ...command.args].join(' '));
        // A phone copy runs `nice -n 15 ffmpeg …`.
        let args = command.args;
        let tool = command.command;
        if (tool === 'nice') {
          tool = command.args[2] ?? '';
          args = command.args.slice(3);
        }
        if (tool === 'ffprobe') return real.spawn(ChildProcess.make('echo', ['12.5']));
        if (tool === 'ffmpeg') {
          const input = args[args.indexOf('-i') + 1] ?? '';
          return real.spawn(ChildProcess.make('cp', [input, args.at(-1) ?? '']));
        }
        return real.spawn(command);
      });
      return Review.layer({
        roots: [{ label: 'out', path: out }],
        cache: path.join(dir, 'cache'),
        phoneOver: 100,
        maxVideo: 1000,
        phoneCopies,
      }).pipe(
        Layer.provide(Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)),
        Layer.merge(Layer.succeed(Spawned, spawned)),
        Layer.merge(Layer.succeed(Root, dir)),
      );
    }),
  ).pipe(Layer.provideMerge(BunServices.layer));

const writeText = (file: string, text: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.writeFileString(file, text));

describe('the review service', () => {
  it.effect('indexes the roots: sets, what is in no set, a variant pulled from elsewhere', () =>
    Effect.gen(function* () {
      const { folders } = yield* (yield* Review).index(false);
      const art = folders.find((f) => f.ref === 'out/art');
      expect(art?.title).toEqual(Option.some('Art'));
      expect(art?.sets[0]?.variants.map((v) => v.video.ref)).toEqual([
        'out/art/roof.A.mp4',
        'out/art/roof.B.mp4',
        'out/elsewhere/roof.D.mp4',
      ]);
      // stills/ is not walked; the big video waits for its phone copy.
      expect(art?.videos.map((v) => [v.name, v.phone])).toEqual([['big.mp4', 'pending']]);
    }).pipe(Effect.provide(fixture(false))),
  );

  it.effect('resolves a ref inside its root, and nothing outside', () =>
    Effect.gen(function* () {
      const review = yield* Review;
      const path = yield* Path.Path;
      expect(yield* review.resolve('out/art/roof.A.mp4')).toBe(
        path.join(yield* Root, 'out', 'art', 'roof.A.mp4'),
      );
      for (const ref of ['out/../secret.mp4', 'out/art', 'out/art/none.mp4', 'nowhere/x.mp4']) {
        const failed = yield* Effect.flip(review.resolve(ref));
        expect(failed._tag).toBe('ReviewFileUnknown');
      }
    }).pipe(Effect.provide(fixture(false))),
  );

  it.effect('a link out of the roots is not followed', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* Root;
      yield* fs.symlink(path.join(root, 'secret.mp4'), path.join(root, 'out', 'art', 'leak.mp4'));
      const failed = yield* Effect.flip((yield* Review).resolve('out/art/leak.mp4'));
      expect(failed._tag).toBe('ReviewFileUnknown');
    }).pipe(Effect.provide(fixture(false))),
  );

  it.effect('measures once, and makes a frame once whoever asks, at 10% in by default', () =>
    Effect.gen(function* () {
      const review = yield* Review;
      const spawned = yield* Spawned;
      expect(yield* review.duration('out/art/roof.A.mp4')).toBe(12.5);
      const [a, b] = yield* Effect.all(
        [
          review.frame('out/art/roof.A.mp4', Option.none(), 640),
          review.frame('out/art/roof.A.mp4', Option.none(), 640),
        ],
        { concurrency: 2 },
      );
      expect(a).toBe(b);
      expect(yield* (yield* FileSystem.FileSystem).readFileString(a)).toBe('a'.repeat(10));
      expect(spawned.filter((c) => c.startsWith('ffprobe'))).toHaveLength(1);
      const frames = spawned.filter((c) => c.startsWith('ffmpeg'));
      expect(frames).toHaveLength(1);
      expect(frames[0]).toContain('-ss 1.250');
      expect(frames[0]).toContain('scale=640:-2');
      yield* review.frame('out/art/roof.A.mp4', Option.some(3), 640);
      expect(spawned.filter((c) => c.startsWith('ffmpeg'))).toHaveLength(2);
    }).pipe(Effect.provide(fixture(false))),
  );

  it.effect('a failed make leaves nothing in the cache, and the next make lands whole', () =>
    Effect.gen(function* () {
      const review = yield* Review;
      const fs = yield* FileSystem.FileSystem;
      const failed = yield* Effect.flip(
        review.derive('mix/x.m4a', (temporary) =>
          writeText(temporary, 'half').pipe(
            Effect.andThen(
              review.ffmpeg('x', ['-i', '/no/such/file', temporary], Duration.seconds(10)),
            ),
          ),
        ),
      );
      expect(failed._tag).toBe('ReviewToolFailed');
      const cache = (yield* Path.Path).join(yield* Root, 'cache', 'mix');
      expect(yield* fs.readDirectory(cache)).toEqual([]);
      const made = yield* review.derive('mix/x.m4a', (temporary) => writeText(temporary, 'whole'));
      expect(yield* fs.readFileString(made)).toBe('whole');
    }).pipe(Effect.provide(fixture(false))),
  );

  it.live('makes a big video a phone copy in the background, then says it is ready', () =>
    Effect.gen(function* () {
      const review = yield* Review;
      const first = yield* review.index(true);
      const big = first.folders.flatMap((f) => f.videos).find((v) => v.name === 'big.mp4');
      expect(big?.phone).toBe('pending');
      const copy = yield* review.phone('out/art/big.mp4').pipe(
        Effect.flatMap((made) =>
          Option.match(made, {
            onNone: () => Effect.fail('not yet'),
            onSome: Effect.succeed,
          }),
        ),
        Effect.retry({ schedule: Schedule.spaced('20 millis'), times: 250 }),
      );
      expect(yield* (yield* FileSystem.FileSystem).readFileString(copy)).toBe('x'.repeat(200));
      expect((yield* Spawned).some((c) => c.startsWith('nice -n 15 ffmpeg'))).toBe(true);
      const again = yield* review.index(true);
      const ready = again.folders.flatMap((f) => f.videos).find((v) => v.name === 'big.mp4');
      expect(ready?.phone).toBe('ready');
    }).pipe(Effect.provide(fixture(true))),
  );

  it.effect('answers the index from memory until it is asked fresh', () =>
    Effect.gen(function* () {
      const review = yield* Review;
      const path = yield* Path.Path;
      yield* review.index(false);
      yield* writeText(path.join(yield* Root, 'out', 'art', 'new.mp4'), 'n');
      const stale = yield* review.index(false);
      expect(stale.folders.flatMap((f) => f.videos).some((v) => v.name === 'new.mp4')).toBe(false);
      const fresh = yield* review.index(true);
      expect(fresh.folders.flatMap((f) => f.videos).some((v) => v.name === 'new.mp4')).toBe(true);
    }).pipe(Effect.provide(fixture(false))),
  );
});
