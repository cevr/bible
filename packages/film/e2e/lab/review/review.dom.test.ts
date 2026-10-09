// The review in a browser, its routes faked over a synthetic folder of three
// variants: home lists the folder under Versions, and the header's Search
// (⌘K) finds it by name, with Refresh; the folder shows its set, its loose
// video with captions, and a doc read as
// escaped markdown; the set plays every variant on one clock (space plays
// and pauses, ←/→ step, 🔊 or `1`…`9` move the sound heard), shows the first against
// one other side by side or wiped (a divider the pointer drags), every
// variant's frame at the moments (←/→ between them), the first and one
// other's difference at a moment (stills in the difference blend), and
// the notes; a variant the record proves stale says why in every view, and
// the rest say no state; the view lives in the URL through a reload; and a
// phone's width folds the grid to one column without scrolling sideways.

import { Effect, Match, Option, Schema } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { SetSayPost, pageHref } from '../../../src/core/api.ts';
import { ReviewFileUnknown } from '../../../src/core/refusals.ts';
import { tone } from '../../../src/lab/fixtures/tone.ts';
import { STEP_S } from '../../../src/lab/review/machine.ts';
import {
  type FakeRoute,
  type Json,
  TONE,
  file,
  json,
  openReview,
  refused,
  route,
  text,
} from '../../../src/lab/fixtures/harness.ts';
import {
  attributeIs,
  attributesAre,
  countIs,
  evaluates,
  textHas,
  textIs,
  textsAre,
  until,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';
import {
  closeCommandMenu,
  menuEntry,
  openCommandMenu,
  rightClick,
  touch,
} from '../../../src/lab/fixtures/gestures.ts';

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

/** A big video whose proxy (the phone's 720p copy) is still being made. */
const pendingSky: Json = {
  ref: 'out/art/sky.D.mp4',
  name: 'sky.D.mp4',
  size: 900_000_000,
  mtime: 0,
  phone: 'pending',
};

/** The folder's loose video, its proxy `phone` (none made, or ready). */
const walkOf = (phone: 'none' | 'ready'): Json => ({
  ref: 'out/art/walk.mp4',
  name: 'walk.mp4',
  size: 4096,
  mtime: 0,
  phone,
});

/** The index, its loose video `walk`. */
const indexOf = (walk: Json): Json => ({
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
        {
          id: 'render:sky',
          kind: 'render',
          title: 'The sky',
          lines: [],
          start: 0,
          marks: [],
          // One version, big enough for a proxy that is still being made.
          variants: [variant('D', 'Dusk', { media: { _tag: 'Seen', video: pendingSky } })],
        },
      ],
      videos: [walk],
      images: [],
      downloads: [
        { ref: 'out/art/master #1.mp4', name: 'master #1.mp4', size: 1700000000, mtime: 0 },
      ],
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
});

const index = indexOf(walkOf('none'));

const routes: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/api\/review\/index/, () => json(index)),
  route('GET', /^\/api\/review\/duration/, () => json({ seconds: 20 })),
  route('GET', /^\/api\/review\/files\/out\/art\/why\.md$/, () =>
    text('# Why\n- **warm** <script>bad()</script>', 200),
  ),
  route('GET', /^\/api\/review\/files\/out\/art\/roof\.A\.md$/, () =>
    text('Warm reads *best*.', 200),
  ),
];

const FOLDER = pageHref.folder('out/art');
const SET = pageHref.set('out/art', 'render:roof');
const SKY = pageHref.set('out/art', 'render:sky');

/** The folder's loose video (`walk.mp4`), played on a clock of its own: its card, row and element. */
const LONE = '.rv-tall';
const LONE_ROW = `${LONE} .rv-alone-row`;
const LONE_VIDEO = `document.querySelector('${LONE} video')`;
const LONE_FAILED = `${LONE} [data-act="play-video"] [data-role="failed"]`;

/** What a lone video that cannot play says. */
const CANNOT_PLAY = 'Can’t play this video · Try again';

/** Where a page's synced player says its clock cannot play, and what it says. */
const SET_FAILED = '.rv-transport [data-role="failed"]';
const CANNOT_PLAY_CLOCK = 'Can’t play this video';

/**
 * Where the next video made after now first plays from, kept as
 * `STARTED_AT`: every video in the page is marked seen, and the first
 * unmarked one to start playing says its time then.
 */
const WATCH_START = `(() => {
  for (const v of document.querySelectorAll('video')) v.dataset.seen = '';
  window.__startedAt = undefined;
  document.addEventListener('playing', (e) => {
    if (!('seen' in e.target.dataset)) window.__startedAt ??= e.target.currentTime;
  }, true);
})()`;
const STARTED_AT = 'window.__startedAt';

/** The loose video's file, answered with `answer`. */
const walkServes = (answer: FakeRoute['answer']) =>
  route('GET', /^\/api\/review\/files\/out\/art\/walk\.mp4/, answer);

/** The lone video's scrub moved to `t` (`input`), or let go (`change`), as a drag does. */
const scrub = (type: 'input' | 'change', t: number) => `(() => {
  const range = document.querySelector('${LONE_ROW} input[type="range"]');
  range.value = '${t}';
  range.dispatchEvent(new Event('${type}', { bubbles: true }));
})()`;

describe('the review page', () => {
  it.live(
    'lists the folders, finds one by name, and opens one: its set, its loose video, its doc',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes);
        yield* textHas(page, '.rv-h', 'Versions');
        yield* textHas(page, '.rv-h', 'Renders');
        yield* textHas(page, 'a.rv-card', 'Roofs at dusk');
        // The header's Go to… opens ⌘K: a folder is found by its title, Refresh is a command.
        yield* page.click('.sh-header [data-act="search"]');
        yield* page.waitFor('.lab-command-query');
        yield* page.fill('.lab-command-query', 'dusk');
        yield* textHas(page, menuEntry('go.folder.out/art'), 'Go to folder Roofs at dusk');
        yield* page.fill('.lab-command-query', 'refresh');
        yield* waitFor(page, menuEntry('review.refresh'));
        yield* closeCommandMenu(page);
        // The view menu ⋯ follows Go to…, and Refresh is one of its rows.
        yield* evaluates(
          page,
          `document.querySelector('.sh-header [data-act="search"]').nextElementSibling?.dataset.act`,
          'view-menu',
        );
        yield* page.click('.sh-header [data-act="view-menu"]');
        yield* waitFor(page, '[data-role="view-menu"] [data-command="review.refresh"]');
        // `/` opens it too, and its Go to goes there, even pressed while the menu
        // ⋯ is still on its way out: a closing menu holds no keys. Its exit is
        // held for 3 s, so the press always lands in it, focus still inside.
        yield* page.evaluate(
          `document.head.append(Object.assign(document.createElement('style'), { textContent: '[data-role="view-menu"] { transition: opacity 3s linear !important; } [data-role="view-menu"][data-ending-style] { opacity: 0 !important; }' }))`,
        );
        yield* page.press('Escape');
        yield* waitFor(page, '[data-role="view-menu"][data-ending-style]');
        yield* page.press('/');
        yield* page.waitFor('.lab-command-query');
        yield* page.fill('.lab-command-query', 'roofs at dusk');
        yield* page.click(menuEntry('go.folder.out/art'));
        yield* until(page, `location.pathname === '${FOLDER}'`);
        yield* page.goto('/');
        yield* page.click(`a.rv-card[href="${FOLDER}"]`);
        yield* until(page, `location.pathname === '${FOLDER}'`);
        yield* textHas(page, '.sh-header [data-role="crumb"]', 'Roofs at dusk');
        // The tab's title names the Folder first, then its part (SU-9).
        yield* until(page, "document.title.startsWith('Roofs at dusk · ')");
        // A phone's header names the Folder too (SU-10).
        yield* page.resize(390, 844);
        yield* evaluates(
          page,
          `document.querySelector('.sh-header [data-role="crumb"]').checkVisibility()`,
          true,
        );
        yield* page.resize(1440, 900);
        yield* textsAre(page, '[data-review-blurb] li', [
          'Cold opening',
          'Message arrives',
          'Mirror answers',
        ]);
        yield* textIs(page, '[data-review-blurb] b', 'Judge:');
        yield* textHas(page, '[data-review-blurb]', '<img src=x onerror=bad()>');
        yield* countIs(page, '[data-review-blurb] img, [data-review-blurb] script', 0);
        // A stack of several says how many; of one, nothing; its versions' names are its
        // long-press menu's, each opening the set on that version's sheet (UR2-6).
        const roof = `a.rv-card[href="${SET}"]`;
        yield* textHas(page, roof, '3 versions');
        yield* countIs(page, `a.rv-card[href="${SKY}"] .rv-badge`, 0);
        yield* evaluates(
          page,
          `document.querySelector('${roof}').innerText.includes('Warm')`,
          false,
        );
        yield* rightClick(page, roof);
        yield* textHas(
          page,
          '[data-role="context-menu"] [data-command="review.open-version-2"]',
          'Open version 2 · Cold',
        );
        yield* countIs(
          page,
          '[data-role="context-menu"] [data-command="review.open-version-4"]',
          0,
        );
        yield* page.click('[data-role="context-menu"] [data-command="review.open-version-2"]');
        yield* until(page, "location.search === '?inspect=B'");
        yield* waitFor(page, '[data-role="inspector"]');
        yield* page.back;
        yield* textHas(page, '.rv-card', 'walk.mp4');
        yield* attributeIs(page, '.rv-tall track', 'src', '/api/review/files/out/art/walk.vtt');
        // Never the browser's controls (how it plays: the lone video's own cases below).
        yield* countIs(page, '.rv-tall video[controls]', 0);
        // A loose video shows its name; its file is its menu's: Open, Copy link, Info (UR-17).
        yield* textIs(page, '.rv-tall .rv-cap', 'walk.mp4');
        yield* rightClick(page, '.rv-tall .rv-cap');
        yield* waitFor(page, '[data-role="context-menu"] [data-command="review.file-open"]');
        yield* textHas(
          page,
          '[data-role="context-menu"] [data-command="link.copy"]',
          'Copy link to file out/art/walk.mp4',
        );
        yield* page.click('[data-role="context-menu"] [data-command="review.file-info"]');
        yield* textHas(page, '[data-role="receipt"]', 'walk.mp4 · 4.0 KB · ');
        yield* textHas(page, '[data-review-download]', 'master #1.mp4');
        yield* attributeIs(
          page,
          '[data-review-download]',
          'href',
          '/api/review/files/out/art/master%20%231.mp4',
        );
        yield* attributeIs(page, '[data-review-download]', 'download', 'master #1.mp4');
        yield* countIs(page, 'video[src*="master"], img[src*="master"]', 0);
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
    'a loose video plays on a clock of its own: its time moves, and a scrub back to the start, let go, plays on',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: FOLDER });
        yield* waitFor(page, `${LONE} [data-act="play-video"]`);
        // At rest its picture is the one control: no row.
        yield* countIs(page, LONE_ROW, 0);
        yield* page.click(`${LONE} [data-act="play-video"]`);
        yield* textIs(page, `${LONE_ROW} [data-act="play"]`, '❚❚');
        // Its time moves, and the row's clock says so.
        yield* until(page, `${LONE_VIDEO}.currentTime > 1.5`);
        yield* until(
          page,
          `document.querySelector('${LONE_ROW} .rv-time-at').textContent !== '00:00:00:00'`,
        );
        // Scrubbed back to the start, the row stays for the whole scrub; let go, it plays on.
        yield* page.evaluate(scrub('input', 0));
        yield* countIs(page, LONE_ROW, 1);
        yield* page.evaluate(scrub('change', 0));
        yield* until(page, `${LONE_VIDEO}.currentTime < 1`);
        yield* textIs(page, `${LONE_ROW} [data-act="play"]`, '❚❚');
        yield* until(page, `!${LONE_VIDEO}.paused && ${LONE_VIDEO}.currentTime > 1.2`);
        // Paused, then scrubbed back to the start and let go, it is at rest again.
        yield* page.click(`${LONE_ROW} [data-act="play"]`);
        yield* textIs(page, `${LONE_ROW} [data-act="play"]`, '▶');
        yield* page.evaluate(scrub('input', 0));
        yield* countIs(page, LONE_ROW, 1);
        yield* page.evaluate(scrub('change', 0));
        yield* countIs(page, LONE_ROW, 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a loose video that cannot play says so, and never shows as playing: a play refused as unsupported',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: FOLDER });
        yield* waitFor(page, `${LONE} [data-act="play-video"]`);
        yield* until(page, `${LONE_VIDEO}.readyState >= 1`);
        // The browser loads it, but will not play it.
        yield* page.evaluate(`(() => {
          HTMLMediaElement.prototype.play = function () {
            return Promise.reject(new DOMException('refused', 'NotSupportedError'));
          };
        })()`);
        yield* page.click(`${LONE} [data-act="play-video"]`);
        // Its picture says so (a press on it tries again); no row offers a play or a scrub.
        yield* textIs(page, LONE_FAILED, CANNOT_PLAY);
        yield* attributeIs(page, LONE_FAILED, 'data-reason', 'NotSupportedError');
        yield* countIs(page, LONE_ROW, 0);
        yield* evaluates(page, `${LONE_VIDEO}.paused`, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a loose video whose media fails to load says so before it is pressed',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(
          [walkServes(() => text('gone', 404)), ...routes],
          { href: FOLDER },
        );
        yield* textIs(page, LONE_FAILED, CANNOT_PLAY);
        yield* attributeIs(page, LONE_FAILED, 'data-reason', 'error');
        yield* countIs(page, LONE_ROW, 0);
        yield* evaluates(page, `${LONE_VIDEO}.paused`, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a loose video whose proxy fails plays its original once the page plays the originals: a failure is its source’s',
    () =>
      Effect.gen(function* () {
        // A phone plays the proxies, and this one will not load; the original plays.
        const { page, errors } = yield* openReview(
          [
            route('GET', /^\/api\/review\/index/, () => json(indexOf(walkOf('ready')))),
            route('GET', /^\/api\/review\/phone\/out\/art\/walk\.mp4/, () => text('gone', 404)),
            ...routes,
          ],
          { href: FOLDER, viewport: { width: 390, height: 844 } },
        );
        yield* textIs(page, LONE_FAILED, CANNOT_PLAY);
        yield* openCommandMenu(page, 'play the');
        yield* page.click(menuEntry('review.quality'));
        yield* countIs(page, LONE_FAILED, 0);
        yield* page.click(`${LONE} [data-act="play-video"]`);
        yield* until(page, `!${LONE_VIDEO}.paused && ${LONE_VIDEO}.currentTime > 0.5`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a loose video that failed to load tries again at a press on its picture, and plays once its media loads',
    () =>
      Effect.gen(function* () {
        // The first ask finds the server unavailable; the next finds the file.
        let asks = 0;
        const { page, errors } = yield* openReview(
          [
            walkServes(() => {
              asks += 1;
              if (asks === 1) return text('unavailable', 503);
              return TONE;
            }),
            ...routes,
          ],
          { href: FOLDER },
        );
        yield* textIs(page, LONE_FAILED, CANNOT_PLAY);
        yield* page.click(`${LONE} [data-act="play-video"]`);
        yield* countIs(page, LONE_FAILED, 0);
        yield* until(page, `!${LONE_VIDEO}.paused && ${LONE_VIDEO}.currentTime > 0.5`);
        expect(asks).toBeGreaterThan(1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a loose video that fails as it plays tries again where the failure left it, and plays',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: FOLDER });
        yield* waitFor(page, `${LONE} [data-act="play-video"]`);
        yield* page.click(`${LONE} [data-act="play-video"]`);
        yield* until(page, `!${LONE_VIDEO}.paused && ${LONE_VIDEO}.currentTime > 2`);
        // Its media fails two seconds in, as a dropped connection's does.
        yield* page.evaluate(`${LONE_VIDEO}.dispatchEvent(new Event('error'))`);
        yield* textIs(page, LONE_FAILED, CANNOT_PLAY);
        yield* page.evaluate(WATCH_START);
        yield* page.click(`${LONE} [data-act="play-video"]`);
        yield* countIs(page, LONE_FAILED, 0);
        // The retry's element starts where the failure left it, and plays.
        yield* until(page, `${STARTED_AT} > 1.9 && !${LONE_VIDEO}.paused`);
        yield* textIs(page, `${LONE_ROW} [data-act="play"]`, '❚❚');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a retry's play is the retry's alone: once its proxy plays, the originals and the proxy again keep it playing",
    () =>
      Effect.gen(function* () {
        // A phone plays the proxy; its first ask finds the server unavailable, the next the file.
        let asks = 0;
        const { page, errors } = yield* openReview(
          [
            route('GET', /^\/api\/review\/index/, () => json(indexOf(walkOf('ready')))),
            route('GET', /^\/api\/review\/phone\/out\/art\/walk\.mp4/, () => {
              asks += 1;
              if (asks === 1) return text('unavailable', 503);
              return TONE;
            }),
            ...routes,
          ],
          { href: FOLDER, viewport: { width: 390, height: 844 } },
        );
        const playing = `!${LONE_VIDEO}.paused && ${LONE_VIDEO}.currentTime > 0.5`;
        const pause = `${LONE_ROW} [data-act="play"]`;
        yield* textIs(page, LONE_FAILED, CANNOT_PLAY);
        yield* page.click(`${LONE} [data-act="play-video"]`);
        yield* until(page, playing);
        for (const [quality, src] of [
          ['play the originals', '/api/review/files/'],
          ['play the proxies', '/api/review/phone/'],
        ] as const) {
          yield* openCommandMenu(page, quality);
          yield* page.click(menuEntry('review.quality'));
          yield* until(page, `${LONE_VIDEO}.src.includes('${src}')`);
          yield* until(page, playing);
          yield* textIs(page, pause, '❚❚');
        }
        // Still playing a beat later: no play asked again turns it off.
        yield* page.clock.runFor(500);
        yield* evaluates(page, `${LONE_VIDEO}.paused`, false);
        yield* textIs(page, pause, '❚❚');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a loose video keeps its place when the page plays the originals: the original stands where the proxy stood, playing',
    () =>
      Effect.gen(function* () {
        // A phone plays the proxy; both copies are the same ten seconds of tone.
        const { page, errors } = yield* openReview(
          [route('GET', /^\/api\/review\/index/, () => json(indexOf(walkOf('ready')))), ...routes],
          { href: FOLDER, viewport: { width: 390, height: 844 } },
        );
        yield* waitFor(page, `${LONE} [data-act="play-video"]`);
        yield* evaluates(page, `${LONE_VIDEO}.src.includes('/api/review/phone/')`, true);
        yield* page.click(`${LONE} [data-act="play-video"]`);
        yield* until(page, `!${LONE_VIDEO}.paused && ${LONE_VIDEO}.currentTime > 2`);
        yield* page.evaluate(WATCH_START);
        yield* openCommandMenu(page, 'play the');
        yield* page.click(menuEntry('review.quality'));
        yield* until(page, `${LONE_VIDEO}.src.includes('/api/review/files/')`);
        // The original starts where the proxy stood, or past it, and plays on.
        yield* until(page, `${STARTED_AT} > 1.9 && !${LONE_VIDEO}.paused`);
        yield* textIs(page, `${LONE_ROW} [data-act="play"]`, '❚❚');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a set whose clock cannot load says so on its transport, and never shows as playing',
    () =>
      Effect.gen(function* () {
        // The first version's video is the set's clock, and its file is gone.
        const { page, errors } = yield* openReview(
          [
            route('GET', /^\/api\/review\/files\/out\/art\/roof\.A\.mp4/, () => text('gone', 404)),
            ...routes,
          ],
          { href: SET },
        );
        yield* waitFor(page, '.rv-transport');
        yield* page.press('Space');
        yield* textIs(page, SET_FAILED, CANNOT_PLAY_CLOCK);
        yield* attributeIs(page, SET_FAILED, 'data-reason', /.+/);
        yield* textIs(page, '.rv-transport [data-act="play"]', '▶');
        yield* evaluates(
          page,
          "[...document.querySelectorAll('.rv-card video')].every((v) => v.paused)",
          true,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'plays every variant on one clock: space, ←/→ and the 🔊',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: SET });
        yield* waitFor(page, '.rv-transport');
        yield* countIs(page, '.rv-card video', 3);
        // A is heard first: the only unmuted video, its card lit.
        const heard =
          "Array.from(document.querySelectorAll('.rv-card[data-id]')).filter((c) => !c.querySelector('video').muted).map((c) => c.dataset.id).join()";
        yield* until(page, `${heard} === 'A'`);
        yield* attributeIs(page, '.rv-audible', 'data-id', 'A');
        // `2` hears version 2, as its 🔊 would (UR-27).
        yield* page.press('2');
        yield* until(page, `${heard} === 'B'`);
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
        yield* textHas(page, '.rv-time', '00:00:04:00');
        yield* page.press('ArrowLeft');
        yield* textHas(page, '.rv-time', '00:00:02:00');
        // Every video stands where the clock does.
        yield* until(
          page,
          "Array.from(document.querySelectorAll('.rv-card video')).every((v) => Math.abs(v.currentTime - 2) < 0.01)",
        );
        // The rate chip opens the rates but the one it plays at; J steps one slower.
        yield* page.click('.rv-transport [data-act="rate"]');
        yield* waitFor(page, '[data-role="chip-menu"] [data-command="play.rate-0.5"]');
        yield* page.press('Escape');
        yield* countIs(page, '[data-role="chip-menu"]', 0);
        yield* page.press('j');
        yield* waitFor(page, '.rv-transport [data-act="rate"] [data-rate="0.5"]');
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
    "shows the first against one other, the moments, and an old notes link as a version's Info, the view kept in the URL",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: SET });
        yield* waitFor(page, '.rv-transport');
        yield* page.click('.rv-card[data-id="C"] .rv-sound');
        yield* page.click('.rv-views button[data-view="compare"]');
        yield* until(page, "location.search === '?view=pair&other=B'");
        const shown =
          "Array.from(document.querySelectorAll('.rv-card[data-id]')).map((c) => c.dataset.id).join()";
        yield* until(page, `${shown} === 'A,B'`);
        // C was heard; the pair hears one of its own.
        yield* waitFor(page, '.rv-card[data-id="A"].rv-audible');
        // `3` is not the pair's to hear; `2` is.
        yield* page.press('3');
        yield* page.press('2');
        yield* waitFor(page, '.rv-card[data-id="B"].rv-audible');
        yield* page.click('button[data-other="C"]');
        yield* until(page, `${shown} === 'A,C'`);
        yield* until(page, "location.search === '?view=pair&other=C'");

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
        yield* until(page, "location.search === '?view=moments&m=4'");
        yield* page.click('.rv-card img');
        yield* textIs(page, '.rv-lightbox figcaption', 'Warm at 00:00:19:00');
        yield* page.press('Escape');
        yield* until(page, "document.querySelector('.rv-lightbox') === null");
        // The keyboard opens it too: a still is a button, Enter and Space open its caption.
        for (const key of ['Enter', ' ']) {
          yield* page.focus('.rv-card[data-id="B"] .rv-zoom');
          yield* page.press(key);
          yield* textHas(page, '.rv-lightbox figcaption', 'at 00:00:19:00');
          yield* page.press('Escape');
          yield* until(page, "document.querySelector('.rv-lightbox') === null");
        }

        // The notes are each version's Info (UR-34): an old link to them opens All, the
        // first version's sheet open on its lines and notes, and says so in the URL.
        yield* page.goto(`${SET}?view=notes`);
        yield* waitFor(page, '.rv-views button[data-view="all"][aria-pressed="true"]');
        yield* until(page, "location.search === '?inspect=A'");
        yield* textHas(page, '[data-role="inspector"] .rv-verdict', 'verdict A');
        yield* waitFor(page, '[data-role="inspector"] i');
        yield* textHas(page, '[data-role="inspector"]', 'Warm reads best.');
        // The caps say a version's name, not its lines (UR-30).
        yield* countIs(page, '.rv-card .rv-tag', 0);

        // A reload opens the view the URL keeps.
        yield* page.goto(`${SET}?view=moments&m=2`);
        yield* waitFor(page, 'button[data-moment="2"][aria-pressed="true"]');

        // Every view marks the version whose sheet is open: Moments and Difference too.
        yield* page.goto(`${SET}?view=moments&inspect=B`);
        yield* waitFor(page, '[data-role="inspector"]');
        yield* attributesAre(page, '.rv-card[data-selected="true"]', 'data-id', ['B']);
        yield* page.goto(`${SET}?view=diff&other=B&inspect=B`);
        yield* waitFor(page, '[data-role="inspector"]');
        yield* attributesAre(page, '.rv-card[data-selected="true"]', 'data-id', ['B']);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'Back lands the player on the time its entry keeps, and nothing writes the later time over it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: SET });
        yield* waitFor(page, '.rv-transport');
        yield* page.press('ArrowRight');
        yield* page.press('ArrowRight');
        yield* until(page, "location.hash === '#t=4'");
        yield* page.click('.rv-views button[data-view="compare"]');
        yield* until(page, "location.search === '?view=pair&other=B'");
        // The time moves on in the pair's entry; all's keeps 4.
        yield* page.press('ArrowRight');
        yield* textHas(page, '.rv-time', '00:00:06:00');
        yield* until(page, "location.hash === '#t=6'");
        yield* page.back;
        yield* waitFor(page, '.rv-views button[data-view="all"][aria-pressed="true"]');
        yield* textHas(page, '.rv-time', '00:00:04:00');
        // Past the time's throttle, the entry still keeps its own time.
        yield* page.evaluate('new Promise((done) => setTimeout(() => done(true), 600))');
        yield* until(page, "location.search === '' && location.hash === '#t=4'");
        yield* textHas(page, '.rv-time', '00:00:04:00');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "shows one timecode: a laptop's in the header, the row its length; a phone's in the row (SU-12)",
    () =>
      Effect.gen(function* () {
        /** The timecodes the page shows, as read (a hidden one is not). */
        const SHOWN = `[...document.querySelectorAll('.sh-tc, .rv-time')].filter((e) => e.getClientRects().length > 0).map((e) => e.innerText.replace(/\\s+/g, ' ').trim()).filter((t) => t !== '')`;
        const { page, errors } = yield* openReview(routes, { href: `${SET}#t=4` });
        yield* textHas(page, '.rv-time', '00:00:04:00');
        yield* until(
          page,
          `${SHOWN}.length === 2 && ${SHOWN}[0] === '00:00:04:00' && ${SHOWN}[1].startsWith('/ ')`,
        );
        const phone = yield* openReview(routes, {
          href: `${SET}#t=4`,
          viewport: { width: 390, height: 844 },
        });
        yield* textHas(phone.page, '.rv-time', '00:00:04:00');
        yield* phone.page.until(`${SHOWN}.join() === '00:00:04:00'`, {
          now: SHOWN,
          say: (shown) => `a phone shows the timecodes ${shown}`,
        });
        expect([...errors, ...phone.errors]).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  // Serial: a finger's touches (`film/touches-serial`).
  test.serial(
    "a long-press on a version's picture steps the set on or back, one step or ten (SU-11)",
    () =>
      Effect.gen(function* () {
        // Thirty seconds of tone, past the twenty ten steps go: a step of another size lands elsewhere.
        const long = tone(30, 0.1);
        const { page, errors } = yield* openReview(
          [
            route('GET', /^\/api\/review\/(files|phone)\/[^?]*\.mp4/, () => ({
              _tag: 'Wav',
              bytes: long,
            })),
            ...routes,
          ],
          { href: SET, viewport: { width: 390, height: 844 } },
        );
        yield* waitFor(page, '.rv-transport');
        const MENU = '[data-role="context-menu"]';
        /** A long press on the second version's picture, on the page's held clock. */
        const held = Effect.gen(function* () {
          yield* page.clock.hold;
          yield* touch(page, '.rv-card[data-id="B"] video', 0);
          yield* page.clock.runFor(700);
          yield* waitFor(page, `${MENU} [data-command]`);
          yield* page.finger.up;
          yield* page.clock.runFor(500);
        });
        yield* held;
        yield* waitFor(page, `${MENU} [data-command="review.step-previous"]`);
        yield* page.click(`${MENU} [data-command="review.step-next"][data-step="coarse"]`);
        // The menu closes, and runs its row, on the held clock.
        yield* page.clock.runFor(500);
        // Ten steps of two seconds on from the start.
        yield* textIs(page, '.rv-time-at', `00:00:${10 * STEP_S}:00`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped, Effect.runPromise),
    SLOW,
  );

  it.live(
    'Back walks the views chosen, a ←/→ step none; the time is in the link, which opens there',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: SET });
        yield* waitFor(page, '.rv-transport');
        yield* evaluates(
          page,
          "(window.first = document.querySelector('.rv-card video')) !== null",
          true,
        );
        yield* page.press('ArrowRight');
        yield* page.press('ArrowRight');
        yield* textHas(page, '.rv-time', '00:00:04:00');
        yield* until(page, "location.hash === '#t=4'");
        // The time in the URL is the set's own: the set and its videos stay as they are.
        yield* evaluates(page, "document.querySelector('.rv-card video') === window.first", true);
        const at = 'location.pathname + location.search';
        yield* page.click('.rv-views button[data-view="compare"]');
        yield* until(page, `${at} === '${SET}?view=pair&other=B'`);
        // Cycling the pair refines the view in its own entry.
        yield* page.click('button[data-other="C"]');
        yield* until(page, `${at} === '${SET}?view=pair&other=C'`);
        yield* page.click('.rv-views button[data-view="moments"]');
        yield* waitFor(page, 'button[data-moment="0"][aria-pressed="true"]');
        yield* page.click('button[data-moment="3"]');
        yield* waitFor(page, 'button[data-moment="3"][aria-pressed="true"]');
        yield* page.press('ArrowRight');
        yield* until(page, `${at} === '${SET}?view=moments&m=4'`);
        yield* page.back;
        yield* waitFor(page, 'button[data-moment="0"][aria-pressed="true"]');
        yield* until(page, `${at} === '${SET}?view=moments'`);
        yield* page.back;
        yield* waitFor(page, '.rv-views button[data-view="compare"][aria-pressed="true"]');
        yield* until(page, `${at} === '${SET}?view=pair&other=C'`);
        yield* page.back;
        yield* waitFor(page, '.rv-views button[data-view="all"][aria-pressed="true"]');
        yield* until(page, `${at} === '${SET}'`);
        // A pasted link opens the set in its view, at its time.
        yield* page.goto(`${SET}?view=pair&other=C#t=7`);
        yield* textHas(page, '.rv-time', '00:00:07:00');
        yield* until(
          page,
          "Array.from(document.querySelectorAll('.rv-card[data-id]')).map((c) => c.dataset.id).join() === 'A,C'",
        );
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
            route('GET', /^\/api\/review\/files\/out\/art\/why\.md$/, () =>
              refused(ReviewFileUnknown.make({ ref: 'out/art/<i>why</i>.md' })),
            ),
            ...routes,
          ],
          { href: FOLDER },
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
    'a variant the record proves stale says Out of date in every view and why in its Info; the rest say no state',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: SET });
        const STALE = 'out of date: its sources changed since it was made';
        /** The grid's one state badge is C's (UR-29). */
        const onlyCStale = Effect.andThen(
          textsAre(page, '.rv-grid [data-approval="stale"]', ['Out of date']),
          textsAre(page, '.rv-grid [data-id="C"] [data-approval="stale"]', ['Out of date']),
        );
        yield* waitFor(page, '.rv-card[data-id="C"] [data-approval="stale"]');
        yield* onlyCStale;
        yield* page.click('.rv-views button[data-view="moments"]');
        yield* waitFor(page, '.rv-card[data-id="C"] img');
        yield* onlyCStale;
        // Why is C's Info.
        yield* page.goto(`${SET}?inspect=C`);
        yield* textsAre(page, '[data-role="inspector"] [data-state="stale"]', [STALE]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a set of one version offers no Compare, and a link asking for one opens All',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, {
          href: `${SKY}?view=pair&other=nope`,
        });
        yield* waitFor(page, '.rv-views button[data-view="all"][aria-pressed="true"]');
        yield* textsAre(page, '.rv-views button', ['All', 'Moments']);
        yield* countIs(page, '.rv-layouts', 0);
        // The URL keeps no empty other.
        yield* until(page, `location.pathname + location.search === '${SKY}'`);
        // Nor does a wipe or a difference: neither has an other here.
        yield* page.goto(`${SKY}?view=diff&m=2`);
        yield* waitFor(page, '.rv-views button[data-view="all"][aria-pressed="true"]');
        yield* until(page, `location.pathname + location.search === '${SKY}'`);
        // A set of several offers its modes, and in Compare its layouts by their industry
        // names (UR-21): `v` steps the modes, `⇧V` the layouts.
        yield* page.goto(SET);
        yield* textsAre(page, '.rv-views button', ['All', 'Compare', 'Moments']);
        yield* countIs(page, '.rv-layouts', 0);
        yield* page.press('v');
        yield* waitFor(page, '.rv-views button[data-view="compare"][aria-pressed="true"]');
        yield* textsAre(page, '.rv-layouts button', ['Side by side', 'Wipe', 'Difference']);
        yield* waitFor(page, '.rv-layouts button[data-view="pair"][aria-pressed="true"]');
        yield* page.press('Shift+V');
        yield* until(page, "location.search === '?view=wipe&other=B'");
        yield* page.press('v');
        yield* waitFor(page, '.rv-views button[data-view="moments"][aria-pressed="true"]');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a wipe (PA-8) stacks the pair full width on the clock, the other right of a divider the pointer drags',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: SET });
        yield* waitFor(page, '.rv-transport');
        yield* page.click('.rv-views button[data-view="compare"]');
        yield* page.click('.rv-layouts button[data-view="wipe"]');
        yield* until(page, "location.search === '?view=wipe&other=B'");
        const stacked =
          "Array.from(document.querySelectorAll('.rv-wipe video')).map((v) => v.dataset.id).join()";
        yield* until(page, `${stacked} === 'A,B'`);
        // It plays: the transport stays, and only the pair is heard.
        yield* waitFor(page, '.rv-transport');
        yield* page.press('3');
        yield* page.press('2');
        yield* waitFor(page, '.rv-wipe-caps .rv-card[data-id="B"].rv-audible');
        const clip = "document.querySelector('.rv-wipe-other').style.clipPath";
        yield* until(page, `${clip} === 'inset(0px 0px 0px 50%)'`);
        const grip = yield* page.box('.rv-wipe-grip');
        const frame = yield* page.box('.rv-wipe');
        const y = grip.y + grip.height / 2;
        yield* page.mouse.move(grip.x + grip.width / 2, y);
        yield* page.mouse.down;
        yield* page.mouse.move(frame.x + frame.width * 0.25, y, 4);
        yield* page.mouse.up;
        yield* until(page, `${clip} === 'inset(0px 0px 0px 25%)'`);
        // The divider is this page's: the link is the same comparison.
        yield* until(page, "location.search === '?view=wipe&other=B'");
        // At a phone's width the grip is a thumb's target.
        expect(grip.width).toBeGreaterThanOrEqual(28);
        // The grip is a slider by the keyboard too: named, it says where it is; ←/→ a
        // hundredth of the frame, ⇧ ten, Home and End its edges; the set's keys stay out of it.
        yield* attributeIs(page, '.rv-wipe-grip', 'role', 'slider');
        yield* attributeIs(page, '.rv-wipe-grip', 'aria-label', 'Wipe');
        yield* attributeIs(page, '.rv-wipe-grip', 'aria-valuenow', '25');
        yield* page.pressIn('.rv-wipe-grip', 'ArrowRight');
        yield* until(page, `${clip} === 'inset(0px 0px 0px 26%)'`);
        yield* page.press('Shift+ArrowRight');
        yield* until(page, `${clip} === 'inset(0px 0px 0px 36%)'`);
        yield* page.press('ArrowLeft');
        yield* until(page, `${clip} === 'inset(0px 0px 0px 35%)'`);
        yield* attributeIs(page, '.rv-wipe-grip', 'aria-valuenow', '35');
        yield* page.press('Home');
        yield* until(page, `${clip} === 'inset(0px 0px 0px 0%)'`);
        yield* page.press('End');
        yield* until(page, `${clip} === 'inset(0px 0px 0px 100%)'`);
        yield* until(page, "location.search === '?view=wipe&other=B'");
        yield* page.click('button[data-other="C"]');
        yield* until(page, `${stacked} === 'A,C'`);
        yield* until(page, "location.search === '?view=wipe&other=C'");
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a wipe whose masters the browser can decode plays them as WebCodecs panes on the set’s clock, in place of the videos',
    () =>
      Effect.gen(function* () {
        const fixture = (name: string) => `${import.meta.dir}/../../../src/tools/fixtures/${name}`;
        const { page, errors } = yield* openReview(
          [
            route('GET', /^\/api\/review\/files\/out\/art\/roof\.A\.mp4/, () =>
              file(fixture('segment-a.mp4')),
            ),
            route('GET', /^\/api\/review\/files\/out\/art\/roof\.B\.mp4/, () =>
              file(fixture('segment-b.mp4')),
            ),
            ...routes,
          ],
          { href: `${SET}?view=wipe&other=B` },
        );
        yield* until(page, "document.querySelector('.rv-wipe').dataset.engine === 'webcodecs'");
        const panes =
          "Array.from(document.querySelectorAll('.rv-wipe canvas')).map((c) => `${c.dataset.id}:${c.width}x${c.height}`).join()";
        yield* until(page, `${panes} === 'A:64x64,B:64x64'`);
        yield* countIs(page, '.rv-wipe video', 0);
        // Shown as the videos are, whatever their picture's size: each pane the wipe's
        // full width at 16:9, the two over each other, the frame no taller than they are.
        const shown = `(() => {
          const frame = document.querySelector('.rv-wipe').getBoundingClientRect();
          return Array.from(document.querySelectorAll('.rv-wipe canvas')).map((c) => {
            const r = c.getBoundingClientRect();
            return [Math.round(r.left - frame.left), Math.round(r.top - frame.top), Math.round(r.width - frame.width), Math.round(r.height - (frame.width * 9) / 16), Math.round(frame.height - r.height)].join(' ');
          });
        })()`;
        yield* evaluates(page, shown, ['0 0 0 0 0', '0 0 0 0 0']);
        yield* page.resize(390, 844);
        yield* evaluates(page, shown, ['0 0 0 0 0', '0 0 0 0 0']);
        yield* page.resize(1400, 900);
        // The other pane is the one clipped right of the divider.
        yield* waitFor(page, '.rv-wipe-other canvas[data-id="B"]');
        // The set's clock holds the panes: it is measured from the first, and plays.
        yield* until(
          page,
          "document.querySelector('.rv-transport').innerText.includes('/ 00:00:00:15')",
        );
        yield* page.click('.rv-transport button');
        // It plays to the end (the time the header shows on a laptop, the row only its length).
        yield* until(
          page,
          "document.querySelector('.rv-transport .rv-time-at').textContent === '00:00:00:15'",
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a wipe whose masters will not open for WebCodecs plays on <video>, and says why',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: `${SET}?view=wipe&other=B` });
        const stacked =
          "Array.from(document.querySelectorAll('.rv-wipe video')).map((v) => v.dataset.id).join()";
        // The videos play while the player is asked, and stay once it is <video>.
        yield* until(page, `${stacked} === 'A,B'`);
        yield* until(page, "document.querySelector('.rv-wipe').dataset.engine === 'video'");
        yield* until(
          page,
          "document.querySelector('.rv-wipe').title.startsWith('Plays on <video>: ')",
        );
        yield* countIs(page, '.rv-wipe canvas', 0);
        yield* until(page, `${stacked} === 'A,B'`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'the difference (PA-8) lays the other’s still over the first’s at one moment, in the difference blend, and nothing plays',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, { href: SET });
        yield* waitFor(page, '.rv-transport');
        yield* page.click('.rv-views button[data-view="compare"]');
        yield* page.click('.rv-layouts button[data-view="diff"]');
        yield* until(page, "location.search === '?view=diff&other=B'");
        yield* countIs(page, '.rv-transport', 0);
        const stills =
          "Array.from(document.querySelectorAll('.rv-diff img')).map((i) => i.dataset.id + '@' + new URL(i.src).searchParams.get('t')).join()";
        yield* until(page, `${stills} === 'A@1,B@1'`);
        yield* evaluates(
          page,
          "getComputedStyle(document.querySelector('.rv-diff-other')).mixBlendMode",
          'difference',
        );
        // ←/→ step its moment, as in the moments, keeping the other.
        yield* page.press('ArrowRight');
        yield* until(page, `${stills} === 'A@5,B@5'`);
        yield* until(page, "location.search === '?view=diff&other=B&m=1'");
        yield* page.click('button[data-other="C"]');
        yield* until(page, `${stills} === 'A@5,C@5'`);
        yield* until(page, "location.search === '?view=diff&other=C&m=1'");
        // The moments keep the moment the difference was at.
        yield* page.click('.rv-views button[data-view="moments"]');
        yield* waitFor(page, 'button[data-moment="1"][aria-pressed="true"]');
        // A link opens it as it was.
        yield* page.goto(`${SET}?view=diff&other=C&m=4`);
        yield* until(page, `${stills} === 'A@19,C@19'`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "at a phone's width, a version's caps fit, its out-of-date reason and lines show in full in its Info, and a proxy still being made is said, never the original streamed",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, {
          href: SET,
          viewport: { width: 390, height: 844 },
        });
        // The caps fit, C's saying Out of date; why, and its lines, are its Info, in full.
        yield* waitFor(page, '.rv-card[data-id="C"] [data-approval="stale"]');
        yield* evaluates(
          page,
          `Array.from(document.querySelectorAll('.rv-card[data-id] .rv-cap')).every((t) => t.scrollWidth <= t.clientWidth)`,
          true,
        );
        yield* page.goto(`${SET}?inspect=C`);
        yield* waitFor(page, '[data-role="inspector"] .rv-tag[data-state="stale"]');
        yield* evaluates(
          page,
          `Array.from(document.querySelectorAll('[data-role="inspector"] :is(.rv-tag, .rv-hint)')).every((t) => t.scrollWidth <= t.clientWidth)`,
          true,
        );
        // The phone plays proxies: the sky's is not made yet, so its card says so and streams nothing.
        yield* page.goto(SKY);
        yield* waitFor(page, '.rv-card[data-id="D"] [data-proxy="pending"]');
        yield* countIs(page, '.rv-card[data-id="D"] video', 0);
        yield* textHas(page, '.rv-card[data-id="D"] [data-proxy="pending"]', 'Proxy being made');
        // Its touch path: play the original instead.
        yield* page.click('.rv-card[data-id="D"] [data-proxy="pending"] button');
        yield* attributeIs(
          page,
          '.rv-card[data-id="D"] video',
          'src',
          '/api/review/files/out/art/sky.D.mp4',
        );
        // The copy played is now the original: the menu's command offers the proxies back.
        yield* openCommandMenu(page, 'play the');
        yield* textHas(page, menuEntry('review.quality'), 'Play the proxies');
        yield* closeCommandMenu(page);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "folds to one column at a phone's width, nothing scrolling sideways",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, {
          href: SET,
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

  it.live(
    "at 900 px the review is a laptop's, its copy too: it plays the originals, as its layout shows (H-6)",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openReview(routes, {
          href: SET,
          viewport: { width: 900, height: 900 },
        });
        yield* waitFor(page, '.rv-transport');
        yield* openCommandMenu(page, 'play the');
        yield* textHas(page, menuEntry('review.quality'), 'Play the proxies');
        yield* closeCommandMenu(page);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "on a laptop a version's caption stays on the first screen: its picture's height is capped to the room under the header, the tray and the transport",
    () =>
      Effect.gen(function* () {
        // A set of one version: its picture takes the page's whole width.
        const lone: Json = {
          folders: [
            {
              ref: 'out/one',
              mtime: 0,
              sets: [
                {
                  id: 'render:one',
                  kind: 'render',
                  title: 'One',
                  lines: [],
                  start: 0,
                  marks: [],
                  variants: [variant('A', 'Only')],
                },
              ],
              videos: [],
              images: [],
              docs: [],
            },
          ],
        };
        const { page, errors } = yield* openReview(
          [route('GET', /^\/api\/review\/index/, () => json(lone)), ...routes],
          { href: pageHref.set('out/one', 'render:one'), viewport: { width: 1440, height: 900 } },
        );
        yield* waitFor(page, '.rv-card[data-id="A"] video');
        yield* evaluates(
          page,
          'document.querySelector(\'.rv-card[data-id="A"] .rv-cap\').getBoundingClientRect().bottom <= innerHeight',
          true,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'on a laptop a wipe and a difference keep their whole picture on the first screen: no taller than the room, and still 16:9',
    () =>
      Effect.gen(function* () {
        // Whether `frame` is 16:9 and ends on the first screen, then its height and end.
        const fits = (frame: string) => `(() => {
          const r = document.querySelector('${frame}').getBoundingClientRect();
          return [Math.round(r.height - (r.width * 9) / 16) === 0, r.bottom <= innerHeight, Math.round(r.height), Math.round(r.bottom), innerHeight].join(' ');
        })()`;
        const { page, errors } = yield* openReview(routes, {
          href: `${SET}?view=wipe&other=B`,
          viewport: { width: 1440, height: 900 },
        });
        yield* countIs(page, '[data-role="inspector"]', 0);
        yield* waitFor(page, '.rv-wipe video');
        yield* until(page, `${fits('.rv-wipe')}.startsWith('true true ')`);
        // Each picture fills the frame, as it does at any width.
        yield* evaluates(
          page,
          "Array.from(document.querySelectorAll('.rv-wipe video')).map((v) => Math.round(v.getBoundingClientRect().height - document.querySelector('.rv-wipe').getBoundingClientRect().height))",
          [0, 0],
        );
        yield* page.goto(`${SET}?view=diff&other=B`);
        yield* waitFor(page, '.rv-diff img.rv-diff-first');
        yield* countIs(page, '[data-role="inspector"]', 0);
        yield* until(page, `${fits('.rv-diff')}.startsWith('true true ')`);
        yield* evaluates(
          page,
          "Array.from(document.querySelectorAll('.rv-diff img')).map((v) => Math.round(v.getBoundingClientRect().height - document.querySelector('.rv-diff').getBoundingClientRect().height))",
          [0, 0],
        );
        expect(errors).toEqual([]);
        // A wipe on WebCodecs panes: its canvases are held to the same room.
        const fixture = (name: string) => `${import.meta.dir}/../../../src/tools/fixtures/${name}`;
        const panes = yield* openReview(
          [
            route('GET', /^\/api\/review\/files\/out\/art\/roof\.A\.mp4/, () =>
              file(fixture('segment-a.mp4')),
            ),
            route('GET', /^\/api\/review\/files\/out\/art\/roof\.B\.mp4/, () =>
              file(fixture('segment-b.mp4')),
            ),
            ...routes,
          ],
          { href: `${SET}?view=wipe&other=B`, viewport: { width: 1440, height: 900 } },
        );
        yield* until(
          panes.page,
          "document.querySelector('.rv-wipe').dataset.engine === 'webcodecs'",
        );
        yield* waitFor(panes.page, '.rv-wipe canvas');
        yield* until(panes.page, `${fits('.rv-wipe')}.startsWith('true true ')`);
        yield* evaluates(
          panes.page,
          "Array.from(document.querySelectorAll('.rv-wipe canvas')).map((v) => Math.round(v.getBoundingClientRect().height - document.querySelector('.rv-wipe').getBoundingClientRect().height))",
          [0, 0],
        );
        expect(panes.errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a version's inspector holds its Info, its approve and its comments, said over the set's route",
    () =>
      Effect.gen(function* () {
        // The roof's set belongs to a film address: its versions take a say.
        const said = { approved: false, comments: new Array<string>() };
        const at = { _tag: 'Scenes', ids: ['roof'] };
        const folder = (): Json => ({
          ref: 'out/art',
          title: 'Roofs at dusk',
          mtime: 0,
          sets: [
            {
              id: 'render:roof',
              kind: 'render',
              title: 'The roof',
              lines: [],
              start: 0,
              marks: [],
              address: at,
              variants: [
                variant('A', 'Warm'),
                variant('B', 'Cold', {
                  approval: ['none', 'approved'][Number(said.approved)] ?? 'none',
                  comments: said.comments.map((text, i) => ({
                    id: `c${i + 1}`,
                    address: at,
                    point: 'render:roof',
                    variant: 'B',
                    key: 'out/art/roof.B.mp4',
                    text,
                    at: i,
                    onThis: true,
                  })),
                }),
              ],
            },
          ],
          videos: [],
          images: [],
          docs: [],
        });
        const asked = new Array<SetSayPost>();
        const sayRoutes: ReadonlyArray<FakeRoute> = [
          route('GET', /^\/api\/review\/index/, () => json({ folders: [folder()] })),
          route('POST', /^\/api\/review\/sets\/out%2Fart\/render%3Aroof\/say$/, (a) => {
            Option.map(Option.flatMap(a.body, Schema.decodeUnknownOption(SetSayPost)), (post) => {
              asked.push(post);
              Match.value(post.say).pipe(
                Match.tagsExhaustive({
                  Approve: () => {
                    said.approved = true;
                  },
                  Withdraw: () => {
                    said.approved = false;
                  },
                  Comment: (c) => {
                    said.comments.push(c.text);
                  },
                }),
              );
            });
            return json(folder());
          }),
          ...routes.slice(1),
        ];
        const { page, errors } = yield* openReview(sayRoutes, { href: SET });
        yield* waitFor(page, '.rv-transport');
        const inspector = '[data-role="inspector"]';
        // Nothing of it is at rest: no comment count while none is said, no inspector.
        yield* countIs(page, '.lab-count', 0);
        yield* countIs(page, inspector, 0);
        // A tap on the version's name opens its inspector: its Info, its approve, its comment box.
        yield* page.click('.rv-card[data-id="B"] [data-act="inspect"]');
        yield* waitFor(page, inspector);
        yield* textHas(page, `${inspector} .lab-sheet-title`, '2 · Cold');
        yield* textHas(page, inspector, 'Cold look');
        yield* textHas(page, inspector, 'out/art/roof.B.mp4');
        yield* page.click(`${inspector} [data-act="approve"]`);
        yield* waitFor(page, `${inspector} [data-act="approve"][data-approval="approved"]`);
        expect(asked[0]).toMatchObject({ variant: 'B', say: { _tag: 'Approve' } });
        yield* page.fill(`${inspector} .rv-comment-input`, 'colder at the edge');
        yield* page.click(`${inspector} [data-act="comment"]`);
        yield* waitFor(page, `${inspector} [data-comment="c1"]`);
        // The comment counts on the card, and the page never read the index again: it stays in place.
        yield* textIs(page, '.rv-card[data-id="B"] .lab-count', '1');
        yield* page.click(`${inspector} [data-act="unapprove"]`);
        yield* waitFor(page, `${inspector} [data-act="approve"][data-approval="none"]`);
        // Escape closes it; `i` on a focused version opens it again, `m` at its comment box.
        yield* page.press('Escape');
        yield* countIs(page, inspector, 0);
        yield* page.focus('.rv-card[data-id="A"] .rv-sound');
        yield* page.press('i');
        yield* textHas(page, `${inspector} .lab-sheet-title`, '1 · Warm');
        yield* page.press('Escape');
        yield* page.focus('.rv-card[data-id="B"] .rv-sound');
        yield* page.press('m');
        yield* until(
          page,
          `document.activeElement?.classList.contains('rv-comment-input') === true`,
        );
        // `a` approves the focused version, as its button does.
        yield* page.press('Escape');
        yield* page.focus('.rv-card[data-id="B"] .rv-sound');
        yield* page.press('a');
        yield* page.press('i');
        yield* waitFor(page, `${inspector} [data-act="approve"][data-approval="approved"]`);
        expect(asked.map((p) => p.say._tag)).toEqual(['Approve', 'Comment', 'Withdraw', 'Approve']);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
