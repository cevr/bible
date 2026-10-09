// Footage, live (`footage.ts`): each source opened with mediabunny (an
// `Input` over a ranged `UrlSource`, as the compare's panes open renders,
// `webcodecs-browser.ts`) and its frames decoded through a
// `VideoSampleSink`. A frame asked for alone (`ready`) is decoded from its
// key frame (`getSample`) and copied onto a canvas of the host's, a few kept
// by (source, second) so a still and a seek on the same frame decode it
// once; a run (`run`) feeds each source's times to `samplesAtTimestamps`,
// which decodes each packet at most once while they rise, and holds each
// frame only until the next. mediabunny loads with the first read, so a page
// whose film reads no footage never downloads it. Which copy a page reads is
// its own (`urlOf`): the lab the proxy, the render the mezzanine. Every
// source stays open for the page's life, and is let go with it.

import { Effect, Layer, Option, Scope, Semaphore } from 'effect';
import type { Input, VideoSample, VideoSampleSink } from 'mediabunny';
import type { FootageFrames, FootageRead } from '../canvas/film.ts';
import { Footage, FootageFrameMissing } from './footage.ts';

/** A source's samples at a run's times, in order (`samplesAtTimestamps`). */
type Samples = ReturnType<VideoSampleSink['samplesAtTimestamps']>;

/** How many decoded frames the host keeps for `ready`: a frame's few sources, and a still beside a seek. */
const KEPT = 8;

/** How many sources a frame's reads are decoded from at once. */
const AT_ONCE = 4;

const loadMediabunny = () => import('mediabunny');

/** A read's key in the kept frames. */
const keyOf = (read: FootageRead) => `${read.source}@${read.at}`;

/** A promise mediabunny made, as an Effect failing with why. */
const ask = <A>(promise: () => Promise<A>): Effect.Effect<A, string> =>
  Effect.tryPromise({ try: promise, catch: String });

/** What mediabunny answered, or `why` there was nothing. */
const present = <A>(found: Effect.Effect<A, string>, why: string) =>
  Effect.flatMap(found, (value) => Effect.fromOption(Option.fromNullishOr(value), () => why));

/** The sample a run's step gave, if it gave one: none once the run is over. */
const sampleIn = (got: Awaited<ReturnType<Samples['next']>>): Option.Option<VideoSample> => {
  if (got.done === true) return Option.none();
  return Option.fromNullishOr(got.value);
};

/** A failure of mediabunny's for `read`, named. */
const missing = (read: FootageRead) => (why: string) =>
  new FootageFrameMissing({ source: read.source, at: read.at, why });

/** `sample` copied whole onto a canvas of the host's, and let go. */
const copied = (sample: VideoSample): Effect.Effect<HTMLCanvasElement> =>
  Effect.sync(() => {
    const canvas = document.createElement('canvas');
    canvas.width = sample.displayWidth;
    canvas.height = sample.displayHeight;
    return canvas;
  }).pipe(
    Effect.flatMap((canvas) =>
      Option.match(Option.fromNullishOr(canvas.getContext('2d')), {
        onNone: () => Effect.die('2d context unavailable'),
        onSome: (ctx) =>
          Effect.sync(() => {
            sample.draw(ctx, 0, 0);
            return canvas;
          }),
      }),
    ),
    Effect.ensuring(Effect.sync(() => sample.close())),
  );

/** The live footage of a page that reads each source's copy at `urlOf(source)`. */
export const footageLayer = (urlOf: (source: string) => string): Layer.Layer<Footage> =>
  Layer.effect(
    Footage,
    Effect.gen(function* () {
      const library = yield* Effect.cached(ask(loadMediabunny));
      const inputs: Array<Input> = [];
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => inputs.forEach((input) => input.dispose())),
      );
      /** Each source's sink, opened once (one at a time) and kept: one that would not open is asked again next time. */
      const sinks = new Map<string, VideoSampleSink>();
      const opening = yield* Semaphore.make(1);
      const sinkOf = (source: string): Effect.Effect<VideoSampleSink, string> =>
        opening.withPermits(1)(
          Option.match(Option.fromUndefinedOr(sinks.get(source)), {
            onSome: (sink) => Effect.succeed(sink),
            onNone: () =>
              Effect.gen(function* () {
                const mb = yield* library;
                const input = new mb.Input({
                  source: new mb.UrlSource(urlOf(source)),
                  formats: mb.ALL_FORMATS,
                });
                inputs.push(input);
                const track = yield* present(
                  ask(() => input.getPrimaryVideoTrack()),
                  'it has no picture',
                );
                const sink = new mb.VideoSampleSink(track);
                sinks.set(source, sink);
                return sink;
              }),
          }),
        );

      /** The frames decoded for `ready`, oldest first. */
      const kept = new Map<string, HTMLCanvasElement>();
      const keep = (key: string, canvas: HTMLCanvasElement) => {
        kept.delete(key);
        kept.set(key, canvas);
        for (const old of kept.keys()) {
          if (kept.size <= KEPT) break;
          kept.delete(old);
        }
      };
      const decodeOne = (read: FootageRead): Effect.Effect<void, FootageFrameMissing> =>
        Option.match(Option.fromUndefinedOr(kept.get(keyOf(read))), {
          onSome: () => Effect.void,
          onNone: () =>
            Effect.gen(function* () {
              const sink = yield* sinkOf(read.source);
              const sample = yield* present(
                ask(() => sink.getSample(read.at)),
                'it starts after that time',
              );
              keep(keyOf(read), yield* copied(sample));
            }).pipe(Effect.mapError(missing(read))),
        });
      const lookup: FootageFrames = { frame: (read) => kept.get(keyOf(read)) };

      /** A run over `frames`: each source's samples at the times the run reads it, in order. */
      const runOf = (frames: ReadonlyArray<ReadonlyArray<FootageRead>>) =>
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          const times = new Map<string, Array<number>>();
          for (const read of frames.flat())
            times.set(read.source, [
              ...Option.getOrElse(Option.fromUndefinedOr(times.get(read.source)), () => []),
              read.at,
            ]);
          /** Each source's samples, made when the run first reads it. */
          const iterators = new Map<string, Samples>();
          const iteratorOf = (source: string): Effect.Effect<Samples, string> =>
            Option.match(Option.fromUndefinedOr(iterators.get(source)), {
              onSome: (it) => Effect.succeed(it),
              onNone: () =>
                Effect.map(sinkOf(source), (sink) => {
                  const it = sink.samplesAtTimestamps(
                    Option.getOrElse(Option.fromUndefinedOr(times.get(source)), () => []),
                  );
                  iterators.set(source, it);
                  return it;
                }),
            });
          /** The frames the last `next` handed out: let go at the next, or when the run ends. */
          let held: Array<VideoFrame> = [];
          const letGo = Effect.sync(() => {
            held.forEach((frame) => frame.close());
            held = [];
          });
          yield* Scope.addFinalizer(
            scope,
            Effect.andThen(
              letGo,
              Effect.forEach(
                [...iterators.values()],
                (it) => Effect.ignore(ask(() => it.return())),
                { concurrency: AT_ONCE, discard: true },
              ),
            ),
          );
          const frameOf = (read: FootageRead) =>
            Effect.gen(function* () {
              const it = yield* iteratorOf(read.source);
              const got = yield* ask(() => it.next());
              const sample = yield* Effect.fromOption(sampleIn(got), () => 'no frame at that time');
              const frame = sample.toVideoFrame();
              sample.close();
              held.push(frame);
              return [keyOf(read), frame] as const;
            }).pipe(Effect.mapError(missing(read)));
          let k = 0;
          const next = Effect.suspend(() => {
            const reads = Option.getOrElse(Option.fromUndefinedOr(frames[k]), () => []);
            k += 1;
            return Effect.andThen(
              letGo,
              Effect.map(Effect.forEach(reads, frameOf), (decoded): FootageFrames => {
                const byKey = new Map<string, CanvasImageSource>(decoded);
                return { frame: (read) => byKey.get(keyOf(read)) };
              }),
            );
          });
          return { next };
        });

      return Footage.of({
        ready: (reads) =>
          Effect.as(
            Effect.forEach(reads, decodeOne, { concurrency: AT_ONCE, discard: true }),
            lookup,
          ),
        run: runOf,
      });
    }),
  );
