// The series drafts over memory: listed by series and title, read with the
// reader's codec, a beat's marks written into its Markdown and no other
// byte, and no path outside the folder's own drafts.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Layer, Option, Path } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import { SeriesDrafts } from './series-drafts.ts';
import { memoryFileSystem, storeLayer } from './testing.ts';

const TALK = [
  '# By Grace: script',
  '',
  '| #        | Say                   | Picture |',
  '| -------- | --------------------- | ------- |',
  '| 1 · Hook | By {*}grace. {/} Now. | A card. |',
  '',
].join('\n');

const FILM = [
  '# Milk and Meat',
  '',
  '### `cold` · STORY',
  '',
  '**say:** A baby drinks {*}milk.',
  '',
].join('\n');

const text = (s: string) => new TextEncoder().encode(s);

/** The drafts under `/series`, over `files` in memory. */
const drafts = (files: Map<string, Uint8Array>, root = Option.some('/series')) =>
  SeriesDrafts.layer(root).pipe(
    Layer.provide([storeLayer(files), memoryFileSystem(files), Path.layer]),
  );

const seeded = () =>
  new Map([
    ['/series/talks/series.md', text('# Taught of the Lord: plan\n')],
    ['/series/talks/scripts/01-grace.md', text(TALK)],
    ['/series/talks/scripts/notes.txt', text('not a draft')],
    ['/series/films/scripts/01-milk.md', text(FILM)],
    ['/series/plans/series.md', text('# No drafts yet\n')],
    ['/series/README.md', text('# Series\n')],
  ]);

/** `files` in memory, but a folder the box may not read: `readDirectory` refused. */
const unreadable = (files: Map<string, Uint8Array>) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (fs) =>
      FileSystem.FileSystem.of({
        ...fs,
        readDirectory: (dir) =>
          Effect.fail(
            PlatformError.systemError({
              _tag: 'PermissionDenied',
              module: 'FileSystem',
              method: 'readDirectory',
              pathOrDescriptor: dir,
            }),
          ),
      }),
    ),
  ).pipe(Layer.provide(memoryFileSystem(files)));

describe('SeriesDrafts', () => {
  it.effect('lists each series with drafts by its plan’s title, each draft by its own', () => {
    const files = seeded();
    return Effect.gen(function* () {
      const list = yield* (yield* SeriesDrafts).list;
      expect(list).toEqual({
        series: [
          { name: 'films', title: 'films', drafts: [{ name: '01-milk', title: 'Milk and Meat' }] },
          {
            name: 'talks',
            title: 'Taught of the Lord',
            drafts: [{ name: '01-grace', title: 'By Grace' }],
          },
        ],
      });
    }).pipe(Effect.provide(drafts(files)));
  });

  it.effect('an app with no series folder lists none', () =>
    Effect.gen(function* () {
      expect(yield* (yield* SeriesDrafts).list).toEqual({ series: [] });
    }).pipe(Effect.provide(drafts(new Map(), Option.none()))),
  );

  it.effect('reads a draft the folder lists, and nothing it does not', () => {
    const files = seeded();
    return Effect.gen(function* () {
      const service = yield* SeriesDrafts;
      const read = yield* service.read('talks', '01-grace');
      expect(read.beats.map((b) => b.id)).toEqual(['1']);
      const reading = yield* service.reading('talks', '01-grace');
      expect(reading.beats.map((b) => b.text)).toEqual(['By grace. Now.']);
      const outside = yield* Effect.flip(service.read('talks', '../films/scripts/01-milk'));
      expect(outside._tag).toBe('DraftUnknown');
    }).pipe(Effect.provide(drafts(files)));
  });

  it.effect('writes a beat’s marks into its cell and changes no other byte', () => {
    const files = seeded();
    return Effect.gen(function* () {
      const service = yield* SeriesDrafts;
      const marks = [
        { _tag: 'Stress', word: 1 },
        { _tag: 'Hold', before: 2, seconds: 1.5 },
      ] as const;
      const read = yield* service.mark('talks', '01-grace', '1', marks);
      const written = new TextDecoder().decode(files.get('/series/talks/scripts/01-grace.md'));
      expect(written).toBe(TALK.replace('By {*}grace. {/} Now.', 'By {*}grace. {//1.5} Now.'));
      expect(read.markdown).toBe(written);
      const misfit = yield* Effect.flip(
        service.mark('talks', '01-grace', '1', [{ _tag: 'Stress', word: 9 }]),
      );
      expect(misfit._tag).toBe('SourceRefused');
      expect(new TextDecoder().decode(files.get('/series/talks/scripts/01-grace.md'))).toBe(
        written,
      );
    }).pipe(Effect.provide(drafts(files)));
  });
  it.effect('a folder the box may not read is said, never listed as no series', () => {
    const files = seeded();
    return Effect.gen(function* () {
      const error = yield* Effect.flip((yield* SeriesDrafts).list);
      expect(error.reason._tag).toBe('PermissionDenied');
    }).pipe(
      Effect.provide(
        SeriesDrafts.layer(Option.some('/series')).pipe(
          Layer.provide([storeLayer(files), unreadable(files), Path.layer]),
        ),
      ),
    );
  });
});
