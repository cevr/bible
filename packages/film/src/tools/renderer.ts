// Render a film frame by frame in headless Chromium. Every frame is a pure
// function of time, so pages render any chunk in any order: a video splits
// into chunks on a queue that idle pages pull from, each page drawing and
// encoding its chunk to its own H.264 segment, then the segments join in
// order (copied, not re-encoded) with the audio cut from the lossless master
// and encoded to AAC. The server, the browser and every page (a pool of
// `Pages`) live in one scope: a failure, or Ctrl-C, closes them all.

import { availableParallelism } from 'node:os';
import {
  Clock,
  Context,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Ref,
  Result,
  Scope,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { splice } from '../core/audio.ts';
import {
  type Encoder,
  EncoderChoice,
  encoderCandidates,
  encoderName,
  sharesInPage,
} from '../core/encoder.ts';
import { filmCaptions, shortCaptions, webVtt } from '../core/captions.ts';
import type { RenderSound } from '../core/catalogue.ts';
import type { ChunkTiming, ExportInfo } from '../core/export-handle.ts';
import type { ShortError } from '../core/errors.ts';
import { type Placed, everyTakeRecorded, filmEnd } from '../core/layout.ts';
import {
  type FilmPiece,
  type ResolvedShort,
  resolveShort,
  shortPage,
  shortPieces,
} from '../core/shorts.ts';
import { FILM_FPS } from '../core/time.ts';
import { type FramePage, type PageOpenError, makeBrowser } from './browser.ts';
import {
  type AudioMissing,
  type AudioStale,
  type BrowserMissing,
  type ContactFailed,
  type EncodeFailed,
  EncoderMissing,
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
import { masterFile, masterFinding, planKey, readMaster } from './mixer.ts';
import { type ExportPages, Pages } from './pages.ts';
import { PreviewServer } from './preview-server.ts';
import {
  type AudioCut,
  type Chunk,
  Cut,
  JOIN_FADE,
  RenderJob,
  type RenderOutput,
  captionsName,
  chaptersName,
  contactSheetName,
  cutPage,
  imagesOutput,
  lookbookName,
  contactTimes,
  frameAt,
  frameSpan,
  planChunks,
  renderPaths,
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

/**
 * The first of `candidates` `page` can encode the film with at `scale`, its
 * share copy included when `share`; `EncoderMissing` when none can.
 */
const pageEncoder = (
  page: FramePage,
  scale: number,
  share: boolean,
  candidates: ReadonlyArray<Encoder>,
) =>
  page.call('encoder', scale, share, candidates).pipe(
    Effect.flatMap((choice) =>
      EncoderChoice.match(choice, {
        Hardware: (found) => Effect.succeed<Encoder>(found),
        Software: (found) => Effect.succeed<Encoder>(found),
        Missing: ({ reason }) => Effect.fail(EncoderMissing.make({ reason })),
      }),
    ),
  );

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
    const encoder = yield* pageEncoder(page, 1, true, candidates);
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

/**
 * Where a chunk's page time went, in ms: drawing its frames, encoding them
 * (the rest of the page's call) and carrying the bytes out of the page (the
 * call's wall time past the page's own), over its `frames`.
 */
interface ChunkTime {
  readonly frames: number;
  readonly draw: number;
  readonly encode: number;
  readonly transfer: number;
}

const noTime: ChunkTime = { frames: 0, draw: 0, encode: 0, transfer: 0 };

/** `chunk`'s time from the page's own account (`ChunkTiming`) and the call's `wall` ms. */
const chunkTime = (chunk: Chunk, timing: ChunkTiming, wall: number): ChunkTime => ({
  frames: chunk.to - chunk.from,
  draw: timing.draw,
  encode: timing.page - timing.draw,
  transfer: Math.max(0, wall - timing.page),
});

const addTime = (a: ChunkTime, b: ChunkTime): ChunkTime => ({
  frames: a.frames + b.frames,
  draw: a.draw + b.draw,
  encode: a.encode + b.encode,
  transfer: a.transfer + b.transfer,
});

/** A log line's ms a frame, drawing, encoding and in transfer: `draw_ms=… encode_ms=… transfer_ms=…`. */
const perFrame = (t: ChunkTime): string => {
  const each = (ms: number) => (ms / Math.max(1, t.frames)).toFixed(1);
  return `draw_ms=${each(t.draw)} encode_ms=${each(t.encode)} transfer_ms=${each(t.transfer)}`;
};

/** The film and short a render draws. */
interface Where {
  readonly placed: ReadonlyArray<Placed>;
  /** The short, resolved on the page's frames, when the render is one. */
  readonly short: Option.Option<ResolvedShort>;
}

export interface RendererService {
  /**
   * Draw `job` into the film's project folder (`renderPaths`), or a video to
   * its `--out`, and say what it wrote.
   */
  readonly render: (film: LoadedFilm, job: RenderJob) => Effect.Effect<RenderOutput, RenderError>;
  /**
   * A video's sound cut again from the film's master now, at the pieces it
   * recorded: its pictures (and its share copy's) copied, no page opened,
   * nothing drawn. The master is checked first, as a render checks it; the
   * sound the video now carries is the answer.
   */
  readonly remux: (film: LoadedFilm, video: Remuxed) => Effect.Effect<RenderSound, RemuxError>;
  /**
   * A run of many renders (`project render`'s scenes): videos that draw the
   * same page the same way are probed once and drawn on one pool of pages,
   * open until the caller's scope closes.
   */
  readonly session: Effect.Effect<RenderSession, never, Scope.Scope>;
}

/** Renders that share their probe and their pages (`RendererService.session`). */
export interface RenderSession {
  readonly render: (film: LoadedFilm, job: RenderJob) => Effect.Effect<RenderOutput, RenderError>;
}

/** What one page says of a video before its pool opens: what it draws, and the encoder every page uses. */
interface Probed {
  readonly info: ExportInfo;
  readonly short: Option.Option<ResolvedShort>;
  readonly scale: number;
  readonly encoder: Encoder;
}

/**
 * How a video gets its probe and its pages: made for it alone (`render`), or
 * kept by a session under a key naming what they were made for.
 */
interface Drawing {
  readonly probe: <E>(key: string, make: Effect.Effect<Probed, E>) => Effect.Effect<Probed, E>;
  readonly pool: <E>(
    key: string,
    open: Effect.Effect<ExportPages, E, Scope.Scope>,
  ) => Effect.Effect<ExportPages, E, Scope.Scope>;
}

/** What a video's probe was made for: two videos alike in all of it share one. */
const probeKey = (
  page: string,
  job: Extract<RenderJob, { _tag: 'Video' }>,
  platform: string,
): string => {
  const asked = Option.match(job.encoder, { onNone: () => 'any', onSome: (e) => e._tag });
  return `${page}|captions=${job.captions}|scale=${job.scale}|share=${job.share}|encoder=${asked}|${platform}`;
};

/** Each video its own probe and its own pages, closed with it. */
const alone: Drawing = { probe: (_, make) => make, pool: (_, open) => open };

/** A recorded video whose sound is cut again: its files, and the pieces of the master it carries. */
export interface Remuxed {
  readonly clip: string;
  readonly share: Option.Option<string>;
  readonly pieces: ReadonlyArray<FilmPiece>;
}

export type RemuxError = AudioMissing | AudioStale | MediaFailed | PlaceError | PlatformError;

export class Renderer extends Context.Service<Renderer, RendererService>()(
  '@bible/film/tools/Renderer',
) {
  static readonly layer = Layer.effect(
    Renderer,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const media = yield* Media;
      const pages = yield* Pages;

      /**
       * The film's master checked, before anything is drawn or cut, against
       * the film it must cover (`seconds`, to within `tolerance`) and the plan
       * the film mixes to now: that plan's key (none when it does not build).
       */
      const checkedMaster = (
        film: LoadedFilm,
        placed: ReadonlyArray<Placed>,
        seconds: number,
        tolerance: number,
      ) =>
        Effect.gen(function* () {
          const master = yield* readMaster(fs, media, film.paths);
          const key = yield* planKey(film, placed).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
          );
          const finding = masterFinding(
            masterFile(film.paths),
            master,
            { seconds, key },
            tolerance,
          );
          if (Option.isSome(finding)) return yield* finding.value;
          return key;
        });

      /** The master cut at `cut`'s pieces, each join faded, and encoded to AAC once. */
      const trackOf = (cut: AudioCut) =>
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
        );

      /** The short on a page's clock: the same spans, on the same frames, it draws. */
      const shortOn = (placed: ReadonlyArray<Placed>, cut: Cut, fps: number) =>
        Cut.$match(cut, {
          Whole: () => Effect.succeedNone,
          Short: ({ short }) => Effect.asSome(Effect.fromResult(resolveShort(placed, short, fps))),
        });

      const video = Effect.fnUntraced(function* (
        film: LoadedFilm,
        job: Extract<RenderJob, { _tag: 'Video' }>,
        page: string,
        placed: ReadonlyArray<Placed>,
        clip: string,
        drawing: Drawing,
      ) {
        // One page first says what the render draws and which encoder every
        // page encodes with: the pages, and the encoders they may run, are
        // sized from that choice before the pool opens.
        const platform = yield* Platform;
        const made = probeKey(page, job, platform);
        const { info, short, scale, encoder } = yield* drawing.probe(
          made,
          Effect.scoped(
            Effect.gen(function* () {
              const first = yield* pages.open(page, { workers: 1, captions: job.captions });
              const found = yield* shortOn(placed, job.cut, first.info.fps);
              // A short's page is 9:16 at the film's density: it encodes down to 1080 × 1920.
              const k = Option.match(found, {
                onNone: () => job.scale,
                onSome: () => shortPage(first.info.width).scale * job.scale,
              });
              // Before a frame is drawn: a browser that cannot encode the film with
              // one of the encoders this platform allows fails here.
              const candidates = encoderCandidates(platform, job.encoder);
              const by = yield* first.use((one) => pageEncoder(one, k, job.share, candidates));
              const probed: Probed = { info: first.info, short: found, scale: k, encoder: by };
              return probed;
            }),
          ),
        );
        const where: Where = { placed, short };
        const { start, end } = frameSpan(info, job.from, job.to);
        if (end <= start)
          return yield* RangeEmpty.make({ from: start / info.fps, to: end / info.fps });
        const total = end - start;
        const target = Option.getOrElse(job.out, () => clip);
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        const range = { from: start / info.fps, to: end / info.fps };

        // The film declares its track only once every take is recorded (a
        // short's page declares none: it plays the film's under its spans).
        // Before a frame is drawn, its master must be there, cover the whole
        // film to within a frame and be mixed for the plan the film plays
        // now: a mix cut short would otherwise mux silence, and one made
        // before a score pick or a re-take the wrong sound.
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
        const seconds = Option.match(where.short, {
          onNone: () => info.duration,
          onSome: () => filmEnd(where.placed),
        });
        const sound = yield* Option.match(audio, {
          onNone: () => Effect.succeedNone,
          onSome: (cut) =>
            checkedMaster(film, where.placed, seconds, 1 / info.fps).pipe(
              Effect.map((mix): RenderSound => ({ mix, pieces: cut.pieces })),
              Effect.asSome,
            ),
        });

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
        const pool = yield* drawing.pool(
          `${made}|workers=${workers}`,
          pages.open(page, { workers, captions: job.captions }),
        );

        // The track, cut and encoded once beside the pages; both joins copy its packets.
        const aac = Option.match(audio, {
          onNone: () => Effect.succeedNone,
          onSome: (cut) => Effect.asSome(trackOf(cut)),
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
        const done = yield* Ref.make(noTime);
        /** A chunk done: the render's progress, and where this chunk's time went a frame. */
        const progress = (chunk: Chunk, spent: ChunkTime) =>
          Effect.gen(function* () {
            const sum = yield* Ref.updateAndGet(done, (was) => addTime(was, spent));
            const secs = ((yield* Clock.currentTimeMillis) - began) / 1000;
            const rate = sum.frames / secs;
            yield* Effect.log(
              `render.progress frames=${sum.frames}/${total} fps=${rate.toFixed(1)} eta=${((total - sum.frames) / rate).toFixed(0)}s chunk=${chunk.index} ${perFrame(spent)}`,
            );
          });

        /**
         * One chunk drawn and encoded on whichever page is free, to its own
         * segment (and its share copy's); a crashed page is dropped and the
         * chunk retried once on a fresh one.
         */
        const encode = (chunk: Chunk) =>
          pool
            .use((one) =>
              Effect.gen(function* () {
                const sent = yield* Clock.currentTimeMillis;
                const encoded = yield* one.call(
                  'encode',
                  chunk.from,
                  chunk.to,
                  scale,
                  job.share,
                  encoder,
                );
                const wall = (yield* Clock.currentTimeMillis) - sent;
                const at = (chunk.from - start) / info.fps;
                const file = path.join(segDir, segmentName(chunk));
                yield* fs.writeFile(file, encoded.master);
                const copy = path.join(shareDir, segmentName(chunk));
                const share = yield* Option.match(encoded.share, {
                  onNone: () => Effect.succeedNone,
                  onSome: (bytes) =>
                    Effect.as(fs.writeFile(copy, bytes), Option.some({ file: copy, at })),
                });
                yield* progress(chunk, chunkTime(chunk, encoded.timing, wall));
                return { master: { file, at }, share };
              }),
            )
            .pipe(
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

        const captions = captionsName(target);
        const cues = Option.match(where.short, {
          onNone: () => filmCaptions(where.placed, range),
          onSome: (short) => shortCaptions(where.placed, short, range),
        });
        yield* fs.writeFileString(captions, webVtt(cues));
        // The whole film of a film that declares a look also gets its YouTube chapters.
        const whole =
          Option.isNone(where.short) &&
          start === 0 &&
          end === info.frames &&
          Option.isSome(film.look);
        const chapters = yield* Option.match(
          Option.liftPredicate(film, () => whole),
          {
            onNone: () => Effect.succeedNone,
            onSome: (declared) =>
              Result.match(filmChapters(declared, where.placed), {
                onFailure: (error) =>
                  Effect.as(
                    Effect.logWarning(`render.chapters skipped: ${error.message}`),
                    Option.none<string>(),
                  ),
                onSuccess: (lines) => {
                  const file = chaptersName(target);
                  return fs
                    .writeFileString(file, `${lines.join('\n')}\n`)
                    .pipe(
                      Effect.andThen(
                        Effect.log(`render.chapters count=${lines.length} file=${file}`),
                      ),
                      Effect.as(Option.some(file)),
                    );
                },
              }),
          },
        );

        const secs = ((yield* Clock.currentTimeMillis) - began) / 1000;
        const spent = yield* Ref.get(done);
        yield* Effect.log(
          `render.done frames=${total} chunks=${chunks.length} audio=${Option.isSome(audio)} secs=${secs.toFixed(1)} fps=${(total / secs).toFixed(1)} ${perFrame(spent)} file=${target} share=${Option.getOrElse(shared, () => 'none')} captions=${captions}`,
        );
        const written: RenderOutput = {
          kind: 'video',
          clip: Option.some(target),
          share: shared,
          captions: Option.some(captions),
          chapters,
          images: [],
          sound,
        };
        return written;
      }, Effect.scoped);

      const remux = Effect.fn('Renderer.remux')(function* (film: LoadedFilm, video: Remuxed) {
        const placed = yield* placeFilm(film);
        const file = masterFile(film.paths);
        const mix = yield* checkedMaster(film, placed, filmEnd(placed), 1 / FILM_FPS);
        const track = yield* trackOf({ file, pieces: video.pieces });
        // The share copy takes the same track, as a render gives both.
        yield* Effect.forEach([video.clip, ...Option.toArray(video.share)], (file) =>
          media.remux(file, track),
        );
        yield* Effect.log(
          `render.remux frames_drawn=0 pieces=${video.pieces.length} mix=${Option.getOrElse(mix, () => 'none').slice(0, 12)} file=${video.clip} share=${Option.getOrElse(video.share, () => 'none')}`,
        );
        const sound: RenderSound = { mix, pieces: video.pieces };
        return sound;
      });

      const stills = Effect.fnUntraced(function* (
        job: Extract<RenderJob, { _tag: 'Stills' }>,
        pool: ExportPages,
        dir: string,
      ) {
        const stillDir = path.join(dir, 'stills');
        yield* fs.makeDirectory(stillDir, { recursive: true });
        const files = yield* Effect.forEach(
          job.times,
          (t) =>
            Effect.gen(function* () {
              const file = path.join(stillDir, stillName(t));
              yield* fs.writeFile(
                file,
                yield* pool.call('frame', frameAt(pool.info, t), 'image/png'),
              );
              yield* Effect.log(`render.still t=${t} file=${file}`);
              return file;
            }),
          { concurrency: job.workers },
        );
        return imagesOutput('stills', files.toSorted());
      });

      const contact = Effect.fnUntraced(function* (
        job: Extract<RenderJob, { _tag: 'Contact' }>,
        pool: ExportPages,
        dir: string,
      ) {
        const { info } = pool;
        // Clipped to the film as a video's range is, so no frame repeats at either end.
        const { start, end } = frameSpan(info, job.from, job.to);
        if (end <= start)
          return yield* RangeEmpty.make({ from: start / info.fps, to: end / info.fps });
        const times = contactTimes(start / info.fps, end / info.fps, job.every);
        const sheet = path.join(dir, contactSheetName);
        yield* fs.writeFile(
          sheet,
          yield* pool.call(
            'contact',
            times.map((t) => frameAt(info, t)),
          ),
        );
        yield* Effect.log(
          `render.contact frames=${times.length} every=${job.every}s file=${sheet}`,
        );
        return imagesOutput('contact', [sheet]);
      });

      const lookbook = Effect.fnUntraced(function* (pool: ExportPages, dir: string) {
        const file = path.join(dir, lookbookName);
        yield* fs.writeFile(file, yield* pool.call('lookbook', 'image/jpeg'));
        yield* Effect.log(`render.lookbook file=${file}`);
        return imagesOutput('lookbook', [file]);
      });

      /** `job` rendered, its video's probe and pages got through `drawing`. */
      const renderWith = (drawing: Drawing) =>
        Effect.fn('Renderer.render')(function* (film: LoadedFilm, job: RenderJob) {
          const cut = RenderJob.$match(job, {
            Video: (v) => v.cut,
            Stills: (st) => st.cut,
            Contact: (c) => c.cut,
            LookBook: () => Cut.Whole(),
          });
          const placed = yield* placeFilm(film);
          const page = cutPage(film.paths.name, cut);
          const where = renderPaths(film.paths.out, job.address, job.variant);
          const dir = where.dir;

          /** A job drawn on `workers` pages that encode nothing, handed the pool. */
          const drawn = <E>(
            workers: number,
            run: (pool: ExportPages) => Effect.Effect<RenderOutput, E>,
          ) =>
            Effect.scoped(
              Effect.gen(function* () {
                yield* fs.makeDirectory(dir, { recursive: true });
                const pool = yield* pages.open(page, { workers, captions: job.captions });
                // A short's spans must resolve on the page's frames, as a video's do.
                yield* shortOn(placed, cut, pool.info.fps);
                return yield* run(pool);
              }),
            );

          return yield* RenderJob.$match(job, {
            // A video writes its file (`--out`, else its clip) and what goes beside it; its segments are its own.
            Video: (v) => video(film, v, page, placed, where.clip, drawing),
            Stills: (s) =>
              drawn(Math.min(s.workers, s.times.length), (pool) => stills(s, pool, dir)),
            // One page composes the whole sheet.
            Contact: (c) => drawn(1, (pool) => contact(c, pool, dir)),
            LookBook: () => drawn(1, (pool) => lookbook(pool, dir)),
          });
        });

      const render = renderWith(alone);

      /**
       * Renders that keep each probe and pool they open, by what it was made
       * for, until the caller's scope closes: one at a time makes or finds one.
       */
      const session = Effect.gen(function* () {
        const scope = yield* Effect.scope;
        const lock = yield* Semaphore.make(1);
        const probes = new Map<string, Probed>();
        const pools = new Map<string, ExportPages>();
        const kept = <A, E>(held: Map<string, A>, key: string, make: Effect.Effect<A, E>) =>
          lock.withPermits(1)(
            Option.match(Option.fromUndefinedOr(held.get(key)), {
              onSome: Effect.succeed,
              onNone: () => Effect.tap(make, (made) => Effect.sync(() => held.set(key, made))),
            }),
          );
        const drawing: Drawing = {
          probe: (key, make) => kept(probes, key, make),
          pool: (key, open) => kept(pools, key, Scope.provide(scope)(open)),
        };
        const run: RenderSession = { render: renderWith(drawing) };
        return run;
      });

      return Renderer.of({ render, remux, session });
    }),
  ).pipe(Layer.provide(Pages.layer));
}
