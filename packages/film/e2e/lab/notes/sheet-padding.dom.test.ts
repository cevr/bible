// On a phone the Lab's foot clears the sheet that stands over it: the peek
// when it peeks, the whole sheet when it is raised. A cue's sheet left raised
// in Edit does not keep the room when the Lab shows Note, whose sheet peeks.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { PHONE, json, labAt, openLab, route } from '../../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../../src/lab/fixtures/probe-film.ts';
import { attributeIs, evaluates, waitFor } from '../../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;
const NOTE = {
  scene: 'one',
  T: 1,
  frame: 30,
  text: 'the ball rises too early',
  id: 'n1',
  film: PROBE,
  seq: 1,
  changed: 1,
  status: 'open',
  still: 'n1.png',
  thread: [],
  createdAt: '2026-09-28T00:00:00.000Z',
};

/** The room the body keeps at its foot, less the height of the sheet that peeks: how far it overshoots. */
const OVERSHOOT = `(() => {
  const peeking = [...document.querySelectorAll('.lab-selection-sheet[data-peek="true"]')].find((s) => s.checkVisibility());
  const pad = parseFloat(getComputedStyle(document.body).paddingBottom);
  return peeking === undefined ? Number.NaN : Math.round(pad - peeking.getBoundingClientRect().height);
})()`;

describe('the Lab on a phone', () => {
  it.live(
    'keeps the room of the sheet that stands, not of a raised sheet the mode hides',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab(
          [route('GET', /^\/notes$/, () => json({ film: PROBE, seq: 1, notes: [NOTE] }))],
          {
            href: labAt(1, { selection: { _tag: 'Cue', scene: 'one', name: 'rise' }, note: 'n1' }),
            mode: 'edit',
            viewport: PHONE,
          },
        );
        const cueSheet = '.lab-edit .lab-selection-sheet';
        const NOTE_PEEKS = '[data-mode-of="note"] .lab-selection-sheet[data-peek="true"]';
        yield* attributeIs(page, cueSheet, 'data-peek', 'true');
        // The room Note's peek keeps with the cue's sheet lowered behind it.
        yield* page.click('.lab-modes [data-mode-pick="note"]');
        yield* waitFor(page, NOTE_PEEKS);
        const kept = yield* page.evaluate<number>(OVERSHOOT);
        yield* page.click('.lab-modes [data-mode-pick="edit"]');
        yield* page.click(`${cueSheet} [data-act="sheet"]`);
        yield* attributeIs(page, cueSheet, 'data-peek', 'false');
        // The raised sheet stands over the tray: the mode is picked as its button's own click.
        yield* page.evaluate(
          `document.querySelector('.lab-modes [data-mode-pick="note"]').click()`,
        );
        yield* waitFor(page, NOTE_PEEKS);
        yield* evaluates(page, OVERSHOOT, kept);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
