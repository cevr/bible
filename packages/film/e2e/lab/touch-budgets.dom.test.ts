// The most things each view shows at rest, on the first screen and (for a
// long view) over its whole length, on each device: its controls, pictures
// and text leaves, as the UI-reduction sweep counts them (`firstScreenItems`).
// The count is the settled page's, and a thing that lands after the view is
// ready, or a long view's rows below the fold, is counted.

import { Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { type Tab, WAIT_MS } from '../../src/lab/fixtures/tab.ts';
import { firstScreenItems } from '../../src/lab/fixtures/touch-targets.ts';
import {
  SLOW,
  PHONE,
  DEVICES,
  LAB_EDIT,
  byPlace,
  review,
  lab,
  CHOICES,
  CHOICES_READY,
  STATES,
} from './studio-states.ts';

/**
 * How far the page's clock runs on before a view is counted: what a view
 * brings in after its ready selector (a timer, a later still, a legend read)
 * is on the page by then, so the count is the settled page's, not the first
 * moment it is within its budget.
 */
const SETTLE_MS = 5_000;

/** What a count's reach is called in a failure. */
const WHERE = { screen: 'first screen', page: 'page' } as const;

/**
 * The settled view shows at most `budget` things on its first screen, or over
 * its whole length when `reach` is the `page` (`firstScreenItems`); else each
 * one is named, `C` a control, `T` text.
 */
const withinBudget = (
  page: Tab,
  budget: number,
  view: string,
  reach: 'screen' | 'page' = 'screen',
  within = WAIT_MS,
) =>
  Effect.gen(function* () {
    yield* page.clock.fastForward(SETTLE_MS);
    const now = firstScreenItems(reach);
    yield* page.until(`${now}.length <= ${budget}`, {
      now,
      within,
      say: (found) =>
        `${view} shows more than ${budget} things on its ${WHERE[reach]} at rest: ${found}`,
    });
  });

/** The script that puts a `tag` saying "planted", fixed on the first screen, over the page. */
const PLANT = (tag: 'button' | 'p') =>
  `const el = document.createElement('${tag}'); el.textContent = 'planted'; Object.assign(el.style, { position: 'fixed', top: '120px', left: '16px', zIndex: '999' }); document.body.append(el);`;

/** Put `tag` saying "planted" on the first screen, over the page. */
const plant = (page: Tab, tag: 'button' | 'p') =>
  page.evaluate(`(() => { ${PLANT(tag)} return true; })()`);

/** Put `tag` saying "planted" on the page 2 s from now, on the page's own clock: a thing that lands after the view is ready. */
const plantLater = (page: Tab, tag: 'button' | 'p') =>
  page.evaluate(`(() => { setTimeout(() => { ${PLANT(tag)} }, 2000); return true; })()`);

for (const device of DEVICES) {
  describe(`the targets each view shows at rest on ${device.name} (UR2-17)`, () => {
    for (const [state, budget] of byPlace(STATES).flatMap(([, s]) =>
      Option.toArray(Option.map(Option.fromUndefinedOr(s.budget), (b) => [s, b] as const)),
    )) {
      it.live(
        `${state.name}: at most ${budget[device.budget]}`,
        () =>
          Effect.gen(function* () {
            const page = yield* state.open(device.viewport);
            yield* withinBudget(page, budget[device.budget], `${state.name} on ${device.name}`);
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
    // A long view's whole length: what comes back on the rows below the fold is counted too.
    for (const [state, page] of byPlace(STATES).flatMap(([, s]) =>
      Option.toArray(Option.map(Option.fromUndefinedOr(s.page), (b) => [s, b] as const)),
    )) {
      it.live(
        `${state.name}: at most ${page[device.budget]} over its whole length`,
        () =>
          Effect.gen(function* () {
            const opened = yield* state.open(device.viewport);
            yield* withinBudget(
              opened,
              page[device.budget],
              `${state.name} on ${device.name}`,
              'page',
            );
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
  });
}

describe('the at-rest budget (UR2-17)', () => {
  for (const [tag, what] of [
    ['button', 'a button'],
    ['p', 'a line of text'],
  ] as const) {
    it.live(
      `fails the Lab's Edit on a phone with ${what} landing 2 s after the view is ready`,
      () =>
        Effect.gen(function* () {
          const page = yield* lab('edit')(PHONE.viewport);
          yield* withinBudget(page, LAB_EDIT.phone, 'the Lab');
          yield* plantLater(page, tag);
          const exit = yield* Effect.exit(
            withinBudget(page, LAB_EDIT.phone, 'the Lab, a thing landing late', 'screen', 0),
          );
          expect(Exit.isFailure(exit)).toBe(true);
        }).pipe(Effect.scoped),
      SLOW,
    );
  }
  it.live(
    'fails a long view on a phone with a line of text planted below the first screen',
    () =>
      Effect.gen(function* () {
        const page = yield* review(CHOICES, ...CHOICES_READY)(PHONE.viewport);
        const choices = byPlace(STATES).filter(([place]) => place === 'choices')[0]?.[1];
        const ceiling = choices?.page?.phone ?? 0;
        const screen = choices?.budget?.phone ?? 0;
        yield* withinBudget(page, screen, 'Choices');
        yield* withinBudget(page, ceiling, 'Choices', 'page');
        // A line far below the fold: the first screen counts none of it, the page counts it.
        yield* page.evaluate(
          `(() => { const el = document.createElement('p'); el.textContent = 'planted'; el.style.marginTop = '5000px'; document.body.append(el); return true; })()`,
        );
        yield* withinBudget(page, screen, 'Choices, planted');
        const exit = yield* Effect.exit(withinBudget(page, ceiling, 'Choices, planted', 'page', 0));
        expect(Exit.isFailure(exit)).toBe(true);
      }).pipe(Effect.scoped),
    SLOW,
  );

  for (const [tag, what] of [
    ['button', 'a button'],
    ['p', 'a line of text'],
  ] as const) {
    it.live(
      `fails the Lab's Edit on a phone with ${what} planted past its budget`,
      () =>
        Effect.gen(function* () {
          const page = yield* lab('edit')(PHONE.viewport);
          yield* withinBudget(page, LAB_EDIT.phone, 'the Lab');
          yield* plant(page, tag);
          const exit = yield* Effect.exit(
            withinBudget(page, LAB_EDIT.phone, 'the Lab, planted', 'screen', 0),
          );
          expect(Exit.isFailure(exit)).toBe(true);
        }).pipe(Effect.scoped),
      SLOW,
    );
  }
});
