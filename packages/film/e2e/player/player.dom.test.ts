// The player in a browser: the real player page over the probe film, on a
// phone's window and a desk's, each in the studio's shell. Neither the play page nor the look-book
// scrolls sideways; the play page keeps its film time as `#t=`, and its legend
// is hidden until `?` or the bar's ? button; a look-book still opens its frame
// in the scene's lab, and the shell's page bar leads there.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { timecode } from '../../src/core/time.ts';
import { openPlayer } from '../../src/lab/fixtures/harness.ts';
import { touch } from '../../src/lab/fixtures/gestures.ts';
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
          '.bar .tc',
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
        '.bar .tc',
      );
      yield* textHas(page, '.bar .scene', 'one');
      yield* attributeIs(page, '.sh-pagebar [data-page="play"]', 'data-active', 'true');
      yield* textHas(page, '.sh-header [data-act="timecode"]', timecode(0.5));
      yield* page.press(']');
      yield* evaluates(page, 'location.hash', `#t=${TWO}`);
      yield* evaluates(page, 'location.pathname', pageHref.play(PROBE));
      // The header's timecode follows the playhead.
      yield* textHas(page, '.sh-header [data-act="timecode"]', timecode(TWO));
    }).pipe(Effect.scoped),
  );

  it.live(
    'a tick held by a finger says its name, which stays a moment once it lifts (UR-115)',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openPlayer(
          { href: pageHref.play(PROBE), viewport: PHONE },
          '.bar .tc',
        );
        const tick = '.bar .track .tick.cue';
        const name = String(yield* page.evaluate(`document.querySelector('${tick}').dataset.name`));
        yield* touch(page, tick, 0);
        yield* evaluates(page, "document.querySelector('.bar .tip').hidden", false);
        yield* textHas(page, '.bar .tip', name);
        yield* page.finger.up;
        yield* evaluates(page, "document.querySelector('.bar .tip').hidden", false);
        yield* evaluates(page, "document.querySelector('.bar .tip').hidden", true);
      }).pipe(Effect.scoped),
  );

  it.live(
    'the legend is hidden at rest; the bar’s ? button shows it, with the keys bound, and ? opens the keys sheet',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.play(PROBE), viewport: PHONE },
          '.bar .tc',
        );
        const shown = "!document.querySelector('.bar .keys').hidden";
        yield* evaluates(page, shown, false);
        yield* page.click('.bar [data-act="legend"]');
        yield* evaluates(page, shown, true);
        yield* attributeIs(page, '.bar [data-act="legend"]', 'aria-expanded', 'true');
        yield* textHas(page, '.bar .keys .bound', 'Space play');
        yield* page.click('.bar [data-act="legend"]');
        yield* evaluates(page, shown, false);
        // `?` is the studio's keys sheet here as on every page, the transport's keys in it.
        yield* page.press('?');
        yield* page.waitFor('[data-role="keys-sheet"] [data-command="play.toggle"]');
        yield* evaluates(page, shown, false);
        yield* page.press('Escape');
        yield* attributeIs(page, '.bar [data-act="legend"]', 'aria-expanded', 'false');
        yield* evaluates(page, NO_SIDEWAYS, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live(
    "the look-book is the shell's Scenes, its page bar leads to the lab, and a still opens its scene's lab",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openPlayer(
          { href: pageHref.scenes(PROBE), viewport: DESK },
          '.lookbook-sheet canvas',
        );
        yield* attributeIs(page, '.sh-pagebar [data-page="scenes"]', 'data-active', 'true');
        yield* attributeIs(page, '.sh-pagebar [data-page="lab"]', 'href', pageHref.lab(PROBE));
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
