/**
 * A history stack in memory: the `Location` for tests. Back is `Location`'s own; `LocationHistory` adds what only a
 * reader's browser does, Forward, and shows the stack for assertions.
 */

import { Context, Effect, Layer, Option, Ref, SubscriptionRef } from 'effect';

import { makeEntryKeys } from './entry-key.js';
import { Location, parseHref, relativeHref, type Entry } from './location.js';

export interface LocationHistoryService {
  /** Go forward one entry; at the last entry, nothing. */
  readonly forward: Effect.Effect<void>;
  /** Every entry on the stack, oldest first, and the index of the one on screen. */
  readonly entries: Effect.Effect<{ readonly stack: readonly Entry[]; readonly index: number }>;
}

export class LocationHistory extends Context.Service<LocationHistory, LocationHistoryService>()(
  '@bible/url-state/LocationHistory',
) {}

interface Stack {
  readonly stack: readonly Entry[];
  readonly index: number;
}

const normalise = (href: string): string => relativeHref(parseHref(href));

/** `Location` and `LocationHistory` over one stack, starting at `href`. */
export const layerMemory = (href: string): Layer.Layer<Location | LocationHistory> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const nextKey = yield* makeEntryKeys;
      const first: Entry = { href: normalise(href), key: yield* nextKey, navigation: 'load' };
      const stack = yield* Ref.make<Stack>({ stack: [first], index: 0 });
      const current = yield* SubscriptionRef.make(first);

      const show = (entry: Entry) => SubscriptionRef.set(current, entry);

      const push = Effect.fn('Location.memory.push')(function* (to: string) {
        const entry: Entry = { href: normalise(to), key: yield* nextKey, navigation: 'push' };
        yield* Ref.update(stack, ({ stack: entries, index }) => ({
          stack: [...entries.slice(0, index + 1), entry],
          index: index + 1,
        }));
        yield* show(entry);
      });

      const replace = Effect.fn('Location.memory.replace')(function* (to: string) {
        const { key } = yield* SubscriptionRef.get(current);
        const entry: Entry = { href: normalise(to), key, navigation: 'replace' };
        yield* Ref.update(stack, ({ stack: entries, index }) => ({
          stack: entries.with(index, entry),
          index,
        }));
        yield* show(entry);
      });

      const traverse = (delta: number) =>
        Effect.gen(function* () {
          const target = yield* Ref.modify(stack, (state): [Option.Option<Entry>, Stack] => {
            const index = state.index + delta;
            const entry = Option.fromUndefinedOr(state.stack[index]);
            const moved = Option.match(entry, {
              onNone: () => state,
              onSome: () => ({ stack: state.stack, index }),
            });
            return [entry, moved];
          });
          if (Option.isNone(target)) return;
          yield* show({ ...target.value, navigation: 'traverse' });
        });

      return Context.make(Location, {
        current: SubscriptionRef.get(current),
        changes: SubscriptionRef.changes(current),
        push,
        replace,
        back: traverse(-1),
      }).pipe(
        Context.add(LocationHistory, {
          forward: traverse(1),
          entries: Ref.get(stack),
        }),
      );
    }),
  );
