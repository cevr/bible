// The studio on a phone (390 × 844): the review's transport lies in one row
// on the floor; every page fits (no sideways scroll, each control inside
// the width, its chrome at most a quarter of the height); a short name is as
// wide as its words; a finger on a note's field under the scope's × writes in
// the field; a finger on a slider drags it from the top edge of its box.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { openReview } from '../../src/lab/fixtures/harness.ts';
import { fitsPhone } from '../../src/lab/fixtures/phone-fit.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { evaluates, waitFor } from '../../src/lab/fixtures/settled.ts';
import {
  STUDIO_ASK,
  STUDIO_PAGE,
  STUDIO_DRAFT,
  STUDIO_FOLDER,
  STUDIO_PRODUCTION,
  STUDIO_SERIES,
  STUDIO_SET,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import { PHONE_HIT } from '../../src/lab/fixtures/touch-targets.ts';
import type { State, ByPlace } from './studio-states.ts';
import {
  SLOW,
  PHONE,
  byPlace,
  isAt,
  review,
  lab,
  player,
  opens,
  PRODUCTION_READY,
  ASK_READY,
  PAGE_READY,
  DELIVERY_READY,
  DRAFT_READY,
  SELECTION_SHEET,
  labCue,
  cueFieldsShown,
  labNoteOnCue,
  LAB_MOVES,
} from './studio-states.ts';

/**
 * The review's transport as a script reads it: whether its dock stands on
 * the floor, and whether play, the time, the scrub and the rate lie in that
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
    'on the floor ' + (Math.round(d.bottom) === innerHeight),
    'in order ' + parts.every((r, i) => i === 0 || r.left >= parts[i - 1].right - 0.5),
    'one line ' + parts.every((r) => Math.abs(mid(r) - mid(d)) < 4),
  ];
})()`;

describe('the review transport on a phone (UI-10)', () => {
  const PAGES = [
    ['a Set', review(pageHref.set(STUDIO_FOLDER, STUDIO_SET), '.rv-main video')],
  ] as const;
  for (const [name, open] of PAGES) {
    it.live(
      `${name}: one row docked on the floor: play, the time, the scrub, then the rate`,
      () =>
        Effect.gen(function* () {
          const page = yield* open(PHONE.viewport);
          yield* evaluates(page, TRANSPORT_ROW, [
            'on the floor true',
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
    set: [['a Set', review(pageHref.set(STUDIO_FOLDER, STUDIO_SET), '.rv-main video')]],
    folder: [
      ['a Folder', review(pageHref.folder(STUDIO_FOLDER), '.rv-card.rv-tall .rv-cap .rv-name')],
    ],
    production: [
      ['a Production', review(pageHref.production(STUDIO_PRODUCTION), PRODUCTION_READY)],
    ],
    ask: [['an ask', review(pageHref.ask(STUDIO_ASK), ASK_READY)]],
    askPage: [['a page of asks', review(pageHref.askPage(STUDIO_PAGE), PAGE_READY)]],
    draft: [['a series draft', review(pageHref.draft(STUDIO_SERIES, STUDIO_DRAFT), DRAFT_READY)]],
    draftBeat: [
      [
        'a series draft, a word selected',
        review(pageHref.draftBeat(STUDIO_SERIES, STUDIO_DRAFT, '1', '4-4'), DELIVERY_READY),
      ],
    ],
    lab: LAB_MOVES,
    labScene: [
      ['Lab', lab('edit')],
      // Its sheet peeks one line above the dock, counted as chrome: the header, the peek and the
      // dock, within the quarter.
      ['Lab, a scene with a cue selected', labCue],
      [
        // Opened, the sheet is a layer over the Lab, as an inspector is: shut to go back, so no chrome.
        "Lab, a scene with a cue selected, its sheet opened: the sheet's width and controls the page's, the sheet no chrome",
        (viewport) => Effect.tap(labCue(viewport), cueFieldsShown),
        SELECTION_SHEET,
      ],
    ],
    studio: [['Studio', player(pageHref.studio(PROBE), '.st-timeline .st-clip')]],
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

describe("a note's scope × on a phone", () => {
  const SCOPE_X = '[data-role="note-scope"] [data-act="clear-scope"]';
  const FIELD = '.lab-compose textarea';
  // Serial: a finger's touches (`film/touches-serial`).
  it.scopedLive.serial(
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
      }),
    SLOW,
  );
});

describe('a finger on a slider', () => {
  // Serial: a finger's touches (`film/touches-serial`).
  it.scopedLive.serial(
    "drags a Set's scrub from the top edge of its box, where a finger meets it, not only on the track's line",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openReview(studioRoutes, {
          href: pageHref.set(STUDIO_FOLDER, STUDIO_SET),
          viewport: PHONE.viewport,
        });
        const slider = '.rv-transport input[type="range"]';
        yield* waitFor(page, slider);
        yield* page.until(
          `(() => { const s = document.querySelector('${slider}'); return Number(s.max) > 1 && Number(s.value) === Number(s.min); })()`,
        );
        const box = yield* page.box(slider);
        // The box is a finger tall; the finger lands 2 px under its top, well off the 4 px track.
        expect(box.height).toBeGreaterThanOrEqual(PHONE_HIT);
        yield* page.finger.down(box.x + box.width * 0.1, box.y + 2);
        yield* page.finger.move(box.x + box.width * 0.8, box.y + 2, 20);
        // Held, the scrub shows the time dragged to: past the middle of the clip.
        yield* page.until(
          `(() => { const s = document.querySelector('${slider}'); return Number(s.value) > (Number(s.min) + Number(s.max)) / 2; })()`,
        );
        yield* page.finger.up;
      }),
    SLOW,
  );
});
