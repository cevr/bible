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
// Every page also fits a phone (G8, `fitsPhone`): no sideways scroll, each
// control inside the width, its chrome at most a quarter of the height; a
// film's Scenes is asked with its tape bar's legend at its fullest. And every
// target stands where the UI face puts it, within 1 px, while the face's file
// has not landed (G10), on both devices: each page is served as the lab
// renders it with that file held, measured, then measured again once it
// lands; the fallback (`--font`, `tokens.css`) is matched to its advance and
// height.
//
// The exceptions are principles, the same on every page and both devices:
// - a backing input (out of the accessibility tree and the tab order, and
//   nothing of it to see or press) is not a target; its visible field is;
// - Inline (WCAG 2.5.8): a link in a sentence takes the line's size;
// - Spacing (WCAG 2.5.8, at `--hit`): a target 24 px each way or more whose
//   `--hit` circle reaches no other target cannot be missed for a neighbour.

import { Deferred, Effect, Exit, Option, Schedule, type Scope } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import type { LabMode } from '../../src/lab/mode.ts';
import { menuEntry, openCommandMenu, rightClick, touch } from '../../src/lab/fixtures/gestures.ts';
import {
  type FakeRoute,
  type Viewport,
  json,
  labAt,
  openLab,
  openPlayer,
  openReview,
  openServed,
  route,
} from '../../src/lab/fixtures/harness.ts';
import { fitsPhone } from '../../src/lab/fixtures/phone-fit.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { evaluates, until, waitFor } from '../../src/lab/fixtures/settled.ts';
import {
  STUDIO_FILM,
  STUDIO_FOLDER,
  STUDIO_SET,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import {
  DESK_HIT,
  PHONE_HIT,
  firstScreenItems,
  targetBoxes,
  undersizedTargets,
} from '../../src/lab/fixtures/touch-targets.ts';

const SLOW = 30_000;

/** A device the studio is used on: its window and pointer, the media query its pointer matches, and the target it needs. */
interface Device {
  readonly name: string;
  readonly viewport: Viewport;
  readonly pointer: string;
  readonly hit: number;
  /** Which of a view's budgets is this device's. */
  readonly budget: keyof Budget;
}

const PHONE: Device = {
  name: 'a phone',
  viewport: { width: 390, height: 844, coarse: true },
  pointer: '(pointer: coarse)',
  hit: PHONE_HIT,
  budget: 'phone',
};
const LAPTOP: Device = {
  name: 'a laptop',
  viewport: { width: 1440, height: 900 },
  pointer: '(pointer: fine)',
  hit: DESK_HIT,
  budget: 'laptop',
};
const DEVICES: ReadonlyArray<Device> = [PHONE, LAPTOP];

/**
 * The most things a view shows on its first screen at rest on each device
 * (`firstScreenItems`: its controls, pictures and text leaves, as the
 * UI-reduction sweep's `count.js` counts them; UR2-17, Progressive
 * disclosure: a thing earns a place at rest by being used in most visits).
 * A budget is raised only in the commit that adds the thing, saying why
 * most visits use it.
 */
interface Budget {
  readonly phone: number;
  readonly laptop: number;
}

/** A view's budget: at most `phone` things on a phone, `laptop` on a laptop. */
const most = (phone: number, laptop: number): Budget => ({ phone, laptop });

/** The Lab's Edit: its budget, which a planted button or a planted line of text passes (the budget's positive controls). */
const LAB_EDIT = most(51, 55);

/** A page in one state: how it opens on a device, what discloses the state, and the layer measured. */
interface State {
  readonly name: string;
  readonly open: (viewport: Viewport) => Effect.Effect<Tab, never, Scope.Scope>;
  readonly disclose: (page: Tab) => Effect.Effect<void>;
  /** A view at rest: the most targets it shows (`Budget`). */
  readonly budget?: Budget;
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

/** The player at `href`, once `ready` shows, over `routes` and the harness's own. */
const player =
  (href: string, ready: string, routes: ReadonlyArray<FakeRoute> = []) =>
  (viewport: Viewport) =>
    Effect.map(openPlayer({ href, viewport }, ready, routes), (o) => o.page);

/**
 * The probe film's project and check as a film in work has them: a scene out
 * of date, one not rendered, one approved, a warning and a finding on scenes
 * and a line of the film's own, so the Scenes' tape bar holds its fullest
 * legend.
 */
const WORK_ROUTES: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/project$/, () =>
    json({
      project: {
        film: PROBE,
        variant: 'main',
        key: 'fk',
        comments: [],
        acts: [{ name: 'opening', scenes: ['one', 'two', 'three'], key: 'ak', comments: [] }],
        scenes: [
          { scene: 'one', key: 'k', state: 'stale', approval: 'none', comments: [] },
          { scene: 'two', key: 'k', state: 'missing', approval: 'none', comments: [] },
          { scene: 'three', key: 'k', state: 'current', approval: 'approved', comments: [] },
        ],
      },
      videos: {},
    }),
  ),
  route('GET', /^\/check$/, () =>
    json({
      findings: [
        {
          level: 'warning',
          tag: 'cue',
          message: 'the page turns early',
          address: { part: { _tag: 'Scenes', ids: ['one'] }, time: 1 },
        },
        {
          level: 'error',
          tag: 'cue',
          message: 'a cue past the scene',
          address: { part: { _tag: 'Scenes', ids: ['two'] }, time: 4 },
        },
        {
          level: 'warning',
          tag: 'AudioStale',
          message: "the film's audio is older than its script",
        },
      ],
    }),
  ),
];

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
  {
    name: 'Films',
    open: review(pageHref.home(), '.rv-main a[href]'),
    disclose: AT_REST,
    budget: most(8, 8),
  },
  {
    name: 'Choices, over a picture, with comment counts',
    open: review(CHOICES, ...CHOICES_READY),
    disclose: AT_REST,
    // The kinds strip's four tabs (SU-5) are its index on a page this long.
    budget: most(45, 33),
  },
  {
    name: "Choices, a variant's inspector",
    open: review(CHOICES, ...CHOICES_READY),
    disclose: opens(`${STRINGS} .lab-inspect`, `${INSPECTOR} [data-act="close-inspector"]`),
    layer: INSPECTOR,
  },
  {
    name: 'Choices, the Findings sheet',
    open: review(CHOICES, ...CHOICES_READY),
    disclose: (page) =>
      Effect.gen(function* () {
        yield* openCommandMenu(page, 'findings');
        yield* page.click(menuEntry('review.findings'));
        yield* waitFor(page, `${FINDINGS} .rv-at`);
      }),
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
    budget: most(39, 30),
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
    budget: most(27, 28),
  },
  {
    name: 'a Set, its wipe (the grip a slider)',
    open: review(`${pageHref.set(STUDIO_FOLDER, STUDIO_SET)}?view=wipe`, '.rv-wipe-grip'),
    disclose: AT_REST,
    budget: most(33, 27),
  },
  {
    name: 'a Set, its diff',
    open: review(`${pageHref.set(STUDIO_FOLDER, STUDIO_SET)}?view=diff`, '.rv-diff'),
    disclose: AT_REST,
    budget: most(32, 26),
  },
  {
    name: 'a Folder, with its set and loose videos',
    open: review(pageHref.folder(STUDIO_FOLDER), '.rv-card.rv-tall .rv-cap a[href]'),
    disclose: AT_REST,
    budget: most(24, 22),
  },
  { name: 'Lab, Edit', open: lab('edit'), disclose: AT_REST, budget: LAB_EDIT },
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
  { name: 'Lab, Note', open: lab('note'), disclose: AT_REST, budget: most(39, 43) },
  { name: 'Lab, Motion', open: lab('motion'), disclose: AT_REST, budget: most(43, 50) },
  { name: 'Lab, Compare', open: lab('compare'), disclose: AT_REST, budget: most(41, 48) },
  { name: 'Lab, Record', open: lab('record'), disclose: AT_REST, budget: most(36, 40) },
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
    budget: most(20, 21),
  },
  {
    // The scene's sheet is a layer, as an inspector is: the tape under it is the case above.
    name: "Scenes, a scene selected (its sheet, the Project's scene inspector's)",
    open: player(pageHref.scene(PROBE, 'two'), '.sc-focus .sc-card'),
    disclose: AT_REST,
    layer: '[data-role="scene"]',
  },
  {
    name: 'Play',
    open: player(pageHref.play(PROBE), '.bar [data-act="play"]'),
    disclose: AT_REST,
    budget: most(18, 18),
  },
  {
    // Play's ticks, turned on from the view menu: each a target its finger can hold.
    name: 'Play, its ticks on',
    open: player(pageHref.play(PROBE), '.bar [data-act="play"]'),
    disclose: (page) =>
      Effect.andThen(
        opens(
          '[data-act="view-menu"]',
          '[data-role="view-menu"] [data-command="view.ticks"]',
        )(page),
        opens('[data-role="view-menu"] [data-command="view.ticks"]', '.bar[data-ticks="on"]')(page),
      ),
  },
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

/** What `view` shows on its first screen (`firstScreenItems`) is at most `budget` things; else each one is named, `C` a control, `T` text. */
const withinBudget = (page: Tab, budget: number, view: string) => {
  const now = firstScreenItems();
  return page.until(`${now}.length <= ${budget}`, {
    now,
    say: (found) =>
      `${view} shows more than ${budget} things on its first screen at rest: ${found}`,
  });
};

/** Put `tag` saying "planted" on the first screen, over the page. */
const plant = (page: Tab, tag: 'button' | 'p') =>
  page.evaluate(
    `(() => { const el = document.createElement('${tag}'); el.textContent = 'planted'; Object.assign(el.style, { position: 'fixed', top: '120px', left: '16px', zIndex: '999' }); document.body.append(el); return true; })()`,
  );

for (const device of DEVICES) {
  describe(`the targets each view shows at rest on ${device.name} (UR2-17)`, () => {
    for (const [state, budget] of STATES.flatMap((s) =>
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
  });
}

describe('the at-rest budget (UR2-17)', () => {
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
          const exit = yield* Effect.exit(withinBudget(page, LAB_EDIT.phone, 'the Lab, planted'));
          expect(Exit.isFailure(exit)).toBe(true);
        }).pipe(Effect.scoped),
      SLOW,
    );
  }
});

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

/**
 * The Lab's transport as a script reads it: whether its row stands on the
 * tab bar as the page's dock, and whether play, the frame steps and the
 * scene's time lie in that order along one line.
 */
const LAB_DOCK = `(() => {
  const row = document.querySelector('.bar > .row');
  const r = row.getBoundingClientRect();
  const parts = ['[data-act="play"]', '[data-act="play.frame-previous"]', '[data-act="play.frame-next"]', '.tc'].map(
    (s) => row.querySelector(s).getBoundingClientRect(),
  );
  const mid = (b) => b.top + b.height / 2;
  return [
    'on the tabs ' + (Math.round(r.bottom) === Math.round(document.querySelector('.sh-pagebar').getBoundingClientRect().top)),
    'in order ' + parts.every((b, i) => i === 0 || b.left >= parts[i - 1].right - 0.5),
    'one line ' + parts.every((b) => Math.abs(mid(b) - mid(r)) < 4),
  ];
})()`;

describe("the Lab's transport on a phone (DL-10)", () => {
  it.live(
    'one row docked over the tab bar, where the page is scrolled: play, the frame steps, then the time',
    () =>
      Effect.gen(function* () {
        const page = yield* lab('edit')(PHONE.viewport);
        const docked = ['on the tabs true', 'in order true', 'one line true'];
        yield* evaluates(page, LAB_DOCK, docked);
        yield* page.evaluate('window.scrollTo(0, document.documentElement.scrollHeight); true');
        yield* until(page, 'scrollY > 0');
        yield* evaluates(page, LAB_DOCK, docked);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('every page fits a phone, 390 × 844 (G8)', () => {
  const PAGES = [
    ['Films', review(pageHref.home(), '.rv-main a[href]')],
    ['Choices', review(CHOICES, ...CHOICES_READY)],
    ['Project', review(PROJECT, ...PROJECT_READY)],
    ['a Set', review(pageHref.set(STUDIO_FOLDER, STUDIO_SET), '.rv-main video')],
    ['a Folder', review(pageHref.folder(STUDIO_FOLDER), '.rv-card.rv-tall .rv-cap a[href]')],
    ['Scenes', player(pageHref.scenes(PROBE), STILL)],
    [
      "Scenes, its legend full (out of date, not rendered, approved, findings, warnings, the film's)",
      player(pageHref.scenes(PROBE), '.sc-legend-item[data-mark="film"]', WORK_ROUTES),
    ],
    ['Lab', lab('edit')],
    ['Play', player(pageHref.play(PROBE), '.bar [data-act="play"]')],
  ] as const;
  for (const [name, open] of PAGES) {
    it.live(
      `${name}: no sideways scroll, every control inside the width, chrome at most a quarter of the height`,
      () => Effect.flatMap(open(PHONE.viewport), fitsPhone).pipe(Effect.scoped),
      SLOW,
    );
  }
});

/**
 * How far, in CSS px, G10 lets a target's edge or size move as the face
 * lands: half a pixel, the most an edge moves without its painted edge
 * jumping a whole pixel, the sub-pixel drift a metric-matched fallback
 * leaves (0.25 px at most across the four pages, on both devices).
 */
const SHIFT_PX = 0.5;

/**
 * How far, in CSS px, a 60-character line in `--font` may change: 1 px over
 * 60 characters, so a label of 30 or fewer drifts under `SHIFT_PX` (0.73 px
 * at most measured, at the largest sizes).
 */
const LINE_PX = 1;

/** The UI face's files in the page's fonts: the head's, and those its script registers. */
const UI_FACES = `[...document.fonts].filter((f) => f.family.replaceAll('"', '') === 'JetBrains Mono')`;

/**
 * The page as it is laid out now, as a script reads it: how many of the UI
 * face's files are on the page and how many have loaded, each target's box
 * (`targetBoxes`), the width of a line named in the UI face alone (another
 * face's while its file has not landed), and each of the chrome's sizes and
 * weights' 60-character line in `--font`: a line as long as a page's longest
 * label, so a fallback a hair off the UI face's advance or height shows where
 * a short label hides it.
 */
const LAID_OUT = `(() => {
  const ui = ${UI_FACES};
  const tokens = getComputedStyle(document.documentElement);
  const sizes = ['--fs-1', '--fs-2', '--fs-3', '--fs-4', '--fs-5'];
  const weights = ['--w-1', '--w-2', '--w-3'];
  const measured = (font) => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;white-space:pre;line-height:normal;font:' + font;
    probe.textContent = 'Record the frame 00:00:12:04 · Compare with last commit ⌘K';
    document.body.append(probe);
    const r = probe.getBoundingClientRect();
    probe.remove();
    return [r.width, r.height];
  };
  const lines = () =>
    Object.fromEntries(
      sizes.flatMap((size) =>
        weights.map((weight) => [
          size + ' ' + weight,
          measured(tokens.getPropertyValue(weight) + ' ' + tokens.getPropertyValue(size) + ' ' + tokens.getPropertyValue('--font')),
        ]),
      ),
    );
  return {
    faces: ui.length,
    loaded: ui.filter((f) => f.status === 'loaded').length,
    boxes: ${targetBoxes('exact')},
    lines: lines(),
    alone: measured('12px "JetBrains Mono", serif')[0],
  };
})()`;

/** The page laid out while the UI face's files are held (`LAID_OUT`), kept on the page; what it says of them. */
const HELD = `(() => { window.__held = ${LAID_OUT}; return [window.__held.faces > 0, window.__held.loaded]; })()`;

/** The UI face landed: the page's fonts settled and its latin file (the chrome's) loaded. */
const LANDED = `document.fonts.status === 'loaded' && ${UI_FACES}.some((f) => f.status === 'loaded')`;

/**
 * The page laid out once the UI face has landed, against how it stood
 * held (`HELD`): whether the line named in the face alone changed (so the
 * page was laid out without it, then with it), each target whose edge or
 * size moved more than `SHIFT_PX`, as `target: held → landed`, and each
 * line in `--font` more than `LINE_PX` longer or taller. Every box is
 * compared as the layout has it (`targetBoxes('exact')`), rounded only to
 * be read in a failure.
 */
const SWAPPED = `(() => {
  const held = window.__held;
  const landed = ${LAID_OUT};
  const keys = [...new Set([...Object.keys(held.boxes), ...Object.keys(landed.boxes)])];
  const moved = keys.filter((key) => {
    const a = held.boxes[key] ?? [];
    const b = landed.boxes[key] ?? [];
    return a.length !== 4 || b.length !== 4 || a.some((v, i) => Math.abs(v - b[i]) > ${SHIFT_PX});
  });
  const off = Object.keys(held.lines).filter((key) =>
    held.lines[key].some((v, i) => Math.abs(v - landed.lines[key][i]) > ${LINE_PX}),
  );
  const box = (r) => (r ?? []).map((v) => v.toFixed(2)).join(',') || 'none';
  return [
    'laid out without it ' + (held.alone !== landed.alone),
    ...moved.map((key) => key + ': ' + box(held.boxes[key]) + ' → ' + box(landed.boxes[key])),
    ...off.map((key) => 'a line at ' + key + ': ' + box(held.lines[key]) + ' → ' + box(landed.lines[key])),
  ];
})()`;

/**
 * A page as the lab serves it, rendered on the server with the UI face's
 * file in its head, that file held until `faceHeld` is done; once each of
 * `ready` shows.
 */
const servedHeld =
  (
    name: 'lab' | 'player' | 'review',
    routes: ReadonlyArray<FakeRoute>,
    href: string,
    ...ready: ReadonlyArray<string>
  ) =>
  (viewport: Viewport, faceHeld: Deferred.Deferred<void>) =>
    Effect.gen(function* () {
      // The page's load waits for the head's face: the open waits for it to mount.
      const { page } = yield* openServed(name, routes, {
        href,
        viewport,
        mountedOnly: true,
        faceHeld,
      });
      for (const selector of ready) yield* waitFor(page, selector);
      return page;
    });

for (const device of DEVICES) {
  describe(`the UI face's fallback on ${device.name} (G10)`, () => {
    const PAGES = [
      ['Lab', servedHeld('lab', [], pageHref.lab(PROBE), '.lab-panel[data-staged="true"]')],
      ['Play', servedHeld('player', [], pageHref.play(PROBE), '.bar [data-act="play"]')],
      ['Scenes', servedHeld('player', [], pageHref.scenes(PROBE), STILL)],
      ['Project', servedHeld('review', studioRoutes, PROJECT, ...PROJECT_READY)],
    ] as const;
    for (const [name, open] of PAGES) {
      it.live(
        `${name}: every target stands where it does once the face lands, within 1 px, laid out while its file is held`,
        () =>
          Effect.gen(function* () {
            const faceHeld = yield* Deferred.make<void>();
            const page = yield* open(device.viewport, faceHeld);
            // Held: the face is on the page, none of its files loaded; every target measured.
            yield* evaluates(page, HELD, [true, 0]);
            yield* Deferred.done(faceHeld, Exit.void);
            yield* until(page, LANDED);
            yield* evaluates(page, SWAPPED, ['laid out without it true']);
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
