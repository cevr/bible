/**
 * The rule the field stills keep: every shipped field still, at every srcset
 * size, is byte-identical to one the owner approved by name
 * (`kit/approved-stills.json`, `./approval.ts`). Whether a still's light
 * comes from the sun is his look, given through a lab ask; this test holds
 * that what ships is what he looked at.
 *
 * The stills as they stand match the record. Over a copy of them, every
 * change is refused, generated from a seed over every served still: a byte
 * flipped at any offset, a re-encode at another quality, one pixel one level
 * off, another still's bytes swapped in, the file dropped; a still added
 * that the record does not name, and a record entry with no file. So is
 * every light the earlier light guards let through (each case named by the
 * review that found it), painted on head's stills and encoded as the kit
 * encodes.
 */
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Match, Option, Path } from 'effect';
import sharp from 'sharp';

import { ASPECT } from '../src/motion/sun.ts';
import { RECORD, type Unapproved, readRecord, servedStills, unapproved } from './approval.ts';
import {
  type Pixels,
  QUALITY,
  REPAINT_TO,
  at,
  skyMask,
  withSunLight,
  withoutRays,
} from './field-paint.ts';

const test = it.effect.layer(BunServices.layer);

const APP = `${import.meta.dir}/..`;

/** The widths the page's `srcset` serves. */
const WIDTHS = [768, 1536, 3072] as const;

/** The quality the kit encodes the stills at, as sharp takes it. */
const KIT_QUALITY = Math.round(QUALITY * 100);

/** A seeded draw in [0, 1). */
const draws = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

/** Pixels from a file or encoded bytes, at a width when one is asked. */
const decoded = (input: string | Uint8Array, width: Option.Option<number> = Option.none()) =>
  Effect.gen(function* () {
    const sized = Option.match(width, {
      onNone: () => sharp(input),
      onSome: (wide) => sharp(input).resize({ width: wide }),
    });
    const { data, info } = yield* Effect.promise(() =>
      sized.ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    );
    const pixels: Pixels = {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data),
    };
    return pixels;
  });

/** How a still is encoded again: at a quality (0 to 100), and without loss where its format can. */
interface Encoding {
  readonly lossless: boolean;
  readonly quality: number;
}

/** Pixels encoded in a still's own format (by its file's extension); a PNG is always lossless, its quality its compression. */
const encoded = (still: string, image: Pixels, { lossless, quality }: Encoding) => {
  const raw = sharp(Buffer.from(image.data), {
    raw: { width: image.width, height: image.height, channels: 4 },
  });
  const coded = Match.value(still.slice(still.lastIndexOf('.') + 1)).pipe(
    Match.when('webp', () => raw.webp({ lossless, quality, effort: 0 })),
    Match.when('png', () => raw.png({ compressionLevel: Math.round(quality / 12) })),
    Match.orElse(() => raw.jpeg({ quality })),
  );
  return Effect.map(
    Effect.promise(() => coded.toBuffer()),
    (bytes) => new Uint8Array(bytes),
  );
};

/** A change to a copy of the served stills: its name, and what it does to the copy. */
interface Change {
  readonly name: string;
  readonly apply: (root: string) => Effect.Effect<void, unknown, FileSystem.FileSystem>;
}

/** A change that writes bytes over a still (or a new one). */
const written = (name: string, still: string, bytes: Uint8Array): Change => ({
  name,
  apply: (root) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFile(`${root}/${still}`, bytes);
    }),
});

/** A copy of the served stills and the record in a scratch app, made once a test; answers its root. */
const copied = Effect.fn('FieldStill.copied')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'field-still-' });
  const files = [...(yield* servedStills(APP)), RECORD];
  yield* Effect.forEach(files, (file) =>
    Effect.andThen(fs.makeDirectory(path.dirname(path.join(root, file)), { recursive: true }), () =>
      fs.copyFile(path.join(APP, file), path.join(root, file)),
    ),
  );
  return root;
});

/** What the provenance check finds in the copy after each change, the copy put back between them. */
const foundAfter = Effect.fn('FieldStill.foundAfter')(function* (
  root: string,
  changes: ReadonlyArray<Change>,
) {
  const fs = yield* FileSystem.FileSystem;
  const files = [...(yield* servedStills(root)), RECORD];
  const kept = yield* Effect.forEach(files, (file) => fs.readFile(`${root}/${file}`));
  const found: Array<readonly [string, ReadonlyArray<Unapproved>]> = [];
  for (const change of changes) {
    yield* change.apply(root);
    found.push([change.name, yield* unapproved(root)]);
    for (const extra of yield* servedStills(root))
      if (!files.includes(extra)) yield* fs.remove(`${root}/${extra}`);
    yield* Effect.forEach(files, (file, i) =>
      fs.writeFile(`${root}/${file}`, kept[i] ?? new Uint8Array()),
    );
  }
  return found;
});

/** Every change to one served still, drawn from `next`: what it is, and the bytes or the drop. */
const changesOf = Effect.fn('FieldStill.changesOf')(function* (
  still: string,
  others: ReadonlyArray<string>,
  next: () => number,
) {
  const fs = yield* FileSystem.FileSystem;
  const bytes = yield* fs.readFile(`${APP}/${still}`);
  const flips = Array.from({ length: 3 }, () => {
    const offset = Math.floor(next() * bytes.length);
    const by = 1 + Math.floor(next() * 255);
    const flipped = Uint8Array.from(bytes);
    flipped[offset] = at(flipped, offset) ^ by;
    return written(`${still}: byte ${offset} xor ${by}`, still, flipped);
  });
  const image = yield* decoded(bytes);
  const quality = Math.round(40 + next() * 59);
  const again = yield* encoded(still, image, { lossless: false, quality });
  const pixel = Math.floor(next() * image.width * image.height);
  const channel = Math.floor(next() * 3);
  const moved = new Uint8ClampedArray(image.data);
  const code = at(moved, pixel * 4 + channel);
  moved[pixel * 4 + channel] = code + 1 - 2 * Number(code === 255);
  const nudged = yield* encoded(still, { ...image, data: moved }, { lossless: true, quality: 100 });
  const swap = others[Math.floor(next() * others.length)] ?? still;
  const changes: ReadonlyArray<Change> = [
    ...flips,
    written(`${still}: encoded again at quality ${quality}`, still, again),
    written(`${still}: pixel ${pixel} channel ${channel} moved one code`, still, nudged),
    written(`${still}: swapped for ${swap}`, still, yield* fs.readFile(`${APP}/${swap}`)),
    {
      name: `${still}: dropped`,
      apply: (root) =>
        Effect.gen(function* () {
          const files = yield* FileSystem.FileSystem;
          yield* files.remove(`${root}/${still}`);
        }),
    },
  ];
  return changes;
});

/** What each change should leave: exactly one still refused, and why. */
const refusedEach = (found: ReadonlyArray<readonly [string, ReadonlyArray<Unapproved>]>) =>
  found.map(([name, problems]) => [name, problems.length] as const);

type Colour = readonly [number, number, number];

const WHITE: Colour = [255, 255, 255];
const GOLD: Colour = [255, 210, 90];

/** A ray as the earlier guards' tests drew one: a band from its origin along its angle, fading over its reach. */
interface Ray {
  readonly u: number;
  readonly v: number;
  readonly angle: number;
  readonly halfWidth: number;
  readonly reach: number;
  readonly colour: Colour;
}

/** The ray painted over a still's sky at `strength` (0 to 1). */
const withRay = (still: Pixels, sky: Uint8Array, ray: Ray, strength: number): Pixels => {
  const { width, height } = still;
  const data = new Uint8ClampedArray(still.data);
  const along = [Math.cos(ray.angle), Math.sin(ray.angle)] as const;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (sky[i] === 0) continue;
      const du = (x + 0.5) / width - ray.u;
      const dv = ((y + 0.5) / height - ray.v) / ASPECT;
      const out = du * along[0] + dv * along[1];
      const off = Math.abs(dv * along[0] - du * along[1]) / ray.halfWidth;
      if (out < 0 || off > 2.5) continue;
      const a = strength * Math.exp(-2 * off * off - out / ray.reach);
      for (let k = 0; k < 3; k++) {
        const c = at(data, i * 4 + k);
        data[i * 4 + k] = c + a * (at(ray.colour, k) - c);
      }
    }
  return { width, height, data };
};

/** Two pixel sets mixed, `t` of the way from `from` to `to`. */
const mixed = (from: Pixels, to: Pixels, t: number): Pixels => {
  const data = new Uint8ClampedArray(from.data.length);
  for (let i = 0; i < data.length; i++) {
    const c = at(from.data, i);
    data[i] = c + t * (at(to.data, i) - c);
  }
  return { ...from, data };
};

/** Round 2's two beams from the top-left corner, painted hard over the sky. */
const beams = (still: Pixels, sky: Uint8Array, colour: Colour): Pixels => {
  const { width, height } = still;
  const data = new Uint8ClampedArray(still.data);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const angle = Math.atan2(y / height, x / width);
      const inBeam = Math.abs(angle - 1.05) < 0.06 || Math.abs(angle - 1.3) < 0.035;
      if (sky[y * width + x] === 1 && x / width < 0.34 && inBeam)
        data.set(colour, (y * width + x) * 4);
    }
  return { width, height, data };
};

/** The sky painted out with a hill's colour, so a guard reading the sky finds none. */
const skyless = (still: Pixels, sky: Uint8Array): Pixels => {
  const data = new Uint8ClampedArray(still.data);
  for (let i = 0; i < sky.length; i++) if (sky[i] === 1) data.set([120, 150, 110], i * 4);
  return { ...still, data };
};

/**
 * The kit's still with its ray repaint cut short (to `reach` of
 * `REPAINT_TO`) or weakened (`weight` of the clear sky laid over the old
 * rays): the master lit and the repainted master lit, mixed column by column.
 */
const kitStill = (master: Pixels, reach: number, weight: number) => {
  const sky = skyMask(master);
  const lit = withSunLight(master, sky);
  const repainted = withSunLight(withoutRays(master, sky), sky);
  const { width } = lit;
  const to = reach * REPAINT_TO * width;
  const feather = Math.max(1, Math.round((48 * width) / 3072));
  const data = new Uint8ClampedArray(lit.data);
  for (let j = 0; j < data.length; j++) {
    const x = (j >> 2) % width;
    const share = weight * Math.min(1, Math.max(0, 1 - (x - to) / feather));
    if (share > 0) data[j] = at(lit.data, j) + share * (at(repainted.data, j) - at(lit.data, j));
  }
  return { ...lit, data };
};

const MASTER = `${import.meta.dir}/art/field.webp`;
const stillAt = (width: number) => `src/art/field-${width}.webp`;

/** Each light the earlier light guards let through, painted on head's still at its width and encoded as the kit encodes. */
const earlierLights = Effect.fn('FieldStill.earlierLights')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const atWidth = (width: number) =>
    Effect.all({
      head: decoded(`${APP}/${stillAt(width)}`),
      old: decoded(
        MASTER,
        Option.liftPredicate(width, (wide) => wide !== 3072),
      ),
    });
  const [w768, w1536, w3072] = yield* Effect.all([atWidth(768), atWidth(1536), atWidth(3072)], {
    concurrency: 3,
  });
  const { head: head768, old: old768 } = w768;
  const { head: head3072, old: old3072 } = w3072;
  const old1536 = w1536.old;
  const sky768 = skyMask(old768);
  const sky3072 = skyMask(old3072);
  const thin = (width: number, colour: Colour): Ray => ({
    u: 0.02,
    v: 0.05,
    angle: 0.35,
    halfWidth: 0.6 / width,
    reach: 2,
    colour,
  });
  const lights: ReadonlyArray<readonly [string, number, Pixels]> = [
    ['r1: the old still, rays from the top left, at 768', 768, old768],
    ['r2: head 0.3 toward the old still', 768, mixed(head768, old768, 0.3)],
    ['r2: head 0.4 toward the old still', 768, mixed(head768, old768, 0.4)],
    ['r2: gold beams', 768, beams(head768, sky768, GOLD)],
    ['r2: white beams', 768, beams(head768, sky768, WHITE)],
    ['r2: the kit repainting to 0.2 of the width', 768, kitStill(old768, 0.5, 1)],
    ['r2: the kit repainting to 0.3 of the width', 768, kitStill(old768, 0.75, 1)],
    ['r2: the kit lifting the rays at 0.5', 768, kitStill(old768, 1, 0.5)],
    ['r2: the kit lifting the rays at 0.7', 768, kitStill(old768, 1, 0.7)],
    ['r2: the sky painted out', 768, skyless(head768, sky768)],
    ['r3: a 1 px white line at 0.5, at 768', 768, withRay(head768, sky768, thin(768, WHITE), 0.5)],
    ['r3: a 1 px gold line at 0.5, at 768', 768, withRay(head768, sky768, thin(768, GOLD), 0.5)],
    [
      'r3: a 1 px white line at 0.5, at 3072',
      3072,
      withRay(head3072, sky3072, thin(3072, WHITE), 0.5),
    ],
    [
      'r3: counsel’s faint white ray',
      768,
      withRay(
        head768,
        sky768,
        {
          u: 0.133012,
          v: 0.355084,
          angle: 0.605899,
          halfWidth: 0.0038546,
          reach: 0.653591,
          colour: WHITE,
        },
        0.155737,
      ),
    ],
    [
      'r3: the faint gold ray that passed at growth 0.022',
      768,
      withRay(
        head768,
        sky768,
        { u: 0.301, v: 0.14, angle: 0.922, halfWidth: 0.0043, reach: 0.725, colour: GOLD },
        0.127,
      ),
    ],
    ['r3: the kit repainting to 0.95 of its reach, at 1536', 1536, kitStill(old1536, 0.95, 1)],
    ['r3: the kit at 0.97 of its reach and weight, at 1536', 1536, kitStill(old1536, 0.97, 0.97)],
    ['r3: head 0.04 toward the old still, at 3072', 3072, mixed(head3072, old3072, 0.04)],
  ];
  const changes = yield* Effect.forEach(
    lights,
    ([name, width, image]) =>
      Effect.map(
        encoded(stillAt(width), image, { lossless: false, quality: KIT_QUALITY }),
        (bytes) => written(name, stillAt(width), bytes),
      ),
    { concurrency: 8 },
  );
  const master = yield* fs.readFile(MASTER);
  return [...changes, written('r1: the old still itself at 3072', stillAt(3072), master)];
});

describe('the field stills the page serves', () => {
  test('are one at each width the srcset names', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const names = yield* fs.readDirectory(`${APP}/src/art`);
      expect(names.filter((name) => /^field-\d+\.webp$/.test(name)).toSorted()).toEqual(
        WIDTHS.map((width) => `field-${width}.webp`).toSorted(),
      );
    }));

  test('hold every field picture the page and its shader import, and the link cards', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const sources = yield* Effect.forEach(['src/ui/art.ts', 'src/motion/scene.ts'], (file) =>
        fs.readFileString(`${APP}/${file}`),
      );
      const imported = sources.flatMap((source) =>
        Array.from(source.matchAll(/'\.\.\/art\/(field-[^'?]+)'/g), (m) => `src/art/${m[1]}`),
      );
      const served = yield* servedStills(APP);
      expect(imported.toSorted()).toEqual([
        'src/art/field-1536.webp',
        'src/art/field-3072.webp',
        'src/art/field-768.webp',
        'src/art/field-wind.png',
      ]);
      expect(imported.filter((still) => !served.includes(still))).toEqual([]);
      expect(served.filter((still) => still.startsWith('public/og/'))).toEqual(
        ['home', 'land', 'path', 'remedies', 'taught'].map((card) => `public/og/${card}.jpg`),
      );
    }));

  test('are each the still the owner approved, byte for byte, under the ask that showed him them', () =>
    Effect.gen(function* () {
      const { approval } = yield* readRecord(APP);
      expect(approval.ask).toMatch(/^[0-9a-f]{11}$/);
      expect(yield* unapproved(APP)).toEqual([]);
    }));

  test('refuse any change to a served still until the owner approves it', () =>
    Effect.gen(function* () {
      const root = yield* copied();
      const stills = yield* servedStills(APP);
      const next = draws(28);
      const changes = yield* Effect.forEach(
        stills,
        (still) =>
          changesOf(
            still,
            stills.filter((other) => other !== still),
            draws(Math.floor(next() * 2 ** 32)),
          ),
        { concurrency: 8 },
      );
      const found = yield* foundAfter(root, changes.flat());
      expect(found.length).toBe(stills.length * 7);
      expect(refusedEach(found)).toEqual(found.map(([name]) => [name, 1] as const));
      expect(found.map(([name, problems]) => [name, problems[0]?.still])).toEqual(
        found.map(([name]) => [name, name.slice(0, name.indexOf(':'))]),
      );
    }).pipe(Effect.scoped));

  test('refuse a still the record does not name, and a record entry with no file', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* copied();
      const card = yield* fs.readFile(`${APP}/public/og/home.jpg`);
      const still = yield* fs.readFile(`${APP}/${stillAt(768)}`);
      const record = yield* fs.readFileString(`${APP}/${RECORD}`);
      const named = record.replace(
        '"stills": {',
        '"stills": {\n    "src/art/field-2048.webp": "0000000000000000000000000000000000000000000000000000000000000000",',
      );
      const found = yield* foundAfter(root, [
        written('a size the srcset does not name', 'src/art/field-1024.webp', still),
        written('a link card the record does not name', 'public/og/about.jpg', card),
        written('a record entry with no file', RECORD, new TextEncoder().encode(named)),
      ]);
      expect(found).toEqual([
        [
          'a size the srcset does not name',
          [{ still: 'src/art/field-1024.webp', why: 'not in the record' }],
        ],
        [
          'a link card the record does not name',
          [{ still: 'public/og/about.jpg', why: 'not in the record' }],
        ],
        ['a record entry with no file', [{ still: 'src/art/field-2048.webp', why: 'no file' }]],
      ]);
    }).pipe(Effect.scoped));

  test('refuse every light the earlier light guards let through', () =>
    Effect.gen(function* () {
      const root = yield* copied();
      const found = yield* foundAfter(root, yield* earlierLights());
      expect(found.length).toBe(19);
      expect(found.map(([name, problems]) => [name, problems.map(({ why }) => why)])).toEqual(
        found.map(([name]) => [name, ['changed']]),
      );
    }).pipe(Effect.scoped));
});
