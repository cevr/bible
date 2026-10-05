// A film's own pages, the Lab, Scenes and Play, as the lab serves them once
// it renders them on the server (PA-12): the server's document is the
// studio's shell (the header, the film switcher, the tab bar on the page's
// part) with a quiet line where the film lands, and none of the film (no
// canvas, no tape: the server never imports a film's modules). The Lab's
// panel is the server's too: its mode tray, each tool's section and the
// film's notes as the server read them, which the browser adopts (no second
// read) and goes on following. The browser hydrates with no mismatch, then
// stages the film, puts its tools in the panel, and fits a phone as ever;
// what the server painted first stays where the staged page has it.

import { Effect, Schedule, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { DESK, PHONE, hold, json, openServed, route } from '../../src/lab/fixtures/harness.ts';
import { fitsPhone } from '../../src/lab/fixtures/phone-fit.ts';
import { targetBoxes } from '../../src/lab/fixtures/touch-targets.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { countIs, evaluates, textHas, until, waitFor } from '../../src/lab/fixtures/settled.ts';
import { LAB_MODES } from '../../src/lab/mode.ts';

/** Long enough to bundle the server entry once, render, open, hydrate and stage the film. */
const SLOW = 60_000;

/** What the page said of its hydration: Solid's development build warns of every mismatch. */
const mismatches = (logged: ReadonlyArray<{ readonly type: string; readonly text: string }>) =>
  logged.filter((l) => /hydrat/i.test(l.text) && l.type !== 'log');

/** The markup as a browser paints it before any script runs. */
const painted = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');

/** The markup from the page's root on (the head's styles name every class). */
const rooted = (html: string) => html.slice(html.indexOf('data-page-root'));

/** What a film's page never sends from the server: the film itself. */
const FILM_PARTS = ['<canvas', 'class="stage"', 'class="bar"', 'sc-still'];

const PAGES = [
  {
    name: 'Scenes',
    page: 'player',
    href: pageHref.scenes(PROBE),
    part: 'scenes',
    ready: '.sc-still[data-drawn="true"] canvas',
  },
  { name: 'Play', page: 'player', href: pageHref.play(PROBE), part: 'play', ready: '.bar .tc' },
] as const;

/** The probe film's one note, at change 3 of its log, as the fake lab keeps it. */
const NOTE = {
  scene: 'one',
  T: 1,
  frame: 30,
  text: 'the ball rises too early',
  id: 'n1',
  film: PROBE,
  seq: 3,
  changed: 3,
  status: 'open',
  still: 'n1.png',
  thread: [],
  createdAt: '2026-09-28T00:00:00.000Z',
};

/** Each tool's section of the Lab's panel, as the server writes it. */
const SECTIONS = ['lab-edit', 'lab-motion', 'lab-compare-tools', 'lab-notes-box', 'lab-studio'];

/**
 * Every target the page shows now that the staged page (its boxes kept on
 * the window as `stagedTargets`) has elsewhere or not at all, as
 * `key: box now → box staged`; none, `[]`.
 */
const MOVED = `(() => {
  const now = ${targetBoxes()};
  return Object.entries(now)
    .filter(([key, box]) => window.stagedTargets[key] !== box)
    .map(([key, box]) => key + ': ' + box + ' → ' + (window.stagedTargets[key] ?? 'gone'));
})()`;

/** How many targets the page shows now that carry each of `attributes`. */
const shownWith = (attributes: ReadonlyArray<string>) =>
  `(() => {
  const keys = Object.keys(${targetBoxes()});
  return ${literal(attributes.join(' '))}.split(' ').map((attribute) => keys.filter((key) => key.includes(' ' + attribute + '=')).length);
})()`;

/** The attributes that name what a Lab's first paint shows: the shell's pages, the panel's modes, the acts. */
const NAMING = ['data-page', 'data-mode-pick', 'data-act'];

/** Whether the panel is seen. */
const SEEN = `getComputedStyle(document.querySelector('.lab-panel')).visibility`;

/** The build the Lab is served at, as the lab stamps it. */
const SERVED_AT = { build: 7, server: 'lab' };

/** Done once the page has asked a path starting `start`. */
const asks = (asked: ReadonlyArray<{ readonly path: string }>, start: string) =>
  Effect.filterOrFail(
    Effect.sync(() => asked.some((a) => a.path.startsWith(start))),
    (did) => did,
    () => `the page never asked ${start}`,
  ).pipe(Effect.retry({ schedule: Schedule.spaced('50 millis'), times: 100 }));

/** A string as a script's literal. */
const literal = Schema.encodeSync(Schema.fromJsonString(Schema.String));

/**
 * The windows the Lab is served to, whether the panel is seen before the
 * film is staged (on a desk, beside where the film lands; on a phone, under
 * it, so unseen until it lands), and the targets its first paint shows, by
 * `NAMING`: the six pages of the shell; the panel's modes on a desk, none on
 * a phone; and the acts (the film switcher, Go to, View: the pen and
 * note-this-frame are Note mode's, and the panel opens in Edit).
 */
const LAB_WINDOWS = [
  { where: 'a desk', viewport: DESK, first: 'visible', shows: [6, LAB_MODES.length, 3] },
  { where: 'a phone', viewport: PHONE, first: 'hidden', shows: [6, 0, 3] },
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
          const html = rooted(documents[0]?.html ?? '');
          expect(html).toContain('class="sh-header"');
          expect(html).toContain(`class="sh" data-part="${part}" data-film="true"`);
          expect(html).toMatch(new RegExp(`data-page="${part}"[^>]*data-active="true"`));
          expect(html).toContain(`Opening ${PROBE}…`);
          for (const film of FILM_PARTS) expect(html).not.toContain(film);
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

  for (const { where, viewport, first, shows } of LAB_WINDOWS)
    it.live(
      `Lab on ${where}: the server's document holds the panel, each tool's section and the film's notes as the server read them, none of the film; the browser adopts the notes, reads them no second time, and puts the film's tools in the panel; no control the server painted moves`,
      () =>
        Effect.gen(function* () {
          const { page, documents, errors, read, asked } = yield* openServed(
            'lab',
            [
              route('GET', /^\/notes$/, () => json({ film: PROBE, seq: 3, notes: [NOTE] })),
              route('GET', /^\/api\/review\/build\?/, () => hold),
            ],
            { href: pageHref.lab(PROBE), viewport, build: SERVED_AT },
          );
          const whole = documents[0]?.html ?? '';
          // The build the page was served at, in the same response: the build feed's first answer.
          expect(whole).toContain(`<meta name="lab-build" content="${SERVED_AT.build}">`);
          const html = rooted(painted(whole));
          expect(html).toContain('class="sh" data-part="lab" data-film="true"');
          expect(html).toContain(`Opening ${PROBE}…`);
          // The panel, painted before any script runs: the mode tray, each tool's section, the notes.
          expect(html).toMatch(/class="lab-panel"[^>]*data-mode="edit"/);
          for (const mode of LAB_MODES) expect(html).toContain(`data-mode-pick="${mode}"`);
          for (const section of SECTIONS) expect(html).toContain(`class="${section}"`);
          expect(html).toContain('data-act="pen"');
          expect(html).toContain('data-act="note-frame"');
          expect(html).toContain('data-id="n1"');
          expect(html).toContain(NOTE.text);
          for (const film of FILM_PARTS) expect(html).not.toContain(film);
          // The server read the notes once, for the page; the browser waits past them.
          expect(read.map((r) => r.path)).toEqual(['/notes']);
          yield* waitFor(page, '.lab-panel[data-staged="true"]');
          yield* until(page, `document.querySelector('.stage canvas') !== null`);
          yield* textHas(page, '.lab-note-item[data-id="n1"] .lab-note-text', NOTE.text);
          // The staged film lends the list each note's time.
          yield* textHas(page, '.lab-note-item[data-id="n1"] .lab-note-label', 'n1 · one · ');
          // Both feeds go on from what the page was sent: the notes past change
          // 3, the build past the one stamped; neither reads its first answer again.
          yield* asks(asked, '/notes/wait?since=3&');
          yield* asks(asked, `/api/review/build?since=${SERVED_AT.build}&`);
          expect(asked.filter((a) => a.path === '/notes')).toEqual([]);
          yield* evaluates(page, SEEN, 'visible');
          if (viewport === PHONE) yield* fitsPhone(page);
          expect(mismatches(page.logged)).toEqual([]);
          expect(errors).toEqual([]);
          // What the server painted first, before any script: every target it
          // shows stands where the staged page has it. On a desk that is the
          // panel's too; on a phone the panel, under a picture and a bar only
          // the film can size, is not seen until they land. (The staged
          // targets are kept on the window, which a document written anew keeps.)
          yield* page.evaluate(`(window.stagedTargets = ${targetBoxes()}, 0)`);
          yield* page.evaluate(
            `(document.open(), document.write(${literal(painted(whole))}), document.close(), 0)`,
          );
          yield* until(
            page,
            `document.fonts.status === 'loaded' && document.querySelector('.lab-modes') !== null`,
          );
          yield* evaluates(page, SEEN, first);
          yield* evaluates(page, shownWith(NAMING), shows);
          yield* evaluates(page, MOVED, []);
        }).pipe(Effect.scoped),
      SLOW,
    );
});
