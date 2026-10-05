// The lab's shell in a browser: the real lab page over the probe film. The
// panel and its header are in place in the studio's shell; the lab's place is
// its URL (the scene under the playhead in the path, the time in that scene,
// a pick Back undoes); every pinned layer sits exactly over the film canvas
// and follows it as the window resizes; the strip's slot sits right under
// the player's timeline; a page reloaded onto new code flashes its picture
// once and one opened by hand does not; and the page starts without an error.

import { Deferred, Effect, Exit } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { timecode } from '../../src/core/time.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';
import { URL_T, hold, json, labAt, later, openLab, route } from '../../src/lab/fixtures/harness.ts';
import { PROBE, probeFilm } from '../../src/lab/fixtures/probe-film.ts';
import {
  attached,
  attributeIs,
  countIs,
  evaluates,
  labelsClash,
  textHas,
  textIs,
} from '../../src/lab/fixtures/settled.ts';

/** Where the probe film's second scene starts, in film seconds. */
const TWO = probeFilm().placed[1]?.start ?? Number.NaN;

/** The probe film's first and second scenes' lengths, in seconds. */
const ONE_LENGTH = probeFilm().placed[0]?.dur ?? Number.NaN;
const TWO_LENGTH = probeFilm().placed[1]?.dur ?? Number.NaN;

/** Each match's box as the page placed it: its rect, or for a pinned layer its inline box from its frame's corner (a hidden layer has no rect). */
const rects = (sel: string) =>
  `[...document.querySelectorAll('${sel}')].map((e) => { const r = e.getBoundingClientRect(); const s = e.style; const f = e.parentElement.getBoundingClientRect(); return (s.left === '' ? [r.left, r.top, r.width, r.height] : [f.left + parseFloat(s.left), f.top + parseFloat(s.top), parseFloat(s.width), parseFloat(s.height)]).map(Math.round); })`;

/**
 * Resize the window, and wait until the page has handled it: its `resize`
 * event has fired. The lab places its layers on the ResizeObserver of the
 * canvas and its frame, which a later read waits for (`evaluates`).
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

/** The film seconds the URL holds. */
const T = URL_T;

/** Whether the page does not scroll sideways. */
const NO_SIDEWAYS = 'document.documentElement.scrollWidth <= document.documentElement.clientWidth';

/** The vertical middle of the bar's `sel`, in whole pixels. */
const middle = (sel: string) =>
  `(() => { const r = document.querySelector('.bar ${sel}').getBoundingClientRect(); return Math.round(r.top + r.height / 2); })()`;

describe('the lab shell', () => {
  it.live(
    "mounts the panel with its header in the studio's shell, whose page bar leads to the film's other parts",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab();
        yield* textHas(page, '.lab-panel header .lab-modes', 'Edit');
        yield* attributeIs(page, '.sh-pagebar [data-page="lab"]', 'data-active', 'true');
        yield* attributeIs(
          page,
          '.sh-pagebar [data-page="project"]',
          'href',
          pageHref.project(PROBE),
        );
        yield* attributeIs(
          page,
          '.sh-pagebar [data-page="choices"]',
          'href',
          pageHref.choices(PROBE),
        );
        yield* attributeIs(
          page,
          '.sh-pagebar [data-page="scenes"]',
          'href',
          pageHref.scenes(PROBE),
        );
        // No text link to another part: the page bar is the way.
        yield* evaluates(page, "document.querySelectorAll('.lab-panel a[href]').length", 0);
        // The header's timecode is the playhead's.
        yield* textHas(page, '.sh-header [data-act="timecode"]', timecode(0));
        yield* evaluates(page, "document.body.classList.contains('lab')", true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live("names the scene under the playhead in its path, and the time in that scene's", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(0.5) });
      yield* evaluates(page, 'location.pathname', '/films/probe/lab/one');
      // A seek past a scene boundary moves the path and rebases the time in one write.
      yield* page.press(']');
      yield* evaluates(page, 'location.pathname', '/films/probe/lab/two');
      yield* evaluates(page, `Math.abs(${T} - ${TWO}) < 0.002`, true);
      yield* evaluates(page, "location.hash.startsWith('#t=0')", true);
    }).pipe(Effect.scoped),
  );

  it.live(
    'a link with a bare film time (an old one) opens on that frame, written as its place',
    () =>
      Effect.gen(function* () {
        const at = TWO + 0.5;
        const { page } = yield* openLab([], { href: `${pageHref.lab(PROBE)}#${at}` });
        yield* evaluates(page, "location.hash.startsWith('#t=')", true);
        yield* evaluates(page, `Math.abs(${T} - ${at}) < 0.002`, true);
        yield* textHas(page, '.bar .scene', 'two');
      }).pipe(Effect.scoped),
  );

  it.live('a time before the film opens on its first frame, and says so', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: `${pageHref.labScene(PROBE, 'one')}#t=-5` });
      yield* evaluates(page, `${T}`, 0);
      yield* textHas(page, '.bar .scene', 'one');
    }).pipe(Effect.scoped),
  );

  it.live('Back undoes a pick, and Forward makes it again', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      for (const name of ['rise', 'fall']) {
        yield* page.click(`.lab-cue[data-cue="${name}"]`);
        yield* evaluates(page, 'location.search', `?cue=${name}`);
      }
      yield* page.back;
      yield* evaluates(page, 'location.search', '?cue=rise');
      yield* attached(page, '.lab-cue[data-cue="rise"].selected');
      yield* page.evaluate('history.forward(); true');
      yield* evaluates(page, 'location.search', '?cue=fall');
      yield* attached(page, '.lab-cue[data-cue="fall"].selected');
    }).pipe(Effect.scoped),
  );

  it.live("Back lands on a pick's own frame, and its entry keeps that time", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* page.click('.lab-cue[data-cue="rise"]');
      yield* evaluates(page, 'location.search', '?cue=rise');
      const first = Number(yield* page.evaluate(`${T}`));
      yield* page.click('.lab-cue[data-cue="fall"]');
      yield* evaluates(page, 'location.search', '?cue=fall');
      // The frame moves on (ten frames with Shift) in fall's entry; rise's keeps the frame it was left at.
      yield* page.press('Shift+ArrowRight');
      yield* evaluates(page, `Math.abs(${T} - ${first + 10 / 30}) < 0.002`, true);
      yield* page.back;
      yield* evaluates(page, 'location.search', '?cue=rise');
      yield* textHas(page, '.bar .time', `${timecode(first)} /`);
      // Past the time's throttle, nothing has written the later frame over it.
      yield* page.evaluate('new Promise((done) => setTimeout(() => done(true), 600))');
      yield* evaluates(page, `Math.abs(${T} - ${first}) < 0.002`, true);
      yield* textHas(page, '.bar .time', `${timecode(first)} /`);
    }).pipe(Effect.scoped),
  );

  it.live("the transport's frame pair steps a frame at a time by touch", () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* page.click('.bar [data-act="play.frame-next"]');
      yield* evaluates(page, `Math.round(${T} * 30)`, 31);
      yield* page.click('.bar [data-act="play.frame-previous"]');
      yield* page.click('.bar [data-act="play.frame-previous"]');
      yield* evaluates(page, `Math.round(${T} * 30)`, 29);
    }).pipe(Effect.scoped),
  );

  it.live(
    "shows one tool at a time, the mode tray's: a mode picked shows its section alone, a reload keeps it, and a note picked shows Note",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab();
        // Which of the five sections show, in the tray's order.
        const shown = `['.lab-edit', '.lab-notes-box', '.lab-motion', '.lab-compare-tools', '.lab-studio'].map((s) => document.querySelector(s)).map((e) => e !== null && getComputedStyle(e).display !== 'none')`;
        yield* attributeIs(page, '.lab-panel', 'data-mode', 'edit');
        yield* evaluates(page, shown, [true, false, false, false, false]);
        yield* page.click('.lab-modes [data-mode-pick="motion"]');
        yield* evaluates(page, shown, [false, false, true, false, false]);
        yield* attributeIs(page, '.lab-modes [data-mode-pick="motion"]', 'aria-pressed', 'true');
        yield* page.reload;
        yield* page.waitFor('.lab-panel[data-staged="true"]');
        yield* attributeIs(page, '.lab-panel', 'data-mode', 'motion');
        // Note this frame, from any mode, shows Note with its composer open.
        yield* page.press('n');
        yield* attributeIs(page, '.lab-panel', 'data-mode', 'note');
        yield* evaluates(page, shown, [false, true, false, false, false]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live(
    'Undo and Redo stay in the header in every mode, at 390 and 1440, and the view menu ⋯ follows Go to…',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab();
        // Whether the header shows `act`: in it, and laid out with a box.
        const inHeader = (act: string) =>
          `(() => { const e = document.querySelector('.sh-header [data-act="${act}"]'); return e !== null && e.getBoundingClientRect().width > 0; })()`;
        const tools = `[${inHeader('undo')}, ${inHeader('redo')}]`;
        for (const size of [
          { width: 390, height: 844 },
          { width: 1440, height: 900 },
        ]) {
          yield* resize(page, size);
          for (const mode of ['edit', 'note', 'motion', 'compare', 'record'] as const) {
            yield* page.click(`.lab-modes [data-mode-pick="${mode}"]`);
            yield* attributeIs(page, '.lab-panel', 'data-mode', mode);
            yield* evaluates(page, tools, [true, true]);
          }
          // The view menu sits right after Go to…, the header's last control.
          yield* evaluates(
            page,
            `document.querySelector('.sh-header [data-act="search"]').nextElementSibling?.dataset.act`,
            'view-menu',
          );
          yield* evaluates(page, inHeader('view-menu'), true);
          yield* evaluates(page, NO_SIDEWAYS, true);
        }
        // Its rows are the page's view commands, and the keys sheet: Keyboard shortcuts opens it.
        yield* page.click('.sh-header [data-act="view-menu"]');
        yield* textHas(page, '[data-role="view-menu"]', 'Captions on or off');
        yield* page.click('[data-role="view-menu"] [data-command="app.keys"]');
        yield* page.waitFor('[data-role="keys-sheet"]');
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

  it.live('a phone turned on its side keeps the layers over the film canvas, and turned back', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* resize(page, { width: 390, height: 844 });
      yield* evaluates(page, layersOnCanvas, true);
      yield* page.evaluate(`window.labCanvasBefore = ${canvasBox}; true`);
      yield* resize(page, { width: 844, height: 390 });
      yield* evaluates(page, `${canvasBox} !== window.labCanvasBefore`, true);
      yield* evaluates(page, layersOnCanvas, true);
      yield* resize(page, { width: 390, height: 844 });
      yield* evaluates(page, `${canvasBox} === window.labCanvasBefore`, true);
      yield* evaluates(page, layersOnCanvas, true);
    }).pipe(Effect.scoped),
  );

  it.live(
    'on a phone, the lab is one page: the picture fills the width, nothing scrolls sideways, and the layers ride the picture as it scrolls',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab();
        yield* resize(page, { width: 390, height: 844 });
        yield* evaluates(page, layersOnCanvas, true);
        // The picture spans the phone's width; no part of the page (and no control) runs off its side.
        yield* evaluates(
          page,
          `(() => { const c = document.querySelector('.stage canvas').getBoundingClientRect(); const acts = [...document.querySelectorAll('[data-act]')].filter((e) => e.getClientRects().length > 0); return [c.width > 300, document.documentElement.scrollWidth <= innerWidth, acts.every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })]; })()`,
          [true, true, true],
        );
        // Scrolled down the page (a short phone, so the page runs past it), the overlay's box as drawn is still the canvas's.
        yield* resize(page, { width: 390, height: 480 });
        const drawn = (sel: string) =>
          `(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })()`;
        yield* page.evaluate('window.scrollTo(0, 240); true');
        yield* evaluates(
          page,
          `[scrollY > 0, JSON.stringify(${drawn('.lab-overlay')}) === JSON.stringify(${drawn('.stage canvas')})]`,
          [true, true],
        );
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

  it.live(
    "at 390 the strip's words never run into each other or cut mid-letter: a word too long for its time shortens or drops",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab();
        yield* resize(page, { width: 390, height: 844 });
        yield* page.waitFor('.lab-strip-words .lab-word');
        yield* evaluates(page, labelsClash('.lab-word', '.lab-word-room'), []);
        // How many words show, and how many in full: the row is not emptied to pass.
        const reads = `(() => { const ws = [...document.querySelectorAll('.lab-word')].filter((e) => getComputedStyle(e).display !== 'none'); return [ws.length > 0, ws.some((e) => e.scrollWidth <= e.clientWidth)]; })()`;
        yield* evaluates(page, `${reads}[0]`, true);
        // A wide window gives the words room: some read in full, and still none overlaps.
        yield* resize(page, { width: 1440, height: 900 });
        yield* evaluates(page, labelsClash('.lab-word', '.lab-word-room'), []);
        yield* evaluates(page, reads, [true, true]);
      }).pipe(Effect.scoped),
  );

  it.live('Play at the end of the film starts it over', () =>
    Effect.gen(function* () {
      // Past the end: the player shows the last frame, kept in the page.
      const { page } = yield* openLab([], { href: labAt(999) });
      yield* evaluates(page, `${T} > 1`, true);
      yield* page.evaluate(`window.labEnd = ${T}; true`);
      yield* page.press(' ');
      yield* page.clock.runFor(500);
      yield* page.press(' ');
      yield* evaluates(page, `${T} > 0 && ${T} < window.labEnd`, true);
    }).pipe(Effect.scoped),
  );

  it.live(
    "on a laptop the transport reads the scene's time and length, the header the film's (SU-12); the bar has no CC, the view menu turns the captions (UR2-12)",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([], { href: labAt(TWO + 0.5) });
        yield* textHas(page, '.sh-header [data-act="timecode"]', timecode(TWO + 0.5));
        yield* textIs(page, '.bar .tc', timecode(0.5));
        yield* textHas(page, '.bar .of', ` / ${timecode(TWO_LENGTH)}`);
        yield* countIs(page, '.bar [data-act="captions"]', 0);
        yield* page.click('[data-act="view-menu"]');
        yield* page.waitFor('[data-role="view-menu"] [data-command="view.captions"]');
      }).pipe(Effect.scoped),
  );

  it.live(
    "on a phone the transport's controls and its timecode keep one row; the scene's length and state wrap below",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([], { href: labAt(1) });
        yield* resize(page, { width: 390, height: 844 });
        // A slower rate says so after the length: more than the first row holds.
        yield* page.press('j');
        yield* textHas(page, '.bar .of', ` / ${timecode(ONE_LENGTH)} · 0.5× muted`);
        const play = Number(yield* page.evaluate(middle('[data-act="play"]')));
        yield* evaluates(
          page,
          `[${middle('[data-act="play.frame-next"]')}, ${middle('.tc')}].every((m) => Math.abs(m - ${play}) <= 2)`,
          true,
        );
        yield* evaluates(page, "document.querySelector('.bar .tc').getClientRects().length", 1);
        yield* evaluates(page, NO_SIDEWAYS, true);
      }).pipe(Effect.scoped),
  );

  for (const ended of ['pointercancel', 'lostpointercapture'])
    it.live(
      `a track drag the browser ends with ${ended} settles where it was: a later move does not scrub`,
      () =>
        Effect.gen(function* () {
          const { page } = yield* openLab([], { href: labAt(1) });
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

  it.live(
    'new code landed (PA-11): the page reloaded onto a rebuild flashes the picture once',
    () =>
      Effect.gen(function* () {
        // The rebuild answers once the page is marked, so the reload is seen.
        const marked = Deferred.makeUnsafe<void>();
        let waits = 0;
        const { page, errors } = yield* openLab(
          [
            route('GET', /^\/api\/review\/build\?/, () => {
              waits += 1;
              if (waits > 1) return hold;
              return later(marked, json({ build: 1, server: 'lab' }));
            }),
          ],
          { href: labAt(1), build: { build: 0, server: 'lab' } },
        );
        yield* page.evaluate('window.loadedOnce = true');
        yield* Deferred.done(marked, Exit.void);
        // The rebuild answered: the page reloads onto the new code.
        yield* evaluates(page, 'window.loadedOnce === true', false);
        yield* attached(page, '.stage[data-landed]');
        // A flash, not a state: it goes.
        yield* page.clock.runFor(2000);
        yield* evaluates(page, "document.querySelectorAll('[data-landed]').length", 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live('a page opened by hand shows no flash', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([], { href: labAt(1) });
      yield* page.waitFor('.bar .tc');
      yield* page.clock.runFor(100);
      yield* evaluates(page, "document.querySelectorAll('[data-landed]').length", 0);
    }).pipe(Effect.scoped),
  );
});
