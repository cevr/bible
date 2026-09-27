// Render a film frame by frame in headless Chromium: the film's Rive project
// built to a .riv, and the Film drawn by the Rive runtime in the film's page.
// Every frame is a pure function of time, so pages render any chunk in any order: a video splits
// into chunks on a queue that idle pages pull from, each page drawing and
// encoding its chunk to its own H.264 segment, then the segments join in
// order (copied, not re-encoded) with the audio cut from the lossless master
// and encoded to AAC. The server, the browser and every page live in one
// scope: a failure, or Ctrl-C, closes them all.

import { Clock, Context, Effect, FileSystem, Layer, Option, Path, Pool, Ref } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { slice } from '../core/audio.ts';
import { filmCaptions, webVtt } from '../core/captions.ts';
import { FILM_FPS } from '../core/film-board.ts';
import { type Placed, everyTakeRecorded } from '../core/layout.ts';
import { filmEnd } from '../core/sound.ts';
import type { ExportInfo } from '../core/schema.ts';
import { Browser, type FramePage, type PageOpenError } from './browser.ts';
import {
  type AudioMissing,
  type AudioStale,
  type ContactFailed,
  type EncodeFailed,
  type EncoderMissing,
  type FrameFailed,
  type LayoutInvalid,
  type MediaFailed,
  type PageCrashed,
  type PageError,
  RangeEmpty,
  type ServeFailed,
} from './errors.ts';
import { type LoadedFilm, placeFilm } from './film-repo.ts';
import { Media } from './media.ts';
import { masterFile, masterFinding, measureMaster } from './master.ts';
import { PageServer } from './page-server.ts';
import { type BuildError, FilmProject } from './project.ts';
import {
  type AudioCut,
  type Chunk,
  RenderJob,
  contactSheetName,
  contactTimes,
  frameAt,
  frameSpan,
  planChunks,
  segmentName,
  shareName,
  stillName,
} from './render-plan.ts';

/** The Film's length, as its timeline holds it: the film's end, to Rive's frame. */
const filmSeconds = (placed: ReadonlyArray<Placed>): number =>
  Math.round(filmEnd(placed) * FILM_FPS) / FILM_FPS;

export type RenderError =
  | PageOpenError
  | PageError
  | PageCrashed
  | FrameFailed
  | ContactFailed
  | EncoderMissing
  | EncodeFailed
  | MediaFailed
  | AudioMissing
  | AudioStale
  | RangeEmpty
  | LayoutInvalid
  | BuildError
  | ServeFailed
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
      const media = yield* Media;
      const browser = yield* Browser;
      const server = yield* PageServer;
      const project = yield* FilmProject;

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
        placed: ReadonlyArray<Placed>,
      ) {
        const { start, end } = frameSpan(info, job.from, job.to);
        if (end <= start)
          return yield* RangeEmpty.make({ from: start / info.fps, to: end / info.fps });
        const total = end - start;
        const target = Option.getOrElse(job.out, () => `${film.paths.out}.mp4`);

        // The film has a track once every take is recorded. Before a frame is
        // drawn, its master must be there and cover the whole film to within a
        // frame: a mix cut short would otherwise mux silence.
        const audio: Option.Option<AudioCut> = Option.liftPredicate(
          { file: masterFile(film.paths), start: start / info.fps, duration: total / info.fps },
          () => everyTakeRecorded(placed),
        );
        if (Option.isSome(audio)) {
          const length = yield* measureMaster(fs, media, audio.value.file);
          const finding = masterFinding(audio.value.file, length, info.duration, 1 / info.fps);
          if (Option.isSome(finding)) return yield* finding.value;
        }

        // Before a frame is drawn: a browser that cannot encode the film fails here.
        yield* Effect.scoped(Effect.flatMap(Pool.get(pool), (page) => page.encoder(job.scale)));

        const segDir = path.join(dir, 'segments');
        const shareDir = path.join(dir, 'share');
        yield* fresh(segDir);
        if (job.share) yield* fresh(shareDir);
        const chunks = planChunks(start, end, job.workers);
        const began = yield* Clock.currentTimeMillis;
        const done = yield* Ref.make(0);
        const progress = (frames: number) =>
          Effect.gen(function* () {
            const n = yield* Ref.updateAndGet(done, (k) => k + frames);
            const secs = ((yield* Clock.currentTimeMillis) - began) / 1000;
            const rate = n / secs;
            yield* Effect.log(
              `render.progress frames=${n}/${total} fps=${rate.toFixed(1)} eta=${((total - n) / rate).toFixed(0)}s`,
            );
          });

        /**
         * One chunk drawn and encoded on whichever page is free, to its own
         * segment (and its share copy's); a crashed page is dropped and the
         * chunk retried once on a fresh one.
         */
        const encode = (chunk: Chunk) =>
          Effect.scoped(
            Effect.gen(function* () {
              const page = yield* Pool.get(pool);
              const encoded = yield* page
                .encode(chunk, job.scale, job.share)
                .pipe(Effect.tapErrorTag('PageCrashed', () => Pool.invalidate(pool, page)));
              const at = (chunk.from - start) / info.fps;
              const file = path.join(segDir, segmentName(chunk));
              yield* fs.writeFile(file, encoded.master);
              const copy = path.join(shareDir, segmentName(chunk));
              const share = yield* Option.match(encoded.share, {
                onNone: () => Effect.succeedNone,
                onSome: (bytes) =>
                  Effect.as(fs.writeFile(copy, bytes), Option.some({ file: copy, at })),
              });
              yield* progress(chunk.to - chunk.from);
              return { master: { file, at }, share };
            }),
          ).pipe(
            Effect.tapErrorTag('PageCrashed', (error) =>
              Effect.logWarning(`render.retry chunk=${chunk.index} reason="${error.reason}"`),
            ),
            Effect.retry({ times: 1, while: (error) => error._tag === 'PageCrashed' }),
          );

        const encoded = yield* Effect.forEach(chunks, encode, { concurrency: job.workers });
        const track = yield* Option.match(audio, {
          onNone: () => Effect.succeedNone,
          onSome: (cut) =>
            Effect.map(media.decode(cut.file), (pcm) =>
              Option.some(
                slice(pcm, Math.round(cut.start * pcm.rate), Math.round(cut.duration * pcm.rate)),
              ),
            ),
        });
        yield* media.join({
          out: target,
          segments: encoded.map((chunk) => chunk.master),
          frames: total,
          audio: track,
        });
        const shared = Option.filter(Option.some(shareName(target)), () => job.share);
        yield* Option.match(shared, {
          onNone: () => Effect.void,
          onSome: (out) =>
            media.join({
              out,
              segments: encoded.flatMap((chunk) => Option.toArray(chunk.share)),
              frames: total,
              audio: track,
            }),
        });

        const captions = `${target.replace(/\.[^./]+$/, '')}.vtt`;
        const range = { from: start / info.fps, to: end / info.fps };
        yield* fs.writeFileString(captions, webVtt(filmCaptions(placed, range)));

        const secs = ((yield* Clock.currentTimeMillis) - began) / 1000;
        yield* Effect.log(
          `render.done frames=${total} chunks=${chunks.length} audio=${Option.isSome(audio)} secs=${secs.toFixed(1)} fps=${(total / secs).toFixed(1)} file=${target} share=${Option.getOrElse(shared, () => 'none')} captions=${captions}`,
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
        const from = Option.getOrElse(job.from, () => 0);
        const to = Option.getOrElse(job.to, () => info.duration);
        const times = contactTimes(from, to, job.every);
        const page = yield* Pool.get(pool);
        const sheet = path.join(dir, contactSheetName);
        yield* fs.writeFile(sheet, yield* page.contact(times.map((t) => frameAt(info, t))));
        yield* Effect.log(
          `render.contact frames=${times.length} every=${job.every}s file=${sheet}`,
        );
      }, Effect.scoped);

      const render = Effect.fn('Renderer.render')(function* (film: LoadedFilm, job: RenderJob) {
        const placed = yield* placeFilm(film);
        const built = yield* project.build(film, placed);
        const dir = path.join(film.paths.out, job.tag);
        yield* fs.makeDirectory(dir, { recursive: true });
        const pages = RenderJob.$match(job, {
          Video: (v) => v.workers,
          Stills: (s) => Math.min(s.workers, s.times.length),
          // One page composes the whole sheet.
          Contact: () => 1,
        });
        yield* Effect.scoped(
          Effect.gen(function* () {
            const url = `${yield* server.serve(built.riv)}?fps=${job.fps}&duration=${filmSeconds(placed)}`;
            const pool = yield* Pool.make({ acquire: browser.open(url), size: Math.max(1, pages) });
            const info = yield* Effect.scoped(Effect.map(Pool.get(pool), (page) => page.info));
            yield* RenderJob.$match(job, {
              Video: (v) => video(film, v, pool, info, dir, placed),
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
