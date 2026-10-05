// Every studio page, at rest and with what it discloses open, on a phone
// (390 × 844, a finger) and on a laptop (1440 × 900, a mouse): each shown
// control a pointer can operate (buttons, links, summaries, fields, sliders,
// menu items, anything focusable) has a hit area of `--hit` at least, the
// design language's "every touch target ≥ --hit through padding": 44 px on
// the phone (`PHONE_HIT`), 28 px on the laptop (`DESK_HIT`). The area is
// what a tap reaches (`undersizedTargets`, `fixtures/touch-targets.ts`):
// padding and a pseudo-element hit-slop count, a covered part does not. A
// failure names each target under it, with what a pointer meets.
//
// The disclosed states are the fixture film's (`fixtures/studio-film.ts`):
// Project's panels with their stills and its dock, a scene row's sheet, an
// act's long-press menu, an inspector, the lab editor's Snap toggle and an
// `until` cue's End field, the Findings sheet, the command
// menu (⌘K, its Go to…), the context menu, the keys dialog, the lab's modes,
// comment counts on their rows, the Choices transport over a picture, a Set's
// wipe and diff, a film's Scenes with a scene selected and the
// Folder's loose videos. A short name with no count beside it is as wide as
// its words (its hit-slop is its target). A
// layer (a sheet, a menu, a dialog) is measured within itself; what lies
// under it was measured with it closed.
//
// The exceptions are principles, the same on every page and both devices:
// - a backing input (out of the accessibility tree and the tab order, and
//   nothing of it to see or press) is not a target; its visible field is;
// - Inline (WCAG 2.5.8): a link in a sentence takes the line's size;
// - Spacing (WCAG 2.5.8, at `--hit`): a target 24 px each way or more whose
//   `--hit` circle reaches no other target cannot be missed for a neighbour.

import { Effect, Schedule, type Scope } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import type { LabMode } from '../../src/lab/mode.ts';
import { rightClick, touch } from '../../src/lab/fixtures/gestures.ts';
import {
  type Viewport,
  labAt,
  openLab,
  openPlayer,
  openReview,
} from '../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { waitFor } from '../../src/lab/fixtures/settled.ts';
import {
  STUDIO_FILM,
  STUDIO_FOLDER,
  STUDIO_SET,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { DESK_HIT, PHONE_HIT, undersizedTargets } from '../../src/lab/fixtures/touch-targets.ts';

const SLOW = 30_000;

/** A device the studio is used on: its window and pointer, the media query its pointer matches, and the target it needs. */
interface Device {
  readonly name: string;
  readonly viewport: Viewport;
  readonly pointer: string;
  readonly hit: number;
}

const PHONE: Device = {
  name: 'a phone',
  viewport: { width: 390, height: 844, coarse: true },
  pointer: '(pointer: coarse)',
  hit: PHONE_HIT,
};
const LAPTOP: Device = {
  name: 'a laptop',
  viewport: { width: 1440, height: 900 },
  pointer: '(pointer: fine)',
  hit: DESK_HIT,
};
const DEVICES: ReadonlyArray<Device> = [PHONE, LAPTOP];

/** A page in one state: how it opens on a device, what discloses the state, and the layer measured. */
interface State {
  readonly name: string;
  readonly open: (viewport: Viewport) => Effect.Effect<Tab, never, Scope.Scope>;
  readonly disclose: (page: Tab) => Effect.Effect<void>;
  /** The layer the state opens, measured within itself; none: the whole page. */
  readonly layer?: string;
}

/** The page as it opens: nothing disclosed. */
const AT_REST = () => Effect.void;

/** A review page at `href`, once each of `ready` shows. */
const review =
  (href: string, ...ready: ReadonlyArray<string>) =>
  (viewport: Viewport) =>
    Effect.gen(function* () {
      const { page } = yield* openReview(studioRoutes, { href, viewport });
      for (const selector of ready) yield* waitFor(page, selector);
      return page;
    });

/** The lab in `mode`. */
const lab = (mode: LabMode) => (viewport: Viewport) =>
  Effect.map(openLab([], { viewport, mode }), (o) => o.page);

/** The player at `href`, once `ready` shows. */
const player = (href: string, ready: string) => (viewport: Viewport) =>
  Effect.map(openPlayer({ href, viewport }, ready), (o) => o.page);

/** A click on `selector`, then `shows` on the page. */
const opens = (selector: string, shows: string) => (page: Tab) =>
  Effect.andThen(page.click(selector), waitFor(page, shows));

/** A key pressed, then `shows` on the page. */
const pressed = (key: string, shows: string) => (page: Tab) =>
  Effect.andThen(page.press(key), waitFor(page, shows));

/** A right-click on `selector`, then the context menu. */
const menuOn = (selector: string) => (page: Tab) =>
  Effect.andThen(rightClick(page, selector), waitFor(page, CONTEXT_MENU));

/**
 * A long press on `selector` (the page's clock held, so its delay passes only
 * as it is run on), then the context menu, the finger lifted and the menu
 * settled.
 */
const heldOn = (selector: string) => (page: Tab) =>
  Effect.gen(function* () {
    yield* page.clock.hold;
    yield* touch(page, selector, 0);
    yield* page.clock.runFor(700);
    yield* waitFor(page, `${CONTEXT_MENU} [data-command]`);
    yield* page.finger.up;
    // The menu's opening runs its frames on the held clock: run on, it stands open.
    yield* page.clock.runFor(500);
  });

const CHOICES = pageHref.choices(STUDIO_FILM);
const PROJECT = pageHref.project(STUDIO_FILM);
/**
 * Project at rest: the film's panel and its band, the act's panel, each
 * scene's still drawn, the dock's transport and a comment's count.
 */
const PROJECT_READY = [
  '.pj-film .pj-band',
  '.pj-act .pj-act-head',
  '.rv-scene[data-scene="end"] .pj-still[data-drawn="true"] canvas',
  '.pj-dock .rv-transport',
  '[data-comments]',
];
/** A still on a film's Scenes tape, drawn. */
const STILL = '.sc-still[data-drawn="true"] canvas';
const STRINGS = '[data-point="score"] [data-variant="strings"]';
const INSPECTOR = '[data-role="inspector"]';
const FINDINGS = '[data-role="findings"]';
const COMMAND_MENU = '[data-role="command-menu"]';
const CONTEXT_MENU = '[data-role="context-menu"]';
const KEYS = '[data-role="keys-sheet"]';
/** Choices at rest: its picture's transport, a knob, a comment's count. */
const CHOICES_READY = ['.rv-transport', '.rv-knob input[type="range"]', `${STRINGS} .lab-count`];

const STATES: ReadonlyArray<State> = [
  { name: 'Films', open: review(pageHref.home(), '.rv-main a[href]'), disclose: AT_REST },
  {
    name: 'Choices, over a picture, with comment counts',
    open: review(CHOICES, ...CHOICES_READY),
    disclose: AT_REST,
  },
  {
    name: "Choices, a variant's inspector",
    open: review(CHOICES, ...CHOICES_READY),
    disclose: opens(`${STRINGS} .lab-inspect`, `${INSPECTOR} [data-act="close-inspector"]`),
    layer: INSPECTOR,
  },
  {
    name: 'Choices, the Findings sheet',
    open: review(CHOICES, '[data-act="findings"][data-check="check"][data-findings="2"]'),
    disclose: opens('[data-act="findings"][data-check="check"]', `${FINDINGS} .rv-at`),
    layer: FINDINGS,
  },
  {
    name: "Choices, a variant's context menu",
    open: review(CHOICES, ...CHOICES_READY),
    disclose: menuOn(`${STRINGS} .rv-name`),
    layer: CONTEXT_MENU,
  },
  {
    name: 'Choices, the command menu',
    open: review(CHOICES, ...CHOICES_READY),
    disclose: pressed('Control+k', `${COMMAND_MENU} [data-command]`),
    layer: COMMAND_MENU,
  },
  {
    name: 'Project, its panels, stills and dock, with comment counts',
    open: review(PROJECT, ...PROJECT_READY),
    disclose: AT_REST,
  },
  {
    name: "Project, a scene row's sheet",
    open: review(PROJECT, ...PROJECT_READY),
    disclose: opens(
      '.rv-scene[data-scene="open"] .sc-card-picture',
      `${INSPECTOR} .rv-comment-input`,
    ),
    layer: INSPECTOR,
  },
  {
    name: "Project, an act's long-press menu",
    open: review(PROJECT, ...PROJECT_READY),
    disclose: heldOn('.pj-act-head .pj-act-meta'),
    layer: CONTEXT_MENU,
  },
  {
    name: "Project, the film's inspector",
    open: review(PROJECT, ...PROJECT_READY),
    disclose: opens('.pj-film-head .lab-inspect', `${INSPECTOR} .rv-comment-input`),
    layer: INSPECTOR,
  },
  {
    name: 'a Set, with a comment count',
    open: review(pageHref.set(STUDIO_FOLDER, STUDIO_SET), '.rv-main video', '[data-comments]'),
    disclose: AT_REST,
  },
  {
    name: 'a Set, its wipe (the grip a slider)',
    open: review(`${pageHref.set(STUDIO_FOLDER, STUDIO_SET)}?view=wipe`, '.rv-wipe-grip'),
    disclose: AT_REST,
  },
  {
    name: 'a Set, its diff',
    open: review(`${pageHref.set(STUDIO_FOLDER, STUDIO_SET)}?view=diff`, '.rv-diff'),
    disclose: AT_REST,
  },
  {
    name: 'a Folder, with its set and loose videos',
    open: review(pageHref.folder(STUDIO_FOLDER), '.rv-card.rv-tall .rv-cap a[href]'),
    disclose: AT_REST,
  },
  { name: 'Lab, Edit', open: lab('edit'), disclose: AT_REST },
  {
    name: 'Lab, Edit, a cue that runs until a mark selected (its End field, the Snap toggle)',
    open: (viewport) =>
      Effect.gen(function* () {
        const href = labAt(10, { selection: { _tag: 'Cue', scene: 'three', name: 'push' } });
        const { page } = yield* openLab([], { viewport, mode: 'edit', href });
        yield* waitFor(page, '.lab-edit-cue input[data-field="end"]:not([disabled])');
        yield* waitFor(page, '[data-act="snap"]');
        return page;
      }),
    disclose: AT_REST,
  },
  { name: 'Lab, Note', open: lab('note'), disclose: AT_REST },
  { name: 'Lab, Motion', open: lab('motion'), disclose: AT_REST },
  { name: 'Lab, Compare', open: lab('compare'), disclose: AT_REST },
  { name: 'Lab, Record', open: lab('record'), disclose: AT_REST },
  {
    name: "Lab, the command menu's Go to",
    open: lab('edit'),
    disclose: (page) =>
      Effect.gen(function* () {
        yield* page.press('Control+k');
        yield* page.fill('.lab-command-query', 'go to');
        yield* waitFor(page, `${COMMAND_MENU} [data-command^="go."]`);
      }),
    layer: COMMAND_MENU,
  },
  {
    name: 'Lab, the context menu',
    open: lab('edit'),
    disclose: menuOn('.lab-panel'),
    layer: CONTEXT_MENU,
  },
  {
    name: 'Lab, the keys dialog',
    open: lab('edit'),
    disclose: pressed('?', `${KEYS} [data-command]`),
    layer: KEYS,
  },
  {
    name: 'Scenes',
    open: player(pageHref.scenes(PROBE), STILL),
    disclose: AT_REST,
  },
  {
    name: 'Scenes, a scene selected (the tape and its focus card)',
    open: player(pageHref.scene(PROBE, 'two'), '.sc-focus .sc-card'),
    disclose: AT_REST,
  },
  { name: 'Play', open: player(pageHref.play(PROBE), '.bar .tc'), disclose: AT_REST },
];

/** Every shown target in `layer` (the page when none) is `device`'s size, or kept by a principle; else each one under it is named. */
const sized = (page: Tab, device: Device, layer?: string) => {
  const now = undersizedTargets(device.hit, layer);
  return page.until(`${now}.length === 0`, {
    now,
    say: (found) =>
      `targets under ${device.hit} × ${device.hit} px on ${device.name} (what its pointer meets): ${found}`,
  });
};

for (const device of DEVICES) {
  describe(`touch targets on ${device.name}`, () => {
    for (const state of STATES) {
      it.live(
        state.name,
        () =>
          Effect.gen(function* () {
            const page = yield* state.open(device.viewport);
            // The page has the device's pointer, so its density tokens are the device's.
            yield* page.until(`matchMedia('${device.pointer}').matches`);
            yield* state.disclose(page);
            yield* sized(page, device, state.layer);
          }).pipe(Effect.scoped),
        SLOW,
      );
    }
  });
}

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

describe('a finger on a slider', () => {
  it.live(
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
      }).pipe(Effect.scoped),
    SLOW,
  );
});
