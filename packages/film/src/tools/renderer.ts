// Render a film frame by frame in headless Chromium. Every frame is a pure
// function of time, so pages render any chunk in any order: a video splits
// into chunks on a queue that idle pages pull from, each page drawing and
// encoding its chunk to its own H.264 segment, then the segments join in
// order (copied, not re-encoded) with the audio cut from the lossless master
// and encoded to AAC. The server, the browser and every page live in one
// scope: a failure, or Ctrl-C, closes them all.

import { availableParallelism } from 'node:os';
import {
  Array as Arr,
  Clock,
  Context,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Pool,
  Ref,
  Result,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { splice } from '../core/audio.ts';
import { encoderCandidates, encoderName, sharesInPage } from '../core/encoder.ts';
import { filmCaptions, shortCaptions, webVtt } from '../core/captions.ts';
import type { ShortError } from '../core/errors.ts';
import { type Placed, everyTakeRecorded } from '../core/layout.ts';
import type { ExportInfo } from '../core/schema.ts';
import { type ResolvedShort, resolveShort, shortPage, shortPieces } from '../core/shorts.ts';
import { filmEnd } from '../core/sound.ts';
import { Browser, type FramePage, type PageOpenError, makeBrowser } from './browser.ts';
import {
  type AudioMissing,
  type AudioStale,
  type BrowserMissing,
  type ContactFailed,
  type EncodeFailed,
  type EncoderMissing,
  type FrameFailed,
  type LookbookFailed,
  type MediaFailed,
  type PageCrashed,
  type PageError,
  RangeEmpty,
  type TooManyEncoders,
} from './errors.ts';
import { type LoadedFilm, type PlaceError, placeFilm } from './film-repo.ts';
import { filmChapters } from './look.ts';
import { Media } from './media.ts';
import { masterFile, masterFinding, measureMaster } from './mixer.ts';
import { PreviewServer } from './preview-server.ts';
import {
  type AudioCut,
  type Chunk,
  Cut,
  JOIN_FADE,
  RenderJob,
  contactSheetName,
  cutBase,
  cutPage,
  lookbookName,
  contactTimes,
  frameAt,
  frameSpan,
  planChunks,
  segmentName,
  shareName,
  encoderLimits,
  stillName,
  videoEncoders,
  videoWorkers,
} from './render-plan.ts';

/**
 * The cores this machine has: a software encoder takes one each, so they
 * bound a software render's encoders (`encoderLimits`). Tests set it.
 */
export const Cores = Context.Reference<number>('@bible/film/tools/Cores', {
  defaultValue: () => availableParallelism(),
});

/**
 * The platform the render runs on (`process.platform`): it decides which
 * encoders a render may use (`encoderCandidates`). Tests set it.
 */
export const Platform = Context.Reference<string>('@bible/film/tools/Platform', {
  defaultValue: () => process.platform,
});

/** How the doctor's encoder check can fail. */
export type EncoderReadyError = PageOpenError | PageError | PageCrashed | EncoderMissing;

/**
 * The doctor's encoder line: the encoder the app's player (its first film,
 * at full size, with its share copy) chooses in headless Chromium among the
 * platform's, as a render's first page does, and the pages a render opens
 * on it by default.
 */
export const encoderReady: Effect.Effect<
  string,
  EncoderReadyError | BrowserMissing,
  PreviewServer | Path.Path
> = Effect.scoped(
  Effect.gen(function* () {
    const server = yield* PreviewServer;
    // A browser of its own, so the doctor's other lines print when Chromium is missing.
    const browser = yield* makeBrowser;
    const page = yield* browser.open(`${server.url}?export`);
    const candidates = encoderCandidates(yield* Platform, Option.none());
    const encoder = yield* page.encoder(1, true, candidates);
    const cores = yield* Cores;
    const { workers, max } = encoderLimits(encoder, cores);
    return `${encoderName(encoder)} H.264, ${workers} pages by default, at most ${max} encoders at once (${cores} cores)`;
  }),
).pipe(Effect.withSpan('Renderer.encoderReady'));

export type RenderError =
  | PageOpenError
  | PageError
  | PageCrashed
  | FrameFailed
  | LookbookFailed
  | ContactFailed
  | EncoderMissing
  | EncodeFailed
  | MediaFailed
  | AudioMissing
  | AudioStale
  | RangeEmpty
  | TooManyEncoders
  | PlaceError
  | ShortError
  | PlatformError;

/** Where a render's outputs go, and the film and short it draws. */
interface Where {
  /** `out/<film>`, or a short's `out/<film>/shorts/<id>` (`cutBase`). */
  readonly base: string;
  readonly placed: ReadonlyArray<Placed>;
  /** The short, resolved on the page's frames, when the render is one. */
  readonly short: Option.Option<ResolvedShort>;
}

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
      const server = yield* PreviewServer;

      /** The short on a page's clock: the same spans, on the same frames, it draws. */
      const shortOn = (placed: ReadonlyArray<Placed>, cut: Cut, fps: number) =>
        Cut.$match(cut, {
          Whole: () => Effect.succeedNone,
          Short: ({ short }) => Effect.asSome(Effect.fromResult(resolveShort(placed, short, fps))),
        });

      const video = Effect.fnUntraced(function* (
        film: LoadedFilm,
        job: Extract<RenderJob, { _tag: 'Video' }>,
        url: string,
        placed: ReadonlyArray<Placed>,
        base: string,
      ) {
        // One page first says what the render draws and which encoder every
        // page encodes with: the pages, and the encoders they may run, are
        // sized from that choice before the pool opens.
        const { info, short, scale, encoder } = yield* Effect.scoped(
          Effect.gen(function* () {
            const page = yield* browser.open(url);
            const found = yield* shortOn(placed, job.cut, page.info.fps);
            // A short's page is 9:16 at the film's density: it encodes down to 1080 × 1920.
            const k = Option.match(found, {
              onNone: () => job.scale,
              onSome: () => shortPage(page.info.width).scale * job.scale,
            });
            // Before a frame is drawn: a browser that cannot encode the film with
            // one of the encoders this platform allows fails here.
            const candidates = encoderCandidates(yield* Platform, job.encoder);
            const by = yield* page.encoder(k, job.share, candidates);
            return { info: page.info, short: found, scale: k, encoder: by };
          }),
        );
        const where: Where = { base, placed, short };
        const { start, end } = frameSpan(info, job.from, job.to);
        if (end <= start)
          return yield* RangeEmpty.make({ from: start / info.fps, to: end / info.fps });
        const total = end - start;
        const target = Option.getOrElse(job.out, () => `${where.base}.mp4`);
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        const range = { from: start / info.fps, to: end / info.fps };

        // The film declares its track only once every take is recorded (a
        // short's page declares none: it plays the film's under its spans).
        // Before a frame is drawn, its master must be there and cover the
        // whole film to within a frame: a mix cut short would otherwise mux
        // silence.
        const recorded = Option.match(where.short, {
          onNone: () => Option.isSome(Option.fromNullishOr(info.audio)),
          onSome: () => everyTakeRecorded(where.placed),
        });
        const audio: Option.Option<AudioCut> = Option.map(
          Option.liftPredicate(recorded, Boolean),
          () => ({
            file: masterFile(film.paths),
            pieces: Option.match(where.short, {
              onNone: () => [{ start: range.from, duration: range.to - range.from }],
              onSome: (short) => shortPieces(short, range.from, range.to),
            }),
          }),
        );
        if (Option.isSome(audio)) {
          const length = yield* measureMaster(fs, media, audio.value.file);
          const filmLength = Option.match(where.short, {
            onNone: () => info.duration,
            onSome: () => filmEnd(where.placed),
          });
          const finding = masterFinding(audio.value.file, length, filmLength, 1 / info.fps);
          if (Option.isSome(finding)) return yield* finding.value;
        }

        // Before the pool opens: pages past the encoders this encoder runs at once would hang
        // (hardware) or fight for the cores (software).
        const cores = yield* Cores;
        const workers = videoWorkers(job.workers, encoder, cores);
        const encoders = yield* Effect.fromResult(
          videoEncoders(workers, job.share, encoder, cores),
        );
        yield* Effect.log(
          `render.encoder kind=${encoderName(encoder)} workers=${workers} encoders=${encoders} cores=${cores}`,
        );
        const pool = yield* Pool.make({ acquire: browser.open(url), size: workers });

        // The track, cut and encoded once beside the pages; both joins copy its packets.
        const aac = Option.match(audio, {
          onNone: () => Effect.succeedNone,
          onSome: (cut) =>
            media.decode(cut.file).pipe(
              Effect.map((pcm) =>
                splice(
                  pcm,
                  cut.pieces.map((piece) => ({
                    from: Math.round(piece.start * pcm.rate),
                    frames: Math.round(piece.duration * pcm.rate),
                  })),
                  Math.round(JOIN_FADE * pcm.rate),
                ),
              ),
              Effect.flatMap(media.encodeAac),
              Effect.asSome,
            ),
        });

        // The segments go in a folder of this render's own, made fresh by the
        // system: never under out/<film>, so two renders at once never share
        // one. It lives in the render's scope: joined, failed or interrupted,
        // the render takes it with it.
        const work = yield* fs.makeTempDirectoryScoped({ prefix: 'film-segments-' });
        const segDir = path.join(work, 'segments');
        const shareDir = path.join(work, 'share');
        yield* fs.makeDirectory(segDir);
        // The hardware encoder makes the share copy in the page, chunk by chunk.
        const shareInPage = job.share && sharesInPage(encoder);
        if (shareInPage) yield* fs.makeDirectory(shareDir);
        const chunks = planChunks(start, end, workers);
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
                .encode(chunk, scale, job.share, encoder)
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

        // One structured run: the first failure, a page's or the track's, stops the other.
        const [encoded, track] = yield* Effect.all(
          [Effect.forEach(chunks, encode, { concurrency: workers }), aac],
          { concurrency: 'unbounded' },
        );
        yield* media.join({
          out: target,
          segments: encoded.map((chunk) => chunk.master),
          frames: total,
          audio: track,
        });
        /** The hardware encoder's share: its copies from the page, joined as the master is. */
        const joinedShare = (out: string) =>
          media.join({
            out,
            segments: encoded.flatMap((chunk) => Option.toArray(chunk.share)),
            frames: total,
            audio: track,
          });
        /** The software encoder's share: x264 over the joined master. */
        const x264Share = (out: string) =>
          Effect.gen(function* () {
            const from = yield* Clock.currentTimeMillis;
            yield* media.shareCopy(target, out);
            const secs = ((yield* Clock.currentTimeMillis) - from) / 1000;
            yield* Effect.log(`render.share by=x264 secs=${secs.toFixed(1)} file=${out}`);
          });
        const shared = Option.filter(Option.some(shareName(target)), () => job.share);
        yield* Option.match(shared, {
          onNone: () => Effect.void,
          onSome: (out) =>
            Match.value(shareInPage).pipe(
              Match.when(true, () => joinedShare(out)),
              Match.orElse(() => x264Share(out)),
            ),
        });

        const captions = `${target.replace(/\.[^./]+$/, '')}.vtt`;
        const cues = Option.match(where.short, {
          onNone: () => filmCaptions(where.placed, range),
          onSome: (short) => shortCaptions(where.placed, short, range),
        });
        yield* fs.writeFileString(captions, webVtt(cues));
        // The whole film of a film that declares a look also gets its YouTube chapters.
        if (
          Option.isNone(where.short) &&
          start === 0 &&
          end === info.frames &&
          Option.isSome(film.look)
        )
          yield* Result.match(filmChapters(film, where.placed), {
            onFailure: (error) => Effect.logWarning(`render.chapters skipped: ${error.message}`),
            onSuccess: (lines) => {
              const file = `${target.replace(/\.[^./]+$/, '')}.chapters.txt`;
              return Effect.andThen(fs.writeFileString(file, `${lines.join('\n')}\n`), () =>
                Effect.log(`render.chapters count=${lines.length} file=${file}`),
              );
            },
          });

        const secs = ((yield* Clock.currentTimeMillis) - began) / 1000;
        yield* Effect.log(
          `render.done frames=${total} chunks=${chunks.length} audio=${Option.isSome(audio)} secs=${secs.toFixed(1)} fps=${(total / secs).toFixed(1)} file=${target} share=${Option.getOrElse(shared, () => 'none')} captions=${captions}`,
        );
      }, Effect.scoped);

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
        // Clipped to the film as a video's range is, so no frame repeats at either end.
        const { start, end } = frameSpan(info, job.from, job.to);
        if (end <= start)
          return yield* RangeEmpty.make({ from: start / info.fps, to: end / info.fps });
        const times = contactTimes(start / info.fps, end / info.fps, job.every);
        const page = yield* Pool.get(pool);
        const sheet = path.join(dir, contactSheetName);
        yield* fs.writeFile(sheet, yield* page.contact(times.map((t) => frameAt(info, t))));
        yield* Effect.log(
          `render.contact frames=${times.length} every=${job.every}s file=${sheet}`,
        );
      }, Effect.scoped);

      const lookbook = Effect.fnUntraced(function* (
        pool: Pool.Pool<FramePage, PageOpenError>,
        dir: string,
      ) {
        const page = yield* Pool.get(pool);
        const file = path.join(dir, lookbookName);
        yield* fs.writeFile(file, yield* page.lookbook);
        yield* Effect.log(`render.lookbook file=${file}`);
      }, Effect.scoped);

      const render = Effect.fn('Renderer.render')(function* (film: LoadedFilm, job: RenderJob) {
        const cut = RenderJob.$match(job, {
          Video: (v) => v.cut,
          Stills: (st) => st.cut,
          Contact: (c) => c.cut,
          LookBook: () => Cut.Whole(),
        });
        const placed = yield* placeFilm(film);
        const query = [
          `film=${encodeURIComponent(cutPage(film.paths.name, cut))}`,
          'export',
          ...Arr.filter(['captions=0'], () => !job.captions),
        ];
        const url = `${server.url}?${query.join('&')}`;
        const base = cutBase(film.paths.out, cut);
        const dir = path.join(base, job.tag);

        /** A job drawn on `pages` pages that encode nothing, handed the pool and the film's info. */
        const drawn = <E>(
          pages: number,
          run: (
            pool: Pool.Pool<FramePage, PageOpenError>,
            info: ExportInfo,
          ) => Effect.Effect<void, E>,
        ) =>
          Effect.scoped(
            Effect.gen(function* () {
              yield* fs.makeDirectory(dir, { recursive: true });
              const pool = yield* Pool.make({
                acquire: browser.open(url),
                size: Math.max(1, pages),
              });
              const info = yield* Effect.scoped(Effect.map(Pool.get(pool), (page) => page.info));
              // A short's spans must resolve on the page's frames, as a video's do.
              yield* shortOn(placed, cut, info.fps);
              yield* run(pool, info);
            }),
          );

        yield* RenderJob.$match(job, {
          // A video writes nothing under `dir`: its segments are its own, and its file is `--out`.
          Video: (v) => video(film, v, url, placed, base),
          Stills: (s) =>
            drawn(Math.min(s.workers, s.times.length), (pool, info) => stills(s, pool, info, dir)),
          // One page composes the whole sheet.
          Contact: (c) => drawn(1, (pool, info) => contact(c, pool, info, dir)),
          LookBook: () => drawn(1, (pool) => lookbook(pool, dir)),
        });
      });

      return Renderer.of({ render });
    }),
  );
}
