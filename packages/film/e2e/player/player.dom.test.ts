// The player in a browser: the real player page over the probe film, on a
// phone's window and a desk's, each in the studio's shell. Neither the play
// page nor the Scenes' tape scrolls sideways; the play page keeps its film
// time as `#t=`, and its legend is hidden until `?` or the bar's ? button.
// The Scenes are the film's tape: a tap selects its scene (the path) and
// moves the playhead there (`#t=`), Back deselects, the scene's card opens
// its lab, a phone's card is a sheet, and ⇧-click and ⇧A approve a batch.
// The tape bar's scene names never overlap, and where a scene has room its
// name reads whole.

import { Boolean as Bool, Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../src/core/api.ts';
import { timecode } from '../../src/core/time.ts';
import {
  type FakeRoute,
  type Json,
  json,
  openPlayer,
  route,
} from '../../src/lab/fixtures/harness.ts';
import { CROWD } from '../../src/lab/fixtures/crowd-film.ts';
import { MENU_ITEMS, touch } from '../../src/lab/fixtures/gestures.ts';
import { PROBE, probeFilm } from '../../src/lab/fixtures/probe-film.ts';
import {
  attributeIs,
  countIs,
  evaluates,
  labelsClash,
  labelsInFull,
  labelsOverMarks,
  textHas,
  textIs,
} from '../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';

const PHONE = { width: 390, height: 844 };
const DESK = { width: 1440, height: 900 };

/** Where the probe film's second and third scenes start, in film seconds. */
const TWO = probeFilm().placed[1]?.start ?? Number.NaN;
const THREE = probeFilm().placed[2]?.start ?? Number.NaN;

/** Whether the page is no wider than its window. */
const NO_SIDEWAYS = 'document.documentElement.scrollWidth <= document.documentElement.clientWidth';

/** A still of the tape, drawn. */
const STILL_DRAWN = '.sc-still[data-drawn="true"] canvas';

/** The tape's point just past `scene`'s cut, on its line: inside the scene. */
const pointInScene = (page: Tab, scene: string) =>
  Effect.map(
    Effect.all([page.box(`.sc-cut[data-scene="${scene}"]`), page.box('.sc-stills')]),
    ([cut, stills]) => ({ x: cut.x + 6, y: stills.y + stills.height / 2 }),
  );

/** Click the tape inside `scene`. */
const clickInScene = (page: Tab, scene: string) =>
  Effect.flatMap(pointInScene(page, scene), (p) => page.mouse.click(p.x, p.y));

/** ⇧-click the tape inside `scene`: added to the selection (the tab's mouse holds no keys). */
const shiftClickInScene = (page: Tab, scene: string) =>
  Effect.flatMap(pointInScene(page, scene), (p) =>
    page.evaluate(
      `document.elementFromPoint(${p.x}, ${p.y}).dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: ${p.x}, clientY: ${p.y}, shiftKey: true }))`,
    ),
  );

/**
 * The probe film's project: each scene rendered as it stands, approved when
 * `approved` holds it; an approve's answer says what it `gave`, an Undo's
 * what it `took`.
 */
const projectOf = (
  approved: ReadonlyMap<string, string>,
  answer: { readonly gave?: Json; readonly took?: Json } = {},
) => ({
  project: {
    film: PROBE,
    variant: 'main',
    key: 'fk',
    ...answer,
    comments: [],
    acts: [{ name: 'opening', scenes: ['one', 'two', 'three'], key: 'ak', comments: [] }],
    scenes: ['one', 'two', 'three'].map((scene) => ({
      scene,
      key: 'k',
      state: 'current',
      approval: Bool.match(approved.has(scene), {
        onTrue: () => 'approved',
        onFalse: () => 'none',
      }),
      comments: [],
    })),
  },
  videos: {},
});

/** What a project say names: its scenes, and what it says (a withdraw `given` an approve's op). */
const SaidOf = Schema.decodeUnknownSync(
  Schema.Struct({
    address: Schema.Struct({ ids: Schema.Array(Schema.String) }),
    say: Schema.Struct({ _tag: Schema.String, given: Schema.optionalKey(Schema.String) }),
  }),
);

/**
 * The project's routes: a read; an approve, a run of its own (its op), that
 * approves the scenes it names not approved already and says it gave them;
 * a withdraw given an op that takes just that run's approvals.
 */
const projectRoutes = (): ReadonlyArray<FakeRoute> => {
  // Each approved scene, by the op of the run that approved it.
  const approved = new Map<string, string>();
  let runs = 0;
  return [
    route('GET', /^\/project$/, () => json(projectOf(approved))),
    route('POST', /^\/project\/say$/, (asked) => {
      const said = SaidOf(Option.getOrElse(asked.body, () => ({})));
      if (said.say._tag === 'Withdraw') {
        const took = said.address.ids.filter((s) => approved.get(s) === said.say.given);
        took.forEach((s) => approved.delete(s));
        return json(projectOf(approved, { took: { op: said.say.given ?? '', scenes: took } }));
      }
      runs += 1;
      const op = `op-${runs}`;
      const made = said.address.ids.filter((s) => !approved.has(s));
      made.forEach((s) => approved.set(s, op));
      return json(projectOf(approved, { gave: { op, at: 0, scenes: made } }));
    }),
  ];
};

describe('the player', () => {
  for (const [label, viewport] of [
    ['a phone', PHONE],
    ['a desk', DESK],
  ] as const) {
    it.live(`the play page does not scroll sideways on ${label}`, () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.play(PROBE), viewport },
          '.bar .tc',
        );
        yield* evaluates(page, NO_SIDEWAYS, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    );

    it.live(`the Scenes' tape does not scroll sideways on ${label}, a scene selected or not`, () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.scenes(PROBE), viewport },
          STILL_DRAWN,
        );
        yield* evaluates(page, NO_SIDEWAYS, true);
        yield* clickInScene(page, 'two');
        yield* page.waitFor('.sc-focus');
        yield* evaluates(page, NO_SIDEWAYS, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    );

    it.live(`on ${label} the Scenes show the picture only in a selected scene's panel`, () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.scenes(PROBE), viewport },
          STILL_DRAWN,
        );
        // Nothing selected: the tape takes the page, no picture above it.
        yield* evaluates(page, "document.querySelector('.stage').checkVisibility()", false);
        yield* clickInScene(page, 'two');
        yield* page.waitFor('.sc-focus');
        yield* evaluates(
          page,
          "document.querySelector('.sc-focus .stage')?.checkVisibility() === true",
          true,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    );
  }

  it.live(
    "on a phone the tape bar's scene names never run into each other: a name too long shortens or drops",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openPlayer(
          { href: pageHref.play(CROWD), viewport: PHONE },
          '.bar .track .seg',
        );
        yield* evaluates(page, "document.querySelectorAll('.bar .track .seg').length", 14);
        yield* evaluates(page, labelsClash('.bar .track .seg span', '.seg'), []);
        // A wide window has room to name each scene more fully, and still none
        // overlaps: some names are shown and read whole, so the row was not
        // emptied to pass.
        yield* page.resize(DESK.width, DESK.height);
        yield* evaluates(page, labelsClash('.bar .track .seg span', '.seg'), []);
        yield* evaluates(page, `${labelsInFull('.bar .track .seg span')} > 0`, true);
      }).pipe(Effect.scoped),
  );

  it.live(
    "on a phone the tape's cut names never run into each other or off their line: a name too long shortens or drops",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openPlayer(
          { href: pageHref.scenes(CROWD), viewport: PHONE },
          STILL_DRAWN,
        );
        yield* evaluates(page, "document.querySelectorAll('.sc-cut').length", 14);
        yield* evaluates(page, labelsClash('.sc-cut-name', '.sc-line-body'), []);
        yield* evaluates(page, `${labelsInFull('.sc-cut-name')} > 0`, true);
        yield* page.resize(DESK.width, DESK.height);
        yield* evaluates(page, labelsClash('.sc-cut-name', '.sc-line-body'), []);
        yield* evaluates(page, `${labelsInFull('.sc-cut-name')} > 0`, true);
      }).pipe(Effect.scoped),
  );

  it.live(
    "the Scenes' tape bar names its scenes in a lane above its ticks: no name runs over a mark, a cue, a sound or an act",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openPlayer(
          { href: pageHref.scenes(CROWD), viewport: DESK },
          STILL_DRAWN,
        );
        const ticks = '.sc-track .track .tick';
        // The crowd film's tape bar has a mark under its opening's name to run over.
        yield* evaluates(page, `document.querySelectorAll('${ticks}').length > 0`, true);
        yield* evaluates(page, `${labelsInFull('.sc-track .track .seg span')} > 0`, true);
        yield* evaluates(page, labelsOverMarks('.sc-track .track .seg span', ticks), []);
        yield* page.resize(PHONE.width, PHONE.height);
        yield* evaluates(page, labelsOverMarks('.sc-track .track .seg span', ticks), []);
      }).pipe(Effect.scoped),
  );

  it.live('on a phone a film with room in each scene names every scene in full', () =>
    Effect.gen(function* () {
      const { page } = yield* openPlayer(
        { href: pageHref.play(PROBE), viewport: PHONE },
        '.bar .track .seg',
      );
      const scenes = probeFilm().placed.length;
      yield* evaluates(page, "document.querySelectorAll('.bar .track .seg').length", scenes);
      yield* evaluates(page, labelsClash('.bar .track .seg span', '.seg'), []);
      yield* evaluates(page, labelsInFull('.bar .track .seg span'), scenes);
    }).pipe(Effect.scoped),
  );

  it.live('a drag along the tape scrubs away from the playhead and turns Follow off', () =>
    Effect.gen(function* () {
      const { page, errors } = yield* openPlayer(
        { href: pageHref.scenes(PROBE), viewport: DESK },
        STILL_DRAWN,
      );
      yield* attributeIs(page, '[data-act="follow"]', 'aria-pressed', 'true');
      const p = yield* pointInScene(page, 'two');
      yield* page.mouse.move(p.x, p.y);
      yield* page.mouse.down;
      yield* page.mouse.move(p.x + 40, p.y, 4);
      yield* page.mouse.up;
      yield* attributeIs(page, '[data-act="follow"]', 'aria-pressed', 'false');
      // Followed again, a press on the tape bar's track scrubs away too.
      yield* page.click('[data-act="follow"]');
      yield* attributeIs(page, '[data-act="follow"]', 'aria-pressed', 'true');
      const track = yield* page.box('.bar .track');
      yield* page.mouse.click(track.x + track.width * 0.7, track.y + track.height / 2);
      yield* attributeIs(page, '[data-act="follow"]', 'aria-pressed', 'false');
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live("the play page keeps its time as #t=, in the film's seconds", () =>
    Effect.gen(function* () {
      const { page } = yield* openPlayer(
        { href: `${pageHref.play(PROBE)}#t=0.5`, viewport: DESK },
        '.bar .tc',
      );
      yield* textHas(page, '.bar .scene', 'one');
      yield* attributeIs(page, '.sh-pagebar [data-page="play"]', 'data-active', 'true');
      yield* textHas(page, '.sh-header [data-act="timecode"]', timecode(0.5));
      yield* page.press(']');
      yield* evaluates(page, 'location.hash', `#t=${TWO}`);
      yield* evaluates(page, 'location.pathname', pageHref.play(PROBE));
      // The header's timecode follows the playhead.
      yield* textHas(page, '.sh-header [data-act="timecode"]', timecode(TWO));
    }).pipe(Effect.scoped),
  );

  it.live(
    'a tick held by a finger says its name, which stays a moment once it lifts (UR-115)',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openPlayer(
          { href: pageHref.play(PROBE), viewport: PHONE },
          '.bar .tc',
        );
        const tick = '.bar .track .tick.cue';
        const name = String(yield* page.evaluate(`document.querySelector('${tick}').dataset.name`));
        yield* touch(page, tick, 0);
        yield* evaluates(page, "document.querySelector('.bar .tip').hidden", false);
        yield* textHas(page, '.bar .tip', name);
        yield* page.finger.up;
        yield* evaluates(page, "document.querySelector('.bar .tip').hidden", false);
        yield* evaluates(page, "document.querySelector('.bar .tip').hidden", true);
      }).pipe(Effect.scoped),
  );

  it.live("a name still held stays: the last tick's lingering name never hides the next", () =>
    Effect.gen(function* () {
      const { page } = yield* openPlayer(
        { href: pageHref.play(PROBE), viewport: PHONE },
        '.bar .tc',
      );
      // A cue's tick and a mark's: two names, apart along the track.
      const middle = (box: { x: number; y: number; width: number; height: number }) => ({
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      });
      const a = middle(yield* page.box('.bar .track .tick.cue'));
      const b = middle(yield* page.box('.bar .track .tick.mark'));
      const nameAt = (p: { x: number; y: number }) =>
        `document.elementFromPoint(${p.x}, ${p.y}).dataset.name`;
      yield* evaluates(page, `${nameAt(a)} !== ${nameAt(b)}`, true);
      // Whether the tip shows the name under `p`.
      const tipNames = (p: { x: number; y: number }) =>
        `!document.querySelector('.bar .tip').hidden && document.querySelector('.bar .tip').textContent === ${nameAt(p)}`;
      yield* page.clock.hold;
      // A is held to its name, then lifted: its name lingers 1.5 s, to 2000.
      yield* page.finger.down(a.x, a.y);
      yield* page.clock.runFor(500);
      yield* evaluates(page, tipNames(a), true);
      yield* page.finger.up;
      // B is held at 1400: named at 1900, and still held past 2000.
      yield* page.clock.runFor(900);
      yield* page.finger.down(b.x, b.y);
      yield* page.clock.runFor(500);
      yield* evaluates(page, tipNames(b), true);
      yield* page.clock.runFor(300);
      yield* evaluates(page, tipNames(b), true);
      // Lifted, B's own name lingers its 1.5 s, then goes.
      yield* page.finger.up;
      yield* page.clock.runFor(1600);
      yield* evaluates(page, "document.querySelector('.bar .tip').hidden", true);
    }).pipe(Effect.scoped),
  );

  it.live(
    'the legend is hidden at rest; the bar’s ? button shows it, with the keys bound, and ? opens the keys sheet',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.play(PROBE), viewport: PHONE },
          '.bar .tc',
        );
        const shown = "!document.querySelector('.bar .keys').hidden";
        yield* evaluates(page, shown, false);
        yield* page.click('.bar [data-act="legend"]');
        yield* evaluates(page, shown, true);
        yield* attributeIs(page, '.bar [data-act="legend"]', 'aria-expanded', 'true');
        yield* textHas(page, '.bar .keys .bound', 'Space play');
        yield* page.click('.bar [data-act="legend"]');
        yield* evaluates(page, shown, false);
        // `?` is the studio's keys sheet here as on every page, the transport's keys in it.
        yield* page.press('?');
        yield* page.waitFor('[data-role="keys-sheet"] [data-command="play.toggle"]');
        yield* evaluates(page, shown, false);
        yield* page.press('Escape');
        yield* attributeIs(page, '.bar [data-act="legend"]', 'aria-expanded', 'false');
        yield* evaluates(page, NO_SIDEWAYS, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live(
    "the Scenes are the film's tape: a cut per scene, every time a timecode, each still a frame of the film",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.scenes(PROBE), viewport: DESK },
          STILL_DRAWN,
        );
        yield* attributeIs(page, '.sh-pagebar [data-page="scenes"]', 'data-active', 'true');
        yield* attributeIs(page, '.sh-pagebar [data-page="lab"]', 'href', pageHref.lab(PROBE));
        // A cut per scene, in film order.
        yield* evaluates(
          page,
          "[...document.querySelectorAll('.sc-cut')].map((c) => c.dataset.scene)",
          ['one', 'two', 'three'],
        );
        // A laptop's line is a minute: the probe film is one line, a still every 5 s.
        yield* countIs(page, '.sc-line', 1);
        yield* textIs(page, '.sc-line-tc', '00:00');
        yield* textHas(page, '[data-role="step"]', '5 s a still · a line a minute');
        yield* evaluates(
          page,
          `(() => { const c = document.querySelector('${STILL_DRAWN}'); return c.width > 0 && c.height > 0; })()`,
          true,
        );
        // The preview's track is the tape bar; its transport row is the header's.
        yield* page.waitFor('.sc-tapebar .sc-track .bar .track');
        yield* evaluates(
          page,
          "getComputedStyle(document.querySelector('.sc-track .bar .row')).display",
          'none',
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live(
    "a tap on the tape selects its scene and moves the playhead there; Back deselects; Open in Lab opens the scene's lab",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.scenes(PROBE), viewport: DESK },
          STILL_DRAWN,
        );
        yield* clickInScene(page, 'two');
        yield* evaluates(page, 'location.pathname', pageHref.scene(PROBE, 'two'));
        yield* textIs(page, '.sc-focus .sc-card-name', 'two');
        yield* textHas(page, '.sc-focus .lab-sheet-title', '2 of 3');
        // In, out and length are the film's timecode.
        yield* textHas(page, '.sc-focus .sc-card-facts', timecode(TWO));
        // The playhead is in the scene, and the URL's `#t=` says so.
        yield* evaluates(
          page,
          `(() => { const t = Number(location.hash.slice(3)); return location.hash.startsWith('#t=') && t >= ${TWO} && t < ${THREE}; })()`,
          true,
        );
        // Back steps out of the selection.
        yield* page.evaluate('history.back()');
        yield* evaluates(page, 'location.pathname', pageHref.scenes(PROBE));
        yield* evaluates(page, "document.querySelector('.sc-focus') === null", true);
        // Selected again, Open in Lab goes to the scene's lab at the playhead.
        yield* clickInScene(page, 'three');
        yield* page.click('.sc-focus [data-act="open-lab"]');
        yield* evaluates(page, 'location.pathname', pageHref.labScene(PROBE, 'three'));
        yield* evaluates(page, "location.hash.startsWith('#t=')", true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live(
    "on a phone the selected scene's card is the one sheet over the tab bar, its verbs a finger's size, its Close dropping the scene (RS-4)",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.scenes(PROBE), viewport: PHONE },
          STILL_DRAWN,
        );
        // A phone's line is half a minute.
        yield* textHas(page, '[data-role="step"]', 'a line 30 s');
        yield* clickInScene(page, 'one');
        yield* page.waitFor('.sc-focus');
        const sheet = yield* page.box('.sc-focus');
        expect(sheet.y + sheet.height).toBeLessThanOrEqual(PHONE.height);
        expect(sheet.width).toBe(PHONE.width);
        const open = yield* page.box('.sc-focus [data-act="open-lab"]');
        expect(open.height).toBeGreaterThanOrEqual(44);
        // It opens lowered to a peek (its card in brief); its grip raises it, as an inspector's does.
        yield* attributeIs(page, '.sc-focus', 'data-peek', 'true');
        yield* page.click('.sc-focus [data-act="sheet"]');
        yield* attributeIs(page, '.sc-focus', 'data-peek', 'false');
        yield* evaluates(page, NO_SIDEWAYS, true);
        // Its Close is the Project inspector's: it drops the scene from the path.
        yield* page.click('.sc-focus [data-act="close-inspector"]');
        yield* evaluates(page, 'location.pathname', pageHref.scenes(PROBE));
        yield* countIs(page, '.sc-focus', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live('⇧-click adds scenes to the selection, and ⇧A approves them all in one say (AA-12)', () =>
    Effect.gen(function* () {
      const { page, asked, errors } = yield* openPlayer(
        { href: pageHref.scenes(PROBE), viewport: DESK },
        STILL_DRAWN,
        projectRoutes(),
      );
      yield* page.waitFor('.sc-acts [data-act-name="opening"]');
      yield* clickInScene(page, 'one');
      yield* shiftClickInScene(page, 'three');
      yield* textIs(page, '.sc-focus [data-role="picked"]', '2 scenes selected');
      // The path names the first scene picked; the batch is never in the URL.
      yield* evaluates(page, 'location.pathname', pageHref.scene(PROBE, 'one'));
      yield* page.press('Shift+A');
      yield* textHas(page, '[data-role="receipt"]', 'approved 2 scenes');
      // One say names every scene picked, neighbours or not: the project approves them in one run.
      expect(
        asked
          .filter((a) => a.method === 'POST' && a.path === '/project/say')
          .map((a) => SaidOf(Option.getOrElse(a.body, () => ({}))).address.ids),
      ).toEqual([['one', 'three']]);
      yield* textHas(page, '.sc-focus .sc-chips', 'Approved');
      expect(errors).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live(
    "an approve on Scenes offers Undo, as Project's does: one withdraw of just the approvals it gave (its op)",
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openPlayer(
          { href: pageHref.scenes(PROBE), viewport: DESK },
          STILL_DRAWN,
          projectRoutes(),
        );
        yield* page.waitFor('.sc-acts [data-act-name="opening"]');
        yield* clickInScene(page, 'one');
        yield* shiftClickInScene(page, 'three');
        yield* page.press('Shift+A');
        yield* textHas(page, '[data-role="receipt"]', 'approved 2 scenes');
        yield* page.click('[data-role="receipt"] [data-act="receipt-undo"]');
        yield* textHas(page, '[data-role="receipt"]', 'Undid approving scenes one, three');
        expect(
          asked
            .filter((a) => a.method === 'POST' && a.path === '/project/say')
            .map((a) => SaidOf(Option.getOrElse(a.body, () => ({})))),
        ).toEqual([
          { address: { ids: ['one', 'three'] }, say: { _tag: 'Approve' } },
          { address: { ids: ['one', 'three'] }, say: { _tag: 'Withdraw', given: 'op-1' } },
        ]);
        yield* evaluates(page, "document.querySelector('.sc-focus .sc-chips').textContent", '');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live(
    "a finger held on the play page's film lists its frame and scene steps (AA-8), and ×10 steps ten frames: Shift's step by touch",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: `${pageHref.play(PROBE)}#t=0.5`, viewport: { ...PHONE, coarse: true } },
          '.bar .tc',
        );
        // The clock held: the long press's delay passes only as the test runs it on.
        yield* page.clock.hold;
        yield* touch(page, '.stage', 0);
        yield* page.clock.runFor(700);
        yield* page.waitFor('[data-role="context-menu"] [data-command]');
        yield* page.finger.up;
        yield* page.clock.runFor(500);
        yield* evaluates(page, `${MENU_ITEMS}.filter((id) => id.startsWith('play.'))`, [
          'play.frame-next',
          'play.frame-next',
          'play.frame-previous',
          'play.frame-previous',
          'play.scene-next',
          'play.scene-previous',
        ]);
        yield* page.click(
          '[data-role="context-menu"] [data-command="play.frame-next"][data-step="coarse"]',
        );
        yield* page.clock.runFor(500);
        // Frame 15 (0.5 s at 30 fps), ten on: frame 25, kept to the millisecond rounded up.
        yield* evaluates(page, 'location.hash', `#t=${Math.ceil((25 / 30) * 1000) / 1000}`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live(
    "a finger clears the Scenes' selection, as Escape does (G8): a still's menu lists it",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openPlayer(
          { href: pageHref.scenes(PROBE), viewport: { ...PHONE, coarse: true } },
          STILL_DRAWN,
        );
        yield* clickInScene(page, 'one');
        yield* page.waitFor('.sc-focus');
        yield* page.clock.hold;
        yield* touch(page, '.sc-still[data-scene="three"]', 0);
        yield* page.clock.runFor(700);
        yield* page.waitFor('[data-role="context-menu"] [data-command="scenes.clear"]');
        yield* page.finger.up;
        yield* page.clock.runFor(500);
        yield* page.click('[data-role="context-menu"] [data-command="scenes.clear"]');
        yield* page.clock.runFor(500);
        yield* countIs(page, '.sc-focus', 0);
        yield* evaluates(page, 'location.pathname', pageHref.scenes(PROBE));
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );
});
