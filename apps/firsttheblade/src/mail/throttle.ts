/**
 * How often one place may sign up: `SIGNUPS` a minute from one IP address.
 * On Cloudflare it is a Rate Limiting binding (`../worker/mail.ts`), counted
 * at each location; in the tests and the preview it is a count kept in
 * memory against the clock. The address it counts is never kept or logged.
 */
import { Clock, Context, Effect, Layer, Ref } from 'effect';

export const SIGNUPS = { limit: 5, period: 60 } as const;

export interface ThrottleService {
  /** Whether one more sign-up from `key` may go now. */
  readonly allow: (key: string) => Effect.Effect<boolean>;
}

export class Throttle extends Context.Service<Throttle, ThrottleService>()(
  'firsttheblade/Throttle',
) {}

/** `SIGNUPS.limit` in each `SIGNUPS.period` window, per key. */
export const layerMemory = Layer.effect(
  Throttle,
  Effect.gen(function* () {
    const windows = yield* Ref.make(
      new Map<string, { readonly start: number; readonly count: number }>(),
    );
    const allow = Effect.fn('Throttle.allow')(function* (key: string) {
      const now = yield* Clock.currentTimeMillis;
      const start = now - (now % (SIGNUPS.period * 1000));
      return yield* Ref.modify(windows, (map) => {
        const seen = map.get(key);
        let count = 1;
        if (seen?.start === start) count = seen.count + 1;
        const next = new Map(map).set(key, { start, count });
        return [count <= SIGNUPS.limit, next] as const;
      });
    });
    return Throttle.of({ allow });
  }),
);
