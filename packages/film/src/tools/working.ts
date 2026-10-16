// What the agents say they are doing now (the `working` tool): one line per
// agent per film, held in the lab's memory and nowhere else, read by the
// studio's header (`core/film-timeline.ts`). A line clears when its agent says
// it is done, or after `WORKING_HELD` of silence from it (an agent that stops
// without saying so leaves no stale line); a new line from the same agent
// replaces its last. The lab's restart clears every line: nothing is written.

import { Array as Arr, Context, DateTime, Duration, Effect, Layer, Order, Ref } from 'effect';
import type { WorkingLine } from '../core/film-timeline.ts';

/** How long a line is held after its agent last said it: half an hour of silence clears it. */
export const WORKING_HELD = Duration.minutes(30);

/** A line as the lab holds it: whose, about which film, and when it was said (ms). */
interface Held {
  readonly film: string;
  readonly by: string;
  readonly text: string;
  readonly at: number;
}

interface WorkingService {
  /** `by`'s line on `film` is `text` now, in place of its last. */
  readonly say: (film: string, by: string, text: string) => Effect.Effect<WorkingLine>;
  /** `by` is done on `film`: its line clears. */
  readonly done: (film: string, by: string) => Effect.Effect<void>;
  /** The lines said on `film` within `WORKING_HELD`, the newest first. */
  readonly on: (film: string) => Effect.Effect<ReadonlyArray<WorkingLine>>;
}

const lineOf = (held: Held): WorkingLine => ({
  by: held.by,
  text: held.text,
  at: DateTime.formatIso(DateTime.makeUnsafe(held.at)),
});

const same = (film: string, by: string) => (held: Held) => held.film === film && held.by === by;

export class Working extends Context.Service<Working, WorkingService>()(
  '@bible/film/tools/Working',
) {
  static readonly layer = Layer.effect(
    Working,
    Effect.gen(function* () {
      const lines = yield* Ref.make<ReadonlyArray<Held>>([]);
      const held = Duration.toMillis(WORKING_HELD);

      const say = Effect.fn('Working.say')(function* (film: string, by: string, text: string) {
        const line: Held = { film, by, text, at: (yield* DateTime.now).epochMilliseconds };
        yield* Ref.update(lines, (all) => [...all.filter((h) => !same(film, by)(h)), line]);
        yield* Effect.log(`[working] said film=${film} by=${by}`);
        return lineOf(line);
      });

      const done = Effect.fn('Working.done')(function* (film: string, by: string) {
        yield* Ref.update(lines, (all) => all.filter((h) => !same(film, by)(h)));
        yield* Effect.log(`[working] done film=${film} by=${by}`);
      });

      const on = Effect.fn('Working.on')(function* (film: string) {
        const now = (yield* DateTime.now).epochMilliseconds;
        // Lines silent past the hold clear here, for every film.
        const kept = yield* Ref.updateAndGet(lines, (all) => all.filter((h) => now - h.at < held));
        return Arr.sort(
          kept.filter((h) => h.film === film),
          Order.mapInput(Order.flip(Order.Number), (h: Held) => h.at),
        ).map(lineOf);
      });

      return Working.of({ say, done, on });
    }),
  );
}
