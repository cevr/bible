// The live footage host (`footage-browser.ts`) on a stand-in mediabunny that
// counts what it is asked to let go: a run's decoders are let go when its
// scope closes, however far it got (read partway, or failed on a source that
// will not open), with every frame it handed out; and a frame's reads, once
// handed over, stay held, whatever is decoded after.

import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, Option } from 'effect';
import { standInDom } from '../canvas/fixtures/stand-in.ts';
import { footageLayer } from './footage-browser.ts';
import { Footage } from './footage.ts';

/** What the stand-in was asked to let go. */
interface LetGo {
  returned: number;
  frames: number;
}

/** `value`, as mediabunny's promises answer. */
const settled = <A>(value: A) => Effect.runPromise(Effect.succeed(value));

/** An iterator's end, as mediabunny's samples answer it. */
const DONE = { done: true } as const;

/** mediabunny, as far as the host uses it, its sources named by URL; those in `closed` have no picture. */
const standIn = (letGo: LetGo, closed: ReadonlySet<string>) => {
  const sample = (at: number) => ({
    timestamp: at,
    displayWidth: 4,
    displayHeight: 2,
    draw: () => {},
    close: () => {},
    toVideoFrame: () => ({
      close: () => {
        letGo.frames += 1;
      },
    }),
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
      return settled(
        Option.getOrNull(Option.liftPredicate({ url: this.url }, () => !closed.has(this.url))),
      );
    }
    dispose() {}
  }
  class VideoSampleSink {
    getSample(at: number) {
      return settled(sample(at));
    }
    samplesAtTimestamps(times: ReadonlyArray<number>) {
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
          letGo.returned += 1;
          return settled(DONE);
        },
      };
    }
  }
  const module = { Input, UrlSource, ALL_FORMATS: [], VideoSampleSink };
  return module as unknown as Awaited<ReturnType<NonNullable<Parameters<typeof footageLayer>[1]>>>;
};

/** The live host over the stand-in, each source read at its own name. */
const hostOver = (letGo: LetGo, closed: ReadonlySet<string> = new Set()) =>
  footageLayer(
    (source) => source,
    () => settled(standIn(letGo, closed)),
  );

const at = (source: string, t: number) => ({ source, at: t });

describe('the live footage host', () => {
  it.effect(
    "lets a run's decoders go when its scope closes, read partway or failed partway, with every frame it handed out",
    () => {
      const letGo: LetGo = { returned: 0, frames: 0 };
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
        expect(letGo).toEqual({ returned: 1, frames: 2 });
        // Failed on its second source, which will not open, its first already decoding.
        const failed = yield* Effect.scoped(
          Effect.gen(function* () {
            const run = yield* footage.run([[at('a', 0), at('b', 0)]]);
            return yield* Effect.flip(run.next);
          }),
        );
        expect(failed.source).toBe('b');
        expect(letGo).toEqual({ returned: 2, frames: 3 });
      }).pipe(Effect.provide(hostOver(letGo, new Set(['b']))));
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
    }).pipe(Effect.scoped, Effect.provide(hostOver({ returned: 0, frames: 0 }))),
  );
});
