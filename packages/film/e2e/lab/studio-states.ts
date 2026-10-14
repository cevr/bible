// What the studio's touch, token, budget and phone-fit guards open: the
// devices they are asked on, every place a page is at in each state it
// discloses (`STATES`), and how a state opens and is read.

import { Effect, Option, type Scope, Struct } from 'effect';
import { Place } from '@bible/url-state';
import { Places, pageHref } from '../../src/core/api.ts';
import type { LabMode } from '../../src/lab/mode.ts';
import { menuEntry, openCommandMenu, rightClick, touch } from '../../src/lab/fixtures/gestures.ts';
import {
  type FakeRoute,
  type Json,
  type Viewport,
  changeOf,
  json,
  labAt,
  openLab,
  openPlayer,
  openReview,
  route,
  tokensCss,
} from '../../src/lab/fixtures/harness.ts';
import { untokened } from '../../src/lab/fixtures/drawn-tokens.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { evaluates, sheetsStand, textHas, until, waitFor } from '../../src/lab/fixtures/settled.ts';
import {
  STUDIO_FILM,
  STUDIO_FOLDER,
  STUDIO_ASK,
  STUDIO_PRODUCTION,
  STUDIO_SET,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { DESK_HIT, PHONE_HIT, undersizedTargets } from '../../src/lab/fixtures/touch-targets.ts';

export const SLOW = 30_000;

/** A device the studio is used on: its window and pointer, the media query its pointer matches, and the target it needs. */
export interface Device {
  readonly name: string;
  readonly viewport: Viewport;
  readonly pointer: string;
  readonly hit: number;
  /** Which of a view's budgets is this device's. */
  readonly budget: keyof Budget;
}

export const PHONE: Device = {
  name: 'a phone',
  viewport: { width: 390, height: 844, coarse: true },
  pointer: '(pointer: coarse)',
  hit: PHONE_HIT,
  budget: 'phone',
};
export const LAPTOP: Device = {
  name: 'a laptop',
  viewport: { width: 1440, height: 900 },
  pointer: '(pointer: fine)',
  hit: DESK_HIT,
  budget: 'laptop',
};
export const DEVICES: ReadonlyArray<Device> = [PHONE, LAPTOP];

/**
 * The most things a view shows on its first screen at rest on each device
 * (`firstScreenItems`: its controls, pictures and text leaves, as the
 * UI-reduction sweep's `count.js` counts them; Progressive
 * disclosure: a thing earns a place at rest by being used in most visits).
 * A budget is raised only in the commit that adds the thing, saying why
 * most visits use it. A film's views count the page bar, a tab for each of
 * the studio's parts (`PARTS`): the Script's tab raised each that had no
 * room by one, as a part is how a visit goes from one to another, and the
 * Board's tab (a film starts on its board) raised each by one again.
 */
export interface Budget {
  readonly phone: number;
  readonly laptop: number;
}

/** A view's budget: at most `phone` things on a phone, `laptop` on a laptop. */
export const most = (phone: number, laptop: number): Budget => ({ phone, laptop });
/** The Lab's Edit: its budget, which a planted button or a planted line of text passes (the budget's positive controls). */
export const LAB_EDIT = most(52, 56);

/** A page in one state: how it opens on a device, what discloses the state, and the layer measured. */
export interface State {
  readonly name: string;
  readonly open: (viewport: Viewport) => Effect.Effect<Tab, never, Scope.Scope>;
  readonly disclose: (page: Tab) => Effect.Effect<void>;
  /** A view at rest: the most things it shows on its first screen (`Budget`). */
  readonly budget?: Budget;
  /** The most things its whole length shows, below the fold too (`Budget`): on a long view. */
  readonly page?: Budget;
  /** The layer the state opens, measured within itself; none: the whole page. */
  readonly layer?: string;
}

/** A place's first case, the place as it opens: the budget of what it shows is not optional. */
export interface AtRest extends State {
  readonly budget: Budget;
}

/**
 * Every place a studio page is at (`Places`, `core/api.ts`): all but a
 * film's export page, the renderer's and the easel's, which has no chrome to
 * touch and no phone to fit (`e2e/player/render.dom.test.ts` opens it).
 */
export type PlaceName = Exclude<keyof typeof Places, 'export'>;

/** A place a guard here does not open itself: the place whose cases measure it, and why. */
export interface Exempt {
  readonly measuredAt: PlaceName;
  readonly why: string;
}

/**
 * What a guard opens at each place: a place added to `Places` is opened here
 * by one case at least or named exempt, with the place that measures it and
 * why, or this fails to typecheck (an empty list too); `First` is the kind of
 * the first case, which for the touch guard's table is the place at rest, its
 * budget required; and each case checks its page is at the place it is keyed
 * by (`isAt`).
 */
export type ByPlace<A, First extends A = A> = Readonly<
  Record<PlaceName, readonly [First, ...ReadonlyArray<A>] | Exempt>
>;

// The type's own probe: a place given an empty list fails to typecheck.
// @ts-expect-error: an empty list neither opens a place nor names it exempt
void ([] satisfies ByPlace<State>[PlaceName]);

// The table's own probe: a place at rest without a budget fails to typecheck.
void ([
  // @ts-expect-error: the first case of a place is the place at rest, and carries its budget
  { name: 'a place', open: () => Effect.die('x'), disclose: () => Effect.void },
] satisfies ByPlace<State, AtRest>[PlaceName]);

/** Each case of `cases` with the place it is keyed by; an exempt place has none. */
export const byPlace = <A>(cases: ByPlace<A>): ReadonlyArray<readonly [PlaceName, A]> =>
  Struct.keys(cases).flatMap((place) => {
    const at = cases[place];
    if ('measuredAt' in at) return [];
    return at.map((one) => [place, one] as const);
  });

/** The exempt places of `cases` whose measuring place is exempt itself: measured nowhere. */
export const unmeasured = <A>(cases: ByPlace<A>): ReadonlyArray<PlaceName> =>
  Struct.keys(cases).filter((place) => {
    const at = cases[place];
    return 'measuredAt' in at && 'measuredAt' in cases[at.measuredAt];
  });

/** Dies unless the page is at `place`: its path and query decode as that place's. */
export const isAt = (page: Tab, place: PlaceName) =>
  Effect.flatMap(page.evaluate<string>('location.pathname + location.search'), (href) =>
    Option.match(Place.decode(Places[place], href), {
      onNone: () => Effect.die(`the page is at ${href}, not at the place ${place}`),
      onSome: () => Effect.void,
    }),
  );

/** The page as it opens: nothing disclosed. */
export const AT_REST = (_page: Tab) => Effect.void;

/** A review page at `href`, once each of `ready` shows. */
export const review =
  (href: string, ...ready: ReadonlyArray<string>) =>
  (viewport: Viewport) =>
    Effect.gen(function* () {
      const { page } = yield* openReview(studioRoutes, { href, viewport });
      for (const selector of ready) yield* waitFor(page, selector);
      return page;
    });

/** The lab in `mode`. */
export const lab = (mode: LabMode) => (viewport: Viewport) =>
  Effect.map(openLab([], { viewport, mode }), (o) => o.page);

/** A beat to record, as the studio's routes answer it. */
export const beat = (id: string, state: string, text: string) => ({
  id,
  file: `${id}.wav`,
  parts: [{ kind: 'line', text }],
  sources: [],
  state,
  recorded: state === 'recorded',
  attempts: 0,
});

/** The studio's routes over the probe film: a beat recorded, one to record, none tried yet. */
export const RECORD_ROUTES: ReadonlyArray<FakeRoute> = [
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
export const recording = (viewport: Viewport) =>
  Effect.gen(function* () {
    const { page } = yield* openLab(RECORD_ROUTES, { viewport, mode: 'record' });
    yield* waitFor(page, '.studio-beats');
    return page;
  });

/**
 * The player at `href`, once `ready` shows and every sheet it opened with stands, over `routes`
 * and the harness's own. A sheet still scrolling in (a scene's, at `pageHref.scene`) passes over
 * the page bar on a phone, so the page is not yet as it opens.
 */
export const player =
  (href: string, ready: string, routes: ReadonlyArray<FakeRoute> = []) =>
  (viewport: Viewport) =>
    Effect.gen(function* () {
      const { page } = yield* openPlayer({ href, viewport }, ready, routes);
      yield* sheetsStand(page);
      return page;
    });

/**
 * The probe film's project and check as a film in work has them: a scene out
 * of date, one not rendered, one approved, a warning and a finding on scenes
 * and a line of the film's own, so the Scenes' tape bar holds its fullest
 * legend.
 */
export const WORK_ROUTES: ReadonlyArray<FakeRoute> = [
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
export const opens = (selector: string, shows: string) => (page: Tab) =>
  Effect.andThen(page.click(selector), waitFor(page, shows));

/** A key pressed, then `shows` on the page. */
export const pressed = (key: string, shows: string) => (page: Tab) =>
  Effect.andThen(page.press(key), waitFor(page, shows));

/** A right-click on `selector`, then the context menu. */
export const menuOn = (selector: string) => (page: Tab) =>
  Effect.andThen(rightClick(page, selector), waitFor(page, CONTEXT_MENU));

/**
 * A long press on `selector` (the page's clock held, so its delay passes only
 * as it is run on), then the context menu, the finger lifted and the menu
 * settled.
 */
export const heldOn = (selector: string) => (page: Tab) =>
  Effect.gen(function* () {
    yield* page.clock.hold;
    yield* touch(page, selector, 0);
    yield* page.clock.runFor(700);
    yield* waitFor(page, `${CONTEXT_MENU} [data-command]`);
    yield* page.finger.up;
    // The menu's opening runs its frames on the held clock: run on, it stands open.
    yield* page.clock.runFor(500);
  });

export const CHOICES = pageHref.choices(STUDIO_FILM);
export const PROJECT = pageHref.project(STUDIO_FILM);
/**
 * Project at rest: the film's panel and its band, the act's panel, each
 * scene's still drawn, the dock's transport and a comment's count.
 */
export const PROJECT_READY = [
  '.pj-film .pj-band',
  '.pj-act .pj-act-head',
  '.rv-scene[data-scene="end"] .pj-still[data-drawn="true"] canvas',
  '.pj-dock .rv-transport',
  '[data-comments]',
];
/** A still on a film's Scenes tape, drawn. */
export const STILL = '.sc-still[data-drawn="true"] canvas';
export const STRINGS = '[data-point="score"] [data-variant="strings"]';
export const INSPECTOR = '[data-role="inspector"]';
export const FINDINGS = '[data-role="findings"]';
export const COMMAND_MENU = '[data-role="command-menu"]';
export const CONTEXT_MENU = '[data-role="context-menu"]';
export const KEYS = '[data-role="keys-sheet"]';
export const CHIP_MENU = '[data-role="chip-menu"]';
export const VIEW_MENU = '[data-role="view-menu"]';
export const RECEIPTS = '[data-role="receipts"]';

/**
 * The film's check as a film with a step to undo has it, so a receipt of a
 * write the page made offers Undo (as the editor's cases read it).
 */
export const UNDO_ROUTES: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/check$/, () =>
    json({
      findings: [],
      undo: {
        scene: 'one',
        file: 'scenes/one.ts',
        target: 'cue rise offset',
        change: changeOf('cue'),
      },
    }),
  ),
];

/** The Lab with a cue dragged and the page read again: its receipt offers Undo. */
export const receipted = (viewport: Viewport) =>
  Effect.gen(function* () {
    const { page } = yield* openLab(UNDO_ROUTES, { viewport, mode: 'edit', href: labAt(1) });
    yield* page.waitFor('.lab-cue[data-cue="rise"]');
    // The strip names the scene's file once the page can write to it: a drag before then writes nothing.
    yield* textHas(page, '.lab-strip-head', 'scenes/one.ts');
    const bar = yield* page.box('.lab-cue[data-cue="rise"]');
    const [x, y] = [bar.x + bar.width / 2, bar.y + bar.height / 2];
    yield* page.mouse.move(x, y);
    yield* page.mouse.down;
    for (const step of [1, 2, 3, 4]) yield* page.mouse.move(x + 15 * step, y);
    yield* page.mouse.up;
    // The write has landed once its receipt names the change ("writing…" before): a reload
    // before then loses the write, and with it the receipt.
    yield* textHas(page, '[data-receipt="edit"] .lab-receipt-said', 'cue rise offset');
    yield* page.reload;
    yield* page.waitFor('[data-receipt="edit"] [data-act="receipt-undo"]');
    // The page's clock held, so the receipt is not put away by its own timer before it is measured.
    yield* page.clock.hold;
    return page;
  });

/** Choices at rest: its picture's transport, a knob, a comment's count. */
export const CHOICES_READY = [
  '.rv-transport',
  '.rv-knob input[type="range"]',
  `${STRINGS} .lab-count`,
];

/** A phone's sheet of the selected cue or knob. */
export const SELECTION_SHEET = '.lab-selection-sheet';

/**
 * The Lab with a cue that runs until a mark selected, at rest: its scene's
 * place, the Snap toggle shown, its End field written and shown (on a phone
 * in the selection's sheet, peeking its one line above the dock).
 */
export const labCue = (viewport: Viewport) =>
  Effect.gen(function* () {
    const href = labAt(10, { selection: { _tag: 'Cue', scene: 'three', name: 'push' } });
    const { page } = yield* openLab([], { viewport, mode: 'edit', href });
    yield* page.attached('.lab-edit-cue input[data-field="end"]:not([disabled])');
    yield* waitFor(page, '[data-act="snap"]');
    yield* waitFor(page, `:is(${SELECTION_SHEET} .lab-sheet-title, .lab-edit-cue)`);
    return page;
  });

/** The selected cue's fields shown: on a phone, its sheet opened by a tap on its head. */
export const cueFieldsShown = (page: Tab) =>
  Effect.gen(function* () {
    const phone = yield* page.evaluate<boolean>(
      `document.querySelector('${SELECTION_SHEET}') !== null`,
    );
    if (phone) yield* page.click(`${SELECTION_SHEET} [data-act="sheet"]`);
    yield* waitFor(page, '.lab-edit-cue input[data-field="end"]:not([disabled])');
  });

/** The Lab's Note mode with a cue selected: a note begun there is scoped to the cue, its × beside it. */
export const labNoteOnCue = (viewport: Viewport) =>
  Effect.gen(function* () {
    const href = labAt(10, { selection: { _tag: 'Cue', scene: 'three', name: 'push' } });
    const { page } = yield* openLab([], { viewport, mode: 'note', href });
    yield* waitFor(page, '[data-act="note-frame"]');
    return page;
  });

/**
 * A film's Lab link (`pageHref.lab`) is the Lab's place only until it opens:
 * the path names the scene under the playhead (`lab/place.ts`), so a film
 * with a scene stands at `labScene`, where its Lab is measured.
 */
export const LAB_MOVES: Exempt = {
  measuredAt: 'labScene',
  why: "a film's Lab moves to the scene under its playhead as it opens",
};

/** The probe film's Script, as its link opens it (`pageHref.script`): its beats read, its words laid out. */
export const scriptOpen = (viewport: Viewport) =>
  Effect.gen(function* () {
    const { page } = yield* openLab([], { viewport, href: pageHref.script(PROBE) });
    yield* waitFor(page, '.lab-script-picture');
    return page;
  });

/** A note the lab lists on the probe film, made at `T` in `scene`: open, with no replies. */
const listed = (
  seq: number,
  scene: string,
  T: number,
  fields: { readonly [key: string]: Json },
) => ({
  id: `n${seq}`,
  film: PROBE,
  scene,
  T,
  frame: Math.round(T * 30),
  status: 'open',
  still: `n${seq}.png`,
  thread: [],
  createdAt: '2026-10-13T00:00:00.000Z',
  seq,
  changed: seq,
  ...fields,
});

/**
 * The probe film's notes on its Script: on beat one's words a note, a
 * correction and a removal, and a note on beat two's frame, whose marker is
 * in its head, which the agent replied to.
 */
const SCRIPT_NOTES: ReadonlyArray<Json> = [
  listed(1, 'one', 0.1, {
    words: { beat: 'one', from: 0, to: 1, text: 'The ball' },
    text: 'a bigger ball',
  }),
  listed(2, 'one', 0.4, {
    words: { beat: 'one', from: 2, to: 3, text: 'rises slowly,' },
    kind: 'correction',
    replace: 'climbs slowly,',
    text: 'say “climbs slowly,” for “rises slowly,”',
  }),
  listed(3, 'one', 1.6, {
    words: { beat: 'one', from: 8, to: 9, text: 'down again.' },
    kind: 'removal',
    text: 'remove “down again.”',
  }),
  listed(4, 'two', 2.4, {
    text: 'the second scene sits too still',
    status: 'replied',
    thread: [
      { seq: 1, by: 'agent', text: 'it drifts now, a little', at: '2026-10-13T00:01:00.000Z' },
    ],
  }),
];

/**
 * A film's Board link (`pageHref.board`) moves as its Lab's does: to the beat
 * under the playhead (or the panel picked), where the Board is measured.
 */
export const BOARD_MOVES: Exempt = {
  measuredAt: 'boardBeat',
  why: "a film's Board moves to the beat under its playhead as it opens",
};

/** The probe film's Board, as its link opens it: its beats read, their panels laid out. */
export const boardOpen = (viewport: Viewport) =>
  Effect.gen(function* () {
    const { page } = yield* openLab([], { viewport, href: pageHref.board(PROBE) });
    yield* waitFor(page, '.lab-board .lab-board-panel[data-panel="one.start"]');
    return page;
  });

/** The probe film's Board with beat one's panel `panel` picked, shown by `view`. */
export const boardAt =
  (panel: string, view: 'animatic' | 'compare' | 'draw' = 'animatic') =>
  (viewport: Viewport) =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], {
        viewport,
        href: pageHref.boardBeat(PROBE, 'one', { panel, view }),
      });
      yield* waitFor(page, '.lab-board-open');
      return page;
    });

/** What the Script's link selects in a beat (`pageHref.scriptBeat`'s). */
type ScriptPicked = NonNullable<Parameters<typeof pageHref.scriptBeat>[2]>;

/** The probe film's Script at beat one with `picked` selected, over its notes (`SCRIPT_NOTES`). */
export const scriptAt = (picked: ScriptPicked) => (viewport: Viewport) =>
  Effect.gen(function* () {
    const notes = route('GET', /^\/notes$/, () =>
      json({ film: PROBE, seq: SCRIPT_NOTES.length, notes: SCRIPT_NOTES }),
    );
    const { page } = yield* openLab([notes], {
      viewport,
      href: pageHref.scriptBeat(PROBE, 'one', picked),
    });
    yield* waitFor(page, '.lab-script-picture');
    yield* waitFor(page, '[data-scene="one"] .lab-script-noted[data-note="n3"]');
    return page;
  });

/** The Script's composer: in a sheet on a phone, under the beat's line on a laptop. */
export const SCRIPT_SHEET = '.lab-script-sheet';

/** A film's Script link moves as its Lab's does: to the beat under the playhead, where the Script is measured. */
export const SCRIPT_MOVES: Exempt = {
  measuredAt: 'scriptBeat',
  why: "a film's Script moves to the beat under its playhead as it opens",
};

/** An ask, read: its step's send. */
export const ASK_READY = '.ak-step [data-act="send"]';

/** A production's timeline, read: its current version's Move forward. */
export const PRODUCTION_READY = '.pd-v[data-current="true"] [data-act="move-forward"]';

export const STATES: ByPlace<State, AtRest> = {
  lab: LAB_MOVES,
  script: SCRIPT_MOVES,
  board: BOARD_MOVES,
  boardBeat: [
    {
      name: 'Board, the beats and their panels',
      open: boardOpen,
      disclose: AT_REST,
      // Follow; a beat's id and start, its Approve, its brief (its marks as chips) and Brief and
      // line, and a thumb for each panel (its words, its mark, its time, its tries, its kept try).
      budget: most(29, 47),
    },
    {
      name: 'Board, a panel picked: its tries, Keep and the composer',
      open: boardAt('fall'),
      disclose: AT_REST,
    },
    {
      // The draw view: the sketch's toolbar in the panel's box, its surface over the picture.
      name: 'Board, a panel drawn on',
      open: boardAt('fall', 'draw'),
      disclose: AT_REST,
    },
  ],
  home: [
    {
      name: 'Films',
      // At rest once each card shows its film's state. The productions come first: their
      // heading and the toy's card.
      open: review(pageHref.home(), '.rv-film-card [data-role="counts"]'),
      disclose: AT_REST,
      budget: most(10, 10),
    },
  ],
  choices: [
    {
      name: 'Choices, over a picture, with comment counts',
      open: review(CHOICES, ...CHOICES_READY),
      disclose: AT_REST,
      // The kinds strip's four tabs are its index on a page this long.
      budget: most(47, 33),
      // Its levels, kinds and rows below the fold: a state word back on every row lands here.
      page: most(101, 102),
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
  ],
  project: [
    {
      name: 'Project, its panels, stills and dock, with comment counts',
      open: review(PROJECT, ...PROJECT_READY),
      disclose: AT_REST,
      budget: most(40, 32),
      page: most(41, 46),
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
      budget: most(29, 30),
    },
    {
      name: "a Set, the transport's rate chip menu",
      open: review(pageHref.set(STUDIO_FOLDER, STUDIO_SET), '.rv-main video', '[data-comments]'),
      disclose: opens('.rv-transport [data-act="rate"]', `${CHIP_MENU} [data-command]`),
      layer: CHIP_MENU,
    },
    {
      name: 'a Set, its wipe (the grip a slider)',
      open: review(`${pageHref.set(STUDIO_FOLDER, STUDIO_SET)}?view=wipe`, '.rv-wipe-grip'),
      disclose: AT_REST,
      budget: most(35, 29),
    },
    {
      name: 'a Set, its diff',
      open: review(`${pageHref.set(STUDIO_FOLDER, STUDIO_SET)}?view=diff`, '.rv-diff'),
      disclose: AT_REST,
      budget: most(34, 28),
    },
  ],
  ask: [
    {
      name: "an agent's ask, at its first step: a choice of three",
      open: review(pageHref.ask(STUDIO_ASK), ASK_READY),
      disclose: AT_REST,
      budget: most(17, 17),
    },
  ],
  production: [
    {
      name: "a Production's timeline: its current version open, the ones before shut",
      open: review(pageHref.production(STUDIO_PRODUCTION), PRODUCTION_READY),
      disclose: AT_REST,
      budget: most(30, 30),
    },
    {
      name: "a Production's timeline, Move forward's form open",
      open: review(pageHref.production(STUDIO_PRODUCTION), PRODUCTION_READY),
      disclose: (page) =>
        Effect.gen(function* () {
          yield* page.click(PRODUCTION_READY);
          yield* waitFor(page, '[data-act="move-form"] input[name="title"]');
        }),
      budget: most(30, 30),
    },
  ],
  folder: [
    {
      name: 'a Folder, with its set and loose videos',
      open: review(pageHref.folder(STUDIO_FOLDER), '.rv-card.rv-tall .rv-cap .rv-name'),
      disclose: AT_REST,
      // A loose video is one card, its file in its menu.
      budget: most(22, 20),
      page: most(22, 20),
    },
  ],
  labScene: [
    {
      name: 'Lab, Edit, a cue that runs until a mark selected (on a phone its sheet peeking)',
      open: labCue,
      disclose: AT_REST,
      // A phone's peek counted: its grip, its line and its Close over the Edit's at rest, the
      // fields in the sheet below it. A laptop's panel shows the cue's fields, its eases and the knobs.
      budget: most(42, 80),
    },
    {
      // On a phone the opened sheet is a layer, as an inspector is: the Lab under it is the case
      // above. On a laptop the fields stand in the panel: the page is measured.
      name: 'Lab, Edit, a cue that runs until a mark selected, its fields shown (its End field, the Snap toggle)',
      open: labCue,
      disclose: cueFieldsShown,
      layer: `:is(${SELECTION_SHEET}, :root:not(:has(${SELECTION_SHEET})))`,
    },
    { name: 'Lab, Edit', open: lab('edit'), disclose: AT_REST, budget: LAB_EDIT },
    { name: 'Lab, Note', open: lab('note'), disclose: AT_REST, budget: most(41, 45) },
    {
      name: 'Lab, Note with a scoped composer',
      open: labNoteOnCue,
      disclose: opens(
        '[data-act="note-frame"]',
        '[data-role="note-scope"] [data-act="clear-scope"]',
      ),
    },
    { name: 'Lab, Motion', open: lab('motion'), disclose: AT_REST, budget: most(44, 51) },
    { name: 'Lab, Compare', open: lab('compare'), disclose: AT_REST, budget: most(42, 46) },
    // Its budget is the resting Record's, with no beats listed.
    { name: 'Lab, Record', open: lab('record'), disclose: AT_REST, budget: most(38, 42) },
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
      // The first command's Change holds the focus, whichever element the opening focus chose.
      disclose: (page) =>
        Effect.gen(function* () {
          yield* pressed('?', `${KEYS} [data-command]`)(page);
          yield* page.focus(`${KEYS} .lab-keys-actions > button`);
        }),
      layer: KEYS,
    },
    {
      name: 'Lab, a receipt with Undo',
      open: receipted,
      disclose: AT_REST,
      layer: RECEIPTS,
    },
  ],
  scriptBeat: [
    {
      name: 'Script, the beats and their words',
      open: scriptOpen,
      disclose: AT_REST,
      // Its words are what it is read for: each its own text leaf, as the Transcript's are, so a tap
      // shows it (the probe's are 26 of the laptop's things, 17 of the phone's, where two of its
      // three beats stand on the first screen). A beat's id and start are one press. How its cues
      // are tied to its words is what the owner reads it for too: a chip for each mark and a link
      // for each cue or mark its picture names (8 on the laptop, 4 on the phone). Notes are what
      // the owner leaves on it: Note frame in its head is the one at rest (a note on words comes
      // from their selection).
      budget: most(52, 72),
    },
    {
      // A mark picked: the cues tied to it under its beat's line, each a row that picks it.
      name: 'Script, a mark and the cues tied to it',
      open: scriptOpen,
      disclose: opens('[data-scene="three"] .lab-script-mark[data-mark="near"]', '.lab-script-tie'),
    },
    {
      // Words selected, then Note… and Correct: the composer on them, its field of the words to
      // say instead. On a phone the sheet is a layer: the Script under it is the case below.
      name: 'Script, the composer on the words selected, correcting them',
      open: scriptAt({ words: '4-7' }),
      disclose: (page) =>
        Effect.gen(function* () {
          yield* opens('[data-act="note-words"]', '.lab-compose:not([hidden])')(page);
          yield* opens('.lab-compose [data-ask="correction"]', '.lab-compose .lab-instead')(page);
        }),
      layer: `:is(${SCRIPT_SHEET}, :root:not(:has(${SCRIPT_SHEET})))`,
    },
    {
      // A note, a correction and a removal on beat one's words, each its marker after them, a
      // frame note's in beat two's head; the correction selected opens under its line.
      name: 'Script, notes on its words and one selected',
      open: scriptAt({ note: 'n2' }),
      disclose: (page) => waitFor(page, '.lab-script-shown[data-note="n2"] .lab-reply-input'),
    },
  ],
  scenes: [
    {
      name: 'Scenes',
      open: player(pageHref.scenes(PROBE), STILL),
      disclose: AT_REST,
      budget: most(22, 23),
    },
  ],
  scene: [
    {
      // The scene's sheet is a layer, as an inspector is: the tape under it is the case above.
      name: "Scenes, a scene selected (its sheet, the Project's scene inspector's)",
      open: player(pageHref.scene(PROBE, 'two'), '.sc-focus .sc-card'),
      disclose: AT_REST,
      // The tape under the sheet and the sheet's own fields, counted as the page shows them.
      budget: most(29, 36),
      layer: '[data-role="scene"]',
    },
  ],
  play: [
    {
      name: 'Play',
      open: player(pageHref.play(PROBE), '.bar [data-act="play"]'),
      disclose: AT_REST,
      budget: most(20, 20),
    },
    {
      name: 'Play, the view menu',
      open: player(pageHref.play(PROBE), '.bar [data-act="play"]'),
      disclose: opens('[data-act="view-menu"]', `${VIEW_MENU} [data-command]`),
      layer: VIEW_MENU,
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

/**
 * Every shown target in `layer` (the page when none) is `device`'s size, or
 * kept by a principle, and its hit-slop lies over no neighbour; else each
 * one that is not is named.
 */
export const sized = (page: Tab, device: Device, layer?: string) => {
  const now = undersizedTargets(device.hit, layer);
  return page.until(`${now}.length === 0`, {
    now,
    say: (found) =>
      `targets under ${device.hit} × ${device.hit} px, or reaching over a neighbour, on ${device.name} (what its pointer meets): ${found}`,
  });
};

/** `state` opened at `place` on `device`, with the device's pointer, and disclosed. */
export const disclosed = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* state.open(device.viewport);
    yield* isAt(page, place);
    // The page has the device's pointer, so its density tokens are the device's.
    yield* page.until(`matchMedia('${device.pointer}').matches`);
    yield* state.disclose(page);
    yield* sheetsStand(page);
    return page;
  });

/** Every target `state` shows is `device`'s size (`sized`). */
export const targetsIn = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* disclosed(place, state, device);
    yield* sized(page, device, state.layer);
  }).pipe(Effect.scoped);

/** Everything `state` draws is drawn in the tokens (`untokened`). */
export const drawnIn = (place: PlaceName, state: State, device: Device) =>
  Effect.gen(function* () {
    const page = yield* disclosed(place, state, device);
    yield* until(page, `document.fonts.status === 'loaded'`);
    yield* evaluates(page, untokened(tokensCss), []);
  }).pipe(Effect.scoped);

/**
 * A state a finger's long press discloses: kept out of `STATES`, whose cases
 * run at once, and asked in a serial case of its own (`film/touches-serial`).
 */
export const LONG_PRESSED: State = {
  name: "Project, an act's long-press menu",
  open: review(PROJECT, ...PROJECT_READY),
  // Made in its case, not as the table is: a call in an initializer runs where it is declared.
  disclose: (page) => heldOn('.pj-act-head .pj-act-meta')(page),
  layer: CONTEXT_MENU,
};
