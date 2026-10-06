// Fixture for film/touches-serial: each line marked RED fires the rule, and
// nothing else does.
import { describe, test } from 'bun:test';
import { it } from 'effect-bun-test';
import { Effect } from 'effect';
import { touch as press } from '../../src/lab/fixtures/gestures.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';

declare const page: Tab;

it.live(
  'a second finger in a case that runs beside its siblings',
  () => page.finger.second.down(1, 1), // RED film/touches-serial
);

test('a one-finger tap in a plain test', () => Effect.runPromise(page.finger.down(1, 1))); // RED film/touches-serial

it.live('the touch gesture beside its siblings', () => press(page, 'button', 0)); // RED film/touches-serial

/** A helper of the file: it touches wherever it is used. */
const pinch = () => page.finger.second.down(2, 2);

/** A table of steps, one of which touches: the table touches. */
const STEPS = [{ name: 'tap', run: () => Effect.andThen(page.finger.down(0, 0), page.finger.up) }];

it.live('a helper that touches, used beside its siblings', () => pinch()); // RED film/touches-serial

describe('cases made from a table that touches', () => {
  for (const step of STEPS) it.live(step.name, () => step.run()); // RED film/touches-serial
});

test.serial('two fingers in a case that runs alone', () =>
  Effect.runPromise(Effect.andThen(page.finger.down(0, 0), page.finger.second.down(1, 1))),
);

test.serial('the touch gesture and a helper in a case that runs alone', () =>
  Effect.runPromise(Effect.andThen(press(page, 'button', 4), pinch())),
);

describe('cases made serial from a table that touches', () => {
  test.serial('each step, alone', () =>
    Effect.runPromise(Effect.forEach(STEPS, (step) => step.run(), { discard: true })),
  );
});

it.live('a mouse beside its siblings', () => page.mouse.click(1, 1));
