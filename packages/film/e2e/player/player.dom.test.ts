// The player in a browser: the real player page over the probe film, on a
// phone's window and a desk's. Neither the play page nor the look-book
// scrolls sideways; the play page keeps its film time as `#t=`; a look-book still
// opens its frame in the scene's lab.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { openPlayer } from '../../src/lab/fixtures/harness.ts';
import { PROBE, probeFilm } from '../../src/lab/fixtures/probe-film.ts';
import { attributeIs, evaluates, textHas } from '../../src/lab/fixtures/settled.ts';

const PHONE = { width: 390, height: 844 };
const DESK = { width: 1440, height: 900 };

/** Where the probe film's second scene starts, in film seconds. */
const TWO = probeFilm().placed[1]?.start ?? Number.NaN;

/** Whether the page is no wider than its window. */
const NO_SIDEWAYS = 'document.documentElement.scrollWidth <= document.documentElement.clientWidth';

describe('the player', () => {
  for (const [label, viewport] of [
    ['a phone', PHONE],
    ['a desk', DESK],
  ] as const) {
    it.live(`the play page does not scroll sideways on ${label}`, () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.play(PROBE), viewport },
          '.bar .time',
        );
        yield* evaluates(page, NO_SIDEWAYS, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    );

    it.live(`the look-book does not scroll sideways on ${label}`, () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.scenes(PROBE), viewport },
          '.lookbook-sheet canvas',
        );
        yield* evaluates(page, NO_SIDEWAYS, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    );
  }

  it.live("the play page keeps its time as #t=, in the film's seconds", () =>
    Effect.gen(function* () {
      const { page } = yield* openPlayer(
        { href: `${pageHref.play(PROBE)}#t=0.5`, viewport: DESK },
        '.bar .time',
      );
      yield* textHas(page, '.bar .scene', 'one');
      yield* page.press(']');
      yield* evaluates(page, 'location.hash', `#t=${TWO}`);
      yield* evaluates(page, 'location.pathname', pageHref.play(PROBE));
    }).pipe(Effect.scoped),
  );

  it.live("the look-book's way back is the film's lab, and a still opens its scene's lab", () =>
    Effect.gen(function* () {
      const { page } = yield* openPlayer(
        { href: pageHref.scenes(PROBE), viewport: DESK },
        '.lookbook-sheet canvas',
      );
      yield* attributeIs(page, '.lookbook-bar a', 'href', pageHref.lab(PROBE));
      // The stills sit below the title and the palette: down the sheet's
      // first column, the first click on a still opens it.
      const sheet = yield* page.box('.lookbook-sheet canvas');
      for (let k = 1; k < 20; k += 1) {
        const left = yield* page.evaluate('location.pathname');
        if (left !== pageHref.scenes(PROBE)) break;
        yield* page.mouse.click(sheet.x + sheet.width * 0.15, sheet.y + (sheet.height * k) / 20);
      }
      yield* evaluates(page, "location.pathname.startsWith('/films/probe/lab/')", true);
      yield* evaluates(page, "location.hash.startsWith('#t=')", true);
    }).pipe(Effect.scoped),
  );
});
