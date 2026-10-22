/**
 * The build walk: every image of the built site, read from its bytes. After
 * `bun run build` (`buildSite`), each file under `dist/` is an image when its
 * first bytes are one (`formatOf`), whatever its name, its extension or its
 * folder: JPEG, PNG and APNG, GIF, WebP, AVIF and HEIF (any ISO media file,
 * by its `ftyp` box, so a video of that family counts too), JPEG XL, BMP,
 * ICO and CUR, TIFF, JPEG 2000, and SVG by its root element in any encoding
 * XML allows (UTF-16 either end first, and any other by its bytes, as its
 * markup is ASCII). A gzipped file is read by what it
 * unzips to. A file named as an image (`IMAGE`) that no signature reads is
 * an image of format `unknown`, so a form the walk does not know is refused,
 * not passed. A file that is no image but holds a data URL in any reading of
 * its bytes (an HTML page, a stylesheet, a script, gzipped or not) is an
 * image of format `data url`: an image inside another file has no bytes of
 * its own the walk can hash, so it is refused whatever it holds. Reading
 * the sources cannot list what the build emits, as each
 * reader holds only the forms its author thought of; the bytes the build
 * wrote are what the site serves.
 */
import { createHash } from 'node:crypto';

import { Effect, FileSystem, Option, Path, Schema, Stream } from 'effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';

import { IMAGE } from './served.ts';

/** The image formats the walk reads, by their bytes; `unknown` is a file named as an image whose bytes no signature reads, `data url` a file that holds a data URL. */
export const Format = Schema.Literals([
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
  'unknown',
  'data url',
]);
export type Format = typeof Format.Type;

/** Whether `bytes` hold `expected` from `at`. */
const holds = (bytes: Uint8Array, at: number, expected: ReadonlyArray<number>) =>
  bytes.length >= at + expected.length && expected.every((byte, i) => bytes[at + i] === byte);

/** Whether `bytes` hold the ASCII `text` from `at`. */
const says = (bytes: Uint8Array, at: number, text: string) =>
  holds(
    bytes,
    at,
    Array.from(text, (character) => character.charCodeAt(0)),
  );

const u16 = (bytes: Uint8Array, at: number) => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
const u32 = (bytes: Uint8Array, at: number) => u16(bytes, at) + u16(bytes, at + 2) * 0x10000;

/** The sizes of a BMP's DIB header, one per version of it. */
const DIB = new Set([12, 16, 40, 52, 56, 64, 108, 124]);

/** The XML a file may open with before its root element: a declaration, a processing instruction, a comment, a doctype (with its internal subset), white space. */
const PROLOG = /^(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE(?:[^[>]|\[[\s\S]*?\])*>)*/i;

/** The root element of an SVG, with a namespace prefix or none. */
const SVG_ROOT = /^<(?:[\w.-]+:)?svg[\s/>]/i;

const UTF16LE = new TextDecoder('utf-16le');
const UTF16BE = new TextDecoder('utf-16be');
/** Each byte as one character: the markup the root test reads is ASCII, so any encoding XML allows that keeps ASCII as its bytes (UTF-8, ISO-8859-1 and the like) reads the same through it. */
const BYTES = new TextDecoder('latin1');

/**
 * The readings of the bytes as XML text: UTF-16 little and big end first (a
 * byte order mark dropped), and each byte as one character, past a UTF-8
 * byte order mark. All three are read, a mark or none, so a file is an SVG
 * when any reading of it opens with an `svg` root: the walk errs toward an
 * image.
 */
const readings = (bytes: Uint8Array) => [
  UTF16LE.decode(bytes),
  UTF16BE.decode(bytes),
  BYTES.decode(bytes.subarray(Number(holds(bytes, 0, [0xef, 0xbb, 0xbf])) * 3)),
];

/** Whether the bytes are a text file whose root element is `svg`, in any reading of them. */
const isSvg = (bytes: Uint8Array) =>
  readings(bytes).some((text) => SVG_ROOT.test(text.replace(/^\ufeff/, '').replace(PROLOG, '')));

const SIGNATURES: ReadonlyArray<readonly [Format, (bytes: Uint8Array) => boolean]> = [
  ['jpeg', (bytes) => holds(bytes, 0, [0xff, 0xd8, 0xff])],
  ['png', (bytes) => holds(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ['gif', (bytes) => says(bytes, 0, 'GIF87a') || says(bytes, 0, 'GIF89a')],
  ['webp', (bytes) => says(bytes, 0, 'RIFF') && says(bytes, 8, 'WEBP')],
  ['avif/heif', (bytes) => says(bytes, 4, 'ftyp')],
  [
    'jpeg xl',
    (bytes) =>
      holds(bytes, 0, [0xff, 0x0a]) ||
      holds(bytes, 0, [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]),
  ],
  ['bmp', (bytes) => says(bytes, 0, 'BM') && bytes.length >= 18 && DIB.has(u32(bytes, 14))],
  [
    'ico/cur',
    (bytes) =>
      (holds(bytes, 0, [0, 0, 1, 0]) || holds(bytes, 0, [0, 0, 2, 0])) &&
      bytes.length >= 6 &&
      u16(bytes, 4) > 0,
  ],
  [
    'tiff',
    (bytes) => holds(bytes, 0, [0x49, 0x49, 0x2a, 0]) || holds(bytes, 0, [0x4d, 0x4d, 0, 0x2a]),
  ],
  [
    'jpeg 2000',
    (bytes) =>
      holds(bytes, 0, [0, 0, 0, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a]) ||
      holds(bytes, 0, [0xff, 0x4f, 0xff, 0x51]),
  ],
  ['svg', isSvg],
];

const gunzipped = Option.liftThrowable((bytes: Uint8Array) =>
  Bun.gunzipSync(new Uint8Array(bytes)),
);

/** The image format the bytes are, read from their first bytes (a gzipped file by what it unzips to), or none. */
export const formatOf = (bytes: Uint8Array): Option.Option<Format> => {
  const found = Option.fromUndefinedOr(SIGNATURES.find(([, is]) => is(bytes))).pipe(
    Option.map(([format]) => format),
  );
  if (Option.isSome(found) || !holds(bytes, 0, [0x1f, 0x8b])) return found;
  return gunzipped(bytes).pipe(
    Option.filter((inner) => !holds(inner, 0, [0x1f, 0x8b])),
    Option.flatMap(formatOf),
  );
};

/**
 * A data URL's opening, in any case: the scheme, then a media type of a
 * registered top-level type, `;` or `,`. A minified script's `{data:n/2}`
 * is no data URL.
 */
export const DATA_URL =
  /\bdata:(?:(?:image|text|application|font|audio|video|model|multipart|message)\/[\w.+-]+|[;,])/iu;

/** Whether any reading of the bytes (a gzipped file's by what it unzips to too) holds a data URL. */
const holdsDataUrl = (bytes: Uint8Array): boolean =>
  readings(bytes).some((text) => DATA_URL.test(text)) ||
  Option.exists(
    Option.filter(gunzipped(bytes), () => holds(bytes, 0, [0x1f, 0x8b])),
    holdsDataUrl,
  );

/** The SHA-256 of bytes, in hex. */
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** An image of the built site: its path from `dist/`, its format, and the SHA-256 of its bytes. */
export interface BuiltImage {
  readonly file: string;
  readonly format: Format;
  readonly hash: string;
}

/** Every image under `dist`, by its bytes, sorted by path. */
export const builtImages = Effect.fn('BuildWalk.images')(function* (dist: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = (yield* fs.readDirectory(dist, { recursive: true })).toSorted();
  const found = yield* Effect.forEach(
    entries,
    (entry) =>
      Effect.gen(function* () {
        const full = path.join(dist, entry);
        if ((yield* fs.stat(full)).type !== 'File') return Option.none<BuiltImage>();
        const bytes = yield* fs.readFile(full);
        const file = entry.split(path.sep).join('/');
        const format = formatOf(bytes).pipe(
          Option.orElse(() =>
            Option.some<Format>('data url').pipe(Option.filter(() => holdsDataUrl(bytes))),
          ),
          Option.orElse(() =>
            Option.some<Format>('unknown').pipe(Option.filter(() => IMAGE.test(file))),
          ),
        );
        return Option.map(format, (format) => ({ file, format, hash: sha256(bytes) }));
      }),
    { concurrency: 16 },
  );
  return found.filter(Option.isSome).map(({ value }) => value);
});

/** The build did not finish. */
export class BuildFailed extends Schema.TaggedError<BuildFailed>()('BuildFailed', {
  app: Schema.String,
  code: Schema.Finite,
  output: Schema.String,
}) {
  override get message() {
    return `bun run build in ${this.app} exited ${this.code}:\n${this.output}`;
  }
}

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/** `bun run build` in `app`, as the prod deploy builds the site; refused with the build's last lines when it fails. */
export const buildSite = Effect.fn('BuildWalk.build')(function* (app: string) {
  const spawner = yield* ChildProcessSpawner;
  const child = yield* spawner.spawn(
    ChildProcess.make('bun', ['run', 'build'], { cwd: app, forceKillAfter: '5 seconds' }),
  );
  const [stdout, stderr, code] = yield* Effect.all(
    [text(child.stdout), text(child.stderr), child.exitCode],
    { concurrency: 3 },
  );
  if (Number(code) === 0) return;
  const output = `${stdout}${stderr}`.split('\n').slice(-30).join('\n');
  return yield* BuildFailed.make({ app, code: Number(code), output });
}, Effect.scoped);
