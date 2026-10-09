// Every studio page, at rest and with what it discloses open, on a phone
// (390 × 844, a finger) and on a laptop (1440 × 900, a mouse): each shown
// control a pointer can operate (buttons, links, summaries, fields, sliders,
// menu items, anything focusable) has a hit area of `--hit` at least, the
// design language's "every touch target ≥ --hit through padding": 44 px on
// the phone (`PHONE_HIT`), 28 px on the laptop (`DESK_HIT`). The area is
// what a tap reaches (`undersizedTargets`, `fixtures/touch-targets.ts`):
// padding and a pseudo-element hit-slop count, a covered part does not, and
// a hit-slop lying over another control's box fails its target. A
// failure names each target under it, with what a pointer meets.
//
// The disclosed states are the fixture film's (`fixtures/studio-film.ts`,
// `studio-states.ts`). Both guards are keyed by place (`Places`,
// `core/api.ts`): a place added there is opened by one case at least or
// named exempt with its reason, or this fails to typecheck, and each case
// checks its page stands at its place. A layer (a sheet, a menu, a dialog)
// is measured within itself; what lies under it was measured with it closed.
//
// The exceptions are principles, the same on every page and both devices:
// - a backing input (out of the accessibility tree and the tab order, and
//   nothing of it to see or press) is not a target; its visible field is;
// - Inline (WCAG 2.5.8): a link in a sentence takes the line's size;
// - Spacing (WCAG 2.5.8, at `--hit`): a target 24 px each way or more whose
//   `--hit` circle reaches no other target cannot be missed for a neighbour.

import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Option } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import {
  SLOW,
  DEVICES,
  byPlace,
  unmeasured,
  CONTEXT_MENU,
  RECEIPTS,
  STATES,
  targetsIn,
  drawnIn,
  LONG_PRESSED,
} from './studio-states.ts';

for (const device of DEVICES) {
  describe(`touch targets on ${device.name}`, () => {
    for (const [place, state] of byPlace(STATES))
      it.live(state.name, () => targetsIn(place, state, device), SLOW);
  });

  // Serial: while a finger is down on one tab, Chrome drops, or lands as a bare click, the
  // touches the file's other cases send their own tabs at the same time.
  test.serial(
    `${LONG_PRESSED.name} on ${device.name}: its targets are the device's size, and it is drawn in its tokens`,
    () =>
      Effect.runPromise(
        Effect.andThen(
          targetsIn('project', LONG_PRESSED, device),
          drawnIn('project', LONG_PRESSED, device),
        ),
      ),
    2 * SLOW,
  );
}

describe('a place named exempt from a guard', () => {
  test('is measured at a place that has cases, in every table', () => {
    expect(unmeasured(STATES)).toEqual([]);
  });

  test('is found when the place measuring it is exempt itself', () => {
    expect(unmeasured({ ...STATES, home: { measuredAt: 'lab', why: 'planted' } })).toEqual([
      'home',
    ]);
  });
});

/** The roles the command surfaces' sources name: `data-role="…"`, or the `role="…-menu"` a menu hands its popup (an ARIA role has no hyphen before `menu`). */
const ROLE = /(?:data-role="([\w-]+)"|\brole="([\w-]+-menu)")/g;

/** The roles in those sources that are a part of a surface (a toast, a legend, a hint), not one. */
const PARTS: ReadonlySet<string> = new Set(['receipt', 'keys-legend', 'inspector-hint']);

/** The command surfaces `sources` name, each by its `data-role`. */
const surfacesOf = (sources: ReadonlyArray<string>): ReadonlyArray<string> =>
  Array.from(
    new Set(sources.flatMap((s) => Array.from(s.matchAll(ROLE), (m) => m[1] ?? m[2] ?? ''))),
  ).filter((role) => role !== '' && !PARTS.has(role));

/** The surfaces among `surfaces` that none of `layers` is: no case opens and measures them. */
const unopened = (surfaces: ReadonlyArray<string>, layers: ReadonlyArray<string>) =>
  surfaces.filter((role) => !layers.some((layer) => layer.includes(`data-role="${role}"`)));

describe('the command surfaces', () => {
  const layers = byPlace(STATES).flatMap(([, state]) =>
    Option.toArray(Option.fromUndefinedOr(state.layer)),
  );

  it.live('each has a case that opens and measures it', () =>
    Effect.gen(function* () {
      const dir = `${import.meta.dir}/../../src/lab/command`;
      const fs = yield* FileSystem.FileSystem;
      const names = (yield* fs.readDirectory(dir)).filter((name) => name.endsWith('.tsx'));
      const sources = yield* Effect.forEach(names, (name) => fs.readFileString(`${dir}/${name}`));
      const surfaces = surfacesOf(sources);
      // The surfaces the lab's command code names today, so a renamed role cannot empty the list.
      expect(surfaces).toEqual(
        expect.arrayContaining([
          'command-menu',
          'context-menu',
          'chip-menu',
          'view-menu',
          'receipts',
          'keys-sheet',
        ]),
      );
      expect(unopened(surfaces, layers)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  test('one no case opens is found', () => {
    expect(unopened(['receipts', 'chip-menu'], [CONTEXT_MENU, RECEIPTS])).toEqual(['chip-menu']);
  });
});
