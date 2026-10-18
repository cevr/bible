// A film's studio as the lab serves it once it renders it on the server: the
// server's document is the header and a quiet line where the film lands,
// none of the film (no canvas: the server never imports a film's modules),
// its root held until the faces land; the browser hydrates it with no
// mismatch, shows it, and its keys and clips work. Stamped with the build
// it was served at, it loads again at its place once the build feed answers
// a newer one (a scene's source changed, or another server: the lab
// restarted), a failed wait asked again after a pause, and only then.

import { Effect, Option, Schedule } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { PAGE_ROOT } from '../../src/core/page-render.ts';
import {
  DESK,
  PHONE,
  hold,
  json,
  openServed,
  route,
  text,
} from '../../src/lab/fixtures/harness.ts';
import type { PageBuild } from '../../src/core/schema.ts';
import { fitsPhone } from '../../src/lab/fixtures/phone-fit.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { attributeIs, evaluates, until, waitFor } from '../../src/lab/fixtures/settled.ts';
import { faceHold } from '../../src/player/face.ts';

/** Long enough to bundle the server entry once, render, open, hydrate and stage the film. */
const SLOW = 60_000;

/** What the page said of its hydration: Solid's development build warns of every mismatch. */
const mismatches = (logged: ReadonlyArray<{ readonly type: string; readonly text: string }>) =>
  logged.filter((l) => /hydrat/i.test(l.text) && l.type !== 'log');

/**
 * The face hold's script (`faceHold`): the one script the head runs before
 * the root is painted, which shows the root once the UI faces have loaded.
 */
/** The face hold the page server writes: its script and the attribute it shows the root by. */
const HOLD_TERMS = faceHold(`[${PAGE_ROOT}]`);
const HOLD = HOLD_TERMS.script;

/**
 * The markup as a browser paints it before the page's scripts run: every
 * script left out but the face hold's, which a first paint waits on.
 */
const painted = (html: string) =>
  html
    .split(HOLD)
    .map((part) => part.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''))
    .join(HOLD);

/** The markup from the page's root on (the head's styles name every class). */
const rooted = (html: string) => html.slice(html.indexOf('data-page-root'));

/** What a film's page never sends from the server: the film itself. */
const FILM_PARTS = ['<canvas', 'class="stage"'];

describe("a film's pages served as the lab renders them", () => {
  for (const { where, viewport } of [
    { where: 'a desk', viewport: DESK },
    { where: 'a phone', viewport: PHONE },
  ] as const)
    it.live(
      `Studio on ${where}: the server's document is the header and a quiet line, none of the film, its root held for the faces; the browser hydrates with no mismatch, shows the root once the faces land, and plays and selects`,
      () =>
        Effect.gen(function* () {
          const { page, documents, errors } = yield* openServed('player', [], {
            href: pageHref.studio(PROBE),
            viewport,
          });
          const whole = documents[0]?.html ?? '';
          // The hold the head carries: the root unpainted until the faces load, its script beside it.
          expect(whole).toContain(faceHold(`[${PAGE_ROOT}]`).head);
          const html = rooted(painted(whole));
          expect(html).toContain('class="st-app"');
          expect(html).toContain(`<b class="st-film">${PROBE}</b>`);
          expect(html).toContain('class="st-home" data-page="films" href="/"');
          expect(html).toContain(`Opening ${PROBE}…`);
          for (const film of FILM_PARTS) expect(html).not.toContain(film);
          // The hold let go: the root is shown, in its faces (`in`) or, past the cap a cold
          // server's first font files can take, in their fallbacks (`late`).
          yield* evaluates(
            page,
            `[['in', 'late'].includes(document.documentElement.getAttribute('${HOLD_TERMS.shown}')), getComputedStyle(document.querySelector('[${PAGE_ROOT}]')).visibility]`,
            [true, 'visible'],
          );
          // The studio took the quiet line's place, and works by key and by pointer.
          yield* waitFor(page, '.st-timeline .st-clip');
          yield* page.press('Space');
          yield* attributeIs(page, '.st-key[data-act="play.toggle"]', 'aria-pressed', 'true');
          yield* page.press('k');
          yield* attributeIs(page, '.st-key[data-act="play.toggle"]', 'aria-pressed', 'false');
          yield* page.click('.st-clip[data-kind="script"][data-beat="two"]');
          yield* waitFor(page, '.st-pane[data-beat="two"]');
          if (viewport === PHONE) yield* fitsPhone(page);
          expect(mismatches(page.logged)).toEqual([]);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

  /** The studio stamped with `served`, its build feed answering `answers` in turn, then holding. */
  const stamped = (served: PageBuild, answers: ReadonlyArray<ReturnType<typeof json>>) => {
    const queue = [...answers];
    return openServed(
      'player',
      [
        route('GET', /^\/api\/review\/build\?/, () =>
          Option.getOrElse(Option.fromNullishOr(queue.shift()), () => hold),
        ),
      ],
      { href: pageHref.studio(PROBE, { sel: 'beat:two' }), viewport: DESK, build: served },
    );
  };

  /** The feed's asks since `served`'s build. */
  const asksSince = (asked: ReadonlyArray<{ readonly path: string }>, served: PageBuild) =>
    asked.filter((a) => a.path.startsWith(`/api/review/build?since=${served.build}&`)).length;

  for (const [name, answers] of [
    ['a newer build (a scene changed)', [json({ build: 8, server: 'lab' })]],
    [
      "a failed wait asked again after a pause, then another server's first build",
      [text('restarting', 503), json({ build: 0, server: 'other' })],
    ],
  ] as const)
    it.live(
      `Studio stamped with its build: ${name} loads it again at its place, once`,
      () =>
        Effect.gen(function* () {
          const served = { build: 7, server: 'lab' };
          const { page, documents, asked, errors } = yield* stamped(served, answers);
          const place = documents[0]?.path ?? '';
          expect(documents[0]?.html ?? '').toContain(`<meta name="lab-build" content="7">`);
          // The page loaded again, at the place it stood, and waits on the feed once more.
          yield* Effect.filterOrFail(
            Effect.sync(() => documents.length),
            (n) => n >= 2,
            () => 'the studio never loaded again',
          ).pipe(Effect.retry({ schedule: Schedule.spaced('50 millis'), times: 300 }));
          yield* waitFor(page, '.st-timeline .st-clip');
          yield* until(page, `document.querySelector('.st-pane[data-beat="two"]') !== null`);
          expect(documents.map((d) => d.path)).toEqual([place, place]);
          expect(asksSince(asked, served)).toBeGreaterThanOrEqual(answers.length + 1);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

  it.live(
    'Studio stamped with its build: its own build answered is asked again, and never loads it again',
    () =>
      Effect.gen(function* () {
        const served = { build: 7, server: 'lab' };
        const { page, documents, asked, errors } = yield* stamped(served, [json(served)]);
        yield* waitFor(page, '.st-timeline .st-clip');
        // The second ask is the page waiting again on the same build: it has not loaded again.
        yield* Effect.filterOrFail(
          Effect.sync(() => asksSince(asked, served)),
          (n) => n >= 2,
          () => 'the studio never asked again',
        ).pipe(Effect.retry({ schedule: Schedule.spaced('50 millis'), times: 300 }));
        expect(documents).toHaveLength(1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
