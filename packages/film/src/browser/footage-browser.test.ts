// The live footage host (`footage-browser.ts`) on a stand-in mediabunny that
// counts what it makes and what it is asked to let go: a run's decoders are
// let go when its scope closes, however far it got (read partway, or failed
// on a source that will not open), with every frame it handed out; a read
// still opening its source when the scope closes makes no decoder and holds
// no frame; and a frame's reads, once handed over, stay held, whatever is
// decoded after.

import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Deferred, Effect, Exit, Fiber, Layer, Option, Scope } from 'effect';
import { standInDom } from '../canvas/fixtures/stand-in.ts';
import { FootageDecoders, footageLayer } from './footage-browser.ts';
import { Footage } from './footage.ts';

/** What the stand-in made, and what it was asked to let go. */
interface Counted {
  /** Decoders made (`samplesAtTimestamps`), and returned. */
  made: number;
  returned: number;
  /** Frames handed out (`toVideoFrame`), and closed. */
  decoded: number;
  frames: number;
}

const counted = (): Counted => ({ made: 0, returned: 0, decoded: 0, frames: 0 });

/** A source whose opening waits: `asked` once the host asks for its picture, which it gives once `open` is done. */
interface Gate {
  readonly asked: Deferred.Deferred<void>;
  readonly open: Deferred.Deferred<void>;
}

/** `value`, as mediabunny's promises answer. */
const settled = <A>(value: A) => Effect.runPromise(Effect.succeed(value));

/** An iterator's end, as mediabunny's samples answer it. */
const DONE = { done: true } as const;

/**
 * mediabunny, as far as the host uses it, its sources named by URL: those in
 * `closed` have no picture, those `gated` open when their gate says.
 */
const standIn = (count: Counted, closed: ReadonlySet<string>, gated: ReadonlyMap<string, Gate>) => {
  const sample = (at: number) => ({
    timestamp: at,
    displayWidth: 4,
    displayHeight: 2,
    draw: () => {},
    close: () => {},
    toVideoFrame: () => {
      count.decoded += 1;
      return {
        close: () => {
          count.frames += 1;
        },
      };
    },
  });
  class UrlSource {
    constructor(readonly url: string) {}
  }
  class Input {
    readonly url: string;
    constructor(options: { readonly source: UrlSource }) {
      this.url = options.source.url;
    }
    getPrimaryVideoTrack() {
      const track = Option.getOrNull(
        Option.liftPredicate({ url: this.url }, () => !closed.has(this.url)),
      );
      return Effect.runPromise(
        Option.match(Option.fromUndefinedOr(gated.get(this.url)), {
          onNone: () => Effect.succeed(track),
          onSome: (gate) =>
            Deferred.done(gate.asked, Exit.void).pipe(
              Effect.andThen(Deferred.await(gate.open)),
              Effect.as(track),
            ),
        }),
      );
    }
    dispose() {}
  }
  class VideoSampleSink {
    getSample(at: number) {
      return settled(sample(at));
    }
    samplesAtTimestamps(times: ReadonlyArray<number>) {
      count.made += 1;
      let i = 0;
      return {
        next: () =>
          settled(
            Option.match(Option.fromUndefinedOr(times[i]), {
              onNone: () => DONE,
              onSome: (at) => {
                i += 1;
                return { done: false, value: sample(at) };
              },
            }),
          ),
        return: () => {
          count.returned += 1;
          return settled(DONE);
        },
      };
    }
  }
  // Only what the host calls: the stand-in is no whole mediabunny.
  const module = { Input, UrlSource, ALL_FORMATS: [], VideoSampleSink };
  return module as unknown as Awaited<ReturnType<Decoders['load']>>;
};

/** What the host is given mediabunny as. */
type Decoders = Parameters<typeof FootageDecoders.of>[0];

/** The live host over the stand-in, given where the page's host gives the module, each source read at its own name. */
const hostOver = (
  count: Counted,
  closed: ReadonlySet<string> = new Set(),
  gated: ReadonlyMap<string, Gate> = new Map(),
) =>
  footageLayer((source) => source).pipe(
    Layer.provide(
      Layer.succeed(
        FootageDecoders,
        FootageDecoders.of({ load: () => settled(standIn(count, closed, gated)) }),
      ),
    ),
  );

const at = (source: string, t: number) => ({ source, at: t });

describe('the live footage host', () => {
  it.effect(
    "lets a run's decoders go when its scope closes, read partway or failed partway, with every frame it handed out",
    () => {
      const count = counted();
      return Effect.gen(function* () {
        const footage = yield* Footage;
        // Read two frames of three.
        yield* Effect.scoped(
          Effect.gen(function* () {
            const run = yield* footage.run([[at('a', 0)], [at('a', 1)], [at('a', 2)]]);
            yield* run.next;
            yield* run.next;
          }),
        );
        expect(count).toEqual({ made: 1, returned: 1, decoded: 2, frames: 2 });
        // Failed on its second source, which will not open, its first already decoding.
        const failed = yield* Effect.scoped(
          Effect.gen(function* () {
            const run = yield* footage.run([[at('a', 0), at('b', 0)]]);
            return yield* Effect.flip(run.next);
          }),
        );
        expect(failed.source).toBe('b');
        expect(count).toEqual({ made: 2, returned: 2, decoded: 3, frames: 3 });
      }).pipe(Effect.provide(hostOver(count, new Set(['b']))));
    },
  );

  it.effect(
    'a read still opening its source when the run ends makes no decoder and holds no frame',
    () => {
      const count = counted();
      const gate: Gate = { asked: Deferred.makeUnsafe(), open: Deferred.makeUnsafe() };
      return Effect.gen(function* () {
        const footage = yield* Footage;
        const scope = yield* Scope.make();
        const run = yield* footage.run([[at('a', 0), at('b', 0)]]).pipe(Scope.provide(scope));
        // Its read on a fiber of its own, as the render runs each frame's, not the run's scope's.
        const reading = yield* Effect.forkDetach(run.next);
        yield* Deferred.await(gate.asked);
        // The run ends (the export stopped) while its second source still opens.
        yield* Scope.close(scope, Exit.void);
        yield* Deferred.done(gate.open, Exit.void);
        const read = yield* Fiber.await(reading);
        expect(Exit.isFailure(read)).toBe(true);
        expect(count).toEqual({ made: 1, returned: 1, decoded: 1, frames: 1 });
      }).pipe(Effect.provide(hostOver(count, new Set(), new Map([['b', gate]]))));
    },
  );

  it.effect("hands a frame's reads over held: what is decoded after never takes them away", () =>
    Effect.gen(function* () {
      yield* standInDom();
      const footage = yield* Footage;
      const first = yield* footage.ready([at('a', 0)]);
      // More frames than the host keeps, decoded before the first frame is drawn.
      yield* footage.ready(Arr.makeBy(9, (i) => at('a', i + 1)));
      expect(first.frame(at('a', 0))).toBeDefined();
    }).pipe(Effect.scoped, Effect.provide(hostOver(counted()))),
  );
});
