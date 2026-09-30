// The review over a synthetic tree: a project folder listed by its catalogue
// (a set per address, the approval as its verdict, the film's pictures), a
// montage by its manifest (the sets, variants, videos, images and docs it
// names, a share copy standing in for its master), refs that never leave
// their root nor answer a file no record names, and derived files (lengths,
// frames, phone copies) made once, whole, through a stand-in Media that
// copies and counts instead (`reviewMedia`).

import { BunServices } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Option, Path, Schedule, Schema } from 'effect';
import { type Address, sceneAddress } from '../core/address.ts';
import {
  type Catalogue,
  CatalogueJson,
  type Render,
  approve,
  comment,
  emptyCatalogue,
  recordRender,
  subjectOf,
} from '../core/catalogue.ts';
import { type ChoiceVariant, VariantMedia } from '../core/choice.ts';
import { ReviewManifestJson } from '../core/review.ts';
import { Media } from './media.ts';
import { reviewMedia } from './testing.ts';
import {
  type Found,
  Review,
  montageFolder,
  namesInMontage,
  namesInProject,
  parseRoots,
  pathOf,
  projectFolder,
  refOf,
} from './review.ts';

/** A seen variant's video ref: what the review plays for it. */
const seenRef = (v: Option.Option<ChoiceVariant>): Option.Option<string> =>
  Option.flatMap(v, (variant) =>
    VariantMedia.match(variant.media, {
      Seen: ({ video }) => Option.some(video.ref),
      Heard: () => Option.none(),
      Unseen: () => Option.none(),
    }),
  );

/** A seen variant's video, its ref and phone copy state. */
const phoneOf = (v: ChoiceVariant): Option.Option<string> =>
  VariantMedia.match(v.media, {
    Seen: ({ video }) => Option.some(video.phone),
    Heard: () => Option.none(),
    Unseen: () => Option.none(),
  });

const found = (name: string, mtime = 1, size = 10): Found => ({
  path: `/r/art/${name}`,
  ref: `out/art/${name}`,
  name,
  size,
  mtime,
});

/** A folder's files as found: each of `names` there, at the mtime its place gives it. */
const lookAmong =
  (names: ReadonlyArray<string>, size = 10, folder = 'out/art') =>
  (name: string) =>
    Option.map(
      Option.liftPredicate(names.indexOf(name), (i) => i >= 0),
      (i) => ({
        ...found(name, i + 1, size),
        ref: `${folder}/${name}`,
      }),
    );

/** A video render of `address`'s `variant`, drawn from sources `key`, its files under `folder`. */
const videoRender = (
  address: Address,
  folder: string,
  variant = 'main',
  key = 'k1',
  from = 0,
): Render => ({
  address,
  variant,
  kind: 'video',
  settings: { scale: 0.5, captions: true },
  stamp: { commit: Option.some('0123456789abcdef'), key },
  span: Option.some({ from, to: from + 4 }),
  files: {
    clip: Option.some(`${folder}/${variant}.mp4`),
    share: Option.some(`${folder}/${variant}.share.mp4`),
    captions: Option.some(`${folder}/${variant}.vtt`),
    chapters: Option.none(),
    images: [],
  },
  sound: Option.none(),
  at: 1,
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
  "docs": ["../brief.md", "check.log"],
  "images": ["compare.jpg"],
  "videos": ["film.mp4"],
  "sets": {
    "roof": {
      "title": "The roof",
      "order": ["C", "B"],
      "start": 2,
      "moments": [1, 3],
      "variants": {
        "A": {},
        "B": { "label": "Bold", "tag": "ink", "verdict": "keep", "notes": "b.md" },
        "C": { "file": "../other/roof.C.mp4" }
      }
    },
    "lone": { "order": ["X"] },
    "gone": { "order": ["Y"] }
  }
}`;

describe('a montage', () => {
  const manifest = Schema.decodeSync(ReviewManifestJson)(MANIFEST);

  test('a set named like an address is refused, so its id never reads as a film render', () => {
    for (const clip of ['film', 'act:valley', 'scenes:cold', 'short:hook', ''])
      expect(() => Schema.decodeSync(ReviewManifestJson)(`{"sets":{"${clip}":{}}}`)).toThrow(
        `a set's clip is never empty nor named like an address ("${clip}")`,
      );
  });

  test('names every file it may show: a variant with no file by its share copy, then its master', () => {
    expect(namesInMontage(manifest)).toEqual([
      '../brief.md',
      'check.log',
      'compare.jpg',
      'film.mp4',
      '../other/roof.C.mp4',
      'roof.B.share.mp4',
      'roof.B.mp4',
      'b.md',
      'roof.A.share.mp4',
      'roof.A.mp4',
      'lone.X.share.mp4',
      'lone.X.mp4',
      'gone.Y.share.mp4',
      'gone.Y.mp4',
    ]);
  });

  test('lists what its manifest names: titles, order, labels, verdicts, notes, a variant from elsewhere', () => {
    const elsewhere: Found = {
      ...found('roof.C.mp4'),
      path: '/r/other/roof.C.mp4',
      ref: 'out/other/roof.C.mp4',
    };
    const there = lookAmong([
      'roof.A.mp4',
      'roof.A.share.mp4',
      'roof.B.mp4',
      'lone.X.mp4',
      'film.mp4',
      'compare.jpg',
      'check.log',
      'b.md',
      // A file the manifest does not name is not shown.
      'stray.mp4',
    ]);
    const folder = montageFolder({
      ref: 'out/art',
      record: manifest,
      look: (name) => {
        if (name === '../other/roof.C.mp4') return Option.some(elsewhere);
        if (name === '../brief.md')
          return Option.some({ ...found('brief.md'), path: '/r/brief.md', ref: 'out/brief.md' });
        return there(name);
      },
      phone: (v) => {
        if (v.name === 'roof.B.mp4') return 'ready';
        return 'none';
      },
      maxVideo: 1000,
    });
    expect(folder.title).toEqual(Option.some('Art 3'));
    expect(folder.blurb).toEqual(Option.some('six looks'));
    // A set whose videos are not there is left out.
    expect(folder.sets.map((s) => s.id)).toEqual(['render:lone', 'render:roof']);
    expect(folder.sets.every((s) => s.kind === 'render' && Option.isNone(s.address))).toBe(true);
    const roof = folder.sets[1];
    expect(roof?.title).toBe('The roof');
    expect(roof?.start).toBe(2);
    expect(roof?.moments).toEqual(Option.some([1, 3]));
    // Its order first, then the rest by name; a share copy stands in for its master.
    expect(roof?.variants.map((v) => [v.id, v.label, seenRef(Option.some(v)), phoneOf(v)])).toEqual(
      [
        ['C', 'C', Option.some('out/other/roof.C.mp4'), Option.some('none')],
        ['B', 'Bold', Option.some('out/art/roof.B.mp4'), Option.some('ready')],
        ['A', 'A', Option.some('out/art/roof.A.share.mp4'), Option.some('none')],
      ],
    );
    const bold = roof?.variants[1];
    // Its tag and verdict are its lines.
    expect(bold?.lines).toEqual(['ink', 'keep']);
    expect(Option.map(bold?.notes ?? Option.none(), (n) => n.ref)).toEqual(
      Option.some('out/art/b.md'),
    );
    expect(folder.videos.map((v) => v.name)).toEqual(['film.mp4']);
    expect(folder.images.map((i) => i.name)).toEqual(['compare.jpg']);
    expect(folder.docs.map((d) => d.ref).toSorted()).toEqual(['out/art/check.log', 'out/brief.md']);
  });
});

describe('a project folder', () => {
  const cold = videoRender(sceneAddress('cold'), 'scenes/cold', 'main', 'k1', 0);
  const coldInk = videoRender(sceneAddress('cold'), 'scenes/cold', 'ink', 'k1', 0);
  const roof = videoRender(sceneAddress('roof'), 'scenes/roof', 'main', 'k2', 8);
  const film = videoRender({ _tag: 'Film' }, 'film');
  const short = videoRender({ _tag: 'Short', id: 'verdict' }, 'shorts/verdict');
  const stills: Render = {
    ...film,
    kind: 'stills',
    variant: 'g',
    files: {
      clip: Option.none(),
      share: Option.none(),
      captions: Option.none(),
      chapters: Option.none(),
      images: ['film/g/stills/t0001.00.png'],
    },
  };
  const approvedCold = approve(
    [roof, short, coldInk, film, cold, stills].reduce(recordRender, emptyCatalogue('f')),
    subjectOf(cold),
    1,
  );
  const catalogue: Catalogue = comment(
    recordRender(approvedCold, { ...roof }),
    subjectOf(roof),
    'the hand jumps',
    2,
  );

  test('lists a set per address, the film first, then film order, then shorts; main first', () => {
    const folder = projectFolder({
      ref: 'out/f',
      record: catalogue,
      look: lookAmong(namesInProject(catalogue), 10, 'out/f'),
      phone: () => 'none',
      maxVideo: 1000,
    });
    expect(folder.title).toEqual(Option.some('f'));
    expect(folder.blurb).toEqual(Option.some('6 renders, 1 approved'));
    expect(folder.sets.map((s) => [s.title, s.variants.map((v) => v.id)])).toEqual([
      ['film', ['main']],
      ['scene cold', ['main', 'ink']],
      ['scene roof', ['main']],
      ['short verdict', ['main']],
    ]);
    const [, coldSet, roofSet] = folder.sets;
    // Each set is the render choice point at its address.
    expect(coldSet?.id).toBe('render:scenes:cold');
    expect(coldSet?.address).toEqual(Option.some(sceneAddress('cold')));
    // The share copy plays; the owner's approval and comments are on each variant; a line says scale, commit and comments.
    expect(seenRef(Option.fromNullishOr(coldSet?.variants[0]))).toEqual(
      Option.some('out/f/scenes/cold/main.share.mp4'),
    );
    expect(coldSet?.variants[0]?.approval).toBe('approved');
    expect(coldSet?.variants[1]?.approval).toBe('none');
    expect(roofSet?.variants[0]?.lines).toEqual(['scale 0.5 · 0123456 · 1 comment']);
    expect(roofSet?.variants[0]?.comments.map((c) => [c.text, c.onThis])).toEqual([
      ['the hand jumps', true],
    ]);
    expect(folder.images.map((i) => i.ref)).toEqual(['out/f/film/g/stills/t0001.00.png']);
    expect(folder.docs.length).toBe(5);
  });

  test('an approval given on an earlier render reads as such once the scene is rendered again', () => {
    const again = recordRender(
      catalogue,
      videoRender(sceneAddress('cold'), 'scenes/cold', 'main', 'k9'),
    );
    const folder = projectFolder({
      ref: 'out/f',
      record: again,
      look: lookAmong(namesInProject(again), 10, 'out/f'),
      phone: () => 'none',
      maxVideo: 1000,
    });
    expect(folder.sets[1]?.variants[0]?.approval).toBe('stale');
  });

  test('a variant is stale by the record: a newer render at its address drew other sources, a newer video carries another mix', () => {
    const mixed = (render: Render, mix: string, at: number): Render => ({
      ...render,
      sound: Option.some({ mix: Option.some(mix), pieces: [] }),
      at,
    });
    const record = [
      mixed(cold, 'm1', 1),
      mixed(coldInk, 'm1', 1),
      mixed(roof, 'm1', 1),
      mixed(videoRender(sceneAddress('cold'), 'scenes/cold', 'main', 'k9'), 'm2', 5),
    ].reduce(recordRender, emptyCatalogue('f'));
    const folder = projectFolder({
      ref: 'out/f',
      record,
      look: lookAmong(namesInProject(record), 10, 'out/f'),
      phone: () => 'none',
      maxVideo: 1000,
    });
    expect(
      folder.sets.map((s) => [s.title, s.variants.map((v) => [v.id, v.state, v.staleBy])]),
    ).toEqual([
      [
        'scene cold',
        [
          ['main', 'current', Option.none()],
          ['ink', 'stale', Option.some('sources')],
        ],
      ],
      ['scene roof', [['main', 'stale', Option.some('sound')]]],
    ]);
  });

  test('a render whose files are gone, or too big to stream, is left out', () => {
    const folder = projectFolder({
      ref: 'out/f',
      record: catalogue,
      look: lookAmong(['scenes/roof/main.mp4'], 2000, 'out/f'),
      phone: () => 'none',
      maxVideo: 1000,
    });
    expect(folder.sets).toEqual([]);
  });
});

/** Every child process the review started, as the stand-in saw it. */
class Spawned extends Context.Service<Spawned, Array<string>>()('test/Spawned') {}
class Root extends Context.Service<Root, string>()('test/Root') {}

/** A catalogue of film `f`: its whole film (two variants) and one scene, as `out/f` holds them. */
const PROJECT = emptyCatalogue('f');
const projectCatalogue = [
  videoRender({ _tag: 'Film' }, 'film', 'main'),
  { ...videoRender({ _tag: 'Film' }, 'film', 'wide'), at: 5 },
  videoRender(sceneAddress('a'), 'scenes/a'),
].reduce(recordRender, PROJECT);

/**
 * The review over a fresh tree: `out/art`, a montage (a set of two, a big
 * lone video, a variant from `out/elsewhere`); `out/f`, a project folder
 * with its catalogue; a stand-in Media (`reviewMedia`) giving every video
 * 12.5 s and making a still or a phone copy by copying the video whole.
 */
const fixture = (phoneCopies: boolean) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped();
      const out = path.join(dir, 'out');
      const write = (rel: string, text: string) =>
        Effect.gen(function* () {
          const file = path.join(out, ...rel.split('/'));
          yield* fs.makeDirectory(path.dirname(file), { recursive: true });
          yield* fs.writeFileString(file, text);
        });
      yield* write('art/roof.A.mp4', 'a'.repeat(10));
      yield* write('art/roof.B.mp4', 'b'.repeat(10));
      yield* write('art/big.mp4', 'x'.repeat(200));
      yield* write('art/stills/roof.C.mp4', 'c');
      yield* write('elsewhere/roof.D.mp4', 'd'.repeat(10));
      yield* fs.writeFileString(path.join(dir, 'secret.mp4'), 's');
      yield* write(
        'art/review.json',
        '{ "title": "Art", "videos": ["big.mp4"], "sets": { "roof": { "order": ["A", "B"], "variants": { "D": { "file": "../elsewhere/roof.D.mp4" } } } } }',
      );
      // A log beside the renders: named by no record, never served.
      yield* write('art/render.log', 'a log');
      for (const name of ['film/main', 'film/wide', 'scenes/a/main']) {
        yield* write(`f/${name}.mp4`, 'm'.repeat(10));
        yield* write(`f/${name}.share.mp4`, 's'.repeat(10));
        yield* write(`f/${name}.vtt`, 'WEBVTT');
      }
      yield* write('f/catalogue.json', yield* Schema.encodeEffect(CatalogueJson)(projectCatalogue));
      const spawned: Array<string> = [];
      return Review.layer({
        roots: [{ label: 'out', path: out }],
        cache: path.join(dir, 'cache'),
        phoneOver: 100,
        maxVideo: 1000,
        phoneCopies,
      }).pipe(
        Layer.provideMerge(reviewMedia(spawned)),
        Layer.merge(Layer.succeed(Spawned, spawned)),
        Layer.merge(Layer.succeed(Root, dir)),
      );
    }),
  ).pipe(Layer.provideMerge(BunServices.layer));

const writeText = (file: string, text: string) =>
  Effect.flatMap(FileSystem.FileSystem, (fs) => fs.writeFileString(file, text));

describe('the review service', () => {
  it.effect('indexes the roots by their records: a montage, and a project by its catalogue', () =>
    Effect.gen(function* () {
      const { folders } = yield* (yield* Review).index(false);
      expect(folders.map((f) => f.ref).toSorted()).toEqual(['out/art', 'out/f']);
      const art = folders.find((f) => f.ref === 'out/art');
      expect(art?.title).toEqual(Option.some('Art'));
      expect(art?.sets[0]?.variants.map((v) => seenRef(Option.some(v)))).toEqual([
        Option.some('out/art/roof.A.mp4'),
        Option.some('out/art/roof.B.mp4'),
        Option.some('out/elsewhere/roof.D.mp4'),
      ]);
      // The big video waits for its phone copy.
      expect(art?.videos.map((v) => [v.name, v.phone])).toEqual([['big.mp4', 'pending']]);
      const project = folders.find((f) => f.ref === 'out/f');
      expect(
        project?.sets.map((s) => [
          s.title,
          s.variants.map((v) => Option.getOrElse(seenRef(Option.some(v)), () => '')),
        ]),
      ).toEqual([
        ['film', ['out/f/film/main.share.mp4', 'out/f/film/wide.share.mp4']],
        ['scene a', ['out/f/scenes/a/main.share.mp4']],
      ]);
    }).pipe(Effect.provide(fixture(false))),
  );

  it.effect("a film's pictures are its whole-film renders, newest first: never a scene's", () =>
    Effect.gen(function* () {
      const review = yield* Review;
      expect((yield* review.pictures('f')).map((v) => v.ref)).toEqual([
        'out/f/film/wide.share.mp4',
        'out/f/film/main.share.mp4',
      ]);
      expect(yield* review.pictures('other')).toEqual([]);
    }).pipe(Effect.provide(fixture(false))),
  );

  it.effect('resolves a ref inside its root that the index lists, and nothing else', () =>
    Effect.gen(function* () {
      const review = yield* Review;
      const path = yield* Path.Path;
      expect(yield* review.resolve('out/art/roof.A.mp4')).toBe(
        path.join(yield* Root, 'out', 'art', 'roof.A.mp4'),
      );
      for (const ref of [
        'out/../secret.mp4',
        'out/art',
        'out/art/none.mp4',
        'nowhere/x.mp4',
        // There, inside the root, but nothing a record names: the records, a log, a stray video.
        'out/art/review.json',
        'out/art/render.log',
        'out/art/stills/roof.C.mp4',
        'out/f/catalogue.json',
      ]) {
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
      expect(spawned.filter((c) => c.startsWith('duration'))).toHaveLength(1);
      const frames = spawned.filter((c) => c.startsWith('still'));
      expect(frames).toHaveLength(1);
      expect(frames[0]).toEndWith('roof.A.mp4 1.25 640');
      yield* review.frame('out/art/roof.A.mp4', Option.some(3), 640);
      expect(spawned.filter((c) => c.startsWith('still'))).toHaveLength(2);
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
              Effect.flatMap(Media, (media) => media.still('/no/such/file', 0, 320, temporary)),
            ),
          ),
        ),
      );
      expect(failed._tag).toBe('MediaFailed');
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
      const copy = yield* review
        .phone('out/art/big.mp4')
        .pipe(
          Effect.flatMap(Effect.fromOption),
          Effect.retry({ schedule: Schedule.spaced('20 millis'), times: 250 }),
        );
      expect(yield* (yield* FileSystem.FileSystem).readFileString(copy)).toBe('x'.repeat(200));
      expect((yield* Spawned).some((c) => c.startsWith('phone '))).toBe(true);
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
      const art = path.join(yield* Root, 'out', 'art');
      yield* writeText(path.join(art, 'new.mp4'), 'n');
      yield* writeText(path.join(art, 'review.json'), '{ "videos": ["new.mp4"] }');
      const stale = yield* review.index(false);
      expect(stale.folders.flatMap((f) => f.videos).some((v) => v.name === 'new.mp4')).toBe(false);
      const fresh = yield* review.index(true);
      expect(fresh.folders.flatMap((f) => f.videos).some((v) => v.name === 'new.mp4')).toBe(true);
    }).pipe(Effect.provide(fixture(false))),
  );
});
