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
// The lab's routes are faked (`edits-kept.ts`) over the version's timeline as each edit
// lays it (`ripple.ts`); every wait is on what the page shows, never on time.

import { Boolean as Bool, Effect, Option } from 'effect';
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
import { type Sent, editsKept, sentOf } from './edits-kept.ts';
import {
  attributeIs,
  countIs,
  evaluates,
  textHas,
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
 * lifted, and the drop line standing where the drop moves the beat (`moves`)
 * or none where it does not.
 */
const carry = (page: Page, beat: string, x: number, moves = true) =>
  Effect.gen(function* () {
    const from = yield* middleOf(page, clip(beat));
    yield* page.mouse.move(from.x, from.y);
    yield* page.mouse.down;
    yield* page.mouse.move(x, from.y, 10);
    yield* attributeIs(page, clip(beat), 'data-lifted', 'true');
    yield* Bool.match(moves, {
      onTrue: () => waitFor(page, '[data-role="drop-line"]'),
      onFalse: () => countIs(page, '[data-role="drop-line"]', 0),
    });
    yield* page.mouse.up;
  });

/** The page x just inside the start of Script clip `beat`. */
const startOf = (page: Page, beat: string) => Effect.map(page.box(clip(beat)), (b) => b.x + 3);

/** Pull beat `beat`'s `edge` along by `seconds` on the clock, showing its readout before it is let go. */
const pull = (page: Page, beat: string, edge: 'lead' | 'tail', seconds: number, readout: string) =>
  Effect.gen(function* () {
    const grip = `${clip(beat)} .st-grip[data-edge="${edge}"]`;
    const at = yield* middleOf(page, grip);
    const perSecond = yield* Effect.map(
      page.box(clip(beat)),
      (b) =>
        b.width /
        Option.getOrElse(
          Option.map(
            Option.fromUndefinedOr(scriptOf(probeTimeline(1)).find((c) => c.beat === beat)),
            (c) => c.dur,
          ),
          () => 1,
        ),
    );
    yield* page.mouse.move(at.x, at.y);
    yield* page.mouse.down;
    yield* page.mouse.move(at.x + seconds * perSecond, at.y, 10);
    yield* textHas(page, '[data-role="trim-readout"]', readout);
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
        yield* carry(page, 'two', (yield* startOf(page, 'two')) + 12, false);
        yield* countIs(page, '[data-role="drop-line"]', 0);
        yield* countIs(page, `${SCRIPT} .st-clip[data-lifted="true"]`, 0);
        expect(posted(asked, '/beats/move')).toEqual([]);
        // Carried just inside two, three lands before it.
        yield* carry(page, 'three', yield* startOf(page, 'two'));
        yield* evaluates(page, ORDER, 'one three two');
        yield* textHas(page, RECEIPT, `Moved three before two. ${AGENTS_AFTER}`);
        expect(posted(asked, '/beats/move')).toEqual([
          Option.some({ version: 1, beat: 'three', before: 'two' }),
        ]);
        yield* evaluates(page, 'location.hash', '#t=5.715');
        yield* page.press('Control+z');
        yield* evaluates(page, ORDER, 'one two three');
        yield* textHas(page, RECEIPT, 'Undid: Moved three before two.');
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
        yield* pull(page, 'one', 'tail', 3, '+3.0 s → 7.7 s');
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
        yield* textHas(page, RECEIPT, 'Undid: Held one +3.0 s after its words.');
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
        yield* carry(page, 'three', yield* startOf(page, 'one'));
        yield* evaluates(page, ORDER, 'three one two');
        yield* textHas(page, RECEIPT, 'Moved three before one.');
        yield* carry(page, 'two', yield* startOf(page, 'one'));
        yield* evaluates(page, ORDER, 'three two one');
        yield* textHas(page, RECEIPT, 'Moved two before one.');
        yield* page.press('Control+z');
        yield* evaluates(page, ORDER, 'three one two');
        yield* textHas(page, RECEIPT, 'Undid: Moved two before one.');
        yield* page.press('Control+z');
        yield* evaluates(page, ORDER, 'one two three');
        yield* textHas(page, RECEIPT, 'Undid: Moved three before one.');
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
