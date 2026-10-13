// The studio's controls as assistive tech and the keyboard meet them, over
// the probe film with the lab API faked: the header's rule is a vertical
// separator, and the film switcher lists the films as a group of radio
// items, the open film checked; and whatever the keyboard focuses (a control,
// a link, a scroll box, a dialog, a receipt) shows the studio's ring on every
// page and in every portal, never the browser's; and a floating root shows it
// over its own shadow, exactly, on every page.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ServerFailed, pageHref } from '../../src/core/api.ts';
import {
  DESK,
  PHONE,
  openLab,
  openPlayer,
  openReview,
  refused,
  route,
} from '../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import {
  FOCUS_SHOWN,
  attributeIs,
  evaluates,
  textIs,
  waitFor,
} from '../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { receipted } from './studio-states.ts';

const SLOW = 30_000;

/** Each radio item of the film menu: its film, its role and whether it reads as checked. */
const FILM_ITEMS = `[...document.querySelectorAll('[data-role="film-menu"] [data-film]')].map((e) => [e.dataset.film, e.getAttribute('role'), e.getAttribute('aria-checked'), e.closest('[role="group"]').getAttribute('aria-label')])`;

describe("the shell's header", () => {
  it.live(
    'the rule after Films is a vertical separator; the switcher’s films are radio items, the open one checked',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab();
        yield* attributeIs(page, '.sh-header .sh-vsep', 'role', 'separator');
        yield* attributeIs(page, '.sh-header .sh-vsep', 'aria-orientation', 'vertical');
        yield* page.click('.sh-switcher');
        yield* waitFor(page, `[data-role="film-menu"] [data-film="${PROBE}"]`);
        // Every film is a radio item of the group named Films; the open one alone is checked.
        yield* evaluates(
          page,
          `${FILM_ITEMS}.every(([, role, , group]) => role === 'menuitemradio' && group === 'Films')`,
          true,
        );
        yield* evaluates(
          page,
          `${FILM_ITEMS}.filter(([, , checked]) => checked === 'true').map(([film]) => film)`,
          [PROBE],
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
    'on the Lab, in its ⌘K portal and on Play, a kit control focused from the keyboard shows the studio’s ring',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab();
        // The mode tray's toggle (a segment), the transport's play (an icon button), a page bar's link.
        for (const control of ['.lab-modes > button', '.bar [data-act="play"]', 'a.sh-tab']) {
          yield* page.focus(control);
          yield* evaluates(page, FOCUS_SHOWN, 'ring');
        }
        // The ⌘K sheet is portalled to the body, outside every page's scope: its query field too.
        yield* page.click('.sh-header [data-act="search"]');
        yield* waitFor(page, '.lab-command-query:focus');
        yield* evaluates(page, FOCUS_SHOWN, 'ring');
        expect(errors).toEqual([]);
        const play = yield* openPlayer(
          { href: pageHref.play(PROBE), viewport: DESK },
          '.bar [data-act="play"]',
        );
        yield* play.page.focus('.bar [data-act="play"]');
        yield* evaluates(play.page, FOCUS_SHOWN, 'ring');
        expect(play.errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'in the keys dialog, a button drawn outside the kit (a command’s Change) shows the studio’s ring',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab();
        const rebind = '[data-role="keys-sheet"] .lab-keys-actions > button';
        yield* page.press('?');
        yield* waitFor(page, rebind);
        yield* page.focus(rebind);
        yield* evaluates(page, FOCUS_SHOWN, 'ring');
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

/** The keys dialog, and a command's Change in it. */
const KEYS_SHEET = '[data-role="keys-sheet"]';
const CHANGE = `${KEYS_SHEET} .lab-keys-actions > button`;

/**
 * Open the keys dialog (`?`), keep its resting shadow, and change the first command's key:
 * Change clicked, `y` pressed. The new chord re-lists the rows, so the button leaves the page,
 * and the dialog takes the focus.
 */
const rebind = (page: Tab) =>
  Effect.gen(function* () {
    yield* page.press('?');
    yield* waitFor(page, CHANGE);
    yield* page.evaluate(keepRest(KEYS_SHEET));
    yield* page.click(CHANGE);
    yield* waitFor(page, `${KEYS_SHEET} [data-act="press"]`);
    yield* page.press('y');
    yield* evaluates(page, `document.activeElement.matches('${KEYS_SHEET}')`, true);
  });

/** Each page the studio's frame (and its keys dialog) is on, opened at a desk. */
const PAGES = [
  ['the Lab', () => openLab()],
  [
    'Play',
    () => openPlayer({ href: pageHref.play(PROBE), viewport: DESK }, '.bar [data-act="play"]'),
  ],
  ['the review', () => openReview([])],
] as const;

describe('every focus the keyboard shows is the studio’s ring', () => {
  for (const viewport of [DESK, PHONE])
    it.live(
      `a Tab walk through the Lab at ${viewport.width}: every stop, control, scroll box or root, shows the ring, never the browser’s`,
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openLab([], { viewport });
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
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('a floating root shows the ring over its own shadow, exactly, on every page', () => {
  for (const [where, open] of PAGES)
    it.live(
      `on ${where}, a key changed in the keys dialog hands the focus to the dialog, which shows the ring over its shadow`,
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* open();
          yield* page.evaluate(WATCH_FOCUS);
          yield* rebind(page);
          yield* evaluates(page, stoppedOn('lab-keys-sheet'), true);
          yield* evaluates(page, UNRINGED, []);
          yield* evaluates(page, ringedOverRest(KEYS_SHEET), 'exact');
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
});
