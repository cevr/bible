// What the studio's touch, token, budget and phone-fit guards open: the
// devices they are asked on, every place a page is at in each state it
// discloses (`STATES`), and how a state opens and is read.

import { Effect, Option, type Scope, Struct } from 'effect';
import { Place } from '@bible/url-state';
import { Places, pageHref } from '../../src/core/api.ts';
import { rightClick, touch } from '../../src/lab/fixtures/gestures.ts';
import {
  type FakeRoute,
  type Viewport,
  openPlayer,
  openReview,
  tokensCss,
} from '../../src/lab/fixtures/harness.ts';
import { untokened } from '../../src/lab/fixtures/drawn-tokens.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { countIs, evaluates, sheetsStand, until, waitFor } from '../../src/lab/fixtures/settled.ts';
import {
  STUDIO_FOLDER,
  STUDIO_ASK,
  STUDIO_PAGE,
  STUDIO_PAGE_PACE,
  STUDIO_DRAFT,
  STUDIO_PRODUCTION,
  STUDIO_SERIES,
  STUDIO_SET,
  studioRoutes,
} from '../../src/lab/fixtures/studio-film.ts';
import { type Tab, jsonOf } from '../../src/lab/fixtures/tab.ts';
import { DESK_HIT, PHONE_HIT, undersizedTargets } from '../../src/lab/fixtures/touch-targets.ts';
import { editsKept } from './studio/edits-kept.ts';

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
/** The studio at rest: its budget, which a planted button or a planted line of text passes (the budget's positive controls). */
export const STUDIO_AT_REST = most(31, 55);

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

/**
 * The harness's player page (the studio) at `href`, once `ready` shows and every sheet it
 * opened with stands, over `routes` and the harness's own.
 */
export const player =
  (href: string, ready: string, routes: ReadonlyArray<FakeRoute> = []) =>
  (viewport: Viewport) =>
    Effect.gen(function* () {
      const { page } = yield* openPlayer({ href, viewport }, ready, routes);
      yield* sheetsStand(page);
      return page;
    });

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
    // A finger holds what is on the screen: below the fold, it is scrolled to first.
    const at = `document.querySelector(${jsonOf(selector)})`;
    yield* page.evaluate(`${at}.scrollIntoView({ block: 'center' }); true`);
    yield* until(
      page,
      `(() => { const r = ${at}.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()`,
    );
    yield* page.clock.hold;
    yield* touch(page, selector, 0);
    yield* page.clock.runFor(700);
    yield* waitFor(page, `${CONTEXT_MENU} [data-command]`);
    yield* page.finger.up;
    // The menu's opening runs its frames on the held clock: run on, it stands open.
    yield* page.clock.runFor(500);
  });

export const INSPECTOR = '[data-role="inspector"]';
export const COMMAND_MENU = '[data-role="command-menu"]';
export const CONTEXT_MENU = '[data-role="context-menu"]';
export const KEYS = '[data-role="keys-sheet"]';
export const CHIP_MENU = '[data-role="chip-menu"]';
export const VIEW_MENU = '[data-role="view-menu"]';
export const RECEIPTS = '[data-role="receipts"]';

/** The studio's first clip drawn: the timeline is read and laid out. */
export const STUDIO_READY = '.st-timeline .st-clip';

/** Script clip `beat` on the studio's timeline. */
const scriptClip = (beat: string) => `.st-lane[data-track="script"] .st-clip[data-beat="${beat}"]`;

/**
 * The studio's first version with a beat moved from its menu: the move's
 * receipt offers Undo, the page's clock held so its own timer does not put
 * it away before it is measured.
 */
export const receipted = (viewport: Viewport) =>
  Effect.gen(function* () {
    const page = yield* player(
      pageHref.studio(PROBE, { v: 1 }),
      STUDIO_READY,
      editsKept(),
    )(viewport);
    yield* rightClick(page, scriptClip('three'));
    yield* page.click(`${CONTEXT_MENU} [data-command="studio.move-before"]`);
    yield* page.click('[data-role="move-picker"] .st-picker-row[data-to="two"]');
    yield* countIs(page, '[data-role="move-picker"]', 0);
    yield* waitFor(page, '[data-role="receipt"] [data-act="receipt-undo"]');
    yield* page.clock.hold;
    return page;
  });

/** An ask, read: its page's send, under its sections. */
export const ASK_READY = '.ak-sections:has(.ak-step) ~ .ak-send [data-act="send"]';

/** A page of asks, read: its count, and its last part's send under its sections. */
export const PAGE_READY = `.akp:has(.akp-count) .ak[data-ask="${STUDIO_PAGE_PACE}"] ${ASK_READY}`;

/** A series draft, read: its first beat's take ready (its ▶). */
export const DRAFT_READY = '.lab-script-beat[data-beat="1"] [data-act="hear-beat"]';

/** A series draft's words selected, read: their delivery's Stress. */
export const DELIVERY_READY = '.lab-script-delivery [data-act="stress-words"]';

/** A production's timeline, read: its current version's Move forward. */
export const PRODUCTION_READY = '.pd-v[data-current="true"] [data-act="move-forward"]';

export const STATES: ByPlace<State, AtRest> = {
  home: [
    {
      name: 'Films',
      // At rest once each card shows its film's state. The productions come first: their
      // heading and the toy's card. The series follow the films, their heading and a card for
      // each, shut (the owner reads and marks the scripts of every series planned there, so a
      // visit opens one; its drafts are behind its head).
      open: review(pageHref.home(), '.rv-film-card [data-role="counts"]'),
      disclose: AT_REST,
      budget: most(12, 12),
    },
    {
      // The shell's view menu (`⋯`), which every review page's header holds.
      name: 'Films, the view menu',
      open: review(pageHref.home(), '.rv-film-card [data-role="counts"]'),
      disclose: opens('[data-act="view-menu"]', `${VIEW_MENU} [data-command]`),
      layer: VIEW_MENU,
    },
    {
      name: "Films, the command menu's Go to",
      open: review(pageHref.home(), '.rv-film-card [data-role="counts"]'),
      disclose: (page) =>
        Effect.gen(function* () {
          yield* page.press('Control+k');
          yield* page.fill('.lab-command-query', 'go to');
          yield* waitFor(page, `${COMMAND_MENU} [data-command^="go."]`);
        }),
      layer: COMMAND_MENU,
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
      // An ask that names a film is a film's view: its switcher names the film and its Studio
      // link leads into it (taste-1 T2, where am I).
      // A page of one section has no "1 of 1" head, and an ask that waits wears no chip (the
      // dock's count says what is left).
      budget: most(23, 23),
    },
  ],
  askPage: [
    {
      name: 'a page of three asks: the first answered and folded, two still asking',
      open: review(pageHref.askPage(STUDIO_PAGE), PAGE_READY),
      disclose: AT_REST,
      // The shell's, the page's head and count, the answered ask's one line, then each ask still
      // asking: its head, why, choice and Send (measured 26 on a phone, 27 on a laptop).
      budget: most(26, 27),
    },
  ],
  draft: [
    {
      // The words, their marks, a ready take and its pace: the shell's four, Hear it (the draft
      // heard whole from its first ready take, what a visit to a draft is for: taste-1 T5) and a
      // ready take's ▶ the only controls; the rest is what is read (the toy's 15 words, each its
      // own text leaf, a hold's glyph, each beat's number and label, its brief and its sources)
      // and the day's spend, one line.
      name: 'a series draft in the Script reader, at rest',
      open: review(pageHref.draft(STUDIO_SERIES, STUDIO_DRAFT), DRAFT_READY),
      disclose: AT_REST,
      budget: most(36, 36),
    },
  ],
  draftBeat: [
    {
      name: "a series draft, a word selected: Hear, Clear and the word's delivery",
      open: review(pageHref.draftBeat(STUDIO_SERIES, STUDIO_DRAFT, '1', '4-4'), DELIVERY_READY),
      disclose: AT_REST,
      // At rest's and the box a tap opened: the words quoted, Hear, Clear, Stress and the gap's three.
      budget: most(43, 43),
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
  studio: [
    {
      name: 'Studio',
      open: player(pageHref.studio(PROBE), STUDIO_READY),
      disclose: AT_REST,
      // On a laptop each of the probe's thirteen clips is a control and the ruler labels each of
      // its 13 seconds: 53 things (measured 2026-10-16). Two earn their place in most visits: the
      // Films link, the studio's way home that every visit that leaves the film takes, and the
      // probe's card panel, a Board clip as a film's narration cards are (CRAFT rule 1), most of an
      // animatic's panels. The Note key is one more on each: the frame's
      // note is the studio's one way to say what to change, so it stands in the transport. The
      // Script key is one more on a laptop: the owner chose a key in the transport to open the
      // Script pane ("opened with a Script key (S)", his answer to the pane's ask). A phone hides
      // the key, so the timecode keeps its room, and opens the pane from its reading block's
      // head, which counts already.
      budget: STUDIO_AT_REST,
    },
    {
      name: 'Studio, a beat selected: the inspector open on its Words',
      open: player(
        pageHref.studio(PROBE, { sel: 'beat:one' }),
        '.st-sec[data-section="Words"][open] .lab-script-beat[data-beat="one"]',
      ),
      disclose: AT_REST,
    },
    {
      name: "Studio, a panel selected: the inspector's Board, a try shown large and Keep",
      open: player(
        pageHref.studio(PROBE, { sel: 'panel:one.fall' }),
        '.st-sec[data-section="Board"][open] .st-panel[data-panel="one.fall"] .st-try-btn',
      ),
      disclose: opens(
        '.st-panel[data-panel="one.fall"] .st-try-btn[data-try="2"]',
        '.st-try-shown [data-act="keep"]',
      ),
    },
    {
      name: "Studio, the inspector's Voice, Code, and Notes and asks open",
      open: player(pageHref.studio(PROBE, { sel: 'beat:two' }), '.st-pane[data-beat="two"]'),
      disclose: (page) =>
        Effect.gen(function* () {
          for (const name of ['Voice', 'Code', 'Notes and asks'])
            yield* opens(
              `.st-sec[data-section="${name}"] > summary`,
              `.st-sec[data-section="${name}"][open] .st-sec-body`,
            )(page);
          yield* waitFor(page, `.st-sec[data-section="Notes and asks"] a.st-ask`);
        }),
    },
    {
      name: 'Studio, Record over the studio (a Dialog on a laptop, a Sheet on a phone)',
      open: player(pageHref.studio(PROBE, { sel: 'beat:two' }), '.st-pane[data-beat="two"]'),
      disclose: (page) =>
        Effect.gen(function* () {
          yield* opens(
            '.st-sec[data-section="Voice"] > summary',
            '.st-sec[data-section="Voice"] [data-act="record"]',
          )(page);
          yield* opens(
            '[data-act="record"]',
            '[data-role="record"] [data-act="close-record"]',
          )(page);
        }),
      layer: '[data-role="record"]',
    },
    {
      name: 'Studio, the version menu',
      open: player(pageHref.studio(PROBE), STUDIO_READY),
      disclose: opens('[data-act="version"]', '[data-role="versions"] [data-version="1"]'),
      layer: '[data-role="versions"]',
    },
    {
      name: 'Studio, the context menu',
      open: player(pageHref.studio(PROBE), STUDIO_READY),
      disclose: menuOn('.st-transport'),
      layer: CONTEXT_MENU,
    },
    {
      name: 'Studio, the keys dialog',
      open: player(pageHref.studio(PROBE), STUDIO_READY),
      disclose: pressed('?', `${KEYS} [data-command]`),
      layer: KEYS,
    },
    {
      name: 'Studio, a receipt with Undo',
      open: receipted,
      disclose: AT_REST,
      layer: RECEIPTS,
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
  name: "the studio's long-press menu on a clip",
  open: player(pageHref.studio(PROBE), STUDIO_READY),
  // Made in its case, not as the table is: a call in an initializer runs where it is declared.
  disclose: (page) => heldOn(scriptClip('two'))(page),
  layer: CONTEXT_MENU,
};

/** The place `LONG_PRESSED` is at. */
export const LONG_PRESSED_AT: PlaceName = 'studio';
