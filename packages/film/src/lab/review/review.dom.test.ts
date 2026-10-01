// The review in a browser, its routes faked over a synthetic folder of three
// variants: home lists the folder under Comparisons and filters it; the
// folder shows its set, its loose video with captions, and a doc read as
// escaped markdown; the set plays every variant on one clock (space plays
// and pauses, ←/→ step, 🔊 moves the sound heard), shows the first against
// one other, every variant's frame at the moments (←/→ between them), and
// the notes; a variant the record proves stale says why in every view, and
// the rest say no state; the view lives in the URL through a reload; and a
// phone's width folds the grid to one column without scrolling sideways.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { ReviewFileUnknown } from '../../core/refusals.ts';
import {
  type FakeRoute,
  type Json,
  json,
  openReview,
  refused,
  route,
  text,
} from '../fixtures/harness.ts';
import {
  attributeIs,
  countIs,
  evaluates,
  textHas,
  textIs,
  textsAre,
  until,
  waitFor,
} from '../fixtures/settled.ts';

/** Long enough to open the page, walk to a set and play with it. */
const SLOW = 30_000;

/** A seen variant of the roof's render set, as the server encodes it. */
const variant = (id: string, label: string, extra: Readonly<Record<string, Json>> = {}): Json => ({
  id,
  label,
  lines: [`${label} look`, `verdict ${id}`],
  state: 'current',
  picked: false,
  verbs: [],
  media: {
    _tag: 'Seen',
    video: {
      ref: `out/art/roof.${id}.mp4`,
      name: `roof.${id}.mp4`,
      size: 2048,
      mtime: 0,
      phone: 'none',
    },
  },
  key: `out/art/roof.${id}.mp4`,
  approval: 'none',
  comments: [],
  ...extra,
});

const index: Json = {
  folders: [
    {
      ref: 'out/art',
      title: 'Roofs at dusk',
      blurb:
        '## Scenes\n1. Cold opening\n2. Message arrives\n3. Mirror answers\n\n**Judge:** Follow the staged order.\n\n<img src=x onerror=bad()>',
      mtime: 0,
      sets: [
        {
          id: 'render:roof',
          kind: 'render',
          title: 'The roof',
          lines: [],
          start: 0,
          marks: [],
          variants: [
            variant('A', 'Warm', {
              notes: { ref: 'out/art/roof.A.md', name: 'roof.A.md', size: 10, mtime: 0 },
            }),
            variant('B', 'Cold'),
            // Drawn before a newer render at its address, of other sources.
            variant('C', 'Grey', { state: 'stale', staleBy: 'sources' }),
          ],
        },
      ],
      videos: [{ ref: 'out/art/walk.mp4', name: 'walk.mp4', size: 4096, mtime: 0, phone: 'none' }],
      images: [],
      docs: [
        { ref: 'out/art/walk.vtt', name: 'walk.vtt', size: 10, mtime: 0 },
        { ref: 'out/art/why.md', name: 'why.md', size: 10, mtime: 0 },
      ],
    },
    {
      ref: 'out/sea',
      mtime: 0,
      sets: [],
      videos: [{ ref: 'out/sea/wave.mp4', name: 'wave.mp4', size: 4096, mtime: 0, phone: 'none' }],
      images: [],
      docs: [],
    },
  ],
};

const routes: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/review\/index/, () => json(index)),
  route('GET', /^\/review\/duration/, () => json({ seconds: 20 })),
  route('GET', /^\/review\/files\/out\/art\/why\.md$/, () =>
    text('# Why\n- **warm** <script>bad()</script>', 200),
  ),
  route('GET', /^\/review\/files\/out\/art\/roof\.A\.md$/, () => text('Warm reads *best*.', 200)),
];

const SET = '?folder=out%2Fart&set=render%3Aroof';

describe('the review page', () => {
  it.live(
    'lists the folders, filters them, and opens one: its set, its loose video, its doc',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes);
        yield* textHas(page, '.rv-h', 'Comparisons');
        yield* textHas(page, '.rv-h', 'Renders');
        yield* textHas(page, 'a.rv-card', 'Roofs at dusk');
        yield* page.fill('.rv-filter', 'sea');
        yield* until(page, "!document.body.textContent.includes('Roofs at dusk')");
        yield* page.fill('.rv-filter', '');
        yield* page.click('a.rv-card[href="/?folder=out%2Fart"]');
        yield* until(page, "location.search === '?folder=out%2Fart'");
        yield* textHas(page, '.rv-crumbs', 'Roofs at dusk');
        yield* textsAre(page, '[data-review-blurb] li', [
          'Cold opening',
          'Message arrives',
          'Mirror answers',
        ]);
        yield* textIs(page, '[data-review-blurb] b', 'Judge:');
        yield* textHas(page, '[data-review-blurb]', '<img src=x onerror=bad()>');
        yield* countIs(page, '[data-review-blurb] img, [data-review-blurb] script', 0);
        yield* textHas(page, 'a.rv-card', 'compare 3');
        yield* textHas(page, '.rv-card', 'walk.mp4');
        yield* attributeIs(page, '.rv-tall track', 'src', '/review/files/out/art/walk.vtt');
        yield* page.click('.rv-doc summary');
        yield* waitFor(page, '.rv-doc .rv-note li b');
        yield* evaluates(
          page,
          "document.querySelector('.rv-doc .rv-note').innerHTML.includes('&lt;script&gt;bad()&lt;/script&gt;')",
          true,
        );
        yield* countIs(page, '.rv-note script', 0);
        yield* page.back;
        yield* textHas(page, '.rv-h', 'Renders');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'plays every variant on one clock: space, ←/→ and the 🔊',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { search: SET });
        yield* waitFor(page, '.rv-transport');
        yield* countIs(page, '.rv-card video', 3);
        // A is heard first: the only unmuted video, its card lit.
        const heard =
          "Array.from(document.querySelectorAll('.rv-card[data-id]')).filter((c) => !c.querySelector('video').muted).map((c) => c.dataset.id).join()";
        yield* until(page, `${heard} === 'A'`);
        yield* attributeIs(page, '.rv-audible', 'data-id', 'A');
        yield* page.click('.rv-card[data-id="C"] .rv-sound');
        yield* until(page, `${heard} === 'C'`);
        yield* waitFor(page, '.rv-card[data-id="C"].rv-audible');
        // Space plays and pauses; ←/→ step 2 s while paused.
        yield* page.press('Space');
        yield* textHas(page, '.rv-big', '❚❚');
        yield* page.press('Space');
        yield* textHas(page, '.rv-big', '▶');
        yield* page.press('ArrowRight');
        yield* page.press('ArrowRight');
        yield* textHas(page, '.rv-time', '0:04.0');
        yield* page.press('ArrowLeft');
        yield* textHas(page, '.rv-time', '0:02.0');
        // Every video stands where the clock does.
        yield* until(
          page,
          "Array.from(document.querySelectorAll('.rv-card video')).every((v) => Math.abs(v.currentTime - 2) < 0.01 || v.readyState === 0)",
        );
        yield* page.click('.rv-seg button[data-rate="0.5"]');
        yield* waitFor(page, '.rv-seg button[data-rate="0.5"][aria-pressed="true"]');
        yield* evaluates(
          page,
          "Array.from(document.querySelectorAll('.rv-card video')).map((v) => v.playbackRate)",
          [0.5, 0.5, 0.5],
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'shows the first against one other, the moments, and the notes, the view kept in the URL',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { search: SET });
        yield* waitFor(page, '.rv-transport');
        yield* page.click('.rv-card[data-id="C"] .rv-sound');
        yield* page.click('.rv-views button[data-view="pair"]');
        yield* until(page, "location.search.endsWith('&view=pair&other=B')");
        const shown =
          "Array.from(document.querySelectorAll('.rv-card[data-id]')).map((c) => c.dataset.id).join()";
        yield* until(page, `${shown} === 'A,B'`);
        // C was heard; the pair hears one of its own.
        yield* waitFor(page, '.rv-card[data-id="A"].rv-audible');
        yield* page.click('button[data-other="C"]');
        yield* until(page, `${shown} === 'A,C'`);
        yield* until(page, "location.search.endsWith('&view=pair&other=C')");

        yield* page.click('.rv-views button[data-view="moments"]');
        yield* waitFor(page, 'button[data-moment="0"][aria-pressed="true"]');
        yield* countIs(page, '.rv-transport', 0);
        const frames =
          "Array.from(document.querySelectorAll('.rv-card img')).map((i) => new URL(i.src).searchParams.get('t')).join()";
        yield* until(page, `${frames} === '1,1,1'`);
        yield* page.press('ArrowRight');
        yield* until(page, `${frames} === '5,5,5'`);
        yield* page.press('ArrowLeft');
        yield* page.press('ArrowLeft');
        yield* until(page, `${frames} === '19,19,19'`);
        yield* until(page, "location.search.endsWith('&view=moments&m=4')");
        yield* page.click('.rv-card img');
        yield* waitFor(page, '.rv-lightbox');
        yield* page.press('Escape');
        yield* until(page, "document.querySelector('.rv-lightbox') === null");

        yield* page.click('.rv-views button[data-view="notes"]');
        yield* textHas(page, '.rv-verdict', 'verdict B');
        yield* waitFor(page, '.rv-note[data-id="A"] i');
        yield* textHas(page, '.rv-note[data-id="A"]', 'Warm reads best.');

        // A reload opens the view the URL keeps.
        yield* page.goto(`/${SET}&view=moments&m=2`);
        yield* waitFor(page, 'button[data-moment="2"][aria-pressed="true"]');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a doc that cannot be read says why as text, the server's words never markup",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(
          [
            route('GET', /^\/review\/files\/out\/art\/why\.md$/, () =>
              refused(ReviewFileUnknown.make({ ref: 'out/art/<i>why</i>.md' })),
            ),
            ...routes,
          ],
          { search: '?folder=out%2Fart' },
        );
        yield* page.click('.rv-doc summary');
        yield* textIs(
          page,
          '.rv-doc .rv-note',
          "no file out/art/<i>why</i>.md under the review's roots",
        );
        yield* countIs(page, '.rv-doc .rv-note i', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a variant the record proves stale says why in every view; the rest say no state',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { search: SET });
        const STALE = 'stale: its sources changed since it was made';
        /** The grid's one state word is C's, and says why it is stale. */
        const onlyCStale = Effect.andThen(
          textsAre(page, '.rv-grid [data-state]', [STALE]),
          textsAre(page, '.rv-grid [data-id="C"] [data-state]', [STALE]),
        );
        yield* waitFor(page, '.rv-card[data-id="C"] [data-state="stale"]');
        yield* onlyCStale;
        yield* page.click('.rv-views button[data-view="moments"]');
        yield* waitFor(page, '.rv-card[data-id="C"] img');
        yield* onlyCStale;
        yield* page.click('.rv-views button[data-view="notes"]');
        yield* waitFor(page, '.rv-note[data-id="C"]');
        yield* onlyCStale;
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "folds to one column at a phone's width, nothing scrolling sideways",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, {
          search: SET,
          viewport: { width: 390, height: 844 },
        });
        yield* waitFor(page, '.rv-transport');
        // Every card starts at one left edge: one column.
        yield* evaluates(
          page,
          "new Set(Array.from(document.querySelectorAll('.rv-card[data-id]')).map((c) => Math.round(c.getBoundingClientRect().left))).size",
          1,
        );
        yield* evaluates(page, 'document.documentElement.scrollWidth <= innerWidth', true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
