// A film's studio (`/films/<film>/studio`) over the probe film, on a laptop
// (1440 × 900) and on a phone (390 × 844): it opens on the open version's
// timeline with the drawn scene in the viewer; Space, K and L play and pause
// it, and a beat key steps the playhead; a drag along the ruler holds play
// while it scrubs and plays on once it lets go; a beat chosen on the script outlines every clip of that
// beat, opens the inspector and names it in the address; the zoom steps in
// and Fit (⇧Z) fits the film again, the playhead held where it was on
// screen; another version reads its own timeline;
// the flag strip flags the open ask; the inspector's Words, Board and Notes
// rows link to the beat on the pages that still hold it, on the version
// kept in the film's own files alone. A phone keeps three lanes. Its touch
// targets are measured with every place's (`touch-targets.dom.test.ts`, the
// studio's states in `studio-states.ts`); the replaced pages' redirects are
// the lab server's (`servedPlace`, `tools/lab-page.test.ts`).

import { Boolean as Bool, Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { FilmVersionUnkept } from '../../src/core/refusals.ts';
import type { FilmTimeline } from '../../src/core/timeline-schema.ts';
import {
  DESK,
  PHONE,
  type Viewport,
  json,
  openPlayer,
  refused,
  route,
  text,
} from '../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../src/lab/fixtures/probe-film.ts';
import { PROBE_ASK, probeTimeline } from '../../src/lab/fixtures/probe-timeline.ts';
import {
  attributeIs,
  countIs,
  evaluates,
  textIs,
  until,
  waitFor,
} from '../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;

/** The studio's first clip drawn: the timeline is read and laid out. */
const READY = '.st-timeline .st-clip';

const PLAY = '.st-key[data-act="play.toggle"]';

/** The studio at `href` in a window `viewport` wide, its timeline drawn. */
const studioAt = (viewport: Viewport, href = pageHref.studio(PROBE)) =>
  openPlayer({ href, viewport }, READY);

const SIZES = [
  { name: 'a laptop', viewport: DESK, lanes: 4 },
  { name: 'a phone', viewport: PHONE, lanes: 3 },
] as const;

for (const size of SIZES) {
  describe(`the studio on ${size.name}`, () => {
    it.live(
      'opens on the open version: its lanes, the drawn scene in the viewer, the flagged ask and the clock at its start',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(size.viewport);
          yield* countIs(page, '.st-lanes .st-lane:not(.st-next)', size.lanes);
          yield* attributeIs(page, '.st-frame', 'data-picture', 'Scene');
          yield* countIs(page, `.st-flag[data-kind="ask"][data-id="${PROBE_ASK}"]`, 1);
          yield* textIs(page, '.st-ver', /v2/);
          yield* textIs(page, '.st-tc', /^0:00\.0/);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      'plays and pauses on Space, K and L, the play key pressed while it plays; a beat key steps the playhead',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(size.viewport);
          yield* attributeIs(page, PLAY, 'aria-pressed', 'false');
          yield* page.press('Space');
          yield* attributeIs(page, PLAY, 'aria-pressed', 'true');
          yield* page.press('k');
          yield* attributeIs(page, PLAY, 'aria-pressed', 'false');
          yield* page.press('l');
          yield* attributeIs(page, PLAY, 'aria-pressed', 'true');
          yield* page.press('Space');
          yield* attributeIs(page, PLAY, 'aria-pressed', 'false');
          yield* page.press('Home');
          yield* textIs(page, '.st-tc', /^0:00\.0/);
          yield* page.click('.st-key[data-act="studio.on"]');
          yield* textIs(page, '.st-tc', /^0:04\.7/);
          yield* page.press('ArrowDown');
          yield* textIs(page, '.st-tc', /^0:08\.2/);
          yield* page.press('j');
          yield* textIs(page, '.st-tc', /^0:04\.7/);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      'scrubs along the ruler: play held while it drags, and on again from where it let go',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(size.viewport);
          const ruler = yield* page.box('.st-ruler');
          const y = ruler.y + ruler.height / 2;
          yield* page.press('Space');
          yield* attributeIs(page, PLAY, 'aria-pressed', 'true');
          yield* page.mouse.move(ruler.x + 8, y);
          yield* page.mouse.down;
          yield* page.mouse.move(ruler.x + Math.min(ruler.width - 8, 200), y, 6);
          yield* attributeIs(page, PLAY, 'aria-pressed', 'false');
          yield* page.mouse.up;
          yield* attributeIs(page, PLAY, 'aria-pressed', 'true');
          yield* page.press('k');
          yield* until(page, `!document.querySelector('.st-tc').textContent.startsWith('0:00.0')`);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      'selects a beat from its script clip: every clip of the beat outlined, the inspector open, the beat in the address; Escape lets it go',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(size.viewport);
          yield* page.click('.st-clip[data-kind="script"][data-beat="two"]');
          yield* countIs(page, '.st-clip[data-beat="two"][data-linked="true"]', size.lanes);
          yield* countIs(page, '.st-clip[data-linked="true"]:not([data-beat="two"])', 0);
          yield* attributeIs(
            page,
            '.st-clip[data-kind="script"][data-beat="two"]',
            'aria-pressed',
            'true',
          );
          yield* waitFor(page, '.st-pane[data-beat="two"]');
          yield* textIs(page, '.st-tc', /^0:04\.7/);
          expect(yield* page.url).toContain('sel=beat%3Atwo');
          yield* page.press('Escape');
          yield* countIs(page, '.st-pane', 0);
          yield* countIs(page, '.st-clip[data-linked="true"]', 0);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      "opens on the beat its address selects, at the beat's start",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { sel: 'beat:three' }),
          );
          yield* waitFor(page, '.st-pane[data-beat="three"]');
          // With no `#t=`, it opens at the beat's start.
          yield* textIs(page, '.st-tc', /^0:08\.2/);
          yield* countIs(page, '.st-clip[data-beat="three"][data-linked="true"]', size.lanes);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      "links the inspector's Words, Board and Notes rows to the beat on the Script, the Board and the Lab, at the playhead in the beat's time",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { sel: 'beat:two' }, Option.some(6)),
          );
          yield* waitFor(page, '.st-pane[data-beat="two"]');
          const row = (section: string) => `.st-pane a.st-row[data-section="${section}"]`;
          yield* attributeIs(page, row('Words'), 'href', /^\/films\/probe\/script\/two#t=1\.\d+$/);
          yield* attributeIs(page, row('Board'), 'href', /^\/films\/probe\/board\/two#t=1\.\d+$/);
          yield* attributeIs(
            page,
            row('Notes and asks'),
            'href',
            /^\/films\/probe\/lab\/two#t=1\.\d+$/,
          );
          // The rows whose bodies the studio holds link nowhere yet.
          yield* countIs(page, '.st-pane a.st-row', 3);
          // At the beat's start, a beat page opens at its own start.
          yield* page.press('Home');
          yield* page.click('.st-clip[data-kind="script"][data-beat="two"]');
          yield* attributeIs(page, row('Words'), 'href', '/films/probe/script/two#t=0');
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      'links no row on a version kept in its own folder, which the Script, the Board and the Lab cannot show',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { v: 1, sel: 'beat:two' }, Option.some(6)),
          );
          yield* waitFor(page, '.st-pane[data-beat="two"]');
          yield* countIs(page, '.st-pane .st-row[data-section="Words"]', 1);
          yield* countIs(page, '.st-pane a.st-row', 0);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      'opens another version from the version menu: its own timeline, its Board in the viewer, the version in the address',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(size.viewport);
          yield* page.click('[data-act="version"]');
          yield* page.click('[data-role="versions"] [data-version="1"]');
          yield* textIs(page, '.st-ver', /v1/);
          yield* attributeIs(page, '.st-frame', 'data-picture', 'Board');
          yield* countIs(page, '.st-lane[data-track="scenes"]', 0);
          expect(yield* page.url).toMatch(/[?&]v=1(&|#|$)/);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  });
}

// The zoom's corner is the laptop's: a phone opens at a zoom a beat reads at.
describe('the zoom on a laptop', () => {
  it.live(
    'zooms in a step, and Fit (⇧Z) fits the film in the timeline again',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK);
        const WIDER = `document.querySelector('.st-canvas').offsetWidth > document.querySelector('.st-scroller').clientWidth + 1`;
        yield* page.click('[data-act="fit"]');
        yield* attributeIs(page, '[data-act="fit"]', 'aria-pressed', 'true');
        yield* until(page, `!(${WIDER})`);
        yield* page.click('[data-act="zoom-in"]');
        yield* attributeIs(page, '[data-act="fit"]', 'aria-pressed', 'false');
        yield* until(page, WIDER);
        yield* page.press('Shift+Z');
        yield* attributeIs(page, '[data-act="fit"]', 'aria-pressed', 'true');
        yield* until(page, `!(${WIDER})`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('a zoom step on a laptop', () => {
  it.live(
    'keeps the playhead where it was on screen, in and out',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK, `${pageHref.studio(PROBE)}#t=9`);
        yield* textIs(page, '.st-tc', /^0:09\.0/);
        const AT = `document.querySelector('.st-playhead').getBoundingClientRect().left`;
        yield* until(page, `(window.__studioPlayheadX = ${AT}) > 0`);
        const HELD = `Math.abs(${AT} - window.__studioPlayheadX) <= 1`;
        for (const step of ['zoom-in', 'zoom-in', 'zoom-out', 'zoom-in', 'zoom-out', 'zoom-out']) {
          const WIDTH = `document.querySelector('.st-canvas').offsetWidth`;
          yield* until(page, `(window.__studioCanvasW = ${WIDTH}) > 0`);
          yield* page.click(`[data-act="${step}"]`);
          yield* until(page, `${WIDTH} !== window.__studioCanvasW`);
          yield* until(page, HELD);
        }
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('the way home', () => {
  // The pointer's target: a thumb's on a phone, the fine pointer's on a laptop (`--hit`).
  const HIT = { 'a laptop': 28, 'a phone': 44 } as const;
  for (const size of SIZES)
    it.live(
      `on ${size.name}, is Films in the header, a target the pointer meets, and ⇧1 goes there`,
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* studioAt(size.viewport);
          const FILMS = '.st-header a[data-page="films"]';
          yield* attributeIs(page, FILMS, 'href', '/');
          yield* attributeIs(page, FILMS, 'aria-label', 'Films');
          yield* until(
            page,
            `document.querySelector('${FILMS}').getBoundingClientRect().width >= ${HIT[size.name]} && document.querySelector('${FILMS}').getBoundingClientRect().height >= ${HIT[size.name]}`,
          );
          yield* page.press('Control+k');
          yield* countIs(page, '[data-role="command-menu"] [data-command="page.films"]', 1);
          yield* page.press('Escape');
          yield* countIs(page, '[data-role="command-menu"]', 0);
          yield* page.press('Shift+1');
          yield* until(page, `location.pathname === '/'`);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
});

describe("the studio's command menu", () => {
  it.live(
    "lists the studio's transport, and none of the preview's beside it",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK);
        const MENU = '[data-role="command-menu"]';
        yield* page.press('Control+k');
        yield* waitFor(page, `${MENU} [data-command="studio.on"]`);
        for (const id of ['play.scene-next', 'play.scene-previous', 'view.captions'])
          yield* countIs(page, `${MENU} [data-command="${id}"]`, 0);
        yield* countIs(page, `${MENU} [data-command="play.toggle"]`, 1);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('what waits, on a phone', () => {
  it.live(
    'is a line a thumb can tap, naming the first thing, that opens the list',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(PHONE);
        const WAITS = '.st-reading [data-act="waits"]';
        yield* textIs(page, WAITS, '1 waits on you · Ask: Which opening?');
        yield* until(
          page,
          `document.querySelector('${WAITS}').getBoundingClientRect().height >= 44`,
        );
        yield* page.click(WAITS);
        yield* waitFor(page, '[data-role="waits"] .lab-context-item');
        yield* textIs(page, '[data-role="waits"] .lab-context-item', 'Ask: Which opening?');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('the version menu', () => {
  const MENU = '[data-role="versions"]';
  /** The open v2's timeline, v1 replaced in place: nothing kept to show. */
  const replaced: FilmTimeline = {
    ...probeTimeline(2),
    versions: probeTimeline(2).versions.map((version) =>
      Object.assign({}, version, version.n === 1 && { files: 'none' as const }),
    ),
  };
  /** The studio at `href`, its timeline route answering v1 with `v1` and any other with the open v2, once `ready` shows. */
  const studioWith = (
    v1: Parameters<typeof route>[2],
    href = pageHref.studio(PROBE),
    ready = READY,
  ) =>
    openPlayer({ href, viewport: DESK }, ready, [
      route('GET', /^\/timeline(\?|$)/, (asked) =>
        Bool.match(/[?&]v=1(&|$)/.test(asked.path), {
          onTrue: () => v1(asked),
          onFalse: () => json(probeTimeline(2)),
        }),
      ),
    ]);

  it.live(
    'lists a version replaced in place, and does not offer it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.studio(PROBE), viewport: DESK },
          READY,
          [route('GET', /^\/timeline(\?|$)/, () => json(replaced))],
        );
        yield* page.click('[data-act="version"]');
        yield* waitFor(page, `${MENU} [role="menuitemradio"][data-version="2"]`);
        yield* countIs(page, `${MENU} [role="menuitemradio"][data-version="1"]`, 0);
        yield* attributeIs(page, `${MENU} [data-version="1"]`, 'aria-disabled', 'true');
        yield* textIs(
          page,
          `${MENU} [data-version="1"] .st-version-note`,
          'replaced in place: nothing kept to show',
        );
        yield* page.click(`${MENU} [data-version="1"]`);
        yield* textIs(page, '.st-ver', /v2/);
        expect(yield* page.url).not.toMatch(/[?&]v=1(&|#|$)/);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "lines every row's number and title up, the check mark at the row's end",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.studio(PROBE), viewport: DESK },
          READY,
          [route('GET', /^\/timeline(\?|$)/, () => json(replaced))],
        );
        yield* page.click('[data-act="version"]');
        yield* waitFor(page, `${MENU} [data-version="2"] .lab-context-check`);
        const lefts = (part: string) =>
          `new Set([...document.querySelectorAll('${MENU} .st-version ${part}')].map((el) => Math.round(el.getBoundingClientRect().left))).size`;
        yield* evaluates(page, lefts('.st-version-n'), 1);
        yield* evaluates(page, lefts('.st-version-text'), 1);
        const ROW = `document.querySelector('${MENU} [data-version="2"]').getBoundingClientRect()`;
        const CHECK = `document.querySelector('${MENU} [data-version="2"] .lab-context-check').getBoundingClientRect()`;
        yield* until(page, `${ROW}.right - ${CHECK}.right < 16`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'keeps the chip while a version cannot be read, offers no retry of a refusal, and opens another',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioWith(() =>
          refused(FilmVersionUnkept.make({ film: PROBE, version: 1, kept: [2] })),
        );
        yield* page.click('[data-act="version"]');
        yield* page.click(`${MENU} [data-version="1"]`);
        yield* textIs(page, '.st-status-line p', /could not be read/);
        yield* textIs(page, '.st-ver', /v1/);
        yield* countIs(page, '[data-act="retry"]', 0);
        yield* countIs(page, '[data-act="open-version"]', 1);
        yield* page.click('[data-act="version"]');
        yield* page.click(`${MENU} [data-version="2"]`);
        yield* waitFor(page, READY);
        yield* textIs(page, '.st-ver', /v2/);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'offers a retry when the lab did not answer, and the open version from an address that cannot be read',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioWith(
          () => text('the lab is away', 502),
          pageHref.studio(PROBE, { v: 1 }),
          '.st-status-line [data-act="retry"]',
        );
        yield* textIs(page, '.st-status-line p', /could not be read/);
        yield* page.click('[data-act="open-version"]');
        yield* waitFor(page, READY);
        yield* textIs(page, '.st-ver', /v2/);
        expect(yield* page.url).not.toMatch(/[?&]v=1(&|#|$)/);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('the studio at a version its address names', () => {
  it.live(
    'opens on that version',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK, pageHref.studio(PROBE, { v: 1 }));
        yield* textIs(page, '.st-ver', /v1/);
        yield* attributeIs(page, '.st-frame', 'data-picture', 'Board');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

/** A 14-inch laptop's window at its default size, where the viewer is clamped by its width with the inspector open. */
const LAPTOP_14 = { width: 1512, height: 982 } as const;

/**
 * The viewer's frame against 16:9, within half a percent: `true`, else its
 * size; how a Board panel in it is fitted (`none` with no panel shown); and
 * the drawn scene's canvas against 16:9 the same way (`none` with no scene).
 */
const FRAME = `(() => {
  const ratio = (el) => {
    if (el === null || el.offsetParent === null) return 'none';
    const r = el.getBoundingClientRect();
    return Math.abs(r.width / r.height / (16 / 9) - 1) <= 0.005 || r.width.toFixed(1) + '×' + r.height.toFixed(1);
  };
  const pic = document.querySelector('.st-frame .st-pic');
  return [ratio(document.querySelector('.st-frame')), (pic && getComputedStyle(pic).objectFit) || 'none', ratio(document.querySelector('.st-scene canvas'))];
})()`;

// The picture is the film's 16:9 at any window, the inspector open or shut, with few lanes (v1:
// a tall viewer, bound by its width) or more (v2): a scene is never squashed, a Board panel never cropped.
describe("the viewer's frame", () => {
  const WINDOWS = [
    ['a laptop', DESK],
    ['a 14-inch laptop', LAPTOP_14],
    ['a phone', PHONE],
  ] as const;
  const VERSIONS = [
    [1, 'its Board panel', ['contain', 'none']],
    [2, 'its drawn scene', ['none', true]],
  ] as const;
  for (const [where, viewport] of WINDOWS)
    for (const [v, shows, [pic, scene]] of VERSIONS)
      it.live(
        `is 16:9 on ${where} at v${v}, ${shows} uncropped, the inspector open and shut`,
        () =>
          Effect.gen(function* () {
            const { page, errors } = yield* studioAt(
              viewport,
              pageHref.studio(PROBE, { v, sel: 'beat:two' }),
            );
            yield* waitFor(page, '.st-pane[data-beat="two"]');
            yield* evaluates(page, FRAME, [true, pic, scene]);
            yield* page.press('Escape');
            yield* countIs(page, '.st-pane', 0);
            yield* evaluates(page, FRAME, [true, pic, scene]);
            expect(errors).toEqual([]);
          }).pipe(Effect.scoped),
        SLOW,
      );
});

// A Board card is a picture made: the viewer shows it as the Board does, never "No picture yet".
describe('a Board card at the playhead', () => {
  it.live(
    "shows its words on the card's paper, its payoff large, on a version the staged film is not",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(
          DESK,
          pageHref.studio(PROBE, { v: 1 }, Option.some(3)),
        );
        yield* attributeIs(page, '.st-frame', 'data-picture', 'Card');
        yield* textIs(page, '.st-card', 'falls down again.');
        yield* textIs(page, '.st-card b', 'down');
        yield* textIs(page, '.st-tag', 'Board · one · card');
        yield* countIs(page, '.st-empty', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'is set by the engine on the version the staged film is, and the tag says why when it cannot be',
    () =>
      Effect.gen(function* () {
        // The open version with no scene drawn over the card: the staged probe film sets it, and
        // the probe declares no card style.
        const undrawn = {
          ...probeTimeline(2),
          lanes: probeTimeline(2).lanes.filter((lane) => lane.track !== 'scenes'),
        };
        const { page, errors } = yield* openPlayer(
          { href: pageHref.studio(PROBE, {}, Option.some(3)), viewport: DESK },
          READY,
          [route('GET', /^\/timeline(\?|$)/, () => json(undrawn))],
        );
        yield* attributeIs(page, '.st-frame', 'data-picture', 'Card');
        yield* textIs(page, '.st-tag', /^Board · one · card · not set: .*card style/);
        yield* textIs(page, '.st-card', 'falls down again.');
        yield* countIs(page, '.st-empty', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
