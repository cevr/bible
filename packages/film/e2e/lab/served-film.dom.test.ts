// A film's own pages, the Lab, Scenes and Play, as the lab serves them once
// it renders them on the server (PA-12): the server's document is the
// studio's shell (the header, the film switcher, the tab bar on the page's
// part) with a quiet line where the film lands, and none of the film (no
// canvas, no panel, no tape: the server never imports a film's modules);
// the browser hydrates the shell with no mismatch, then stages the film and
// puts its page in the shell's body, which fits a phone as ever.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { PHONE, openServed } from '../../src/lab/fixtures/harness.ts';
import { fitsPhone } from '../../src/lab/fixtures/phone-fit.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { countIs, until, waitFor } from '../../src/lab/fixtures/settled.ts';

/** Long enough to bundle the server entry once, render, open, hydrate and stage the film. */
const SLOW = 60_000;

/** What the page said of its hydration: Solid's development build warns of every mismatch. */
const mismatches = (logged: ReadonlyArray<{ readonly type: string; readonly text: string }>) =>
  logged.filter((l) => /hydrat/i.test(l.text) && l.type !== 'log');

const PAGES = [
  { name: 'Lab', page: 'lab', href: pageHref.lab(PROBE), part: 'lab', ready: '.lab-panel' },
  {
    name: 'Scenes',
    page: 'player',
    href: pageHref.scenes(PROBE),
    part: 'scenes',
    ready: '.sc-still[data-drawn="true"] canvas',
  },
  { name: 'Play', page: 'player', href: pageHref.play(PROBE), part: 'play', ready: '.bar .tc' },
] as const;

describe("a film's pages served as the lab renders them", () => {
  for (const { name, page: served, href, part, ready } of PAGES)
    it.live(
      `${name}: the server's document is the shell, none of the film; hydrated with no mismatch, the film lands in its body and the page fits a phone`,
      () =>
        Effect.gen(function* () {
          const { page, documents, errors } = yield* openServed(served, [], {
            href,
            viewport: PHONE,
          });
          // The markup, from the page's root on (the head's styles name every class).
          const whole = documents[0]?.html ?? '';
          const html = whole.slice(whole.indexOf('data-page-root'));
          expect(html).toContain('class="sh-header"');
          expect(html).toContain(`class="sh" data-part="${part}" data-film="true"`);
          expect(html).toMatch(new RegExp(`data-page="${part}"[^>]*data-active="true"`));
          expect(html).toContain(`Opening ${PROBE}…`);
          for (const film of ['<canvas', 'lab-panel', 'sc-still', 'class="bar"'])
            expect(html).not.toContain(film);
          // The film, staged in the browser, in the hydrated shell's body.
          yield* waitFor(page, ready);
          yield* until(page, `document.querySelector('.stage canvas') !== null`);
          yield* countIs(page, '.sh-await', 0);
          yield* fitsPhone(page);
          expect(mismatches(page.logged)).toEqual([]);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
});
