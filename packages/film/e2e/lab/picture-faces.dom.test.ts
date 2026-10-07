// What waits for a film's picture faces on the Lab (PS-1): its loader asks
// for them and gives the film at once (`narratedFilms`), so the page's bar
// stands and names where the film is while they load, and only what draws
// the film waits (`pictureFacesWait`): the stage's canvas stays blank and no
// tool stands until they have loaded, so no frame is drawn in a fallback
// face. A face that will not load fails the page as a film that will not
// start does: it ends (no key heard, no feed asking) and says why. The probe
// film's face (`PROBE_FACE`) is the lab's file, held or refused here.

import { Deferred, Effect, Exit } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import {
  PHONE,
  PROBE_FACE_FILE,
  PROBE_FACE_PATH,
  file,
  json,
  later,
  openServed,
  route,
  text,
} from '../../src/lab/fixtures/harness.ts';
import {
  attributeIs,
  countIs,
  evaluates,
  textHas,
  textIs,
  until,
} from '../../src/lab/fixtures/settled.ts';

/** Long enough to bundle the server entry once, render, open, hydrate and stage the film. */
const SLOW = 60_000;

/** Whether the stage's canvas has nothing drawn on it. */
const BLANK = `(() => {
  const canvas = document.querySelector('.stage canvas');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  return data.every((v) => v === 0);
})()`;

/** The probe face's status in the page's fonts. */
const FACE_STATUS = `[...document.fonts].find((f) => f.family.replaceAll('"', '') === 'Probe Face')?.status ?? 'none'`;

/**
 * From now on, the probe face's status at every fill on the stage's canvas,
 * kept on `window.__fills`: what each frame drawn there was drawn with. Run
 * again, it keeps recording as it was.
 */
const RECORD_FILLS = `(() => {
  if ('__fills' in window) return true;
  window.__fills = [];
  const proto = CanvasRenderingContext2D.prototype;
  for (const name of ['fill', 'fillRect', 'fillText', 'drawImage']) {
    const own = proto[name];
    proto[name] = function (...args) {
      if (this.canvas === document.querySelector('.stage canvas')) window.__fills.push(${FACE_STATUS});
      return own.apply(this, args);
    };
  }
  return true;
})()`;

describe("a film's picture faces on the Lab", () => {
  it.live(
    "held: the bar stands and names the film's place, the canvas is blank and no tool stands; landed: the first frame is drawn, and every fill on it, with the face loaded",
    () =>
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const { page, errors } = yield* openServed(
          'lab',
          [route('GET', PROBE_FACE_PATH, () => later(gate, file(PROBE_FACE_FILE)))],
          // The page's load waits for the face too: the open waits for it to mount.
          { viewport: PHONE, mountedOnly: true },
        );
        // The face held: the film's bar is up, its canvas blank, the panel not staged.
        yield* textIs(page, '.bar .scene', 'one');
        yield* textHas(page, '.bar .say', 'The ball');
        yield* evaluates(page, FACE_STATUS, 'loading');
        yield* evaluates(page, BLANK, true);
        yield* evaluates(
          page,
          `document.querySelector('.lab-panel').dataset.staged === 'true'`,
          false,
        );
        // The header's timecode follows the player's time, drawn or not.
        yield* countIs(page, '.sh-tc', 1);
        yield* until(page, RECORD_FILLS);
        // The face lands: the frame is drawn, every fill with it loaded, and the tools stand.
        yield* Deferred.done(gate, Exit.void);
        yield* attributeIs(page, '.lab-panel', 'data-staged', 'true');
        yield* evaluates(page, BLANK, false);
        yield* evaluates(page, 'window.__fills.length > 0', true);
        yield* evaluates(page, '[...new Set(window.__fills)]', ['loaded']);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'refused: the page ends and says why in its place: no key heard, no play, and the notes feed asks nothing more',
    () =>
      Effect.gen(function* () {
        const WAIT = /^\/notes\/wait/;
        const { page, asked } = yield* openServed(
          'lab',
          [
            route('GET', PROBE_FACE_PATH, () => text('no such face', 404)),
            // The notes feed asks again as soon as each wait is answered: while the page runs, it keeps asking.
            route('GET', WAIT, () => json({ cursor: 0, events: [] })),
          ],
          { viewport: PHONE, mountedOnly: true },
        );
        yield* countIs(page, 'body > pre', 1);
        yield* countIs(page, '.bar', 0);
        const hash = yield* page.evaluate<string>('location.hash');
        const waits = () => asked.filter((a) => WAIT.test(a.path)).length;
        const before = waits();
        // Space would play the film, and its time would move; long past any pause the feed would make.
        yield* page.press('Space');
        yield* page.clock.runFor(10_000);
        // A request of the test's own, behind any the page made meanwhile.
        yield* page.evaluate("fetch('/api/films/probe/check').then((r) => r.status)");
        expect(waits()).toBe(before);
        yield* evaluates(page, 'location.hash', hash);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
