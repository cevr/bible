/**
 * The app icon, held to its config and to its one shape: the native config
 * names icons that exist at their sizes, in the app's own colour tokens; every
 * pixel of every icon is the ground, the wheat or a blend of the two; the
 * Android layers stay inside the launcher's safe circle; and every committed
 * file is what `bun run icon` draws from `assets/icon/wheat.svg` now.
 *
 * The expected colours come from the tokens (`wada167`), not from the
 * script's table, so a wrong row in the table is red too.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { validateNativeApp } from 'one/native';
import sharp from 'sharp';

import { wada167 } from '../src/theme.ts';
import { app } from '../vite/app.ts';
import { WebManifestJson, draw, faviconSvg, icons, manifest, wheatOf } from './icon.ts';

const test = it.effect.layer(BunServices.layer);

/** scripts/ → the app's root. */
const ROOT = `${import.meta.dir}/..`;

type Rgb = readonly [number, number, number];
interface Pixels {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

const rgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** A PNG's pixels, from bytes. */
const pixels = (input: string | Buffer) =>
  Effect.promise(() => sharp(input).raw().toBuffer({ resolveWithObject: true })).pipe(
    Effect.map(({ data, info }): Pixels => ({
      data,
      width: info.width,
      height: info.height,
      channels: info.channels,
    })),
  );

/** A PNG's pixels, from a file under the app's root. */
const decode = (file: string) => pixels(`${ROOT}/${file}`);

const meta = (file: string) => Effect.promise(() => sharp(`${ROOT}/${file}`).metadata());

const blue = wada167.vandarPoelsBlue;
const ecru = wada167.ecru;

/** Each opaque two-colour icon's ground and wheat. */
const opaque: ReadonlyArray<readonly [string, string, string]> = [
  ['assets/icon/ios-light.png', ecru, blue],
  ['assets/icon/ios-dark.png', blue, ecru],
  ['public/apple-touch-icon.png', ecru, blue],
  ['public/icon-192.png', ecru, blue],
  ['public/icon-512.png', ecru, blue],
  ['public/icon-maskable-512.png', ecru, blue],
  ['public/favicon-32.png', ecru, blue],
];

const corners = (p: Pixels) =>
  [0, p.width - 1, (p.height - 1) * p.width, p.height * p.width - 1].map((n) => n * p.channels);

const exact = (data: Buffer, i: number, colour: Rgb) =>
  data.readUInt8(i) === colour[0] &&
  data.readUInt8(i + 1) === colour[1] &&
  data.readUInt8(i + 2) === colour[2];

const at = (p: Pixels, i: number) => {
  const n = i / p.channels;
  return Option.some(`${n % p.width},${Math.floor(n / p.width)}`);
};

/**
 * The first pixel (`x,y`) off the segment from ground to wheat: t comes from
 * the channel the tokens differ most in, and each channel lies within 2 of
 * ground + t × (wheat − ground). Also the pixels exactly the wheat's colour,
 * and the ink: t summed over the square, per pixel.
 */
const blends = (p: Pixels, ground: Rgb, wheat: Rgb) => {
  const span = [wheat[0] - ground[0], wheat[1] - ground[1], wheat[2] - ground[2]] as const;
  let k = 0;
  for (const c of [1, 2]) if (Math.abs(span[c] ?? 0) > Math.abs(span[k] ?? 0)) k = c;
  const gk = ground[k] ?? 0;
  const sk = span[k] ?? 1;
  const near = (v: number, c: 0 | 1 | 2, t: number) => Math.abs(v - (ground[c] + t * span[c])) <= 2;
  let off = Option.none<string>();
  let exactly = 0;
  let ink = 0;
  for (let i = 0; i < p.data.length; i += p.channels) {
    const t = (p.data.readUInt8(i + k) - gk) / sk;
    const fits =
      t >= 0 &&
      t <= 1 &&
      near(p.data.readUInt8(i), 0, t) &&
      near(p.data.readUInt8(i + 1), 1, t) &&
      near(p.data.readUInt8(i + 2), 2, t);
    if (!fits && Option.isNone(off)) off = at(p, i);
    if (exact(p.data, i, wheat)) exactly++;
    ink += t;
  }
  return { off: Option.getOrElse(off, () => 'none'), exactly, ink: ink / (p.width * p.height) };
};

/** The first pixel (`x,y`) farther than `radius` × width from the centre that `drawn` holds drawn. */
const outside = (p: Pixels, radius: number, drawn: (i: number) => boolean) => {
  const r2 = (radius * p.width) ** 2;
  for (let y = 0; y < p.height; y++) {
    const dy = y + 0.5 - p.height / 2;
    for (let x = 0; x < p.width; x++) {
      const dx = x + 0.5 - p.width / 2;
      const i = (y * p.width + x) * p.channels;
      if (dx * dx + dy * dy > r2 && drawn(i)) return `${x},${y}`;
    }
  }
  return 'none';
};

/** The `<link rel="icon|apple-touch-icon|manifest">` lines of the web head. */
const headLinks = (layout: string) =>
  [...layout.matchAll(/<link rel="(icon|apple-touch-icon|manifest)" href="([^"]+)"/g)].map(
    ([, rel = '', href = '']) => ({ rel, href }),
  );

/** A square PNG's side. */
const sideOf = (file: string) =>
  meta(file).pipe(
    Effect.map((m) => ({ format: m.format, square: m.width === m.height, side: m.width })),
  );

const readManifest = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* Schema.decodeEffect(WebManifestJson)(
    yield* fs.readFileString(`${ROOT}/public/manifest.webmanifest`),
  );
});

describe('the app icon', () => {
  test('names the app Hymnal and passes One for iOS and Android', () =>
    Effect.gen(function* () {
      expect(() => validateNativeApp(app, 'ios')).not.toThrow();
      expect(() => validateNativeApp(app, 'android')).not.toThrow();
      expect(app.name).toBe('Hymnal');
      const web = yield* readManifest;
      expect([web.name, web.short_name]).toEqual(['Hymnal', 'Hymnal']);
    }));

  test('names files that exist at their sizes', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const native = [
        app.icon.source,
        app.icon.dark.source,
        app.icon.tinted.source,
        app.android.adaptiveIcon.foreground,
        app.android.adaptiveIcon.monochrome,
      ];
      const web = yield* readManifest;
      const links = headLinks(yield* fs.readFileString(`${ROOT}/app/_layout.tsx`));
      expect(links.map((link) => link.rel).toSorted()).toEqual([
        'apple-touch-icon',
        'icon',
        'icon',
        'manifest',
      ]);
      const [nativeSides, webSides, linked] = yield* Effect.all(
        [
          Effect.forEach(native, sideOf, { concurrency: 5 }),
          Effect.forEach(web.icons, (icon) => sideOf(path.join('public', icon.src)), {
            concurrency: 3,
          }),
          Effect.forEach(links, (link) => fs.exists(path.join(ROOT, 'public', link.href)), {
            concurrency: 4,
          }),
        ],
        { concurrency: 3 },
      );
      expect(nativeSides).toEqual(native.map(() => ({ format: 'png', square: true, side: 1024 })));
      expect(webSides).toEqual(
        web.icons.map((icon) => ({
          format: 'png',
          square: true,
          side: Number(icon.sizes.split('x')[0]),
        })),
      );
      expect(web.icons.every((icon) => icon.sizes.split('x')[0] === icon.sizes.split('x')[1])).toBe(
        true,
      );
      expect(linked).toEqual(links.map(() => true));
      const touch = links.find((link) => link.rel === 'apple-touch-icon')?.href ?? '';
      expect(yield* sideOf(path.join('public', touch))).toEqual({
        format: 'png',
        square: true,
        side: 180,
      });
    }));

  test('takes its colours from the tokens', () =>
    Effect.sync(() => {
      expect(app.icon.backgroundColor).toBe(ecru);
      expect(app.icon.dark.backgroundColor).toBe(blue);
      expect(app.android.adaptiveIcon.backgroundColor).toBe(ecru);
    }));

  test('draws every opaque pixel as ground, wheat or a blend of the two', () =>
    Effect.forEach(
      opaque,
      ([file, groundHex, wheatHex]) =>
        decode(file).pipe(
          Effect.map((p) => {
            const ground = rgb(groundHex);
            const drawn = blends(p, ground, rgb(wheatHex));
            // From 180 px up, 2% of the square is the wheat's exact colour;
            // the favicon's stem is mostly blended pixels, so it holds one.
            const solid = Math.max(1, Number(p.width >= 180) * 0.02 * p.width * p.height);
            return {
              file,
              channels: p.channels,
              cornersGround: corners(p).every((i) => exact(p.data, i, ground)),
              offBlend: drawn.off,
              solidWheat: drawn.exactly >= solid,
              ink: drawn.ink >= 0.02,
            };
          }),
        ),
      { concurrency: 7 },
    ).pipe(
      Effect.map((rows) =>
        expect(rows).toEqual(
          opaque.map(([file]) => ({
            file,
            channels: 3,
            cornersGround: true,
            offBlend: 'none',
            solidWheat: true,
            ink: true,
          })),
        ),
      ),
    ));

  test('draws the tinted icon in greys on black', () =>
    decode(app.icon.tinted.source).pipe(
      Effect.map((p) => {
        expect(corners(p).every((i) => exact(p.data, i, [0, 0, 0]))).toBe(true);
        let grey = true;
        let max = 0;
        for (let i = 0; i < p.data.length; i += p.channels) {
          const r = p.data.readUInt8(i);
          grey &&= r === p.data.readUInt8(i + 1) && r === p.data.readUInt8(i + 2);
          max = Math.max(max, r);
        }
        expect(grey).toBe(true);
        expect(max).toBeGreaterThanOrEqual(250);
      }),
    ));

  test('keeps the Android layers in their colour and inside the safe circle', () => {
    const layers: ReadonlyArray<readonly [string, Rgb]> = [
      [app.android.adaptiveIcon.foreground, rgb(blue)],
      [app.android.adaptiveIcon.monochrome, rgb('#ffffff')],
    ];
    return Effect.forEach(
      layers,
      ([file, colour]) =>
        decode(file).pipe(
          Effect.map((p) => {
            const near = (i: number, c: 0 | 1 | 2) =>
              Math.abs(p.data.readUInt8(i + c) - colour[c]) <= 2;
            let off = 0;
            for (let i = 0; i < p.data.length; i += 4)
              if (p.data.readUInt8(i + 3) > 0 && !(near(i, 0) && near(i, 1) && near(i, 2))) off++;
            return {
              file,
              channels: p.channels,
              cornerAlpha: corners(p).map((i) => p.data.readUInt8(i + 3)),
              offColour: off,
              outsideSafeCircle: outside(p, 33 / 108, (i) => p.data.readUInt8(i + 3) > 0),
            };
          }),
        ),
      { concurrency: 2 },
    ).pipe(
      Effect.map((rows) =>
        expect(rows).toEqual(
          layers.map(([file]) => ({
            file,
            channels: 4,
            cornerAlpha: [0, 0, 0, 0],
            offColour: 0,
            outsideSafeCircle: 'none',
          })),
        ),
      ),
    );
  });

  test('keeps the maskable icon inside the W3C safe circle', () =>
    decode('public/icon-maskable-512.png').pipe(
      Effect.map((p) => {
        const ground = rgb(ecru);
        expect(outside(p, 0.4, (i) => !exact(p.data, i, ground))).toBe('none');
      }),
    ));

  test('commits what bun run icon draws from the wheat now', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const wheat = yield* wheatOf(yield* fs.readFileString(`${ROOT}/assets/icon/wheat.svg`));
      // The same bytes need no decode; another host's sharp may encode or
      // antialias apart, so then the pixels are compared, within 8.
      const worstOf = (kept: Buffer, fresh: Buffer) =>
        Effect.all([pixels(kept), pixels(fresh)], { concurrency: 2 }).pipe(
          Effect.map(([a, b]) => {
            let worst = Math.abs(a.data.length - b.data.length) * 255;
            for (let i = 0; i < a.data.length && worst <= 8; i++)
              worst = Math.max(worst, Math.abs(a.data.readUInt8(i) - b.data.readUInt8(i)));
            return worst;
          }),
        );
      const drifts = yield* Effect.forEach(
        icons,
        (icon) =>
          Effect.all([fs.readFile(`${ROOT}/${icon.file}`), draw(wheat, icon)], {
            concurrency: 2,
          }).pipe(
            Effect.flatMap(([kept, fresh]) => {
              if (Buffer.from(kept).equals(fresh)) return Effect.succeed(0);
              return worstOf(Buffer.from(kept), fresh);
            }),
            Effect.map((worst) => [icon.file, worst] as const),
          ),
        { concurrency: 10 },
      );
      expect(drifts.filter(([, worst]) => worst > 8)).toEqual([]);
      expect(yield* fs.readFileString(`${ROOT}/public/favicon.svg`)).toBe(faviconSvg(wheat));
      expect(yield* fs.readFileString(`${ROOT}/public/manifest.webmanifest`)).toBe(manifest);
    }));
});
