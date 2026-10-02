// The lab's shell in a browser: the real lab page over the probe film. The
// panel, its header and the look-book link are in place; every pinned layer
// sits exactly over the film canvas and follows it as the window resizes; the
// strip's slot sits right under the player's timeline; and the page starts
// without an error.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { openLab } from '../../src/lab/fixtures/harness.ts';
import { attributeIs, evaluates, textHas } from '../../src/lab/fixtures/settled.ts';

/** Each match's box as the page placed it: its rect, or for a pinned layer its inline box (a hidden layer has no rect). */
const rects = (sel: string) =>
  `[...document.querySelectorAll('${sel}')].map((e) => { const r = e.getBoundingClientRect(); const s = e.style; return (s.left === '' ? [r.left, r.top, r.width, r.height] : [s.left, s.top, s.width, s.height].map(parseFloat)).map(Math.round); })`;

/**
 * Resize the window, and wait until the page has handled it: its `resize`
 * event has fired. The lab places its layers in its own listener, added
 * before this one, and on the canvas's ResizeObserver in the same rendering
 * step, so the next read sees them placed.
 */
const resize = (page: Tab, size: { readonly width: number; readonly height: number }) =>
  Effect.gen(function* () {
    yield* page.evaluate(
      `window.labResized = new Promise((done) => addEventListener('resize', () => done(true), { once: true })); true`,
    );
    yield* page.resize(size.width, size.height);
    yield* page.evaluate('window.labResized');
  });

/** The pinned layers over the film canvas. */
const LAYERS = '.lab-overlay, .lab-onion, .lab-compare';

/** Whether there are pinned layers, and each sits exactly on the film canvas's box. */
const layersOnCanvas = `(() => { const c = JSON.stringify(${rects('.stage canvas')}[0]); const ls = ${rects(LAYERS)}; return ls.length > 0 && ls.every((l) => JSON.stringify(l) === c); })()`;

/** The canvas's box, as JSON. */
const canvasBox = `JSON.stringify(${rects('.stage canvas')}[0])`;

/** The film seconds `#T` holds. */
const T = 'Number(location.hash.slice(1))';

describe('the lab shell', () => {
  it.live('mounts the panel with its header and the look-book link', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openLab();
      yield* textHas(page, '.lab-panel header', 'Lab');
      yield* attributeIs(page, '.lab-lookbook', 'href', '/?film=probe&lookbook');
      yield* evaluates(page, "document.body.classList.contains('lab')", true);
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('pins its layers over the film canvas, and keeps them there as the window resizes', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab();
      yield* evaluates(page, layersOnCanvas, true);
      // The canvas's box as it stands, kept in the page for the resize to move.
      yield* page.evaluate(`window.labCanvasBefore = ${canvasBox}; true`);
      yield* resize(page, { width: 1000, height: 800 });
      yield* evaluates(page, `${canvasBox} !== window.labCanvasBefore`, true);
      yield* evaluates(page, layersOnCanvas, true);
    }).pipe(Effect.scoped),
  );

  it.live('keeps the film canvas, and so its layers, inside its row, off the bar', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab();
      // The canvas ends above its row's end, the overlay above the bar, and the overlay on the canvas.
      const placed = `(() => { const bottom = ([, top, , height]) => top + height; const stage = ${rects('.stage')}[0], canvas = ${rects('.stage canvas')}[0], overlay = ${rects('.lab-overlay')}[0], bar = ${rects('.bar')}[0]; return [bottom(canvas) <= bottom(stage), bottom(overlay) <= bar[1], JSON.stringify(overlay) === JSON.stringify(canvas)]; })()`;
      for (const size of [
        { width: 1400, height: 480 },
        { width: 1100, height: 420 },
      ]) {
        yield* resize(page, size);
        yield* evaluates(page, placed, [true, true, true]);
      }
    }).pipe(Effect.scoped),
  );

  it.live("keeps the strip's slot right under the player's timeline", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab();
      yield* evaluates(
        page,
        "document.querySelector('.bar .track')?.nextElementSibling?.className",
        'lab-strip-slot',
      );
    }).pipe(Effect.scoped),
  );

  it.live('a scene of many cues scrolls its strip, and the film keeps its size', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab();
      yield* page.resize(1440, 900);
      yield* page.waitFor('.lab-strip-row');
      // 35 cue rows, as roof's busiest scene has: the probe's own rows, copied.
      yield* page.evaluate(`(() => {
        const rows = document.querySelector('.lab-strip-rows');
        const row = rows?.querySelector('.lab-strip-row');
        for (let i = rows?.querySelectorAll('.lab-strip-row').length ?? 35; i < 35; i++)
          if (row) rows?.append(row.cloneNode(true));
      })()`);
      // The film keeps at least half its column; the strip scrolls, and scrolled
      // to its end still shows the words row at its top.
      yield* evaluates(
        page,
        `(() => {
          const width = (at) => document.querySelector(at)?.getBoundingClientRect().width ?? 0;
          const scroller = document.querySelector('.lab-strip-scroll');
          if (!(scroller instanceof HTMLElement)) return [false, false, false];
          scroller.scrollTop = scroller.scrollHeight;
          const words = scroller.querySelector('.lab-strip-words')?.getBoundingClientRect().top;
          return [
            width('.stage canvas') >= width('.stage') / 2,
            scroller.scrollHeight > scroller.clientHeight,
            Math.round(words ?? -1) === Math.round(scroller.getBoundingClientRect().top),
          ];
        })()`,
        [true, true, true],
      );
    }).pipe(Effect.scoped),
  );

  it.live('Play at the end of the film starts it over', () =>
    Effect.gen(function* () {
      // Past the end: the player shows the last frame, kept in the page.
      const { page } = yield* openLab([], { hash: '#999' });
      yield* evaluates(page, `${T} > 1`, true);
      yield* page.evaluate(`window.labEnd = ${T}; true`);
      yield* page.press(' ');
      yield* page.clock.runFor(500);
      yield* page.press(' ');
      yield* evaluates(page, `${T} > 0 && ${T} < window.labEnd`, true);
    }).pipe(Effect.scoped),
  );

  for (const ended of ['pointercancel', 'lostpointercapture'])
    it.live(
      `a track drag the browser ends with ${ended} settles where it was: a later move does not scrub`,
      () =>
        Effect.gen(function* () {
          const { page } = yield* openLab([], { hash: '#1' });
          const track = yield* page.box('.bar .track');
          const y = track.y + track.height / 2;
          yield* page.mouse.move(track.x + track.width * 0.25, y);
          yield* page.mouse.down;
          // The browser takes the gesture (a page pan on a phone): the drag ends here.
          yield* page.evaluate(
            `document.querySelector('.bar .track').dispatchEvent(new PointerEvent('${ended}', { bubbles: true, pointerId: 1 })); true`,
          );
          yield* page.clock.runFor(300);
          yield* page.evaluate(`window.labSettled = ${T}; true`);
          yield* page.mouse.move(track.x + track.width * 0.75, y, 4);
          yield* page.clock.runFor(300);
          yield* evaluates(page, `${T} === window.labSettled && ${T} > 0`, true);
          yield* page.mouse.up;
        }).pipe(Effect.scoped),
    );
});
