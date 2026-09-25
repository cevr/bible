// Render a film frame by frame in headless Chromium. Every frame is a pure
// function of time, so pages render any chunk in any order: a video splits
// into chunks on a queue that idle pages pull from, each chunk piped into its
// own ffmpeg segment, then the segments join in order with the audio cut from
// the lossless master. The server, the browser, every page and every ffmpeg
// child live in one scope: a failure, or Ctrl-C, closes them all.

import {
  Array as Arr,
  Clock,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Pool,
  Ref,
  Stream,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { filmCaptions, webVtt } from '../core/captions.ts';
import type { ExportInfo } from '../core/schema.ts';
import { Browser, type FramePage, type PageOpenError } from './browser.ts';
import {
  AudioNotMuxed,
  type AudioMissing,
  type AudioStale,
  type FfmpegFailed,
  type FfmpegMissing,
  type FrameFailed,
  type LayoutInvalid,
  type PageCrashed,
  type PageError,
  RangeEmpty,
} from './errors.ts';
import { Ffmpeg } from './ffmpeg.ts';
import { type LoadedFilm, placeFilm } from './film-repo.ts';
import { masterFile, masterFinding, measureMaster } from './mixer.ts';
import { PreviewServer } from './preview-server.ts';
import {
  type AudioCut,
  type Chunk,
  RenderJob,
  concatList,
  contactArgs,
  contactName,
  contactTimes,
  frameAt,
  frameSpan,
  muxArgs,
  planChunks,
  segmentArgs,
  segmentName,
  stillName,
} from './render-plan.ts';

/** Progress is logged every this many frames. */
const PROGRESS_EVERY = 60;

export type RenderError =
  | PageOpenError
  | PageError
  | PageCrashed
  | FrameFailed
  | FfmpegFailed
  | FfmpegMissing
  | AudioMissing
  | AudioStale
  | AudioNotMuxed
  | RangeEmpty
  | LayoutInvalid
  | PlatformError;

export interface RendererService {
  readonly render: (film: LoadedFilm, job: RenderJob) => Effect.Effect<void, RenderError>;
}

export class Renderer extends Context.Service<Renderer, RendererService>()(
  '@bible/film/tools/Renderer',
) {
  static readonly layer = Layer.effect(
    Renderer,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const ffmpeg = yield* Ffmpeg;
      const browser = yield* Browser;
      const server = yield* PreviewServer;

      const fresh = (dir: string) =>
        fs
          .remove(dir, { recursive: true, force: true })
          .pipe(Effect.andThen(fs.makeDirectory(dir, { recursive: true })));

      const video = Effect.fnUntraced(function* (
        film: LoadedFilm,
        job: Extract<RenderJob, { _tag: 'Video' }>,
        pool: Pool.Pool<FramePage, PageOpenError>,
        info: ExportInfo,
        dir: string,
      ) {
        const { start, end } = frameSpan(info, job.from, job.to);
        if (end <= start)
          return yield* RangeEmpty.make({ from: start / info.fps, to: end / info.fps });
        const total = end - start;
        const target = Option.getOrElse(job.out, () => `${film.paths.out}.mp4`);

        // The film declares its track only once every take is recorded. Before
        // a frame is drawn, its master must be there and cover the whole film
        // to within a frame: a mix cut short would otherwise mux silence.
        const audio: Option.Option<AudioCut> = Option.map(Option.fromNullishOr(info.audio), () => ({
          file: masterFile(film.paths),
          start: start / info.fps,
          duration: total / info.fps,
        }));
        if (Option.isSome(audio)) {
          const length = yield* measureMaster(fs, ffmpeg, audio.value.file);
          const finding = masterFinding(audio.value.file, length, info.duration, 1 / info.fps);
          if (Option.isSome(finding)) return yield* finding.value;
        }

        const segDir = path.join(dir, 'segments');
        yield* fresh(segDir);
        const chunks = planChunks(start, end, job.workers);
        const began = yield* Clock.currentTimeMillis;
        const done = yield* Ref.make(0);
        const tick = Effect.gen(function* () {
          const n = yield* Ref.updateAndGet(done, (k) => k + 1);
          if (n % PROGRESS_EVERY !== 0) return;
          const secs = ((yield* Clock.currentTimeMillis) - began) / 1000;
          const rate = n / secs;
          yield* Effect.log(
            `render.progress frames=${n}/${total} fps=${rate.toFixed(1)} eta=${((total - n) / rate).toFixed(0)}s`,
          );
        });

        /**
         * One chunk's frames, drawn on whichever page is free. The page goes back
         * to the pool as soon as the last frame is drawn, while ffmpeg is still
         * flushing, so the next chunk starts at once; a crashed page is dropped.
         */
        const frames = (chunk: Chunk) =>
          Stream.unwrap(
            Effect.map(Pool.get(pool), (page) =>
              Stream.range(chunk.from, chunk.to - 1).pipe(
                Stream.mapEffect((i) =>
                  page
                    .frame(i, 'image/png')
                    .pipe(Effect.tapErrorTag('PageCrashed', () => Pool.invalidate(pool, page))),
                ),
              ),
            ),
          ).pipe(
            Stream.tap(() => tick),
            // The page draws the next frame while ffmpeg drains this one.
            Stream.buffer({ capacity: 2 }),
          );

        /** One chunk to its own segment, retried once on a fresh page if its page crashes. */
        const encode = (chunk: Chunk) => {
          const file = path.join(segDir, segmentName(chunk));
          return ffmpeg.encode(segmentArgs(info.fps, job.scale, file), frames(chunk)).pipe(
            Effect.tapErrorTag('PageCrashed', (error) =>
              Effect.logWarning(`render.retry chunk=${chunk.index} reason="${error.reason}"`),
            ),
            Effect.retry({ times: 1, while: (error) => error._tag === 'PageCrashed' }),
            Effect.as(file),
          );
        };

        // Twice as many chunks in flight as pages: while one chunk's ffmpeg
        // flushes, the next is already drawing on the page it freed.
        const segments = yield* Effect.forEach(chunks, encode, { concurrency: job.workers * 2 });
        const list = path.join(segDir, 'list.txt');
        yield* fs.writeFileString(list, concatList(segments));
        yield* ffmpeg.run(muxArgs(list, audio, target));
        if (Option.isSome(audio) && !(yield* ffmpeg.probeStreams(target)).includes('audio'))
          return yield* AudioNotMuxed.make({ file: target });

        const placed = yield* placeFilm(film);
        const captions = `${target.replace(/\.[^./]+$/, '')}.vtt`;
        const range = { from: start / info.fps, to: end / info.fps };
        yield* fs.writeFileString(captions, webVtt(filmCaptions(placed, range)));

        const secs = ((yield* Clock.currentTimeMillis) - began) / 1000;
        yield* Effect.log(
          `render.done frames=${total} chunks=${chunks.length} audio=${Option.isSome(audio)} secs=${secs.toFixed(1)} fps=${(total / secs).toFixed(1)} file=${target} captions=${captions}`,
        );
      });

      const stills = Effect.fnUntraced(function* (
        job: Extract<RenderJob, { _tag: 'Stills' }>,
        pool: Pool.Pool<FramePage, PageOpenError>,
        info: ExportInfo,
        dir: string,
      ) {
        const stillDir = path.join(dir, 'stills');
        yield* fs.makeDirectory(stillDir, { recursive: true });
        yield* Effect.forEach(
          job.times,
          (t) =>
            Effect.scoped(
              Effect.gen(function* () {
                const page = yield* Pool.get(pool);
                const file = path.join(stillDir, stillName(t));
                yield* fs.writeFile(file, yield* page.frame(frameAt(info, t), 'image/png'));
                yield* Effect.log(`render.still t=${t} file=${file}`);
              }),
            ),
          { concurrency: job.workers, discard: true },
        );
      });

      const contact = Effect.fnUntraced(function* (
        job: Extract<RenderJob, { _tag: 'Contact' }>,
        pool: Pool.Pool<FramePage, PageOpenError>,
        info: ExportInfo,
        dir: string,
      ) {
        const frameDir = path.join(dir, 'contact');
        yield* fresh(frameDir);
        const from = Option.getOrElse(job.from, () => 0);
        const to = Option.getOrElse(job.to, () => info.duration);
        const times = contactTimes(from, to, job.every);
        yield* Effect.forEach(
          times,
          (t, k) =>
            Effect.scoped(
              Effect.gen(function* () {
                const page = yield* Pool.get(pool);
                const bytes = yield* page.frame(frameAt(info, t), 'image/jpeg');
                yield* fs.writeFile(path.join(frameDir, contactName(k)), bytes);
              }),
            ),
          { concurrency: job.workers, discard: true },
        );
        const sheet = path.join(dir, 'contact.jpg');
        yield* ffmpeg.run(contactArgs(path.join(frameDir, '%04d.jpg'), times.length, sheet));
        yield* Effect.log(
          `render.contact frames=${times.length} every=${job.every}s file=${sheet}`,
        );
      });

      const render = Effect.fn('Renderer.render')(function* (film: LoadedFilm, job: RenderJob) {
        // Before a page opens: a missing ffmpeg would otherwise surface only at the first chunk.
        yield* ffmpeg.version;
        const query = [
          `film=${encodeURIComponent(film.paths.name)}`,
          'export',
          ...Arr.filter(['captions=0'], () => !job.captions),
        ];
        const url = `${server.url}?${query.join('&')}`;
        const dir = path.join(film.paths.out, job.tag);
        yield* fs.makeDirectory(dir, { recursive: true });
        const pages = RenderJob.$match(job, {
          Video: (v) => v.workers,
          Stills: (s) => Math.min(s.workers, s.times.length),
          Contact: (c) => c.workers,
        });
        yield* Effect.scoped(
          Effect.gen(function* () {
            const pool = yield* Pool.make({ acquire: browser.open(url), size: Math.max(1, pages) });
            const info = yield* Effect.scoped(Effect.map(Pool.get(pool), (page) => page.info));
            yield* RenderJob.$match(job, {
              Video: (v) => video(film, v, pool, info, dir),
              Stills: (s) => stills(s, pool, info, dir),
              Contact: (c) => contact(c, pool, info, dir),
            });
          }),
        );
      });

      return Renderer.of({ render });
    }),
  );
}
