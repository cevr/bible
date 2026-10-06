// Fixture for film/two-fingers-serial: each line marked RED fires the rule,
// and nothing else does.
import { test } from 'bun:test';
import { it } from 'effect-bun-test';
import { Effect } from 'effect';

declare const page: {
  readonly finger: {
    readonly down: (x: number, y: number) => Effect.Effect<void>;
    readonly second: { readonly down: (x: number, y: number) => Effect.Effect<void> };
  };
};

it.live(
  'a second finger in a case that runs beside its siblings',
  () => page.finger.second.down(1, 1), // RED film/two-fingers-serial
);

test('a second finger in a plain test', () => Effect.runPromise(page.finger.second.down(1, 1))); // RED film/two-fingers-serial

/** A helper of the file: its second finger is a case's that may run beside others. */
const pinch = () => page.finger.second.down(2, 2); // RED film/two-fingers-serial

test.serial('a second finger in a case that runs alone', () =>
  Effect.runPromise(Effect.andThen(page.finger.down(0, 0), page.finger.second.down(1, 1))),
);

it.live('one finger beside its siblings', () => Effect.andThen(page.finger.down(0, 0), pinch));
