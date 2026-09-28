// Render a film frame by frame in headless Chromium. Every frame is a pure
// function of time, so pages render any chunk in any order: a video splits
// into chunks on a queue that idle pages pull from, each page drawing and
// encoding its chunk to its own H.264 segment, then the segments join in
// order (copied, not re-encoded) with the audio cut from the lossless master
// and encoded to AAC. The server, the browser and every page live in one
// scope: a failure, or Ctrl-C, closes them all.

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
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { splice } from '../core/audio.ts';
import { filmCaptions, shortCaptions, webVtt } from '../core/captions.ts';
import type { ShortError } from '../core/errors.ts';
import { type Placed, everyTakeRecorded } from '../core/layout.ts';
import type { ExportInfo } from '../core/schema.ts';
import { type ResolvedShort, resolveShort, shortPage, shortPieces } from '../core/shorts.ts';
import { filmEnd } from '../core/sound.ts';
import { Browser, type FramePage, type PageOpenError } from './browser.ts';
import {
  type AudioMissing,
  type AudioStale,
  type ContactFailed,
  type EncodeFailed,
  type EncoderMissing,
  type FrameFailed,
  type LayoutInvalid,
  type LookbookFailed,
  type MediaFailed,
  type PageCrashed,
  type PageError,
  RangeEmpty,
  type TooManyEncoders,
} from './errors.ts';
import { type LoadedFilm, placeFilm } from './film-repo.ts';
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
  encoderBudget,
  planChunks,
  segmentName,
  shareName,
  stillName,
} from './render-plan.ts';

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
  | LayoutInvalid
  | ShortError
  | PlatformError;

/** Where a render's outputs go, and the film and short it draws. */
interface Where {
  /** `out/<film>`, or a short's `out/<film>/shorts/<id>` (`cutBase`). */
  readonly base: string;
  /** `<base>/<tag>`: stills, sheets and a video's segments. */
  readonly dir: string;
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

      const fresh = (dir: string) =>
        fs
          .remove(dir, { recursive: true, force: true })
          .pipe(Effect.andThen(fs.makeDirectory(dir, { recursive: true })));

      const video = Effect.fnUntraced(function* (
        film: LoadedFilm,
        job: Extract<RenderJob, { _tag: 'Video' }>,
        pool: Pool.Pool<FramePage, PageOpenError>,
        info: ExportInfo,
        where: Where,
      ) {
        const { start, end } = frameSpan(info, job.from, job.to);
        if (end <= start)
          return yield* RangeEmpty.make({ from: start / info.fps, to: end / info.fps });
        const total = end - start;
        const target = Option.getOrElse(job.out, () => `${where.base}.mp4`);
        const range = { from: start / info.fps, to: end / info.fps };
        // A short's page is 9:16 at the film's density: it encodes down to 1080 × 1920.
        const scale = Option.match(where.short, {
          onNone: () => job.scale,
          onSome: () => shortPage(info.width).scale * job.scale,
        });

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

        // Before a frame is drawn: a browser that cannot encode the film fails here.
        yield* Effect.scoped(Effect.flatMap(Pool.get(pool), (page) => page.encoder(scale)));

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
              Effect.map(Option.some),
            ),
        });

        const segDir = path.join(where.dir, 'segments');
        const shareDir = path.join(where.dir, 'share');
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
                .encode(chunk, scale, job.share)
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
          [Effect.forEach(chunks, encode, { concurrency: job.workers }), aac],
          { concurrency: 'unbounded' },
        );
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

        // Joined: the segments are copied into the film and nothing reads them
        // again. A failed join leaves them for the error that names one.
        yield* fs.remove(segDir, { recursive: true, force: true });
        yield* fs.remove(shareDir, { recursive: true, force: true });

        const captions = `${target.replace(/\.[^./]+$/, '')}.vtt`;
        const cues = Option.match(where.short, {
          onNone: () => filmCaptions(where.placed, range),
          onSome: (short) => shortCaptions(where.placed, short, range),
        });
        yield* fs.writeFileString(captions, webVtt(cues));

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
        // Before a page opens: a video past the encoders the hardware runs would hang.
        yield* Effect.fromResult(encoderBudget(job));
        const url = `${server.url}?${query.join('&')}`;
        const base = cutBase(film.paths.out, cut);
        const dir = path.join(base, job.tag);
        yield* fs.makeDirectory(dir, { recursive: true });
        const pages = RenderJob.$match(job, {
          Video: (v) => v.workers,
          Stills: (s) => Math.min(s.workers, s.times.length),
          // One page composes the whole sheet.
          Contact: () => 1,
          LookBook: () => 1,
        });
        yield* Effect.scoped(
          Effect.gen(function* () {
            const pool = yield* Pool.make({ acquire: browser.open(url), size: Math.max(1, pages) });
            const info = yield* Effect.scoped(Effect.map(Pool.get(pool), (page) => page.info));
            // The short on the page's clock: the same spans, on the same frames, it draws.
            const short = yield* Cut.$match(cut, {
              Whole: () => Effect.succeedNone,
              Short: ({ short }) =>
                Effect.map(Effect.fromResult(resolveShort(placed, short, info.fps)), Option.some),
            });
            const where: Where = { base, dir, placed, short };
            yield* RenderJob.$match(job, {
              Video: (v) => video(film, v, pool, info, where),
              Stills: (s) => stills(s, pool, info, dir),
              Contact: (c) => contact(c, pool, info, dir),
              LookBook: () => lookbook(pool, dir),
            });
          }),
        );
      });

      return Renderer.of({ render });
    }),
  );
}
