/**
 * The build walk reads an image by its bytes, whatever its name: each
 * format's first bytes are read as that format, a gzipped one by what it
 * unzips to, an SVG by its root element after any prolog; the site's other
 * files are no image. Over a `dist/` fixture made from a seed, every image of
 * every format under any name, extension (none, a wrong one, another
 * image's) and folder is refused, and the approved stills and the images
 * outside the rule, under any name, pass.
 */
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Order, Path } from 'effect';

import { readRecord, unapprovedBuilt } from './approval.ts';
import { type Format, formatOf } from './build-walk.ts';
import { OUTSIDE } from './served.ts';

const APP = `${import.meta.dir}/..`;

/** A seeded draw in [0, 1). */
const draws = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

type Draw = () => number;

const pick = <A>(next: Draw, from: readonly [A, ...ReadonlyArray<A>]): A =>
  from[Math.floor(next() * from.length)] ?? from[0];

const randomBytes = (next: Draw, length: number) =>
  Uint8Array.from({ length }, () => Math.floor(next() * 256));

const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));
const le32 = (value: number) => [
  value & 255,
  (value >> 8) & 255,
  (value >> 16) & 255,
  value >>> 24,
];
const joined = (...parts: ReadonlyArray<ReadonlyArray<number> | Uint8Array>) =>
  Uint8Array.from(parts.flatMap((part) => Array.from(part)));

/** An SVG's text: a prolog drawn from the forms XML allows, then the root element. */
const svgText = (next: Draw) => {
  const prolog = [
    '﻿',
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<!-- drawn by hand -->\n',
    '<?xml-stylesheet href="a.css"?>',
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n',
    '<!DOCTYPE svg [ <!ENTITY a "b"> ]>',
    '  \n\t',
  ].filter(() => next() < 0.4);
  const root = pick(next, ['<svg ', '<svg>', '<svg/>', '<svg:svg ', '<SVG ', '<svg\n']);
  return `${prolog.join('')}${root}xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><path d="M0 0h8v8z"/></svg>\n`;
};

/** A file of `format`: its first bytes, then a body drawn from `next`. */
const imageOf = (format: Format, next: Draw): Uint8Array => {
  const body = randomBytes(next, 16 + Math.floor(next() * 200));
  switch (format) {
    case 'jpeg':
      return joined([0xff, 0xd8, 0xff, pick(next, [0xe0, 0xe1, 0xdb, 0xee])], body);
    case 'png':
      return joined([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], body);
    case 'gif':
      return joined(ascii(pick(next, ['GIF87a', 'GIF89a'])), body);
    case 'webp':
      return joined(
        ascii('RIFF'),
        le32(body.length + 4),
        ascii('WEBP'),
        ascii(pick(next, ['VP8 ', 'VP8L', 'VP8X'])),
        body,
      );
    case 'avif/heif':
      return joined(
        le32(0x18000000),
        ascii('ftyp'),
        ascii(pick(next, ['avif', 'avis', 'heic', 'heix', 'mif1', 'msf1'])),
        body,
      );
    case 'jpeg xl':
      return joined(
        pick(next, [
          [0xff, 0x0a],
          [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a],
        ]),
        body,
      );
    case 'bmp':
      return joined(
        ascii('BM'),
        le32(body.length + 18),
        [0, 0, 0, 0],
        le32(54),
        le32(pick(next, [12, 40, 108, 124])),
        body,
      );
    case 'ico/cur':
      return joined([0, 0, pick(next, [1, 2]), 0, 1 + Math.floor(next() * 4), 0], body);
    case 'tiff':
      return joined(
        pick(next, [
          [0x49, 0x49, 0x2a, 0],
          [0x4d, 0x4d, 0, 0x2a],
        ]),
        body,
      );
    case 'jpeg 2000':
      return joined(
        pick(next, [
          [0, 0, 0, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a],
          [0xff, 0x4f, 0xff, 0x51],
        ]),
        body,
      );
    case 'svg':
      return new TextEncoder().encode(svgText(next));
  }
};

const FORMATS: readonly [Format, ...ReadonlyArray<Format>] = [
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif/heif',
  'jpeg xl',
  'bmp',
  'ico/cur',
  'tiff',
  'jpeg 2000',
  'svg',
];

/** Extensions a file may carry: none, wrong ones, every image's, in any case. */
const EXTENSIONS: readonly [string, ...ReadonlyArray<string>] = [
  '',
  '.js',
  '.css',
  '.txt',
  '.html',
  '.woff2',
  '.json',
  '.bin',
  '.webp',
  '.png',
  '.jpg',
  '.jfif',
  '.jxl',
  '.avif',
  '.gif',
  '.svg',
  '.SVG',
  '.ico',
  '.bmp',
  '.tif',
  '.jp2',
  '.heic',
  '.Webp',
];

/** A path under `dist/` drawn from `next`: up to three folders, a name, an extension. */
const pathOf = (next: Draw, index: number) => {
  const folders = Array.from({ length: Math.floor(next() * 4) }, () =>
    pick(next, ['assets', 'og', 'series', '.well-known', 'a b', 'x']),
  );
  return [...folders, `f${index}-${Math.floor(next() * 1e6)}${pick(next, EXTENSIONS)}`].join('/');
};

const utf8 = (text: string) => new TextEncoder().encode(text);

/** The files of the built site that are no image, as the build writes them. */
const NOT_IMAGES: ReadonlyArray<readonly [string, Uint8Array]> = [
  ['a script', utf8('import{a as b}from"./x.js";const svg=`<svg viewBox="0 0 1 1"></svg>`;')],
  ['a stylesheet', utf8('.a{background:url(/og/home.jpg)}')],
  [
    'a page with an svg inside',
    utf8('<!doctype html><html><body><svg viewBox="0 0 1 1"></svg></body></html>'),
  ],
  ['a manifest', utf8('{"icons":[{"src":"/icon-192.png"}]}')],
  ['a sitemap', utf8('<?xml version="1.0"?><urlset></urlset>')],
  ['robots', utf8('User-agent: *\nAllow: /\n')],
  ['text that opens BM', utf8('BM is not a bitmap without its header')],
  ['a font', joined(ascii('wOF2'), [0, 1, 0, 0, 0, 0, 0, 0, 0, 0])],
  ['an empty file', utf8('')],
  ['bytes that are not text', Uint8Array.from([0xc3, 0x28, 0x3c, 0x73, 0x76, 0x67])],
];

const test = it.effect.layer(BunServices.layer);

describe('the build walk', () => {
  test('reads each format by its first bytes, a gzipped one by what it unzips to', () =>
    Effect.sync(() => {
      const next = draws(41);
      for (const format of FORMATS) {
        expect([format, formatOf(imageOf(format, next))]).toEqual([format, Option.some(format)]);
        const zipped = Bun.gzipSync(new Uint8Array(imageOf(format, next)));
        expect([format, formatOf(zipped)]).toEqual([format, Option.some(format)]);
      }
    }));

  test('reads an svg by its root element after any prolog, and no other markup as one', () =>
    Effect.sync(() => {
      const next = draws(43);
      for (let i = 0; i < 60; i += 1) {
        const text = svgText(next);
        expect([text, formatOf(new TextEncoder().encode(text))]).toEqual([
          text,
          Option.some('svg'),
        ]);
      }
    }));

  test("reads none of the site's other files as an image", () =>
    Effect.sync(() => {
      for (const [name, given] of NOT_IMAGES)
        expect([name, formatOf(given)]).toEqual([name, Option.none()]);
    }));

  test('refuses every image under any name, extension and folder, and passes the approved stills and the images outside the rule under any name', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { stills } = yield* readRecord(APP);
      const dist = yield* fs.makeTempDirectoryScoped({ prefix: 'dist-' });
      const next = draws(47);
      const put = (file: string, bytes: Uint8Array) =>
        Effect.gen(function* () {
          yield* fs.makeDirectory(path.dirname(path.join(dist, file)), { recursive: true });
          yield* fs.writeFile(path.join(dist, file), bytes);
        });
      const expected: Array<{ readonly image: string; readonly format: Format }> = [];
      for (let i = 0; i < 240; i += 1) {
        const format = FORMATS[i % FORMATS.length] ?? FORMATS[0];
        const raw = imageOf(format, next);
        const bytes = pick(next, [raw, raw, raw, raw, raw, raw, Bun.gzipSync(new Uint8Array(raw))]);
        const file = pathOf(next, i);
        yield* put(file, bytes);
        expected.push({ image: file, format });
      }
      const held = [...Object.keys(stills), ...OUTSIDE.map(({ image }) => image)];
      for (const [i, source] of held.entries())
        yield* put(pathOf(next, 1000 + i), yield* fs.readFile(path.join(APP, source)));
      for (const [i, [, given]] of NOT_IMAGES.entries()) yield* put(pathOf(next, 2000 + i), given);
      const refused = yield* unapprovedBuilt(APP, dist);
      expect(refused).toEqual(
        expected.toSorted(Order.mapInput(Order.String, ({ image }) => image)),
      );
    }).pipe(Effect.scoped));
});
