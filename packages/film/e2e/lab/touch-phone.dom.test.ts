// The studio on a phone (390 × 844): the review's transport lies in one row
// over the tab bar; every page fits (no sideways scroll, each control inside
// the width, its chrome at most a quarter of the height); a short name is as
// wide as its words; a finger on a note's field under the scope's × writes in
// the field; a finger on a slider drags it from the top edge of its box.

import { Effect, Schedule } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { openReview } from '../../src/lab/fixtures/harness.ts';
import { fitsPhone } from '../../src/lab/fixtures/phone-fit.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { evaluates, waitFor } from '../../src/lab/fixtures/settled.ts';
import { STUDIO_FOLDER, STUDIO_SET, studioRoutes } from '../../src/lab/fixtures/studio-film.ts';
import { PHONE_HIT } from '../../src/lab/fixtures/touch-targets.ts';
import type { State, ByPlace } from './studio-states.ts';
import {
  SLOW,
  PHONE,
  DEVICES,
  byPlace,
  isAt,
  review,
  lab,
  player,
  WORK_ROUTES,
  opens,
  CHOICES,
  PROJECT,
  PROJECT_READY,
  STILL,
  CHOICES_READY,
  SELECTION_SHEET,
  labCue,
  cueFieldsShown,
  labNoteOnCue,
  LAB_MOVES,
} from './studio-states.ts';

/**
 * The review's transport as a script reads it: whether its dock stands on
 * the tab bar, and whether play, the time, the scrub and the rate lie in that
 * order along one line. Their size is the touch guard's (a finger's target)
 * and the phone-fit checks' (the chrome's share of the screen).
 */
const TRANSPORT_ROW = `(() => {
  const dock = document.querySelector('.sh-dock:has(.rv-transport)');
  const d = dock.getBoundingClientRect();
  const parts = ['[data-act="play"]', '.rv-time', 'input[type="range"]', '[data-act="rate"]'].map(
    (s) => dock.querySelector(s).getBoundingClientRect(),
  );
  const mid = (r) => r.top + r.height / 2;
  return [
    'on the tabs ' + (Math.round(d.bottom) === Math.round(document.querySelector('.sh-pagebar').getBoundingClientRect().top)),
    'in order ' + parts.every((r, i) => i === 0 || r.left >= parts[i - 1].right - 0.5),
    'one line ' + parts.every((r) => Math.abs(mid(r) - mid(d)) < 4),
  ];
})()`;

describe('the review transport on a phone (UI-10)', () => {
  const PAGES = [
    ['Choices', review(CHOICES, ...CHOICES_READY)],
    ['Project', review(PROJECT, ...PROJECT_READY)],
    ['a Set', review(pageHref.set(STUDIO_FOLDER, STUDIO_SET), '.rv-main video')],
  ] as const;
  for (const [name, open] of PAGES) {
    it.live(
      `${name}: one row docked over the tab bar: play, the time, the scrub, then the rate`,
      () =>
        Effect.gen(function* () {
          const page = yield* open(PHONE.viewport);
          yield* evaluates(page, TRANSPORT_ROW, [
            'on the tabs true',
            'in order true',
            'one line true',
          ]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  }
});

describe('every page fits a phone, 390 × 844 (G8)', () => {
  /** A page: its name, how it opens, and the layer it opens, which is no chrome. */
  const PAGES: ByPlace<readonly [name: string, open: State['open'], layer?: string]> = {
    home: [['Films', review(pageHref.home(), '.rv-main a[href]')]],
    choices: [['Choices', review(CHOICES, ...CHOICES_READY)]],
    project: [['Project', review(PROJECT, ...PROJECT_READY)]],
    set: [['a Set', review(pageHref.set(STUDIO_FOLDER, STUDIO_SET), '.rv-main video')]],
    folder: [
      ['a Folder', review(pageHref.folder(STUDIO_FOLDER), '.rv-card.rv-tall .rv-cap .rv-name')],
    ],
    scenes: [
      ['Scenes', player(pageHref.scenes(PROBE), STILL)],
      [
        "Scenes, its legend full (out of date, not rendered, approved, findings, warnings, the film's)",
        player(pageHref.scenes(PROBE), '.sc-legend-item[data-mark="film"]', WORK_ROUTES),
      ],
    ],
    scene: [
      [
        // Its sheet is a layer over the tape, as an inspector is: shut to go back, so no chrome.
        "Scenes, a scene selected: its sheet's width and controls the page's, the sheet no chrome",
        player(pageHref.scene(PROBE, 'two'), '.sc-focus .sc-card'),
        '[data-role="scene"]',
      ],
    ],
    lab: LAB_MOVES,
    labScene: [
      ['Lab', lab('edit')],
      // Its sheet peeks one line above the dock, counted as chrome: the header, the peek, the
      // dock and the tab bar, within the quarter.
      ['Lab, a scene with a cue selected', labCue],
      [
        // Opened, the sheet is a layer over the Lab, as an inspector is: shut to go back, so no chrome.
        "Lab, a scene with a cue selected, its sheet opened: the sheet's width and controls the page's, the sheet no chrome",
        (viewport) => Effect.tap(labCue(viewport), cueFieldsShown),
        SELECTION_SHEET,
      ],
    ],
    play: [['Play', player(pageHref.play(PROBE), '.bar [data-act="play"]')]],
  };
  for (const [place, [name, open, layer]] of byPlace(PAGES)) {
    it.live(
      `${name}: no sideways scroll, every control inside the width, chrome at most a quarter of the height`,
      () =>
        Effect.gen(function* () {
          const page = yield* open(PHONE.viewport);
          yield* isAt(page, place);
          yield* fitsPhone(page, layer);
        }).pipe(Effect.scoped),
      SLOW,
    );
  }
});

/** How far `selector`'s box is wider than its words, in px. */
const slack = (selector: string) =>
  `(() => { const b = document.querySelector('${selector}'); const words = document.createRange(); words.selectNodeContents(b); return b.getBoundingClientRect().width - words.getBoundingClientRect().width; })()`;

for (const device of DEVICES) {
  describe(`a short name on ${device.name}`, () => {
    it.live(
      'with no comment count beside it, is as wide as its words: its hit-slop is its target, no gap after it',
      () =>
        Effect.gen(function* () {
          const page = yield* review(CHOICES, ...CHOICES_READY)(device.viewport);
          yield* page.until(`matchMedia('${device.pointer}').matches`);
          yield* page.until(
            `${slack('[data-point="look:ground"] [data-variant="now"] .lab-inspect')} < 1`,
          );
        }).pipe(Effect.scoped),
      SLOW,
    );
  });
}

describe("a note's scope × on a phone", () => {
  const SCOPE_X = '[data-role="note-scope"] [data-act="clear-scope"]';
  const FIELD = '.lab-compose textarea';
  // Serial: a finger's touches (`film/touches-serial`).
  test.serial(
    "a finger on the note's field, just under the ×, writes in the field and keeps the scope",
    () =>
      Effect.gen(function* () {
        const page = yield* labNoteOnCue(PHONE.viewport);
        yield* opens('[data-act="note-frame"]', SCOPE_X)(page);
        yield* page.until(
          `(() => { document.querySelector('${FIELD}').scrollIntoView({ block: 'center', behavior: 'instant' }); document.activeElement.blur(); return document.activeElement === document.body; })()`,
        );
        const x = yield* page.box(SCOPE_X);
        const field = yield* page.box(FIELD);
        // The finger lands 1 px inside the field's top edge, under the ×'s middle.
        yield* page.finger.down(x.x + x.width / 2, field.y + 1);
        yield* page.finger.up;
        yield* page.until(`document.activeElement === document.querySelector('${FIELD}')`);
        yield* evaluates(page, `document.querySelector('${SCOPE_X}') !== null`, true);
      }).pipe(Effect.scoped, Effect.runPromise),
    SLOW,
  );
});

describe('a finger on a slider', () => {
  // Serial: a finger's touches (`film/touches-serial`).
  test.serial(
    "drags a level from the top edge of its box, where a finger meets it, not only on the track's line",
    () =>
      Effect.gen(function* () {
        const { page, asked } = yield* openReview(studioRoutes, {
          href: CHOICES,
          viewport: PHONE.viewport,
        });
        const slider = '.rv-knob input[type="range"]';
        yield* waitFor(page, slider);
        yield* page.until(
          `(() => { const s = document.querySelector('${slider}'); s.scrollIntoView({ block: 'center', behavior: 'instant' }); return s.value === '-24'; })()`,
        );
        const box = yield* page.box(slider);
        // The box is a finger tall; the finger lands 2 px under its top, well off the 4 px track.
        expect(box.height).toBeGreaterThanOrEqual(PHONE_HIT);
        yield* page.finger.down(box.x + box.width * 0.4, box.y + 2);
        yield* page.finger.move(box.x + box.width * 0.9, box.y + 2, 20);
        // Held, the slider shows the value dragged to: up toward 0 dB from -24.
        yield* page.until(`Number(document.querySelector('${slider}').value) > -10`);
        yield* page.finger.up;
        // Let go, the level is written.
        yield* Effect.sync(() => asked.some((a) => a.method === 'POST')).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (sent) => sent }),
          Effect.timeout('10 seconds'),
        );
      }).pipe(Effect.scoped, Effect.runPromise),
    SLOW,
  );
});
