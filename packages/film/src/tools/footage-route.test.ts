// The footage route names only a copy the footage library's lock lists, made
// and on disk, and answers it by range; and the lock, and a transcript it
// names, for a talk's page: on a library and outputs folder made here.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import {
  EMPTY_FOOTAGE_LOCK,
  FOOTAGE_LOCK_HREF,
  type FootageEntry,
  FootageLockJson,
  transcriptHref,
} from '../core/footage.ts';
import { type FootageRoot, footageHandler, isFootageUrl } from './footage-route.ts';

const SHA = '0123456789ab'.padEnd(64, 'c');

const ENTRY: FootageEntry = {
  kind: 'take',
  sha256: SHA,
  bytes: 10,
  ext: '.mov',
  probe: {
    container: 'mp4',
    duration: 1,
    picture: {
      codec: 'hevc',
      width: 1080,
      height: 1920,
      rotation: 0,
      fps: 30,
      variable: false,
      start: 0,
    },
  },
};

/** The copy's bytes, so a range of them is known. */
const BYTES = 'abcdefghijklmnopqrstuvwxyz';

/**
 * A library listing `take.why` (its mezzanine made, its proxy not) and an
 * outputs folder holding a copy no lock lists (`stray`), and a file beside
 * the library.
 */
const library = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: 'footage-route-' });
  const dir = path.join(root, 'footage');
  const out = path.join(root, 'out');
  yield* fs.makeDirectory(dir, { recursive: true });
  const lock = { ...EMPTY_FOOTAGE_LOCK, footage: { 'take.why': ENTRY } };
  yield* fs.writeFileString(
    path.join(dir, 'library.lock.json'),
    yield* Schema.encodeEffect(FootageLockJson)(lock),
  );
  for (const name of ['take.why', 'stray']) {
    const at = path.join(out, 'footage', name, SHA.slice(0, 12));
    yield* fs.makeDirectory(at, { recursive: true });
    yield* fs.writeFileString(path.join(at, 'mezzanine.mp4'), BYTES);
    yield* fs.writeFileString(path.join(at, 'stamp.json'), '{}');
  }
  yield* fs.writeFileString(path.join(root, 'secret.mp4'), BYTES);
  return { dir, out };
});

describe('the footage route', () => {
  it.live(
    "serves only a listed source's made copy: no other name, hash or file, no path, no dotfile",
    () =>
      Effect.gen(function* () {
        const root = yield* library;
        const sha12 = SHA.slice(0, 12);
        /** Whether the route served `url` from `at`, and with its copy's bytes. */
        const servedFrom = (at: FootageRoot) => (url: string) =>
          Effect.gen(function* () {
            const response = yield* Effect.promise(() =>
              footageHandler(at)(new Request(`http://player${url}`)),
            );
            const body = yield* Effect.promise(() => response.text());
            return [url, response.status === 200 && body === BYTES] as const;
          });
        const served = servedFrom(root);
        const urls = [
          `/footage/take.why/${sha12}/mezzanine.mp4`,
          `/footage/take.why/${sha12}/proxy.mp4`,
          `/footage/take.why/${sha12}/stamp.json`,
          `/footage/take.why/${'f'.repeat(12)}/mezzanine.mp4`,
          `/footage/stray/${sha12}/mezzanine.mp4`,
          `/footage/../secret.mp4`,
          `/footage/take.why/${sha12}/../../../secret.mp4`,
          `/footage/%2e%2e/${sha12}/mezzanine.mp4`,
          `/footage/.take/${sha12}/mezzanine.mp4`,
          `/footage/take.why/${sha12}/mezzanine.mp4/`,
          // A footage name every object answers to, which the lock does not list.
          `/footage/constructor/${sha12}/mezzanine.mp4`,
        ];
        expect(yield* Effect.forEach(urls, served)).toEqual(urls.map((url, i) => [url, i === 0]));
        expect(urls.map(isFootageUrl)).toEqual(urls.map(() => true));
        expect(isFootageUrl('/films/f/narration/full.wav')).toBe(false);
        // Each answered, as a page asks: every URL not served is a 404, never a failure of the route's.
        const handler = footageHandler(root);
        const statuses = yield* Effect.forEach(urls, (url) =>
          Effect.map(
            Effect.promise(() => handler(new Request(`http://player${url}`))),
            (response) => [url, response.status] as const,
          ),
        );
        const status = (i: number) =>
          Option.match(
            Option.liftPredicate(i, (k) => k === 0),
            {
              onNone: () => 404,
              onSome: () => 200,
            },
          );
        expect(statuses).toEqual(urls.map((url, i) => [url, status(i)] as const));
        // A library with no lock yet serves nothing.
        const copy = `/footage/take.why/${sha12}/mezzanine.mp4`;
        const unlisted = servedFrom({ ...root, dir: `${root.dir}/none` });
        expect(yield* unlisted(copy)).toEqual([copy, false]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.live(
    "serves the library's lock, and a transcript only when the lock names it: never another file under the library",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* library;
        const named = 'take.why.0123456789ab.json';
        const lock = {
          ...EMPTY_FOOTAGE_LOCK,
          footage: { 'take.why': { ...ENTRY, transcript: named } },
        };
        const lockText = yield* Schema.encodeEffect(FootageLockJson)(lock);
        yield* fs.writeFileString(path.join(root.dir, 'library.lock.json'), lockText);
        yield* fs.makeDirectory(path.join(root.dir, 'transcripts'));
        for (const file of [named, 'take.why.0123456789ab.2.json'])
          yield* fs.writeFileString(path.join(root.dir, 'transcripts', file), `{"file":"${file}"}`);
        yield* fs.makeDirectory(path.join(root.dir, 'files'));
        yield* fs.writeFileString(path.join(root.dir, 'files', 'secret.json'), BYTES);
        const handler = footageHandler(root);
        const answer = (url: string) =>
          Effect.gen(function* () {
            const response = yield* Effect.promise(() =>
              handler(new Request(`http://player${url}`)),
            );
            return [response.status, yield* Effect.promise(() => response.text())] as const;
          });
        expect(yield* answer(FOOTAGE_LOCK_HREF)).toEqual([200, lockText]);
        expect(yield* answer(transcriptHref(named))).toEqual([200, `{"file":"${named}"}`]);
        for (const url of [
          transcriptHref('take.why.0123456789ab.2.json'),
          '/footage/transcripts/..%2ffiles%2fsecret.json',
          '/footage/transcripts/%2e%2e%2ffiles%2fsecret.json',
          '/footage/transcripts/../files/secret.json',
          '/footage/files/secret.json',
          '/footage/transcripts/',
        ])
          expect([url, (yield* answer(url))[0]]).toEqual([url, 404]);
        // A library with no lock yet answers none.
        const bare = footageHandler({ ...root, dir: `${root.dir}/none` });
        const none = yield* Effect.promise(() =>
          bare(new Request(`http://player${FOOTAGE_LOCK_HREF}`)),
        );
        expect(none.status).toBe(404);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.live('answers a copy whole or by the range asked, and anything else with a 404', () =>
    Effect.gen(function* () {
      const root = yield* library;
      const handler = footageHandler(root);
      const url = `http://player/footage/take.why/${SHA.slice(0, 12)}/mezzanine.mp4`;
      const whole = yield* Effect.promise(() => handler(new Request(url)));
      expect(whole.status).toBe(200);
      expect(yield* Effect.promise(() => whole.text())).toBe(BYTES);
      const part = yield* Effect.promise(() =>
        handler(new Request(url, { headers: { range: 'bytes=2-5' } })),
      );
      expect(part.status).toBe(206);
      expect(part.headers.get('content-range')).toBe(`bytes 2-5/${BYTES.length}`);
      expect(yield* Effect.promise(() => part.text())).toBe('cdef');
      const missing = yield* Effect.promise(() =>
        handler(new Request(url.replace('mezzanine', 'proxy'))),
      );
      expect(missing.status).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
