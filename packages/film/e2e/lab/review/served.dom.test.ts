// The review as the lab serves it once it renders the page on the server
// (PA-12): each document is the review's server entry rendered at the link
// asked, its reads of the lab answered by the test's routes, and the
// browser's script hydrates it (`openServedReview`). The server's document
// holds the page's data (Films and its folders, a folder's videos); the
// page hydrates over it with no mismatch and asks again for nothing the
// server read (the index, the films, a film's choices); and once hydrated
// it is the page as ever: Refresh reads the index again, a card's link
// opens its folder, and Back and Forward walk between the two.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import {
  type Asked,
  type FakeRoute,
  type Json,
  PHONE,
  json,
  openServed,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { TOY } from '../../../src/lab/fixtures/toy-film.ts';
import {
  STUDIO_FILM,
  STUDIO_FOLDER,
  STUDIO_SET,
  studioRoutes,
} from '../../../src/lab/fixtures/studio-film.ts';
import { countIs, textHas, until, waitFor } from '../../../src/lab/fixtures/settled.ts';

/** Long enough to bundle the server entry once, render, open and hydrate. */
const SLOW = 60_000;

const index: Json = {
  folders: [
    {
      ref: 'out/art',
      title: 'Roofs at dusk',
      mtime: 0,
      sets: [],
      videos: [{ ref: 'out/art/walk.mp4', name: 'walk.mp4', size: 4096, mtime: 0, phone: 'none' }],
      images: [],
      docs: [],
    },
  ],
};

/** The toy film's choices: one point of two looks, as the server encodes them. */
const choices: Json = {
  film: TOY,
  pictures: [],
  points: [
    {
      id: 'look:ground',
      kind: 'look',
      address: { _tag: 'Film' },
      title: 'look:ground',
      lines: [],
      start: 0,
      marks: [],
      variants: ['now', 'light'].map((id) => ({
        id,
        label: id,
        lines: [],
        state: 'current',
        picked: id === 'now',
        verbs: [],
        media: { _tag: 'Unseen' },
        key: id,
        approval: 'none',
        comments: [],
      })),
    },
  ],
};

const routes: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/api\/review\/index(\?fresh=1)?$/, () => json(index)),
  route('GET', /^\/api\/films$/, () => json({ films: [TOY] })),
  route('GET', /^\/api\/films\/toy\/choices$/, () => json(choices)),
];

const FOLDER = pageHref.folder('out/art');

/** The GETs of `path` among `asked`. */
const reads = (asked: ReadonlyArray<Asked>, path: string) =>
  asked.filter((a) => a.method === 'GET' && a.path === path).length;

/** The open sheet (`inspector.tsx`). */
const SHEET = '[data-role="inspector"]';

/** Links that name a sheet open: a Set's version, a Choices variant, a Project scene. */
const NAMING_A_SHEET: ReadonlyArray<{
  readonly name: string;
  readonly href: string;
  readonly title: string;
}> = [
  { name: 'a Set', href: pageHref.set(STUDIO_FOLDER, STUDIO_SET, 'warm'), title: 'warm' },
  {
    name: 'Choices',
    href: pageHref.choices(STUDIO_FILM, 'score', 'piano'),
    title: 'piano of score',
  },
  { name: 'Project', href: pageHref.project(STUDIO_FILM, STUDIO_SET), title: 'open' },
];

/** Links written before what they name went: a version and a variant the page no longer has. */
const NAMING_NOTHING: ReadonlyArray<{
  readonly name: string;
  readonly href: string;
  /** An attribute the page's cards carry, there once it is rendered. */
  readonly ready: string;
}> = [
  {
    name: 'a Set',
    href: pageHref.set(STUDIO_FOLDER, STUDIO_SET, 'removed'),
    ready: 'data-act="inspect"',
  },
  {
    name: 'Choices',
    href: pageHref.choices(STUDIO_FILM, 'look:ground', 'removed'),
    ready: 'data-point="look:ground"',
  },
];

/** The reads among `read` that are the browser's alone: a check, the steps, a wait on a build. */
const browserOnly = (read: ReadonlyArray<Asked>) =>
  read.map((a) => a.path).filter((path) => /check|steps|wait|build/.test(path));

/** `html` with its scripts gone: what the browser paints before any of them runs. */
const painted = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');

/** What the page said of its hydration: Solid's development build warns of every mismatch. */
const mismatches = (logged: ReadonlyArray<{ readonly type: string; readonly text: string }>) =>
  logged.filter((l) => /hydrat/i.test(l.text) && l.type !== 'log');

describe('the review served as the lab renders it', () => {
  it.live(
    "holds Films and a folder's data in the server's document, hydrates with no mismatch, and asks again for nothing it was sent",
    () =>
      Effect.gen(function* () {
        const { page, asked, read, documents, errors } = yield* openServed('review', routes, {
          viewport: PHONE,
        });
        // The server's document: the film and the folder, before any script ran.
        const home = documents[0]?.html ?? '';
        expect(home).toContain('Roofs at dusk');
        expect(home).toContain(`data-film="${TOY}"`);
        expect(reads(read, '/api/review/index')).toBe(1);
        expect(reads(read, '/api/films')).toBe(1);
        // Hydrated: the same cards, and no request for what came with the page.
        yield* textHas(page, 'a.rv-card', 'Roofs at dusk');
        expect(reads(asked, '/api/review/index')).toBe(0);
        expect(reads(asked, '/api/films')).toBe(0);
        expect(mismatches(page.logged)).toEqual([]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "renders a folder's videos on the server, and a film's choices are read once, by the server",
    () =>
      Effect.gen(function* () {
        const folder = yield* openServed('review', routes, { href: FOLDER });
        expect(folder.documents[0]?.html ?? '').toContain('walk.mp4');
        yield* textHas(folder.page, '.rv-card', 'walk.mp4');
        expect(reads(folder.asked, '/api/review/index')).toBe(0);
        expect(mismatches(folder.page.logged)).toEqual([]);
        expect(folder.errors).toEqual([]);

        const film = yield* openServed('review', routes, { href: pageHref.choices(TOY) });
        expect(reads(film.read, `/api/films/${TOY}/choices`)).toBe(1);
        // Its cards are the server's markup, painted before any script runs.
        expect(painted(film.documents[0]?.html ?? '')).toContain('data-point="look:ground"');
        yield* waitFor(film.page, '[data-point="look:ground"]');
        expect(reads(film.asked, `/api/films/${TOY}/choices`)).toBe(0);
        expect(mismatches(film.page.logged)).toEqual([]);
        expect(film.errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "paints a film's shell before its choices are read: the server's first piece holds the page and a reading line, the choices follow in the same answer",
    () =>
      Effect.gen(function* () {
        // The film's choices read as the lab reads them, in a fresh process: a while.
        const slow = [
          route('GET', /^\/api\/films\/toy\/choices$/, () => json(choices), '400 millis'),
          ...routes,
        ];
        const film = yield* openServed('review', slow, { href: pageHref.choices(TOY) });
        // The pieces after the page root's opening tag, which the lab writes on its own.
        const [, first = '', ...rest] = film.documents[0]?.pieces ?? [];
        // The shell, its header and the film's place, at once: no wait on the film's read.
        expect(first).toContain('class="sh-header"');
        expect(first).toContain(`Reading ${TOY}'s choices…`);
        expect(first).not.toContain('look:ground');
        // The read's answer, sent later in the same document: its cards rendered, not only its data.
        const later = painted(rest.join(''));
        expect(later).toContain('data-point="look:ground"');
        expect(later).toContain('data-variant="light"');
        yield* waitFor(film.page, '[data-point="look:ground"]');
        expect(reads(film.asked, `/api/films/${TOY}/choices`)).toBe(0);
        expect(mismatches(film.page.logged)).toEqual([]);
        expect(film.errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "renders a film's choice cards and its project's scenes on the server, painted before any script runs, and hydrates them with no read again",
    () =>
      Effect.gen(function* () {
        const choicesPage = yield* openServed('review', studioRoutes, {
          href: pageHref.choices(STUDIO_FILM),
          viewport: PHONE,
        });
        const cards = painted(choicesPage.documents[0]?.html ?? '');
        // Each kind's cards, their variants, which is picked and each one's state and approval.
        for (const point of ['score', 'look:ground', 'take:room.tone', 'level:const:PAPER'])
          expect(cards).toContain(`data-point="${point}"`);
        expect(cards).toMatch(
          /data-variant="strings"[^>]*data-state="current"[^>]*data-picked="true"/,
        );
        expect(cards).toMatch(/data-variant="piano"[^>]*data-picked="false"/);
        expect(cards).toContain('data-approval="none"');
        // The browser's alone: the server's render runs no check and waits on no build.
        expect(browserOnly(choicesPage.read)).toEqual([]);
        yield* waitFor(choicesPage.page, '[data-point="score"]');
        expect(reads(choicesPage.asked, `/api/films/${STUDIO_FILM}/choices`)).toBe(0);
        expect(mismatches(choicesPage.page.logged)).toEqual([]);
        expect(choicesPage.errors).toEqual([]);

        const projectPage = yield* openServed('review', studioRoutes, {
          href: pageHref.project(STUDIO_FILM),
          viewport: PHONE,
        });
        const scenes = painted(projectPage.documents[0]?.html ?? '');
        // The film's panel, its act and each scene's card with its state.
        expect(scenes).toContain('class="pj-film"');
        expect(scenes).toContain('opening');
        expect(scenes).toMatch(/data-scene="open"[^>]*data-state="current"/);
        expect(scenes).toMatch(/data-scene="close"[^>]*data-state="stale"/);
        expect(scenes).toMatch(/data-scene="end"[^>]*data-state="missing"/);
        expect(browserOnly(projectPage.read)).toEqual([]);
        yield* waitFor(projectPage.page, '[data-scene="open"]');
        expect(reads(projectPage.asked, `/api/films/${STUDIO_FILM}/choices`)).toBe(0);
        expect(reads(projectPage.asked, `/api/films/${STUDIO_FILM}/project`)).toBe(0);
        expect(mismatches(projectPage.page.logged)).toEqual([]);
        expect(projectPage.errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  for (const link of NAMING_A_SHEET)
    it.live(
      `renders the sheet ${link.name}'s link names on the server, painted before any script runs, and hydrates it with no mismatch`,
      () =>
        Effect.gen(function* () {
          const served = yield* openServed('review', studioRoutes, {
            href: link.href,
            viewport: PHONE,
          });
          const html = painted(served.documents[0]?.html ?? '');
          expect(html).toContain('data-role="inspector"');
          expect(html).toContain(link.title);
          yield* waitFor(served.page, `${SHEET} [data-act="close-inspector"]`);
          yield* countIs(served.page, SHEET, 1);
          yield* textHas(served.page, `${SHEET} .lab-sheet-title`, link.title);
          expect(mismatches(served.page.logged)).toEqual([]);
          expect(served.errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

  for (const link of NAMING_NOTHING)
    it.live(
      `renders ${link.name}'s link that names no sheet the page has with its sheet shut, on the server as once hydrated`,
      () =>
        Effect.gen(function* () {
          const served = yield* openServed('review', studioRoutes, {
            href: link.href,
            viewport: PHONE,
          });
          const html = painted(served.documents[0]?.html ?? '');
          expect(html).toContain(link.ready);
          expect(html).not.toContain('data-role="inspector"');
          yield* waitFor(served.page, `[${link.ready}]`);
          yield* countIs(served.page, SHEET, 0);
          expect(mismatches(served.page.logged)).toEqual([]);
          expect(served.errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

  it.live(
    'is the page as ever once hydrated: Refresh reads the index again, a card opens its folder, Back and Forward walk',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openServed('review', routes);
        yield* page.click('.sh-header [data-act="view-menu"]');
        yield* page.click('[data-role="view-menu"] [data-command="review.refresh"]');
        // A refresh asks the server to walk its roots again.
        yield* until(
          page,
          `performance.getEntriesByType('resource').some((e) => e.name.endsWith('/api/review/index?fresh=1'))`,
        );
        expect(reads(asked, '/api/review/index?fresh=1')).toBe(1);
        expect(reads(asked, '/api/review/index')).toBe(0);
        yield* page.click(`a.rv-card[href="${FOLDER}"]`);
        yield* until(page, `location.pathname === '${FOLDER}'`);
        yield* textHas(page, '.rv-card', 'walk.mp4');
        yield* page.back;
        yield* until(page, `location.pathname === '/'`);
        yield* textHas(page, 'a.rv-card', 'Roofs at dusk');
        yield* page.forward;
        yield* until(page, `location.pathname === '${FOLDER}'`);
        yield* textHas(page, '.rv-card', 'walk.mp4');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
