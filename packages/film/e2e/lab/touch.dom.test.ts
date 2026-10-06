// Every studio page, at rest and with what it discloses open, on a phone
// (390 × 844, a finger) and on a laptop (1440 × 900, a mouse): each shown
// control a pointer can operate (buttons, links, summaries, fields, sliders,
// menu items, anything focusable) has a hit area of `--hit` at least, the
// design language's "every touch target ≥ --hit through padding": 44 px on
// the phone (`PHONE_HIT`), 28 px on the laptop (`DESK_HIT`). The area is
// what a tap reaches (`undersizedTargets`, `fixtures/touch-targets.ts`):
// padding and a pseudo-element hit-slop count, a covered part does not. A
// failure names each target under it, with what a pointer meets. In each of
// the same states on both devices, everything drawn is drawn in the tokens
// (G9, DL-9: `untokened`, `fixtures/drawn-tokens.ts`), a failure naming each
// value off them.
//
// The disclosed states are the fixture film's (`fixtures/studio-film.ts`):
// Project's panels with their stills and its dock, a scene row's sheet, an
// act's long-press menu, an inspector, the lab editor's Snap toggle and an
// `until` cue's End field, the Findings sheet, the command
// menu (⌘K, its Go to…), the context menu, the keys dialog, the lab's modes
// (Record's with its beats listed and the recorder on one),
// comment counts on their rows, the Choices transport over a picture, a Set's
// wipe and diff, a film's Scenes with a scene selected and the
// Folder's loose videos. A short name with no count beside it is as wide as
// its words (its hit-slop is its target). A
// layer (a sheet, a menu, a dialog) is measured within itself; what lies
// under it was measured with it closed.
//
// Both guards are keyed by place (`Places`, `core/api.ts`; G13): a place
// added there is opened here by one case at least or named exempt with its
// reason, or this fails to typecheck, and each case checks its page stands at
// its place.
//
// Every page also fits a phone (G8, `fitsPhone`): no sideways scroll, each
// control inside the width, its chrome at most a quarter of the height; a
// film's Scenes is asked with its tape bar's legend at its fullest, and a
// selected scene with its sheet open, the sheet a layer and no chrome. And every
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

import { Deferred, Effect, Exit, Option, Schedule, type Scope, Struct } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { Place } from '@bible/url-state';
import { Places, pageHref } from '../../src/core/api.ts';
import type { LabMode } from '../../src/lab/mode.ts';
import { rightClick, touch } from '../../src/lab/fixtures/gestures.ts';
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
  tokensCss,
} from '../../src/lab/fixtures/harness.ts';
import { untokened } from '../../src/lab/fixtures/drawn-tokens.ts';
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
  /**
   * What the state draws off the tokens today, by device name (`untokened`'s
   * lines), each a defect kept as it is until the owner takes the change of
   * its pixels; none: nothing. A new value off them still fails, and so does
   * one fixed, until it is struck from here.
   */
  readonly drawnOff?: Readonly<Record<string, ReadonlyArray<string>>>;
}

/** Every place a page is at (`Places`, `core/api.ts`). */
type PlaceName = keyof typeof Places;

/** A place a guard here does not open, and why. */
interface Exempt {
  readonly exempt: string;
}

/**
 * What a guard opens at each place: a place added to `Places` is opened here
 * by one case at least or named exempt with its reason, or this fails to
 * typecheck (an empty list too); and each case checks its page is at the
 * place it is keyed by (`isAt`).
 */
type ByPlace<A> = Readonly<Record<PlaceName, readonly [A, ...ReadonlyArray<A>] | Exempt>>;

// The type's own probe: a place given an empty list fails to typecheck.
// @ts-expect-error: an empty list neither opens a place nor names it exempt
void ([] satisfies ByPlace<State>[PlaceName]);

/** Each case of `cases` with the place it is keyed by; an exempt place has none. */
const byPlace = <A>(cases: ByPlace<A>): ReadonlyArray<readonly [PlaceName, A]> =>
  Struct.keys(cases).flatMap((place) => {
    const at = cases[place];
    if ('exempt' in at) return [];
    return at.map((one) => [place, one] as const);
  });

/** Dies unless the page is at `place`: its path and query decode as that place's. */
const isAt = (page: Tab, place: PlaceName) =>
  Effect.flatMap(page.evaluate<string>('location.pathname + location.search'), (href) =>
    Option.match(Place.decode(Places[place], href), {
      onNone: () => Effect.die(`the page is at ${href}, not at the place ${place}`),
      onSome: () => Effect.void,
    }),
  );

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

/** A beat to record, as the studio's routes answer it. */
const beat = (id: string, state: string, text: string) => ({
  id,
  file: `${id}.wav`,
  parts: [{ kind: 'line', text }],
  sources: [],
  state,
  recorded: state === 'recorded',
  attempts: 0,
});

/** The studio's routes over the probe film: a beat recorded, one to record, none tried yet. */
const RECORD_ROUTES: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/studio\/beats$/, () =>
    json({
      film: PROBE,
      beats: [
        beat('opening', 'recorded', 'In the beginning.'),
        beat('thesis', 'staging', 'The law is holy.'),
      ],
    }),
  ),
  route('GET', /^\/studio\/takes\/\w+\/attempts$/, () => json({ beat: 'thesis', attempts: [] })),
];

/** The lab's Record mode with its beats listed, the recorder on the first to record. */
const recording = (viewport: Viewport) =>
  Effect.gen(function* () {
    const { page } = yield* openLab(RECORD_ROUTES, { viewport, mode: 'record' });
    yield* waitFor(page, '.studio-beats');
    return page;
  });

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

/** The Lab with a cue that runs until a mark selected: its scene's place, its End field and the Snap toggle shown. */
const labCue = (viewport: Viewport) =>
  Effect.gen(function* () {
    const href = labAt(10, { selection: { _tag: 'Cue', scene: 'three', name: 'push' } });
    const { page } = yield* openLab([], { viewport, mode: 'edit', href });
    yield* waitFor(page, '.lab-edit-cue input[data-field="end"]:not([disabled])');
    yield* waitFor(page, '[data-act="snap"]');
    return page;
  });

/**
 * A film's Lab link (`pageHref.lab`) is the Lab's place only until it opens:
 * the path names the scene under the playhead (`lab/place.ts`), so a film
 * with a scene stands at `labScene`, where its Lab is measured.
 */
const LAB_MOVES: Exempt = {
  exempt: "a film's Lab moves to the scene under its playhead as it opens: measured at labScene",
};

const STATES: ByPlace<State> = {
  lab: LAB_MOVES,
  home: [{ name: 'Films', open: review(pageHref.home(), '.rv-main a[href]'), disclose: AT_REST }],
  choices: [
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
  ],
  project: [
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
      name: "Project, the film's inspector",
      open: review(PROJECT, ...PROJECT_READY),
      disclose: opens('.pj-film-head .lab-inspect', `${INSPECTOR} .rv-comment-input`),
      layer: INSPECTOR,
    },
  ],
  set: [
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
  ],
  folder: [
    {
      name: 'a Folder, with its set and loose videos',
      open: review(pageHref.folder(STUDIO_FOLDER), '.rv-card.rv-tall .rv-cap a[href]'),
      disclose: AT_REST,
      // A loose video still in proxy offers its original by a bare button
      // (`review/section.tsx`, "Play the original"): the user agent's face
      // and padding, not `.sh-btn`'s.
      drawnOff: {
        'a phone': [
          'background-color rgb(107, 107, 107): rv-row > button',
          'paddingLeft 6px: rv-row > button',
          'paddingRight 6px: rv-row > button',
        ],
      },
    },
  ],
  labScene: [
    {
      name: 'Lab, Edit, a cue that runs until a mark selected (its End field, the Snap toggle)',
      open: labCue,
      disclose: AT_REST,
    },
    { name: 'Lab, Edit', open: lab('edit'), disclose: AT_REST },
    { name: 'Lab, Note', open: lab('note'), disclose: AT_REST },
    { name: 'Lab, Motion', open: lab('motion'), disclose: AT_REST },
    { name: 'Lab, Compare', open: lab('compare'), disclose: AT_REST },
    { name: 'Lab, Record, its beats and the recorder', open: recording, disclose: AT_REST },
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
  ],
  scenes: [
    {
      name: 'Scenes',
      open: player(pageHref.scenes(PROBE), STILL),
      disclose: AT_REST,
    },
  ],
  scene: [
    {
      // The scene's sheet is a layer, as an inspector is: the tape under it is the case above.
      name: "Scenes, a scene selected (its sheet, the Project's scene inspector's)",
      open: player(pageHref.scene(PROBE, 'two'), '.sc-focus .sc-card'),
      disclose: AT_REST,
      layer: '[data-role="scene"]',
    },
  ],
  play: [
    {
      name: 'Play',
      open: player(pageHref.play(PROBE), '.bar [data-act="play"]'),
      disclose: AT_REST,
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
          opens(
            '[data-role="view-menu"] [data-command="view.ticks"]',
            '.bar[data-ticks="on"]',
          )(page),
        ),
    },
  ],
};

/** Every shown target in `layer` (the page when none) is `device`'s size, or kept by a principle; else each one under it is named. */
const sized = (page: Tab, device: Device, layer?: string) => {
  const now = undersizedTargets(device.hit, layer);
  return page.until(`${now}.length === 0`, {
    now,
    say: (found) =>
      `targets under ${device.hit} × ${device.hit} px on ${device.name} (what its pointer meets): ${found}`,
  });
};

/** `state` opened at `place` on `device`, with the device's pointer, and disclosed. */
const disclosed = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* state.open(device.viewport);
    yield* isAt(page, place);
    // The page has the device's pointer, so its density tokens are the device's.
    yield* page.until(`matchMedia('${device.pointer}').matches`);
    yield* state.disclose(page);
    return page;
  });

/** Every target `state` shows is `device`'s size (`sized`). */
const targetsIn = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* disclosed(place, state, device);
    yield* sized(page, device, state.layer);
  }).pipe(Effect.scoped);

/** Everything `state` draws is drawn in the tokens (`untokened`), but what it names `drawnOff`. */
const drawnIn = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* disclosed(place, state, device);
    yield* until(page, `document.fonts.status === 'loaded'`);
    yield* evaluates(
      page,
      untokened(tokensCss),
      Option.getOrElse(Option.fromUndefinedOr(state.drawnOff?.[device.name]), () => []),
    );
  }).pipe(Effect.scoped);

/**
 * A state a finger's long press discloses: kept out of `STATES`, whose cases
 * run at once, and asked in a serial case of its own (`film/touches-serial`).
 */
const LONG_PRESSED: State = {
  name: "Project, an act's long-press menu",
  open: review(PROJECT, ...PROJECT_READY),
  disclose: heldOn('.pj-act-head .pj-act-meta'),
  layer: CONTEXT_MENU,
};

for (const device of DEVICES) {
  describe(`touch targets on ${device.name}`, () => {
    for (const [place, state] of byPlace(STATES))
      it.live(state.name, () => targetsIn(place, state, device), SLOW);
  });

  describe(`drawn only in its tokens on ${device.name} (G9, DL-9)`, () => {
    for (const [place, state] of byPlace(STATES))
      it.live(
        `${state.name}: every colour, family, size, weight, leading, radius, spacing, shadow and gradient drawn is a token's`,
        () => drawnIn(place, state, device),
        SLOW,
      );
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
  /** A page: its name, how it opens, and the layer it opens, which is no chrome. */
  const PAGES: ByPlace<readonly [name: string, open: State['open'], layer?: string]> = {
    home: [['Films', review(pageHref.home(), '.rv-main a[href]')]],
    choices: [['Choices', review(CHOICES, ...CHOICES_READY)]],
    project: [['Project', review(PROJECT, ...PROJECT_READY)]],
    set: [['a Set', review(pageHref.set(STUDIO_FOLDER, STUDIO_SET), '.rv-main video')]],
    folder: [
      ['a Folder', review(pageHref.folder(STUDIO_FOLDER), '.rv-card.rv-tall .rv-cap a[href]')],
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
      ['Lab, a scene with a cue selected', labCue],
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

/**
 * The Lab's inspected scene's source read, landed: a knob's field says it
 * can be written. Until it lands each knob's row carries a "cannot edit"
 * line, so a source landing while the face is held moves every row under it
 * for a reason that is no font's (the Motion fields under full-E2E load).
 */
const SOURCED = '.lab-knob [data-field="x"]:not([title^="cannot edit"])';

for (const device of DEVICES) {
  describe(`the UI face's fallback on ${device.name} (G10)`, () => {
    const PAGES = [
      [
        'Lab',
        servedHeld('lab', [], pageHref.lab(PROBE), '.lab-panel[data-staged="true"]', SOURCED),
      ],
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
