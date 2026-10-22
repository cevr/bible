/**
 * The build walk reads an image by its bytes, whatever its name: each
 * format's first bytes are read as that format, a gzipped one by what it
 * unzips to, an SVG by its root element after any prolog; the site's other
 * files are no image. An SVG is drawn in each encoding XML allows a browser
 * to draw. Over a `dist/` fixture made from a seed, every image of every
 * format under any name, extension (none, a wrong one, another image's) and
 * folder is refused, and each file named as an image whose bytes no
 * signature reads is refused as `unknown`; the approved stills and the
 * images outside the rule, under any name, pass. A built file that holds a
 * data URL (a page, a stylesheet, a script, in UTF-8 or UTF-16, gzipped or
 * not) is refused as `data url`. The build inlines no imported asset, and
 * no served source file the linter does not read (a stylesheet, a drawing)
 * holds an image inside it as a data URL.
 */
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Glob, JSONC } from 'bun';
import { Effect, FileSystem, Option, Order, Path, Schema } from 'effect';

import { readRecord, unapprovedBuilt } from './approval.ts';
import { DATA_URL, type Format, formatOf } from './build-walk.ts';
import viteConfig from '../vite.config.ts';
import { OUTSIDE, SERVED_FOLDERS } from './served.ts';

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

/** The encodings XML allows an SVG in, each a browser draws. */
const ENCODINGS = ['utf-8', 'utf-16le', 'utf-16be', 'iso-8859-1'] as const;
type Encoding = (typeof ENCODINGS)[number];

/** The code units of `text`, each as two bytes, its low byte first (little end) or last. */
const utf16 = (text: string, end: 'little' | 'big') =>
  Uint8Array.from(
    Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)).flatMap(
      (unit) => ({ little: [unit & 255, unit >> 8], big: [unit >> 8, unit & 255] })[end],
    ),
  );

/** An SVG's text in `encoding`, its byte order mark drawn for UTF-8 and UTF-16, and a declaration and an `é` for ISO-8859-1. */
const svgIn = (encoding: Encoding, next: Draw): Uint8Array => {
  const text = svgText(next).replace(/^\ufeff/, '');
  const marked = `${'\ufeff'.repeat(Math.floor(next() * 2))}${text}`;
  switch (encoding) {
    case 'utf-8':
      return new TextEncoder().encode(marked);
    case 'utf-16le':
      return utf16(marked, 'little');
    case 'utf-16be':
      return utf16(marked, 'big');
    case 'iso-8859-1':
      return Uint8Array.from(
        Array.from(
          `<?xml version="1.0" encoding="ISO-8859-1"?><!-- caf\u00e9 -->${text.replace(/^<\?xml[^>]*>/, '')}`,
          (character) => character.charCodeAt(0),
        ),
      );
  }
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
      return svgIn(pick(next, ENCODINGS), next);
    case 'unknown':
      return joined(ascii('?'), body);
    case 'data url':
      return joined(ascii('url(data:image/png;base64,'), body);
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

/** The extensions of a file named as an image, in any case. */
const IMAGE_EXTENSIONS: readonly [string, ...ReadonlyArray<string>] = [
  '.webp',
  '.png',
  '.apng',
  '.jpg',
  '.JPEG',
  '.jfif',
  '.jxl',
  '.avif',
  '.gif',
  '.svg',
  '.svgz',
  '.ico',
  '.bmp',
  '.tif',
  '.heic',
  '.jp2',
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

/** The extensions of the site's files that are no image. */
const PLAIN_EXTENSIONS: readonly [string, ...ReadonlyArray<string>] = [
  '',
  '.js',
  '.css',
  '.txt',
  '.html',
  '.woff2',
  '.json',
  '.bin',
];

/** A path under `dist/` drawn from `next`: up to three folders, a name, an extension from `extensions`. */
const pathOf = (
  next: Draw,
  index: number,
  extensions: readonly [string, ...ReadonlyArray<string>] = EXTENSIONS,
) => {
  const folders = Array.from({ length: Math.floor(next() * 4) }, () =>
    pick(next, ['assets', 'og', 'series', '.well-known', 'a b', 'x']),
  );
  return [...folders, `f${index}-${Math.floor(next() * 1e6)}${pick(next, extensions)}`].join('/');
};

const utf8 = (text: string) => new TextEncoder().encode(text);

/** The files of the built site that are no image, as the build writes them. */
const NOT_IMAGES: ReadonlyArray<readonly [string, Uint8Array]> = [
  [
    'a script',
    utf8(
      'import{a as b}from"./x.js";const svg=`<svg viewBox="0 0 1 1"></svg>`;const f={_tag:`FormData`,formData:1,data:2},g={data:n/2,Data:a.b/c},h={data:"x"},k={a:1, data:`y`},m=c?data:\'z\':0;',
    ),
  ],
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

/** Files of the built site that hold an image inside them as a data URL. */
const INLINED: ReadonlyArray<Uint8Array> = [
  utf8('<!doctype html><img src="data:image/png;base64,iVBORw0KGgo=">'),
  utf8('.a{background:url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E")}'),
  utf8('const a="data:image/webp;base64,UklGRg==";export{a};'),
  utf8('const b=`DATA:,x`;export{b};'),
  joined(
    [0xff, 0xfe],
    [...new TextEncoder().encode('.a{mask:url(data:;base64,AA==)}')].flatMap((byte) => [byte, 0]),
  ),
  Bun.gzipSync(utf8('const c="data:image/png;base64,iVBORw0KGgo=";')),
  utf8('const d=t=>"data:"+t+";base64,"+e;export{d};'),
  utf8('const g=t=>`url(data:`+t+`)`;export{g};'),
  utf8('<!doctype html><img src="data&#58;image/png;base64,iVBORw0KGgo=">'),
  utf8('<!doctype html><img src="DATA&#x3A;;base64,AA==">'),
];

const test = it.effect.layer(BunServices.layer);

const ALL_DATA_URLS = new RegExp(DATA_URL.source, 'giu');

/** Each data URL's opening a text holds. */
const dataUrls = (text: string) => Array.from(text.matchAll(ALL_DATA_URLS), ([found]) => found);

const fatalUtf8 = new TextDecoder('utf-8', { fatal: true });
const textOf = Option.liftThrowable((bytes: Uint8Array) => fatalUtf8.decode(bytes));

/** A test, which is not served. */
const TEST = /\.test\./u;

/** The globs of each block of the repo's `.oxlintrc.json` that refuses a data URL (film/no-data-url). */
const dataUrlLinted = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* fs.readFileString(path.join(APP, '..', '..', '.oxlintrc.json'));
  const { overrides } = yield* Schema.decodeUnknownEffect(LintConfig)(JSONC.parse(text));
  const globs = overrides
    .filter(({ rules }) => rules['film/no-data-url'] === 'error')
    .flatMap(({ files }) => files.map((glob) => new Glob(glob)));
  return (file: string) => globs.some((glob) => glob.match(`apps/firsttheblade/${file}`));
});

const LintConfig = Schema.Struct({
  overrides: Schema.Array(
    Schema.Struct({
      files: Schema.Array(Schema.String),
      rules: Schema.Record(Schema.String, Schema.Unknown),
    }),
  ),
});

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

  test('reads an svg in UTF-16 little or big end first, with its byte order mark or none, in ISO-8859-1, and each gzipped', () =>
    Effect.sync(() => {
      const next = draws(53);
      for (let i = 0; i < 80; i += 1) {
        const encoding = ENCODINGS[i % ENCODINGS.length] ?? 'utf-8';
        const bytes = svgIn(encoding, next);
        expect([encoding, i, formatOf(bytes)]).toEqual([encoding, i, Option.some('svg')]);
        expect([encoding, i, formatOf(Bun.gzipSync(new Uint8Array(bytes)))]).toEqual([
          encoding,
          i,
          Option.some('svg'),
        ]);
      }
    }));

  test('inlines no imported asset, so each image the build emits is a file of its own', () =>
    Effect.sync(() => {
      expect(viteConfig.build?.assetsInlineLimit).toBe(0);
    }));

  test("reads none of the site's other files as an image", () =>
    Effect.sync(() => {
      for (const [name, given] of NOT_IMAGES)
        expect([name, formatOf(given)]).toEqual([name, Option.none()]);
    }));

  test('refuses a script that joins a type to the scheme at run time and a page whose colon is a character reference, each as a data URL, and passes a key or a name data', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dist = yield* fs.makeTempDirectoryScoped({ prefix: 'dist-' });
      const files: ReadonlyArray<readonly [string, string]> = [
        ['assets/joined.js', 'const d=t=>"data:"+t+";base64,"+e;export{d};'],
        ['assets/url.css.js', 'const g=t=>`url(data:`+t+`)`;export{g};'],
        ['entity.html', '<img src="data&#58;image/png;base64,iVBORw0KGgo=">'],
        ['hex.html', '<img src="DATA&#x3A;;base64,AA==">'],
        ['assets/keys.js', 'const h={data:"x"},k={a:1, data:`y`},m=c?data:\'z\':0;export{h,k,m};'],
      ];
      for (const [file, text] of files) {
        yield* fs.makeDirectory(path.dirname(path.join(dist, file)), { recursive: true });
        yield* fs.writeFileString(path.join(dist, file), text);
      }
      const refused = yield* unapprovedBuilt(APP, dist);
      expect(refused).toEqual([
        { image: 'assets/joined.js', format: 'data url' },
        { image: 'assets/url.css.js', format: 'data url' },
        { image: 'entity.html', format: 'data url' },
        { image: 'hex.html', format: 'data url' },
      ]);
    }).pipe(Effect.scoped));

  test('refuses every image under any name, extension and folder, each file named as an image that no signature reads as unknown, and each file that holds a data URL, and passes the approved stills and the images outside the rule under any name', () =>
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
      for (const [i, [, given]] of NOT_IMAGES.entries())
        yield* put(pathOf(next, 2000 + i, PLAIN_EXTENSIONS), given);
      for (const [i, given] of INLINED.entries()) {
        const file = pathOf(next, 4000 + i, [...PLAIN_EXTENSIONS, ...IMAGE_EXTENSIONS]);
        yield* put(file, given);
        expected.push({ image: file, format: 'data url' });
      }
      for (let i = 0; i < 40; i += 1) {
        const file = pathOf(next, 3000 + i, IMAGE_EXTENSIONS);
        const [, given] = NOT_IMAGES[i % NOT_IMAGES.length] ?? ['', new Uint8Array()];
        yield* put(file, given);
        expected.push({ image: file, format: 'unknown' });
      }
      const refused = yield* unapprovedBuilt(APP, dist);
      expect(refused).toEqual(
        expected.toSorted(Order.mapInput(Order.String, ({ image }) => image)),
      );
    }).pipe(Effect.scoped));

  test('no served file the linter does not read, a stylesheet or a drawing, holds a data URL, so each image the site serves is a file the walk reads', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      expect(
        [
          'background: url("data:image/png;base64,iVBORw0KGgo=")',
          '<image href="data:image/jpeg;base64,/9j/4A==" />',
          'mask: url(DATA:,x)',
          'the pages as data: where each is served',
        ].map(dataUrls),
      ).toEqual([['data:image/png'], ['data:image/jpeg'], ['DATA:,'], []]);
      const linted = yield* dataUrlLinted;
      expect(
        ['src/a/b.js', 'src/a/b.mjs', 'public/rogue.js', 'public/a/b.cjs', 'src/a.tsx'].map(linted),
      ).toEqual([true, true, true, true, true]);
      const read: Array<string> = [];
      const found: Array<readonly [string, ReadonlyArray<string>]> = [];
      for (const folder of SERVED_FOLDERS) {
        const entries = yield* fs.readDirectory(path.join(APP, folder), { recursive: true });
        for (const entry of entries.toSorted()) {
          const file = `${folder}/${entry.split(path.sep).join('/')}`;
          if (TEST.test(file) || linted(file)) continue;
          if ((yield* fs.stat(path.join(APP, file))).type !== 'File') continue;
          const text = textOf(yield* fs.readFile(path.join(APP, file)));
          if (Option.isNone(text)) continue;
          read.push(file);
          const urls = dataUrls(text.value);
          if (urls.length > 0) found.push([file, urls]);
        }
      }
      expect(read).toEqual(
        expect.arrayContaining(['src/styles.css', 'src/art/emblem-remedies.svg']),
      );
      expect(found).toEqual([]);
    }));
});
