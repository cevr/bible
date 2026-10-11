// The studio's controls as assistive tech and the keyboard meet them, over
// the probe film with the lab API faked: the header's rule is a vertical
// separator, and the film switcher lists the films as a group of radio
// items, the open film checked.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { openLab } from '../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { attributeIs, evaluates, waitFor } from '../../src/lab/fixtures/settled.ts';

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
