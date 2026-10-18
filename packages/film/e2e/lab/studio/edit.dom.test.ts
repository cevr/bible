// The studio's edits over the probe film's first version (kept in its own
// folder, so an edit reads the version again and never reloads the page), on
// a laptop (1440 × 900) and a phone (390 × 844). On a laptop a Script clip
// carried to another gap moves its beat (it lifts, the white drop line shows
// the gap), and a beat's edge pulled sets its hold (its readout live); on a
// phone a beat's menu moves it before the beat picked, and no clip has an
// edge to pull. ⌘Z, the receipt's Undo and the page's menu step the film's
// one history, each step alone. A frame drawn on in red with one line files
// a note, and the receipt's Withdraw takes it back; a beat's menu files a
// split at the playhead for an agent, the page writing nothing to the film.
// A ⌘Z refused because an agent's change stands on top reads the history
// again, and the next ⌘Z, pressed while it is read, waits for it and undoes
// the agent's change. A trim right after a
// landed write, or right after a reorder, waits for the version's read and
// starts from it: its readout and its receipt agree; a write whose version
// cannot be read again says so on its receipt. The lab's routes are
// faked (`edits-kept.ts`) over the version's script, its timeline laid again
// from the script each change leaves; every wait is on what the page shows,
// never on time.

import { Effect, Match, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { AGENTS_AFTER } from '../../../src/core/beat-edit.ts';
import { pageHref } from '../../../src/core/api.ts';
import { scriptOf } from '../../../src/lab/film-studio/ripple.ts';
import { rightClick } from '../../../src/lab/fixtures/gestures.ts';
import {
  type Asked,
  DESK,
  type FakeRoute,
  type Json,
  PANEL_PNG,
  PHONE,
  type Viewport,
  json,
  openPlayer,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { PROBE } from '../../../src/lab/fixtures/probe-film.ts';
import { probeTimeline } from '../../../src/lab/fixtures/probe-timeline.ts';
import type { FilmTimeline } from '../../../src/core/timeline-schema.ts';
import { type Sent, editsKept, editsLab, sentOf } from './edits-kept.ts';
import {
  attributeIs,
  countIs,
  evaluates,
  textHas,
  textIs,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;

/** The studio's first clip drawn: the timeline is read and laid out. */
const READY = '.st-timeline .st-clip';

/** The first version: its own folder's files, so an edit never reloads the page. */
const V1 = pageHref.studio(PROBE, { v: 1 });

const SCRIPT = '.st-lane[data-track="script"]';
const clip = (beat: string) => `${SCRIPT} .st-clip[data-beat="${beat}"]`;
const RECEIPT = '[data-role="receipt"]';
const RECEIPT_BUTTON = '[data-role="receipt"] [data-act="receipt-undo"]';
const MENU = '[data-role="context-menu"]';

/** The Script clips' beats in the order the lane draws them, left to right. */
const ORDER = `[...document.querySelectorAll('${SCRIPT} .st-clip')].sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left)).map((c) => c.dataset.beat).join(' ')`;

/** The POSTs to `path` among `asked`, by their bodies. */
const posted = (asked: ReadonlyArray<Asked>, path: string) =>
  asked.filter((a) => a.method === 'POST' && a.path === path).map((a) => a.body);

/** A note on the probe film as the lab answers one: its frame and words as sent, its id and its thread. */
const noteOf = (id: string, sent: Sent): Json => ({
  id,
  film: PROBE,
  scene: sent.scene ?? 'one',
  T: sent.T ?? 0,
  frame: sent.frame ?? 0,
  text: sent.text ?? '',
  status: 'open',
  still: `${id}.png`,
  thread: [],
  createdAt: '2026-10-18T00:00:00.000Z',
  seq: 1,
  changed: 1,
});

/** The notes routes over a list the case's posts grow, and take back on a withdraw. */
const notesKept = () => {
  let made: ReadonlyArray<{ readonly id: string; readonly note: Json }> = [];
  let next = 0;
  return [
    route('GET', /^\/notes$/, () =>
      json({ film: PROBE, seq: next, notes: made.map((m) => m.note) }),
    ),
    route('POST', /^\/notes$/, (asked) => {
      next += 1;
      const id = `n${next}`;
      const note = noteOf(id, sentOf(asked.body));
      made = [...made, { id, note }];
      return json(note);
    }),
    route('POST', /^\/notes\/n\d+\/withdraw$/, (asked) => {
      const id = asked.path.split('/')[2] ?? '';
      const found = made.find((m) => m.id === id);
      made = made.filter((m) => m.id !== id);
      return Option.match(Option.fromUndefinedOr(found), {
        onNone: () => json({ _tag: 'NoteUnknown', message: `no note ${id}` }, 404),
        onSome: (m) => json(m.note),
      });
    }),
  ];
};

const BOARD_FILES: FakeRoute = route('GET', /^\/board\/files\/[\w.]+\.png(\?|$)/, () => PANEL_PNG);

/** The studio at `href` on `viewport`, its timeline drawn, over `routes`. */
const studioAt = (viewport: Viewport, href: string, routes: ReadonlyArray<FakeRoute>) =>
  openPlayer({ href, viewport }, READY, [...routes, BOARD_FILES]);

type Page = Effect.Success<ReturnType<typeof studioAt>>['page'];

/** The middle of `selector`'s box on the page. */
const middleOf = (page: Page, selector: string) =>
  Effect.map(page.box(selector), (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }));

/**
 * Carry Script clip `beat` with the mouse to `x` (a page x, on its lane),
 * and assert what the carry shows on the way before letting it go: the clip
 * lifted, the playhead stepped aside, and the drop line standing whole where
 * the drop moves the beat, its tag saying what `lands` there, or none where
 * it does not.
 */
const carry = (page: Page, beat: string, x: number, lands: Option.Option<string>) =>
  Effect.gen(function* () {
    const from = yield* middleOf(page, clip(beat));
    yield* page.mouse.move(from.x, from.y);
    yield* page.mouse.down;
    yield* page.mouse.move(x, from.y, 10);
    yield* attributeIs(page, clip(beat), 'data-lifted', 'true');
    yield* Option.match(lands, {
      onSome: (tag) =>
        Effect.gen(function* () {
          yield* waitFor(page, '[data-role="drop-line"]');
          // The line runs through every lane, not the Script lane alone, and shows whole inside them.
          const line = yield* page.box('[data-role="drop-line"]');
          const lifted = yield* page.box(clip(beat));
          const lanes = yield* page.box('.st-scroller');
          expect(line.height).toBeGreaterThan(lifted.height * 2);
          expect(line.x).toBeGreaterThanOrEqual(lanes.x);
          yield* textIs(page, '[data-role="drop-tag"]', tag);
          // The carried clip shows no grips, and the playhead steps aside for the line.
          yield* evaluates(
            page,
            `[...document.querySelectorAll('${clip(beat)} .st-grip')].every((g) => getComputedStyle(g).display === 'none')`,
            true,
          );
          yield* evaluates(
            page,
            `getComputedStyle(document.querySelector('.st-playhead')).visibility`,
            'hidden',
          );
        }),
      onNone: () => countIs(page, '[data-role="drop-line"]', 0),
    });
    yield* page.mouse.up;
  });

/** The page x just inside the start of Script clip `beat`. */
const startOf = (page: Page, beat: string) => Effect.map(page.box(clip(beat)), (b) => b.x + 3);

/** The page pixels a second of beat `beat` spans, as `shown` (the timeline the page shows) lays it. */
const pixelsPerSecond = (page: Page, beat: string, shown: FilmTimeline) =>
  Effect.map(
    page.box(clip(beat)),
    (b) =>
      b.width /
      Option.getOrElse(
        Option.map(
          Option.fromUndefinedOr(scriptOf(shown).find((c) => c.beat === beat)),
          (c) => c.dur,
        ),
        () => 1,
      ),
  );

/** Pull beat `beat`'s `edge` along by `seconds` on the clock, showing its readout before it is let go; `shown` is the timeline the page shows. */
const pull = (
  page: Page,
  beat: string,
  edge: 'lead' | 'tail',
  seconds: number,
  readout: string,
  shown: FilmTimeline = probeTimeline(1),
) =>
  Effect.gen(function* () {
    const grip = `${clip(beat)} .st-grip[data-edge="${edge}"]`;
    const at = yield* middleOf(page, grip);
    const perSecond = yield* pixelsPerSecond(page, beat, shown);
    yield* page.mouse.move(at.x, at.y);
    yield* page.mouse.down;
    yield* page.mouse.move(at.x + seconds * perSecond, at.y, 10);
    yield* textHas(page, '[data-role="trim-readout"]', readout);
    // The readout stands over the edge in the hand: a lead's left on it, a tail's right.
    const said = yield* page.box('[data-role="trim-readout"]');
    const pulled = yield* page.box(grip);
    expect(
      Math.abs(
        Match.value(edge).pipe(
          Match.when('lead', () => said.x - pulled.x),
          Match.when('tail', () => said.x + said.width - (pulled.x + pulled.width)),
          Match.exhaustive,
        ),
      ),
    ).toBeLessThan(3);
    yield* page.mouse.up;
    yield* countIs(page, '[data-role="trim-readout"]', 0);
  });

/** Open `selector`'s context menu (a right-click on a laptop, the same menu a long-press opens on a phone) and run `command` from it. */
const fromMenu = (page: Page, selector: string, command: string) =>
  Effect.gen(function* () {
    yield* rightClick(page, selector);
    yield* page.click(`${MENU} [data-command="${command}"]`);
    yield* countIs(page, MENU, 0);
  });

/** Move beat `beat` before `to` (none: to the end) from its menu, as a phone does. */
const moveFromMenu = (page: Page, beat: string, to: Option.Option<string>) =>
  Effect.gen(function* () {
    yield* fromMenu(page, clip(beat), 'studio.move-before');
    // Each row says where the beat goes.
    yield* Option.match(to, {
      onNone: () =>
        textIs(page, '[data-role="move-picker"] .st-picker-row[data-end]', 'To the end'),
      onSome: (b) =>
        textIs(page, `[data-role="move-picker"] .st-picker-row[data-to="${b}"]`, `Before ${b}`),
    });
    yield* page.click(
      Option.match(to, {
        onNone: () => '[data-role="move-picker"] .st-picker-row[data-end]',
        onSome: (b) => `[data-role="move-picker"] .st-picker-row[data-to="${b}"]`,
      }),
    );
    yield* countIs(page, '[data-role="move-picker"]', 0);
  });

/** Undo from the page's own menu: the phone's way to the history's next step. */
const undoFromMenu = (page: Page) => fromMenu(page, '.st-transport', 'edit.undo');

describe('the studio’s edits on a laptop', () => {
  it.live(
    'a Script clip carried to another gap moves its beat, and ⌘Z puts it back',
    () =>
      Effect.gen(function* () {
        // The playhead a second into three, where it stays through the move and its undo.
        const { page, asked, errors } = yield* studioAt(DESK, `${V1}#t=9.26`, editsKept());
        yield* evaluates(page, ORDER, 'one two three');
        // Dropped on itself, nothing is asked.
        yield* carry(page, 'two', (yield* startOf(page, 'two')) + 12, Option.none());
        yield* countIs(page, '[data-role="drop-line"]', 0);
        yield* countIs(page, `${SCRIPT} .st-clip[data-lifted="true"]`, 0);
        expect(posted(asked, '/beats/move')).toEqual([]);
        // Carried just inside two, three lands before it.
        yield* carry(page, 'three', yield* startOf(page, 'two'), Option.some('three before two'));
        yield* evaluates(page, ORDER, 'one three two');
        yield* textHas(page, RECEIPT, `Moved three before two. ${AGENTS_AFTER}`);
        expect(posted(asked, '/beats/move')).toEqual([
          Option.some({ version: 1, beat: 'three', before: 'two' }),
        ]);
        yield* evaluates(page, 'location.hash', '#t=5.715');
        yield* page.press('Control+z');
        yield* evaluates(page, ORDER, 'one two three');
        yield* textHas(page, RECEIPT, 'Undone: Moved three before two.');
        yield* textHas(page, RECEIPT_BUTTON, 'Redo');
        yield* evaluates(page, 'location.hash', '#t=9.26');
        expect(posted(asked, '/edits/undo')).toEqual([Option.some({ change: 'c1' })]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a beat's tail pulled sets its hold with a live readout, and the receipt's Undo puts it back",
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* studioAt(DESK, V1, editsKept());
        const width = `document.querySelector('${clip('one')}').getBoundingClientRect().width`;
        const before = yield* page.evaluate<number>(width);
        yield* pull(page, 'one', 'tail', 3, 'hold +3.0 s · 7.7 s long');
        yield* textHas(page, RECEIPT, `Held one +3.0 s after its words. ${AGENTS_AFTER}`);
        expect(posted(asked, '/beats/hold')).toEqual([
          Option.some({ version: 1, beat: 'one', edge: 'tail', seconds: 3.1 }),
        ]);
        // One ends 3 s later (the lane refits the longer film, so its width grows by less).
        yield* attributeIs(page, clip('one'), 'title', /–0:07\.7$/);
        yield* evaluates(page, `${width} > ${before}`, true);
        // Two follows the beat that grew.
        yield* evaluates(
          page,
          `parseFloat(document.querySelector('${clip('two')}').style.left) > parseFloat(document.querySelector('${clip('one')}').style.width) - 1`,
          true,
        );
        yield* page.click(RECEIPT_BUTTON);
        yield* textHas(page, RECEIPT, 'Undone: Held one +3.0 s after its words.');
        yield* attributeIs(page, clip('one'), 'title', /–0:04\.7$/);
        yield* evaluates(page, `Math.abs(${width} - ${before}) < 1`, true);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'two edits are undone one at a time, the newest first, and Redo makes the last undone again',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* studioAt(DESK, V1, editsKept());
        yield* carry(page, 'three', yield* startOf(page, 'one'), Option.some('three before one'));
        yield* evaluates(page, ORDER, 'three one two');
        yield* textHas(page, RECEIPT, 'Moved three before one.');
        yield* carry(page, 'two', yield* startOf(page, 'one'), Option.some('two before one'));
        yield* evaluates(page, ORDER, 'three two one');
        yield* textHas(page, RECEIPT, 'Moved two before one.');
        yield* page.press('Control+z');
        yield* evaluates(page, ORDER, 'three one two');
        yield* textHas(page, RECEIPT, 'Undone: Moved two before one.');
        yield* page.press('Control+z');
        yield* evaluates(page, ORDER, 'one two three');
        yield* textHas(page, RECEIPT, 'Undone: Moved three before one.');
        expect(posted(asked, '/edits/undo')).toEqual([
          Option.some({ change: 'c2' }),
          Option.some({ change: 'c1' }),
        ]);
        yield* page.press('Control+Shift+Z');
        yield* evaluates(page, ORDER, 'three one two');
        expect(posted(asked, '/edits/redo')).toEqual([Option.some({ change: 'c1' })]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('the studio’s edits beside an agent’s, and in the read’s window', () => {
  it.live(
    'a grip pressed and let go within a tap’s reach, or pulled out and back, writes nothing',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* studioAt(DESK, V1, editsKept());
        const grip = `${clip('one')} .st-grip[data-edge="tail"]`;
        const at = yield* middleOf(page, grip);
        // 1 px, and 5 px (under DRAG_PX, 6): a tap, whatever a pixel is worth on the clock.
        // The readout says the hold as it stood.
        for (const px of [1, 5]) {
          yield* page.mouse.move(at.x, at.y);
          yield* page.mouse.down;
          yield* page.mouse.move(at.x + px, at.y, 2);
          yield* textHas(page, '[data-role="trim-readout"]', 'hold +0.0 s');
          yield* page.mouse.up;
          yield* countIs(page, '[data-role="trim-readout"]', 0);
        }
        // Out past a tap and back to where it began: the hold it started from.
        yield* page.mouse.move(at.x, at.y);
        yield* page.mouse.down;
        yield* page.mouse.move(at.x + 60, at.y, 6);
        yield* waitFor(page, '[data-role="trim-readout"]');
        yield* page.mouse.move(at.x, at.y, 6);
        yield* textHas(page, '[data-role="trim-readout"]', 'hold +0.0 s');
        yield* page.mouse.up;
        yield* countIs(page, '[data-role="trim-readout"]', 0);
        // A pull that sets a hold after them: it is the one hold asked.
        yield* pull(page, 'one', 'tail', 3, 'hold +3.0 s · 7.7 s long');
        yield* textHas(page, RECEIPT, `Held one +3.0 s after its words. ${AGENTS_AFTER}`);
        expect(posted(asked, '/beats/hold')).toEqual([
          Option.some({ version: 1, beat: 'one', edge: 'tail', seconds: 3.1 }),
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a ⌘Z refused under an agent's newer change reads the history again, and the next ⌘Z undoes the agent's",
    () =>
      Effect.gen(function* () {
        const lab = editsLab();
        const { page, asked, errors } = yield* studioAt(DESK, V1, lab.routes);
        yield* carry(page, 'three', yield* startOf(page, 'two'), Option.some('three before two'));
        yield* textHas(page, RECEIPT, 'Moved three before two.');
        // An agent holds one through its tool: the page's history still names the move.
        const agents = yield* lab.agent('one', 'tail', 1.1);
        // The history read again after the refusal is held: a ⌘Z pressed in its window waits for it.
        const release = yield* lab.holdHistory;
        yield* page.press('Control+z');
        yield* textHas(page, RECEIPT, 'hold one tail came after it');
        yield* page.press('Control+z');
        yield* textHas(page, RECEIPT, 'Reading the film’s history…');
        yield* release;
        yield* textHas(page, RECEIPT, 'Undone: Held one +1.0 s after its words.');
        expect(posted(asked, '/edits/undo')).toEqual([
          Option.some({ change: 'c1' }),
          Option.some({ change: agents }),
        ]);
        // The page read the history again between the two.
        expect(
          asked.filter((a) => a.method === 'GET' && a.path === '/steps').length,
        ).toBeGreaterThan(0);
        yield* evaluates(page, ORDER, 'one three two');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a second trim on the same edge right after a landed write waits for the read, and starts from it',
    () =>
      Effect.gen(function* () {
        const lab = editsLab();
        const { page, asked, errors } = yield* studioAt(DESK, V1, lab.routes);
        const release = yield* lab.holdReads;
        yield* pull(page, 'one', 'tail', 3, 'hold +3.0 s · 7.7 s long');
        yield* textHas(page, RECEIPT, 'Held one +3.0 s after its words.');
        // The read is held: a grip pulled in its window shows no readout and asks nothing.
        const grip = `${clip('one')} .st-grip[data-edge="tail"]`;
        const at = yield* middleOf(page, grip);
        yield* page.mouse.move(at.x, at.y);
        yield* page.mouse.down;
        yield* page.mouse.move(at.x + 40, at.y, 5);
        yield* countIs(page, '[data-role="trim-readout"]', 0);
        yield* attributeIs(page, grip, 'data-waiting', 'true');
        yield* page.mouse.up;
        yield* release;
        // The version read again, the edge is the hand's again.
        yield* attributeIs(page, grip, 'data-waiting', 'false');
        yield* attributeIs(page, clip('one'), 'title', /–0:07\.7$/);
        yield* pull(page, 'one', 'tail', 1, 'hold +1.0 s · 8.7 s long', lab.now());
        yield* textHas(page, RECEIPT, `Held one +1.0 s after its words. ${AGENTS_AFTER}`);
        expect(posted(asked, '/beats/hold')).toEqual([
          Option.some({ version: 1, beat: 'one', edge: 'tail', seconds: 3.1 }),
          Option.some({ version: 1, beat: 'one', edge: 'tail', seconds: 4.1 }),
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a write whose version cannot be read again says so on its receipt, which keeps its Undo',
    () =>
      Effect.gen(function* () {
        const lab = editsLab();
        const { page, asked } = yield* studioAt(DESK, V1, lab.routes);
        yield* lab.failReads;
        yield* pull(page, 'one', 'tail', 3, 'hold +3.0 s · 7.7 s long');
        yield* textHas(page, RECEIPT, 'Held one +3.0 s after its words.');
        yield* textHas(page, RECEIPT, 'The page could not read it again');
        yield* countIs(page, RECEIPT_BUTTON, 1);
        // The clip shows the beat from before the write, as the receipt says.
        yield* attributeIs(page, clip('one'), 'title', /–0:04\.7$/);
        expect(posted(asked, '/beats/hold')).toEqual([
          Option.some({ version: 1, beat: 'one', edge: 'tail', seconds: 3.1 }),
        ]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a trim started right after a reorder waits for its read; neither edit is lost',
    () =>
      Effect.gen(function* () {
        const lab = editsLab();
        const { page, asked, errors } = yield* studioAt(DESK, V1, lab.routes);
        const release = yield* lab.holdReads;
        yield* carry(page, 'three', yield* startOf(page, 'two'), Option.some('three before two'));
        yield* textHas(page, RECEIPT, 'Moved three before two.');
        const grip = `${clip('three')} .st-grip[data-edge="tail"]`;
        const at = yield* middleOf(page, grip);
        yield* page.mouse.move(at.x, at.y);
        yield* page.mouse.down;
        yield* page.mouse.move(at.x + 40, at.y, 5);
        yield* countIs(page, '[data-role="trim-readout"]', 0);
        yield* attributeIs(page, grip, 'data-waiting', 'true');
        yield* page.mouse.up;
        yield* release;
        // The version read again, the edge is the hand's again.
        yield* attributeIs(page, grip, 'data-waiting', 'false');
        yield* evaluates(page, ORDER, 'one three two');
        yield* pull(page, 'three', 'tail', 1, 'hold +1.0 s · 5.1 s long', lab.now());
        yield* textHas(page, RECEIPT, `Held three +1.0 s after its words. ${AGENTS_AFTER}`);
        yield* evaluates(page, ORDER, 'one three two');
        expect(posted(asked, '/beats/move')).toEqual([
          Option.some({ version: 1, beat: 'three', before: 'two' }),
        ]);
        expect(posted(asked, '/beats/hold')).toEqual([
          Option.some({ version: 1, beat: 'three', edge: 'tail', seconds: 1.1 }),
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('the studio’s edits on a phone', () => {
  it.live(
    "a beat's menu moves it before the beat picked, the receipt's Undo puts it back, and no clip has an edge to pull",
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* studioAt(PHONE, V1, editsKept());
        yield* countIs(page, '.st-grip', 0);
        yield* moveFromMenu(page, 'three', Option.some('two'));
        yield* evaluates(page, ORDER, 'one three two');
        yield* textHas(page, RECEIPT, `Moved three before two. ${AGENTS_AFTER}`);
        expect(posted(asked, '/beats/move')).toEqual([
          Option.some({ version: 1, beat: 'three', before: 'two' }),
        ]);
        yield* page.click(RECEIPT_BUTTON);
        yield* evaluates(page, ORDER, 'one two three');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "two moves are undone one at a time from the page's menu, the newest first",
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* studioAt(PHONE, V1, editsKept());
        yield* moveFromMenu(page, 'one', Option.none());
        yield* evaluates(page, ORDER, 'two three one');
        yield* moveFromMenu(page, 'three', Option.some('two'));
        yield* evaluates(page, ORDER, 'three two one');
        yield* undoFromMenu(page);
        yield* evaluates(page, ORDER, 'two three one');
        yield* undoFromMenu(page);
        yield* evaluates(page, ORDER, 'one two three');
        expect(posted(asked, '/beats/move')).toEqual([
          Option.some({ version: 1, beat: 'one' }),
          Option.some({ version: 1, beat: 'three', before: 'two' }),
        ]);
        expect(posted(asked, '/edits/undo')).toEqual([
          Option.some({ change: 'c2' }),
          Option.some({ change: 'c1' }),
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

const SIZES = [
  { name: 'a laptop', viewport: DESK },
  { name: 'a phone', viewport: PHONE },
] as const;

/** A stroke across the box `selector` draws, a mouse's on a laptop and a finger's on a phone. */
const strokeOver = (page: Page, viewport: Viewport, selector: string) =>
  Effect.gen(function* () {
    const box = yield* page.box(selector);
    const from = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.3 };
    const to = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.5 };
    if (viewport === PHONE) {
      yield* page.finger.drag(from, to, 8);
      return;
    }
    yield* page.mouse.move(from.x, from.y);
    yield* page.mouse.down;
    yield* page.mouse.move(to.x, to.y, 8);
    yield* page.mouse.up;
  });

for (const size of SIZES)
  describe(`the studio's notes for an agent on ${size.name}`, () => {
    // A phone's stroke is the browser's own touch: one case at a time.
    it.live.serial(
      "a frame drawn on in red with one line files a note, and the receipt's Withdraw takes it back",
      () =>
        Effect.gen(function* () {
          const { page, asked, errors } = yield* studioAt(size.viewport, V1, notesKept());
          yield* page.click('[data-act="studio.note"]');
          yield* waitFor(page, '[data-role="note-bar"] [data-role="note-text"]');
          yield* countIs(page, '.st-transport', 0);
          // The frame says it takes a drawing: a crosshair over it, and its tag.
          yield* evaluates(
            page,
            `getComputedStyle(document.querySelector('.st-draw-over')).cursor`,
            'crosshair',
          );
          yield* textHas(page, '.st-frame .st-tag', 'Draw here · ');
          yield* strokeOver(page, size.viewport, '.st-draw-over');
          yield* waitFor(page, '.st-draw-over .lab-sketch-item');
          yield* attributeIs(page, '[data-act="file-note"]', 'disabled', '');
          yield* page.fill('[data-role="note-text"]', 'Lift the ball higher here');
          yield* page.click('[data-act="file-note"]:not([disabled])');
          yield* textHas(page, RECEIPT, 'Filed a note on one (n1).');
          // The bar gives the row back to the transport.
          yield* waitFor(page, '.st-transport');
          const notes = posted(asked, '/notes').map(sentOf);
          expect(notes.map((n) => [n.scene, n.text, n.sketch?.length ?? 0])).toEqual([
            ['one', 'Lift the ball higher here', 1],
          ]);
          expect(notes.map((n) => Option.isSome(Option.fromUndefinedOr(n.still)))).toEqual([true]);
          yield* page.click(RECEIPT_BUTTON);
          yield* textHas(page, RECEIPT, 'Withdrew note n1.');
          expect(posted(asked, '/notes/n1/withdraw').length).toBe(1);
          expect(posted(asked, '/beats/move')).toEqual([]);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      "a beat's menu files a split at the playhead for an agent, writing nothing to the film",
      () =>
        Effect.gen(function* () {
          const { page, asked, errors } = yield* studioAt(
            size.viewport,
            pageHref.studio(PROBE, { v: 1 }, Option.some(2)),
            [...notesKept(), ...editsKept()],
          );
          yield* fromMenu(page, clip('one'), 'studio.split');
          yield* textHas(page, RECEIPT, 'Filed a split of one (n1).');
          expect(posted(asked, '/notes').map((n) => sentOf(n).text)).toEqual([
            'Split one at 0:02.0, 2.0 s into it.',
          ]);
          expect(posted(asked, '/beats/move')).toEqual([]);
          expect(posted(asked, '/beats/hold')).toEqual([]);
          yield* page.click(RECEIPT_BUTTON);
          yield* textHas(page, RECEIPT, 'Withdrew note n1.');
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  });
