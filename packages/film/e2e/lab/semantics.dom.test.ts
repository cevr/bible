// The studio's controls as assistive tech and the keyboard meet them, over
// the probe film with the lab API faked: the header's rule is a vertical
// separator, and the film switcher lists the films as a group of radio
// items, the open film checked; and whatever the keyboard focuses (a control,
// a link, a scroll box, a dialog, a receipt) shows the studio's ring on every
// page and in every portal, never the browser's; every floating root (a
// dialog, a menu, a sheet, a receipt) shows it over its own shadow, exactly,
// on every page that opens it, inside its edge when its box fills the view;
// and a mouse path that moves the focus from script (the studio holding it)
// shows no ring.

import { Effect, type Scope } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ServerFailed, pageHref } from '../../src/core/api.ts';
import {
  DESK,
  type Json,
  PHONE,
  type Viewport,
  json,
  openPlayer,
  openReview,
  refused,
  route,
} from '../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { STUDIO_FILM, STUDIO_FOLDER, STUDIO_SET } from '../../src/lab/fixtures/studio-film.ts';
import { rightClick } from '../../src/lab/fixtures/gestures.ts';
import {
  FOCUS_SHOWN,
  attributeIs,
  evaluates,
  textIs,
  waitFor,
} from '../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { FLOATING, LEFT_OPEN, pageAfterPage, registry, runFromMenu, sampled } from './registry.ts';
import { receipted, review } from './studio-states.ts';

const SLOW = 30_000;
/** A page's every root, its registry run once. */
const REGISTRY = 180_000;

/** Each radio item of the film menu: its film, its role and whether it reads as checked. */
/** The studio at rest: its timeline drawn. */
const READY = '.st-timeline .st-clip';

/** The studio, `viewport` wide. */
const studio = (viewport: Viewport = DESK) =>
  openPlayer({ href: pageHref.studio(PROBE), viewport }, READY);

/** A Set of a film (`STUDIO_FILM`'s), at a desk: its header names the film. */
const aSet = () =>
  Effect.map(review(pageHref.set(STUDIO_FOLDER, STUDIO_SET), '.rv-main video')(DESK), (page) => ({
    page,
    errors: page.errors,
  }));

const FILM_ITEMS = `[...document.querySelectorAll('[data-role="film-menu"] [data-film]')].map((e) => [e.dataset.film, e.getAttribute('role'), e.getAttribute('aria-checked'), e.closest('[role="group"]').getAttribute('aria-label')])`;

describe("the shell's header", () => {
  it.live(
    'the rule after Films is a vertical separator; the switcher’s films are radio items, the open one checked',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* aSet();
        yield* attributeIs(page, '.sh-header .sh-vsep', 'role', 'separator');
        yield* attributeIs(page, '.sh-header .sh-vsep', 'aria-orientation', 'vertical');
        yield* page.click('.sh-switcher');
        yield* waitFor(page, `[data-role="film-menu"] [data-film="${STUDIO_FILM}"]`);
        // Every film is a radio item of the group named Films; the open one alone is checked.
        yield* evaluates(
          page,
          `${FILM_ITEMS}.every(([, role, , group]) => role === 'menuitemradio' && group === 'Films')`,
          true,
        );
        yield* evaluates(
          page,
          `${FILM_ITEMS}.filter(([, , checked]) => checked === 'true').map(([film]) => film)`,
          [STUDIO_FILM],
        );
        // The check is drawn, not said: no key hint stands for a state.
        yield* evaluates(
          page,
          `document.querySelectorAll('[data-role="film-menu"] kbd').length`,
          0,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('a read that fails', () => {
  it.live(
    'on the review, a read refused says why in a polite live region, where it said it was reading',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openReview([
          route('GET', /^\/api\/review\/index/, () =>
            refused(ServerFailed.make({ tag: 'IndexFailed', reason: 'the renders are locked' })),
          ),
        ]);
        yield* textIs(page, '.rv-main .empty', 'the renders are locked');
        yield* attributeIs(page, '.rv-main .empty', 'role', 'status');
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe("the kit's focus ring", () => {
  it.live(
    'on the studio and in its ⌘K portal, a kit control focused from the keyboard shows the studio’s ring',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studio();
        // The transport's play and next beat (icon buttons), the timeline's Fit (a text button).
        for (const control of [
          '.st-key[data-act="play.toggle"]',
          '.st-key[data-act="studio.on"]',
          '.st-tbtn[data-act="fit"]',
        ]) {
          yield* page.focus(control);
          yield* evaluates(page, FOCUS_SHOWN, 'ring');
        }
        // The ⌘K sheet is portalled to the body, outside every page's scope: its query field too.
        yield* page.press('Control+k');
        yield* waitFor(page, '.lab-command-query:focus');
        yield* evaluates(page, FOCUS_SHOWN, 'ring');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'on a Set, the header’s Studio link and Go to… focused from the keyboard show the studio’s ring',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* aSet();
        for (const control of ['a.sh-studio', '.sh-header [data-act="search"]']) {
          yield* page.focus(control);
          yield* evaluates(page, FOCUS_SHOWN, 'ring');
        }
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

/** A page-side function: the box-shadow a value (`var(--focus-ring)`) computes to. */
const RESOLVED = `((v) => { const i = document.createElement('i'); i.style.boxShadow = v; document.body.append(i); const s = getComputedStyle(i).boxShadow; i.remove(); return s; })`;

/** A page-side function: an element's name, as `tag.class.class[role=…]`. */
const NAME = `((el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() !== '' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + (el.hasAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : ''))`;

/**
 * A script that, from now on, keeps every focus the keyboard shows (`:focus-visible`) as
 * `[element, shown]`: `ring` when its shadow begins with the studio's ring (`--focus-ring`, or
 * `--focus-ring-inset` inside a clipping edge) and it draws no `auto` outline; `browser` when it
 * draws the user agent's own ring (an `auto` outline); else `none`.
 */
const WATCH_FOCUS = `(() => {
  const resolved = ${RESOLVED};
  const rings = [resolved('var(--focus-ring)'), resolved('var(--focus-ring-inset)')];
  const name = ${NAME};
  window.focusStops = [];
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof Element) || !el.matches(':focus-visible')) return;
    const s = getComputedStyle(el);
    const shown = s.outlineStyle === 'auto' ? 'browser' : rings.some((r) => s.boxShadow.startsWith(r)) ? 'ring' : 'none';
    window.focusStops.push([name(el), shown]);
  }, true);
  return true;
})()`;

/** Each stop the watch kept that showed no studio ring, as `element: shown`. */
const UNRINGED = `window.focusStops.filter(([, shown]) => shown !== 'ring').map(([el, shown]) => el + ': ' + shown)`;

/** Whether the watch kept a stop on an element whose name has `part`. */
const stoppedOn = (part: string) => `window.focusStops.some(([el]) => el.includes('${part}'))`;

/** Press Tab until the focused element matches `selector`, at most `most` times. */
const tabTo = (page: Tab, selector: string, most: number) =>
  Effect.gen(function* () {
    for (let i = 0; i < most; i++) {
      if (yield* page.evaluate<boolean>(`document.activeElement.matches('${selector}')`)) return;
      yield* page.press('Tab');
    }
  });

/** A script that keeps `root`'s shadow as it rests, unfocused, for `RINGED_OVER_REST` to read. */
const keepRest = (root: string) =>
  `(() => { window.restingShadow = getComputedStyle(document.querySelector('${root}')).boxShadow; return true; })()`;

/**
 * How the focused element shows its focus: `exact` when it is `root`, draws no outline, and its
 * shadow is exactly `--focus-ring` over the shadow `keepRest` kept (a shadow that merely begins
 * with the ring, its own lost, is not); else what it drew.
 */
const ringedOverRest = (root: string) =>
  `((el) => { const s = getComputedStyle(el); const ring = ${RESOLVED}('var(--focus-ring)'); const want = window.restingShadow === 'none' ? ring : ring + ', ' + window.restingShadow; return el.matches('${root}') && s.outlineStyle === 'none' && s.boxShadow === want ? 'exact' : ${NAME}(el) + ': outline ' + s.outlineStyle + ', shadow ' + s.boxShadow + ', not ' + want; })(document.activeElement)`;

/**
 * The element the page shows the keyboard's focus on (`:focus-visible`), by name; `none` when
 * none. A page without the window's focus matches no `:focus-visible` at all, so it answers
 * that instead of a `none` that proves nothing.
 */
const SHOWN_FOCUS = `(document.hasFocus() ? ((el) => el === null ? 'none' : ${NAME}(el))(document.querySelector(':focus-visible')) : 'a page without focus')`;

/** Whether the studio holds the focus. */
const IN_STUDIO = `document.activeElement.matches('[data-role="studio"]')`;

/** The beat the studio selects, to record. */
const STUDIO_ROUTES = [
  route('GET', /^\/studio\/beats$/, () =>
    json({
      film: PROBE,
      beats: [
        {
          id: 'one',
          file: 'one.wav',
          parts: [{ kind: 'line', text: 'The ball climbs.' }],
          sources: [],
          state: 'staging',
          recorded: false,
          attempts: 0,
        },
      ],
    } satisfies Json),
  ),
];

/** The recorder's beat, in its dialog. */
const RECORD_BEAT = '[data-role="record"] [data-beat="one"]';

/** The studio's recorder over `STUDIO_ROUTES`, opened by the pointer from beat one's Voice section. */
const inRecord = () =>
  Effect.gen(function* () {
    const opened = yield* openPlayer(
      { href: pageHref.studio(PROBE, { sel: 'beat:one' }), viewport: DESK, microphone: true },
      READY,
      STUDIO_ROUTES,
    );
    const voice = '.st-pane .st-sec[data-section="Voice"]';
    yield* opened.page.click(`${voice} > summary`);
    yield* opened.page.click(`${voice} [data-act="record"]`);
    yield* waitFor(opened.page, RECORD_BEAT);
    return opened;
  });

describe('every focus the keyboard shows is the studio’s ring', () => {
  for (const viewport of [DESK, PHONE])
    it.live(
      `a Tab walk through the studio at ${viewport.width}: every stop, control, scroll box or root, shows the ring, never the browser’s`,
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studio(viewport);
          yield* page.evaluate(WATCH_FOCUS);
          for (let i = 0; i < 60; i++) yield* page.press('Tab');
          yield* evaluates(page, 'window.focusStops.length > 20', true);
          yield* evaluates(page, UNRINGED, []);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

  it.live(
    'a receipt reached by Tab shows the ring over its own shadow, exactly',
    () =>
      Effect.gen(function* () {
        const page = yield* receipted(DESK);
        yield* page.evaluate(WATCH_FOCUS);
        yield* page.evaluate(keepRest('.lab-receipt'));
        yield* tabTo(page, '.lab-receipt', 80);
        yield* evaluates(page, stoppedOn('lab-receipt'), true);
        yield* evaluates(page, UNRINGED, []);
        yield* evaluates(page, ringedOverRest('.lab-receipt'), 'exact');
        expect(page.errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

/**
 * A case that runs alone, its scope closed at its end, a timeout's included (`it.scopedLive.serial`):
 * `:focus-visible` matches only in the window that has the focus, and a sibling case opening
 * its own tab at once takes it.
 */
const alone = <A, E>(name: string, body: Effect.Effect<A, E, Scope.Scope>, timeout = SLOW) =>
  it.scopedLive.serial(name, () => Effect.asVoid(body), timeout);

describe('a mouse path that moves the focus from script shows no ring', () => {
  alone(
    'on the studio, a plain click on a transport button shows none',
    Effect.gen(function* () {
      const { page, errors } = yield* studio();
      for (const control of ['.st-key[data-act="studio.on"]', '.st-key[data-act="play.toggle"]']) {
        yield* page.click(control);
        yield* evaluates(page, SHOWN_FOCUS, 'none');
      }
      expect(errors).toEqual([]);
    }),
  );

  alone(
    'in the recorder, opened by the pointer, a click on a beat leaves the focus on the recorder with no ring',
    Effect.gen(function* () {
      const { page, errors } = yield* inRecord();
      yield* page.click(RECORD_BEAT);
      yield* evaluates(page, IN_STUDIO, true);
      yield* evaluates(page, SHOWN_FOCUS, 'none');
      expect(errors).toEqual([]);
    }),
  );
});

/**
 * Every floating root open now, outermost only (⌘K's listbox sits in its dialog), each focused
 * from the keyboard in turn: `exact` when it draws no outline and its shadow is exactly
 * `--focus-ring` over the shadow it rests with, unfocused; else what it drew. A root whose box
 * fills the view (the lightbox) has no edge on screen for a ring outside it, nor has a sheet's,
 * whose container clips it to its panel's box (`[data-sheet-scroll]`), so either shows
 * `--focus-ring-inset` inside its edge, and nothing outside. The focus goes back where it
 * was, with the look it had. Answers `[root, how]` pairs.
 */
const ROOTS_RINGED = `(() => {
  const ring = ${RESOLVED}('var(--focus-ring)');
  const inset = ${RESOLVED}('var(--focus-ring-inset)');
  const name = (el) => ${NAME}(el) + (el.dataset.role === undefined ? '' : '[data-role=' + el.dataset.role + ']');
  const floating = '${FLOATING}';
  const open = [...document.querySelectorAll(floating)].filter((e) => e.checkVisibility() && !e.matches('[data-ending-style], [data-closed]') && (e.parentElement === null || e.parentElement.closest(floating) === null));
  const had = document.activeElement;
  const hadRing = had instanceof Element && had.matches(':focus-visible');
  const answers = open.map((root) => {
    if (root === document.activeElement) root.blur();
    const rest = getComputedStyle(root).boxShadow;
    root.focus({ focusVisible: true, preventScroll: true });
    if (document.activeElement !== root) return [name(root), 'takes no focus'];
    const s = getComputedStyle(root);
    const box = root.getBoundingClientRect();
    const fills = box.left <= 0 && box.top <= 0 && box.right >= innerWidth && box.bottom >= innerHeight;
    const clipped = root.closest('[data-sheet-scroll]') !== null;
    const want = fills || clipped ? inset : rest === 'none' ? ring : ring + ', ' + rest;
    return [name(root), s.outlineStyle === 'none' && s.boxShadow === want ? 'exact' : 'outline ' + s.outlineStyle + ', shadow ' + s.boxShadow + ', not ' + want];
  });
  if (had instanceof HTMLElement) had.focus({ focusVisible: hadRing, preventScroll: true });
  return answers;
})()`;

/** Three animation frames: a root opened has drawn, its opening's styles settled. */
const FRAMES = `new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => done(true)))))`;

/** Mark the `i`th visible trigger of a floating root on the page (`aria-haspopup`), outside any root. */
const markTrigger = (i: number) =>
  `(() => { document.querySelectorAll('[data-guard]').forEach((e) => e.removeAttribute('data-guard')); const t = [...document.querySelectorAll('[aria-haspopup]:not([aria-haspopup=false]):not(:disabled)')].filter((e) => e.checkVisibility() && e.closest('${FLOATING}') === null)[${i}]; if (t === undefined) return false; t.dataset.guard = 'trigger'; return true; })()`;

/** Mark the first visible thing the page's context menu is about (`data-target`). */
const MARK_TARGET = `(() => { const t = [...document.querySelectorAll('[data-target]')].find((e) => e.checkVisibility()); if (t === undefined) return false; t.dataset.guard = 'target'; return true; })()`;

/** A page the guard walks, by its name, and the roots it opens, by their `data-role`. */
interface Walked {
  readonly name: string;
  readonly open: () => Effect.Effect<{ readonly page: Tab }, never, Scope.Scope>;
  /** The roots the walk meets on this page: one it meets and does not name fails it. */
  readonly roots: ReadonlyArray<string>;
  /** Only the roots the page opens on (a link to a still, a phone's open view), not the walk. */
  readonly opening?: true;
}

/** The roof set of the review: three stills, each one a lightbox opens on. */
const roof = (id: string, label: string): Json => ({
  id,
  label,
  lines: [`${label} look`],
  state: 'current',
  picked: false,
  verbs: [],
  media: {
    _tag: 'Seen',
    video: {
      ref: `out/art/roof.${id}.mp4`,
      name: `roof.${id}.mp4`,
      size: 2048,
      mtime: 0,
      phone: 'none',
    },
  },
  key: `out/art/roof.${id}.mp4`,
  approval: 'none',
  comments: [],
});
const ROOF_ROUTES = [
  route('GET', /^\/api\/review\/index/, () =>
    json({
      folders: [
        {
          ref: 'out/art',
          title: 'Roofs at dusk',
          blurb: 'Roofs.',
          mtime: 0,
          sets: [
            {
              id: 'render:roof',
              kind: 'render',
              title: 'The roof',
              lines: [],
              start: 0,
              marks: [],
              variants: [roof('A', 'Warm'), roof('B', 'Cold')],
            },
          ],
          videos: [],
          images: [],
          downloads: [],
          docs: [],
        },
      ],
    }),
  ),
  route('GET', /^\/api\/review\/duration/, () => json({ seconds: 20 })),
];

/** The studio, `viewport` wide, with the picker a Script clip's Move before… opens. */
const movePicker = (viewport: Viewport) =>
  Effect.gen(function* () {
    const opened = yield* studio(viewport);
    yield* rightClick(opened.page, '.st-lane[data-track="script"] .st-clip[data-beat="two"]');
    yield* opened.page.click('[data-role="context-menu"] [data-command="studio.move-before"]');
    yield* waitFor(opened.page, '[data-role="move-picker"] .st-picker-row');
    return opened;
  }).pipe(Effect.orDie);

/** The pages that open floating roots, at a desk, and at a phone's width (its sheets). */
const WALKED: ReadonlyArray<Walked> = [
  {
    name: 'the studio',
    open: () => studio(),
    roots: ['command-menu', 'context-menu', 'keys-sheet', 'receipt', 'versions', 'waits'],
  },
  {
    name: 'the studio at a phone',
    open: () => studio(PHONE),
    roots: ['command-menu', 'context-menu', 'keys-sheet', 'receipt', 'versions', 'waits'],
  },
  ...(
    [
      ['a desk', DESK],
      ['a phone', PHONE],
    ] as const
  ).map(([where, viewport]): Walked => ({
    name: `the studio at ${where}, a beat's Move before… open`,
    open: () => movePicker(viewport),
    roots: ['move-picker'],
    opening: true,
  })),
  {
    name: 'the review',
    open: () => openReview([]),
    roots: ['command-menu', 'film-menu', 'keys-sheet', 'receipt', 'view-menu'],
  },
  ...(
    [
      ['a desk', DESK],
      ['a phone', PHONE],
    ] as const
  ).map(([where, viewport]): Walked => ({
    name: `the review's moments at ${where}, a still in its lightbox`,
    open: () =>
      openReview(ROOF_ROUTES, {
        href: `${pageHref.set('out/art', 'render:roof')}?view=moments&still=B`,
        viewport,
      }),
    roots: ['lightbox'],
    opening: true,
  })),
];

/** The roots the pages open, by their `data-role`: each page's together. */
const ROOTS = [
  'command-menu',
  'context-menu',
  'film-menu',
  'keys-sheet',
  'lightbox',
  'move-picker',
  'receipt',
  'versions',
  'view-menu',
  'waits',
];

/**
 * On the page `walked` opens, open every floating root it offers, one at a time: the keys
 * dialog (`?`), ⌘K, the page's context menu, every trigger of a root on the page (a menu, a
 * chip, the film switcher, a lightbox), and every command of its registry run from ⌘K that
 * leaves a root open (a findings sheet, a scene's palette). Each root open shows the ring over
 * its own shadow, exactly. A path that leaves the page, or leaves a root Escape does not close,
 * has the page opened again.
 */
const everyRoot = (walked: Walked) =>
  Effect.gen(function* () {
    const walk = yield* pageAfterPage(walked.open);
    const start = yield* walk.page().evaluate<string>('location.pathname');
    const failures: Array<string> = [];
    const errors: Array<string> = [];
    const seen = new Set<string>();
    const check = (path: string) =>
      Effect.gen(function* () {
        const page = walk.page();
        yield* page.evaluate(FRAMES);
        for (const [root, how] of yield* page.evaluate<ReadonlyArray<readonly [string, string]>>(
          ROOTS_RINGED,
        )) {
          seen.add(root.replace(/^.*\[data-role=([^\]]+)\]$/, '$1'));
          if (how !== 'exact') failures.push(`${walked.name}, ${path}: ${root}: ${how}`);
        }
        for (let i = 0; i < 3 && (yield* page.evaluate<boolean>(LEFT_OPEN)); i++) {
          yield* page.press('Escape');
          yield* page.evaluate(FRAMES);
        }
        const away = yield* page.evaluate<boolean>(
          `location.pathname !== '${start}' || ${LEFT_OPEN}`,
        );
        if (away) {
          errors.push(...page.errors);
          yield* walk.again;
        }
      });
    yield* check('as it opens');
    if (walked.opening !== true) {
      yield* walk.page().press('?');
      yield* check('the keys dialog');
      yield* walk.page().press('Control+k');
      yield* check('⌘K');
      if (yield* walk.page().evaluate<boolean>(MARK_TARGET)) {
        yield* rightClick(walk.page(), '[data-guard="target"]');
        yield* check('the context menu');
      }
      for (let i = 0; yield* walk.page().evaluate<boolean>(markTrigger(i)); i++) {
        yield* walk.page().click('[data-guard="trigger"]');
        yield* check(`trigger ${i}`);
      }
      for (const id of sampled(yield* registry(walk.page()))) {
        if (yield* runFromMenu(walk.page(), id, 'key')) yield* check(id);
      }
    }
    errors.push(...walk.page().errors);
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
    expect([...seen].toSorted()).toEqual(walked.roots.toSorted());
  });

describe('every floating root shows the ring over its own shadow, exactly, on every page that opens it', () => {
  for (const walked of WALKED) alone(`on ${walked.name}`, everyRoot(walked), REGISTRY);

  // A root a page opens that its row does not name fails it: name it, so the list stays the
  // roots the pages open.
  it.effect('the roots walked are the ones the design language names', () =>
    Effect.sync(() =>
      expect([...new Set(WALKED.flatMap((w) => w.roots))].toSorted()).toEqual(ROOTS),
    ),
  );
});
