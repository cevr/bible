// The studio's controls as assistive tech and the keyboard meet them, over
// the probe film with the lab API faked: the header's rule is a vertical
// separator, and the film switcher lists the films as a group of radio
// items, the open film checked; and a kit control focused from the keyboard
// shows the studio's ring on every page and in every portal.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ServerFailed, pageHref } from '../../src/core/api.ts';
import {
  DESK,
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
        // The mode tray's toggle (a segment), the transport's play (an icon button).
        for (const control of ['.lab-modes > button', '.bar [data-act="play"]']) {
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
