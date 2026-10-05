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
import { textHas, until, waitFor } from '../../../src/lab/fixtures/settled.ts';

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
        // Its cards follow the player, which is the browser's: they show once hydrated.
        yield* waitFor(film.page, '[data-point="look:ground"]');
        expect(reads(film.asked, `/api/films/${TOY}/choices`)).toBe(0);
        expect(mismatches(film.page.logged)).toEqual([]);
        expect(film.errors).toEqual([]);
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
