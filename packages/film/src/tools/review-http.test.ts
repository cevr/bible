// The lab's review routes as a phone calls them: the index, a file answered
// in ranges (206, and 416 past its end), a frame, a length, a ref that leaves
// its root refused as unknown; and the hosts the lab answers to, the
// allowlist's beside loopback, a write from anywhere else refused.

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schedule, Schema } from 'effect';
import { ReviewDuration, ReviewIndex } from '../core/review.ts';
import { SetSayPost, labUrls, reviewFileUrl, reviewPhoneUrl, ServerFailed } from '../core/api.ts';
import { refFromUrl } from './review-http.ts';
import {
  ReviewTestRoot,
  reviewHttpFixture,
  reviewHttpFixtureLasting,
  reviewTestAsk,
  reviewTestBody,
  reviewTestGet,
  reviewTestPost,
  reviewTestRefusalOf,
  REVIEW_TEST_HOME,
} from './testing.ts';

describe('review routes', () => {
  test('reads a ref from a files URL, each segment decoded', () => {
    expect(refFromUrl('/api/review/files/out/a%20b/c.mp4?x=1', '/api/review/files/')).toEqual(
      Option.some('out/a b/c.mp4'),
    );
    expect(refFromUrl('/api/review/files/out/%E0%A4%A', '/api/review/files/')).toEqual(
      Option.none(),
    );
    expect(reviewFileUrl('out/a b/#1.mp4')).toBe('/api/review/files/out/a%20b/%231.mp4');
  });

  it.effect('answers the index, a length and a frame', () =>
    Effect.gen(function* () {
      const index = yield* reviewTestAsk(reviewTestGet(labUrls.review.index({ query: {} })));
      expect(index.status).toBe(200);
      const decoded = yield* Schema.decodeUnknownEffect(ReviewIndex)(
        yield* Effect.promise(() => index.json()),
      );
      expect(decoded.folders.map((f) => [f.ref, f.sets.map((s) => s.id)])).toEqual([
        ['out/art', ['render:roof']],
      ]);
      const length = yield* reviewTestAsk(
        reviewTestGet(labUrls.review.duration({ query: { ref: 'out/art/roof.A.mp4' } })),
      );
      expect(
        yield* Schema.decodeUnknownEffect(ReviewDuration)(
          yield* Effect.promise(() => length.json()),
        ),
      ).toEqual({ seconds: 12.5 });
      const frame = yield* reviewTestAsk(
        reviewTestGet(labUrls.review.frame({ query: { ref: 'out/art/roof.A.mp4', t: 2, w: 320 } })),
      );
      expect(frame.status).toBe(200);
      expect(frame.headers.get('content-type')).toBe('image/jpeg');
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect(
    'a frame is asked again on each load: its URL names the render, not its version, so a render rewritten in place shows its new frame',
    () =>
      Effect.gen(function* () {
        const url = labUrls.review.frame({ query: { ref: 'out/art/roof.A.mp4', t: 2, w: 320 } });
        const first = yield* reviewTestAsk(reviewTestGet(url));
        expect(first.headers.get('cache-control')).toBe('no-cache');
        const tag = first.headers.get('etag') ?? '';
        expect(tag).not.toBe('');
        expect(yield* reviewTestBody(first)).toBe('0123456789');
        expect((yield* reviewTestAsk(reviewTestGet(url, { 'if-none-match': tag }))).status).toBe(
          304,
        );
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const render = path.join(yield* ReviewTestRoot, 'out', 'art', 'roof.A.mp4');
        yield* fs.writeFileString(render, 'rendered again');
        // Its mtime moved on (2100-01-01, in seconds), as a render's is.
        yield* fs.utimes(render, 4_102_444_800, 4_102_444_800);
        const again = yield* reviewTestAsk(reviewTestGet(url, { 'if-none-match': tag }));
        expect(again.status).toBe(200);
        expect(yield* reviewTestBody(again)).toBe('rendered again');
      }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.live(
    'a phone copy is asked again on each load, as its render is: named by the render’s ref, with an ETag',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const art = path.join(yield* ReviewTestRoot, 'out', 'art');
        yield* fs.writeFileString(path.join(art, 'big.mp4'), 'abcde'.repeat(1000));
        yield* fs.writeFileString(path.join(art, 'review.json'), '{ "videos": ["big.mp4"] }');
        // The index finds the big video and queues its phone copy; it is there once made.
        yield* reviewTestAsk(reviewTestGet('/api/review/index?fresh'));
        const url = reviewPhoneUrl('out/art/big.mp4');
        const copy = yield* reviewTestAsk(reviewTestGet(url)).pipe(
          Effect.repeat({
            until: (response) => response.status === 200,
            schedule: Schedule.spaced('20 millis'),
          }),
          Effect.timeout('5 seconds'),
        );
        expect(copy.headers.get('cache-control')).toBe('no-cache');
        const tag = copy.headers.get('etag') ?? '';
        expect(tag).not.toBe('');
        expect((yield* reviewTestAsk(reviewTestGet(url, { 'if-none-match': tag }))).status).toBe(
          304,
        );
      }).pipe(Effect.scoped, Effect.provide(reviewHttpFixtureLasting(12.5, true))),
  );

  it.effect(
    'a length the lab cannot answer is its own failure (500), not the request’s (400)',
    () =>
      Effect.gen(function* () {
        const length = yield* reviewTestAsk(
          reviewTestGet(labUrls.review.duration({ query: { ref: 'out/art/roof.A.mp4' } })),
        );
        expect(length.status).toBe(500);
        const body = yield* Effect.promise(() => length.json());
        expect(yield* Schema.decodeUnknownEffect(ServerFailed)(body)).toMatchObject({
          tag: 'AnswerUnencoded',
        });
      }).pipe(Effect.scoped, Effect.provide(reviewHttpFixtureLasting(Number.NaN))),
  );

  it.effect(
    'serves an oversized declared download by range and keeps undeclared files and outside links private',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const art = path.join(yield* ReviewTestRoot, 'out', 'art');
        yield* fs.writeFileString(path.join(art, 'master.mp4'), 'abcdefghij'.repeat(1001));
        expect(
          (yield* reviewTestAsk(reviewTestGet(reviewFileUrl('out/art/master.mp4')))).status,
        ).toBe(404);
        yield* fs.symlink(
          path.join(yield* ReviewTestRoot, 'secret.mp4'),
          path.join(art, 'leak.mp4'),
        );
        yield* fs.writeFileString(
          path.join(art, 'review.json'),
          '{ "videos": ["master.mp4"], "downloads": ["master.mp4", "leak.mp4"] }',
        );
        const index = yield* reviewTestAsk(reviewTestGet('/api/review/index?fresh'));
        const decoded = yield* Schema.decodeUnknownEffect(ReviewIndex)(
          yield* Effect.promise(() => index.json()),
        );
        expect(decoded.folders[0]?.videos).toEqual([]);
        expect(decoded.folders[0]?.downloads?.map((file) => file.name)).toContain('master.mp4');
        const part = yield* reviewTestAsk(
          reviewTestGet(reviewFileUrl('out/art/master.mp4'), { range: 'bytes=2-5' }),
        );
        expect(part.status).toBe(206);
        expect(part.headers.get('content-range')).toBe('bytes 2-5/10010');
        expect(yield* reviewTestBody(part)).toBe('cdef');
        expect(
          (yield* reviewTestAsk(reviewTestGet(reviewFileUrl('out/art/leak.mp4')))).status,
        ).toBe(404);
        expect(
          (yield* reviewTestAsk(reviewTestGet(reviewPhoneUrl('out/art/master.mp4')))).status,
        ).toBe(404);
      }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect('serves a file whole, a range of it as 206, and past its end as 416', () =>
    Effect.gen(function* () {
      const whole = yield* reviewTestAsk(reviewTestGet(reviewFileUrl('out/art/roof.B.mp4')));
      expect(whole.status).toBe(200);
      expect(whole.headers.get('accept-ranges')).toBe('bytes');
      expect(whole.headers.get('content-type')).toBe('video/mp4');
      expect(yield* reviewTestBody(whole)).toBe('abcdefghij');
      const part = yield* reviewTestAsk(
        reviewTestGet(reviewFileUrl('out/art/roof.B.mp4'), { range: 'bytes=2-5' }),
      );
      expect(part.status).toBe(206);
      expect(part.headers.get('content-range')).toBe('bytes 2-5/10');
      expect(yield* reviewTestBody(part)).toBe('cdef');
      const past = yield* reviewTestAsk(
        reviewTestGet(reviewFileUrl('out/art/roof.B.mp4'), { range: 'bytes=20-' }),
      );
      expect(past.status).toBe(416);
      const captions = yield* reviewTestAsk(reviewTestGet(reviewFileUrl('out/art/roof.vtt')));
      expect(captions.headers.get('content-type')).toBe('text/vtt; charset=utf-8');
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect(
    'a ref out of its root, naming nothing or nothing listed, is a 404; a phone copy not made yet too',
    () =>
      Effect.gen(function* () {
        for (const path of [
          '/api/review/files/out/../secret.mp4',
          '/api/review/files/out/%2E%2E/secret.mp4',
          reviewFileUrl('out/art/none.mp4'),
          reviewFileUrl('out/art/review.json'),
          reviewFileUrl('elsewhere/x.mp4'),
          reviewPhoneUrl('out/art/roof.A.mp4'),
          '/api/review/duration?ref=out/../secret.mp4',
        ])
          expect([path, (yield* reviewTestAsk(reviewTestGet(path))).status]).toEqual([path, 404]);
        expect((yield* reviewTestAsk(reviewTestGet('/api/review/frame'))).status).toBe(400);
      }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect("takes a say on a set's version by the folder's ref, each `/` written %2F", () =>
    Effect.gen(function* () {
      const sayOn = (folder: string) =>
        reviewTestAsk(
          reviewTestPost(
            `/api/review/sets/${encodeURIComponent(folder)}/render:roof/say`,
            Schema.encodeSync(Schema.fromJsonString(SetSayPost))({
              variant: 'A',
              say: { _tag: 'Approve' },
            }),
            REVIEW_TEST_HOME,
          ),
        );
      // The montage is reached by its ref, and keeps no say.
      const montage = yield* sayOn('out/art');
      expect(montage.status).toBe(409);
      const refusal = reviewTestRefusalOf(yield* reviewTestBody(montage));
      expect(refusal._tag).toBe('VerbRefused');
      expect(refusal.message).toContain('montage');
      expect((yield* sayOn('out/none')).status).toBe(404);
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect('answers the allowlist and loopback, and no other host or site', () =>
    Effect.gen(function* () {
      const through = yield* reviewTestAsk(
        reviewTestGet(labUrls.review.index({ query: {} }), { host: 'box.example:8229' }),
      );
      expect(through.status).toBe(200);
      const local = yield* reviewTestAsk(
        reviewTestGet(labUrls.review.index({ query: {} }), { host: 'localhost:8229' }),
      );
      expect(local.status).toBe(200);
      const rebound = yield* reviewTestAsk(
        reviewTestGet(labUrls.review.index({ query: {} }), { host: 'evil.example:8229' }),
      );
      expect(rebound.status).toBe(403);
      const cross = yield* reviewTestAsk(
        reviewTestGet(labUrls.review.index({ query: {} }), {
          host: 'box.example:8229',
          'sec-fetch-site': 'cross-site',
        }),
      );
      expect(cross.status).toBe(403);
      const write = (origin: string) =>
        new Request(`http://127.0.0.1:8229${labUrls.review.index({ query: {} })}`, {
          method: 'POST',
          headers: { host: 'box.example:8229', origin, 'content-type': 'application/json' },
          body: '{}',
        });
      expect((yield* reviewTestAsk(write('https://box.example:8229'))).status).toBe(404);
      expect((yield* reviewTestAsk(write('https://evil.example'))).status).toBe(403);
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );

  it.effect("passes the app's page the rest, behind the same hosts", () =>
    Effect.gen(function* () {
      for (const path of ['/', '/chunk-a1.js', '/films/tiny/narration/s1.mp3']) {
        const own = yield* reviewTestAsk(reviewTestGet(path, { host: 'box.example:8229' }));
        expect([path, own.status, yield* reviewTestBody(own)]).toEqual([path, 200, `page ${path}`]);
        const rebound = yield* reviewTestAsk(reviewTestGet(path, { host: 'evil.example:8229' }));
        expect([path, rebound.status]).toEqual([path, 403]);
      }
    }).pipe(Effect.scoped, Effect.provide(reviewHttpFixture)),
  );
});
