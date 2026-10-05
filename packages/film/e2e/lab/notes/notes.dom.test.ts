// The notes in a browser, over the probe film with the lab API faked: a click
// on the frame pins a point and opens the composer at that frame, a drag
// draws a box, the pen draws ink, `n` notes the whole frame and Escape closes;
// a save posts the note with its still and lists it, selected, with a pin on
// the timeline; a refused save says the server's reason; a reply and a
// resolve post to the note's thread; a change the long-poll brings in shows
// as it lands; a lost feed says so and connects again; and ⇧N/⌥⇧N step
// through the open notes, Go to finding any by its words; a drag across a cue
// lane marks a range, and a note carries it and the cue selected as a scope
// chip whose × clears it; a finger the frame's menu took marks nothing.

import { Effect, Option, Predicate, Schedule } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Tab } from '../../../src/lab/fixtures/tab.ts';
import {
  type Asked,
  type FakeRoute,
  type Json,
  URL_T,
  json,
  labAt,
  openLab,
  refused,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { ServerFailed } from '../../../src/core/api.ts';
import { timecode } from '../../../src/core/time.ts';
import { PROBE, probeFilm } from '../../../src/lab/fixtures/probe-film.ts';
import {
  attached,
  evaluates,
  textHas,
  textIs,
  valueIs,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';
import { RETRY_MS } from '../../../src/lab/notes/feed.ts';
import { cueOf } from '../../../src/command/selection.ts';
import type { Note, Reply } from '../../../src/core/schema.ts';

/** Long enough to open the lab, draw, save and read the list back. */
const SLOW = 15_000;

type JsonObject = { readonly [key: string]: Json };

const click = (page: Tab, selector: string) => page.click(selector);

/**
 * Do `act` and wait for the answer to the request whose URL ends `suffix`,
 * listening before `act` starts: a fake route answers at once, so a listener
 * added after the act can miss the answer and wait forever.
 */
const answered = (page: Tab, suffix: string, act: Effect.Effect<void>) =>
  Effect.gen(function* () {
    const answer = yield* page.nextAnswer((r) => r.url.endsWith(suffix));
    yield* act;
    yield* answer;
  });

/** The note the fake server keeps, as `film notes` would write it. */
const noteJson = (id: string, over: Partial<Note> = {}): Note => ({
  scene: 'one',
  T: 1,
  frame: 30,
  text: 'the ball rises too early',
  id,
  film: PROBE,
  seq: 1,
  changed: 1,
  status: 'open',
  still: `${id}.png`,
  thread: [],
  createdAt: '2026-09-28T00:00:00.000Z',
  ...over,
});

/** A notes file with `notes`, at change `seq`. */
const notesFile = (seq: number, notes: ReadonlyArray<Json>) => json({ film: PROBE, seq, notes });

/** The note the URL selects (`?note=`), or '' for none. */
const NOTE_IN_URL = "new URLSearchParams(location.search).get('note') ?? ''";

/** A notes store: empty until a POST adds `n1`, which it then lists. */
const store = (): ReadonlyArray<FakeRoute> => {
  const notes: Array<Json> = [];
  return [
    route('GET', /^\/notes$/, () => notesFile(notes.length, notes)),
    route('POST', /^\/notes$/, () => {
      const made = noteJson('n1');
      notes.push(made);
      return json(made);
    }),
  ];
};

/** A point on the frame, in page pixels, at film pixels (x, y). */
const onFrame = (page: Tab, x: number, y: number) =>
  page.box('.lab-overlay').pipe(
    Effect.map((box) => ({
      x: box.x + (x / 640) * box.width,
      y: box.y + (y / 360) * box.height,
    })),
  );

const posted = (asked: ReadonlyArray<Asked>, path: RegExp) =>
  asked.filter((a) => a.method === 'POST' && path.test(a.path)).map((a) => a.body);

const isObject = (value: Json): value is JsonObject =>
  Predicate.isObject(value) && !Array.isArray(value);

/** `key` of a JSON object, if it has one. */
const field = (value: Option.Option<Json>, key: string): Option.Option<Json> =>
  Option.flatMap(Option.filter(value, isObject), (o) => Option.fromUndefinedOr(o[key]));

/** The note body the page posted. */
const theNote = (asked: ReadonlyArray<Asked>) =>
  Option.flatten(Option.fromUndefinedOr(posted(asked, /^\/notes$/)[0]));

const drag = (page: Tab, from: readonly [number, number], to: readonly [number, number]) =>
  Effect.gen(function* () {
    const a = yield* onFrame(page, from[0], from[1]);
    const b = yield* onFrame(page, to[0], to[1]);
    yield* page.mouse.move(a.x, a.y);
    yield* page.mouse.down;
    yield* page.mouse.move(b.x, b.y, 5);
    yield* page.mouse.up;
  });

const save = (page: Tab, words: string) =>
  Effect.gen(function* () {
    yield* page.fill('.lab-compose textarea', words);
    yield* click(page, '.lab-compose button[type="submit"]');
  });

describe('marking a frame', () => {
  it.live(
    'a click pins a point, the composer says where, and a save posts and lists it',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openLab(store(), { href: labAt(1) });
        yield* waitFor(page, '.lab-overlay');
        // With no notes yet, the list says how to make one (the panel's header no longer does).
        yield* textHas(page, '[data-role="notes-empty"]', 'click the frame to pin a point');
        yield* textHas(page, '[data-role="notes-empty"] kbd', 'N');
        const at = yield* onFrame(page, 520, 300);
        yield* page.mouse.click(at.x, at.y);
        yield* waitFor(page, '.lab-compose:not([hidden])');
        yield* textHas(page, '.lab-where', 'one · 00:00:01:00 · ');
        yield* attached(page, '.lab-overlay circle.lab-draft');
        yield* save(page, 'the ball rises too early');
        yield* waitFor(page, '.lab-notes .lab-note-item.selected[data-id="n1"]');
        const body = theNote(asked);
        expect(field(body, 'scene')).toEqual(Option.some('one'));
        expect(field(body, 'T')).toEqual(Option.some(1));
        expect(field(body, 'local')).toEqual(Option.some(1));
        expect(field(body, 'frame')).toEqual(Option.some(30));
        expect(field(body, 'text')).toEqual(Option.some('the ball rises too early'));
        expect(field(body, 'box')).toEqual(Option.some({ x: 520, y: 300, w: 0, h: 0 }));
        const still = Option.getOrElse(field(body, 'still'), () => '');
        expect(String(still).length).toBeGreaterThan(100);
        yield* attached(page, '.lab-compose[hidden]');
        yield* attached(page, '.track .tick.note');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a drag draws a box',
    () =>
      Effect.gen(function* () {
        const { page, asked } = yield* openLab(store(), { href: labAt(1) });
        yield* waitFor(page, '.lab-overlay');
        yield* drag(page, [420, 60], [600, 160]);
        yield* attached(page, '.lab-overlay rect.lab-draft');
        yield* save(page, 'too wide');
        yield* waitFor(page, '.lab-note-item[data-id="n1"]');
        const box = field(theNote(asked), 'box');
        const n = (key: string) => Number(Option.getOrElse(field(box, key), () => Number.NaN));
        expect(n('x')).toBeCloseTo(420, -1);
        expect(n('y')).toBeCloseTo(60, -1);
        expect(n('w')).toBeCloseTo(180, -1);
        expect(n('h')).toBeCloseTo(100, -1);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'the pen draws ink',
    () =>
      Effect.gen(function* () {
        const { page, asked } = yield* openLab(store(), { href: labAt(1) });
        yield* waitFor(page, '[data-act="pen"]');
        yield* click(page, '[data-act="pen"]');
        yield* waitFor(page, '[data-act="pen"].on');
        yield* attached(page, '.lab-overlay .lab-notes-surface.pen');
        yield* drag(page, [420, 60], [560, 140]);
        yield* attached(page, '.lab-overlay polyline.lab-draft-ink');
        yield* save(page, 'this arc');
        yield* waitFor(page, '.lab-note-item[data-id="n1"]');
        const body = theNote(asked);
        expect(field(body, 'box')).toEqual(Option.none());
        const ink = Option.getOrElse(field(body, 'ink'), (): Json => []);
        expect(Array.isArray(ink) && ink.length).toBe(1);
        expect(Array.isArray(ink) && Array.isArray(ink[0]) && ink[0].length).toBeGreaterThan(2);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a cancelled gesture (an OS swipe, a call) drops the mark and writes nothing',
    () =>
      Effect.gen(function* () {
        const { page, asked } = yield* openLab(store(), { href: labAt(1) });
        yield* waitFor(page, '.lab-overlay');
        const at = yield* onFrame(page, 520, 300);
        yield* page.mouse.move(at.x, at.y);
        yield* page.mouse.down;
        yield* waitFor(page, '.lab-compose:not([hidden])');
        yield* page.evaluate(
          `document.querySelector('.lab-notes-surface').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))`,
        );
        yield* attached(page, '.lab-compose[hidden]');
        // The next note opens as ever.
        yield* page.mouse.up;
        yield* page.press('n');
        yield* waitFor(page, '.lab-compose:not([hidden])');
        yield* textHas(page, '.lab-where', 'one · 00:00:01:00');
        expect(posted(asked, /^\/notes$/)).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a second finger neither cancels nor lifts the first one’s mark',
    () =>
      Effect.gen(function* () {
        const { page, asked } = yield* openLab(store(), { href: labAt(1) });
        yield* waitFor(page, '.lab-overlay');
        const a = yield* onFrame(page, 420, 60);
        const b = yield* onFrame(page, 600, 160);
        const c = yield* onFrame(page, 300, 300);
        // The mouse is pointer 1: it presses and drags a box.
        yield* page.mouse.move(a.x, a.y);
        yield* page.mouse.down;
        yield* page.mouse.move(b.x, b.y, 5);
        // Pointer 2 is a second finger. The browser cannot make one, so its
        // events are dispatched, and its capture taken as a real touch's is.
        yield* page.evaluate(`(() => {
          const s = document.querySelector('.lab-notes-surface');
          const capture = s.setPointerCapture.bind(s);
          s.setPointerCapture = (id) => { try { capture(id); } catch {} };
          const at = { bubbles: true, pointerId: 2, clientX: ${c.x}, clientY: ${c.y} };
          s.dispatchEvent(new PointerEvent('pointerdown', at));
          s.dispatchEvent(new PointerEvent('pointerup', at));
          s.dispatchEvent(new PointerEvent('pointerdown', at));
          s.dispatchEvent(new PointerEvent('pointercancel', at));
          return true;
        })()`);
        yield* page.mouse.up;
        yield* waitFor(page, '.lab-compose:not([hidden])');
        yield* attached(page, '.lab-overlay rect.lab-draft');
        yield* save(page, 'one finger at a time');
        yield* waitFor(page, '.lab-note-item[data-id="n1"]');
        const box = field(theNote(asked), 'box');
        const n = (key: string) => Number(Option.getOrElse(field(box, key), () => Number.NaN));
        expect(n('x')).toBeCloseTo(420, -1);
        expect(n('y')).toBeCloseTo(60, -1);
        expect(n('w')).toBeCloseTo(180, -1);
        expect(n('h')).toBeCloseTo(100, -1);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a finger held still owns the press as the frame's menu: slid 30 px and lifted, it draws no box and opens no composer",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab(store(), { href: labAt(1) });
        yield* waitFor(page, '.lab-overlay');
        const a = yield* onFrame(page, 400, 240);
        // The clock held: the long press's delay passes only as the test runs it on.
        yield* page.clock.hold;
        yield* page.finger.down(a.x, a.y);
        yield* page.clock.runFor(700);
        yield* waitFor(page, '[data-role="context-menu"]');
        // Away from the menu, which opens below and right of the finger.
        yield* page.finger.move(a.x - 30, a.y - 30, 10);
        yield* page.finger.up;
        yield* page.clock.runFor(100);
        // The press was the menu's: its release is no lift, so the composer closes with no mark.
        yield* evaluates(
          page,
          `document.querySelector('.lab-compose').hidden && document.querySelector('.lab-overlay .lab-draft') === null`,
          true,
        );
        // The menu shut (its close runs on the clock), a plain tap of a finger, its own press and
        // no one's, pins a point.
        yield* page.press('Escape');
        yield* page.clock.runFor(500);
        yield* evaluates(
          page,
          `document.querySelector('[data-role="context-menu"]') === null`,
          true,
        );
        yield* page.finger.down(a.x, a.y);
        yield* page.finger.up;
        yield* page.clock.runFor(100);
        yield* waitFor(page, '.lab-compose:not([hidden])');
        yield* attached(page, '.lab-overlay circle.lab-draft');
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'the marks and pins mount with no cleanup Solid cannot run',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab(
          [route('GET', /^\/notes$/, () => notesFile(1, [noteJson('n1')]))],
          { href: labAt(1) },
        );
        yield* page.reload;
        yield* attached(page, '.track .tick.note');
        yield* waitFor(page, '.lab-overlay');
        expect(page.logged.filter((m) => m.text.includes('NO_OWNER_CLEANUP'))).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'n notes the whole frame, and Escape closes the composer',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab(store(), { href: labAt(1) });
        yield* waitFor(page, '.lab-overlay');
        yield* page.press('n');
        yield* waitFor(page, '.lab-compose:not([hidden])');
        yield* page.press('Escape');
        yield* attached(page, '.lab-compose[hidden]');
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'the Note frame button notes the whole frame, as `n` does, with no box',
    () =>
      Effect.gen(function* () {
        const { page, asked } = yield* openLab(store(), { href: labAt(1) });
        yield* waitFor(page, '[data-act="note-frame"]');
        yield* textIs(page, '[data-act="note-frame"]', 'Note frame');
        yield* click(page, '[data-act="note-frame"]');
        yield* waitFor(page, '.lab-compose:not([hidden])');
        yield* textHas(page, '.lab-where', 'one · 00:00:01:00 · ');
        yield* save(page, 'the whole frame is too dark');
        yield* waitFor(page, '.lab-note-item[data-id="n1"]');
        const body = theNote(asked);
        expect(field(body, 'box')).toEqual(Option.none());
        expect(field(body, 'ink')).toEqual(Option.none());
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a refused save says the server's reason and keeps the draft",
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab(
          [
            route('POST', /^\/notes$/, () =>
              refused(
                ServerFailed.make({ tag: 'StoreFailed', reason: 'the notes file is locked' }),
              ),
            ),
          ],
          { href: labAt(1) },
        );
        yield* waitFor(page, '.lab-overlay');
        yield* page.press('n');
        yield* save(page, 'hold longer');
        yield* textIs(page, '.lab-status', 'the notes file is locked');
        yield* waitFor(page, '.lab-compose:not([hidden])');
        yield* valueIs(page, '.lab-compose textarea', 'hold longer');
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe("a note's place", () => {
  it.live(
    'a note seeks to its time in its scene, so an earlier re-take does not move it off its frame',
    () =>
      Effect.gen(function* () {
        const film = probeFilm();
        const two = film.placed[1];
        const shown = (two?.start ?? 0) + 0.4;
        // Its T is from before scene one was re-taken: it now falls in scene one.
        const stale = noteJson('n1', {
          scene: 'two',
          T: 0.5,
          local: 0.4,
          box: { x: 100, y: 100, w: 50, h: 50 },
        });
        const { page } = yield* openLab([route('GET', /^\/notes$/, () => notesFile(1, [stale]))], {
          href: labAt(3),
          mode: 'note',
        });
        yield* waitFor(page, '.lab-note-item[data-id="n1"]');
        yield* textHas(page, '.lab-note-label', `two · ${timecode(shown)}`);
        yield* click(page, '.lab-note-item[data-id="n1"] .lab-note-text');
        yield* evaluates(page, `Math.round(${URL_T} * ${film.fps})`, Math.round(shown * film.fps));
        yield* attached(page, '.lab-overlay rect.lab-note');
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'the selected note is in the link: a reload keeps it, Back undoes it, and one gone from the feed leaves it',
    () =>
      Effect.gen(function* () {
        const notes = [noteJson('n1'), noteJson('n2')];
        const { page } = yield* openLab([route('GET', /^\/notes$/, () => notesFile(1, notes))], {
          href: labAt(1),
          mode: 'note',
        });
        for (const id of ['n1', 'n2']) {
          yield* click(page, `.lab-note-item[data-id="${id}"] .lab-note-text`);
          yield* evaluates(page, NOTE_IN_URL, id);
        }
        yield* page.reload;
        yield* attached(page, '.lab-note-item[data-id="n2"].selected');
        yield* page.back;
        yield* attached(page, '.lab-note-item[data-id="n1"].selected');
        // A link to a note the feed does not have: the URL lets it go, in place.
        yield* page.goto(labAt(1, { note: 'gone' }));
        yield* waitFor(page, '.lab-note-item[data-id="n1"]');
        yield* evaluates(page, NOTE_IN_URL, '');
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a pasted note link shows Note on its page and leaves the viewer's own mode as it was (US2-3)",
    () =>
      Effect.gen(function* () {
        const MODE =
          "document.querySelector('.lab-panel[data-staged=\"true\"]')?.dataset.mode ?? ''";
        const { page } = yield* openLab(
          [route('GET', /^\/notes$/, () => notesFile(1, [noteJson('n1')]))],
          { mode: 'motion' },
        );
        yield* page.goto(labAt(1, { note: 'n1' }));
        yield* waitFor(page, '.lab-note-item[data-id="n1"].selected');
        yield* evaluates(page, MODE, 'note');
        // The next lab opened with no note is in the mode the viewer picked.
        yield* page.goto(labAt(1));
        yield* evaluates(page, MODE, 'motion');
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a drag across a cue lane marks a range; a note carries it and the cue selected as a chip one tap clears',
    () =>
      Effect.gen(function* () {
        const dur = probeFilm().placed[0]?.dur ?? Number.NaN;
        const { page, asked, errors } = yield* openLab(store(), {
          href: labAt(1, { selection: cueOf('one', 'rise') }),
        });
        const lane = '.lab-strip-row:has([data-cue="fall"])';
        yield* waitFor(page, lane);
        const rows = yield* page.box('.lab-strip-rows');
        const row = yield* page.box(lane);
        const xAt = (local: number) => rows.x + (local / dur) * rows.width;
        const y = row.y + row.height / 2;
        yield* page.mouse.move(xAt(0.5), y);
        yield* page.mouse.down;
        yield* page.mouse.move(xAt(1), y, 5);
        yield* page.mouse.up;
        yield* waitFor(page, '[data-role="in-out"]');
        yield* page.press('n');
        yield* textIs(
          page,
          '[data-role="note-scope"] .lab-scope-text',
          'one · rise · 00:00:00:15–00:00:01:00',
        );
        yield* save(page, 'the rise starts too late');
        yield* waitFor(page, '.lab-note-item[data-id="n1"]');
        const body = theNote(asked);
        expect(field(body, 'cue')).toEqual(Option.some({ name: 'rise', edge: 'start' }));
        const range = field(body, 'range');
        const at = (key: string) => Number(Option.getOrThrow(field(range, key)));
        expect(Math.abs(at('from') - 0.5)).toBeLessThan(0.02);
        expect(Math.abs(at('to') - 1)).toBeLessThan(0.02);
        // The next note starts scoped again; its × writes it about the frame alone.
        yield* page.press('n');
        yield* waitFor(page, '[data-role="note-scope"]');
        yield* click(page, '[data-role="note-scope"] [data-act="clear-scope"]');
        yield* attached(page, '.lab-compose:not(:has([data-role="note-scope"]))');
        yield* save(page, 'and the whole frame is dark');
        // The fake store answers every save as n1: the second post is what is read.
        yield* Effect.sync(() => posted(asked, /^\/notes$/).length).pipe(
          Effect.repeat({ schedule: Schedule.spaced('25 millis'), until: (n) => n >= 2 }),
          Effect.timeout('10 seconds'),
        );
        const second = Option.flatten(Option.fromUndefinedOr(posted(asked, /^\/notes$/)[1]));
        expect(field(second, 'range')).toEqual(Option.none());
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('the thread', () => {
  it.live(
    'a selected note takes a reply and a resolve',
    () =>
      Effect.gen(function* () {
        const { page, asked } = yield* openLab(
          [
            route('GET', /^\/notes$/, () => notesFile(1, [noteJson('n1')])),
            route('POST', /^\/notes\/n1\/reply$/, () => json(noteJson('n1'))),
            route('POST', /^\/notes\/n1\/resolve$/, () => json(noteJson('n1'))),
          ],
          { href: labAt(3), mode: 'note' },
        );
        yield* waitFor(page, '.lab-note-item[data-id="n1"]');
        yield* click(page, '.lab-note-item[data-id="n1"] .lab-note-text');
        yield* waitFor(page, '.lab-note-item.selected .lab-reply-input');
        yield* page.fill('.lab-reply-input', 'see frame 31');
        yield* answered(page, '/notes/n1/reply', page.pressIn('.lab-reply-input', 'Enter'));
        yield* answered(page, '/notes/n1/resolve', page.click('.lab-resolve'));
        expect(posted(asked, /^\/notes\/n1\/reply$/)).toEqual([
          Option.some({ text: 'see frame 31' }),
        ]);
        expect(posted(asked, /^\/notes\/n1\/resolve$/)).toHaveLength(1);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

const agentReply: Reply = {
  seq: 2,
  by: 'agent',
  text: 'moved rise to {lift}',
  at: '2026-09-28T00:01:00Z',
};

describe('the feed', () => {
  it.live(
    'a change the long-poll brings in shows as it lands',
    () =>
      Effect.gen(function* () {
        const replied = noteJson('n1', { status: 'replied', changed: 2, thread: [agentReply] });
        const notes: Array<Json> = [noteJson('n1')];
        const { page } = yield* openLab(
          [
            route('GET', /^\/notes$/, () => notesFile(notes.length, notes)),
            route('GET', /^\/notes\/wait\?since=1&/, () => {
              notes.splice(0, 1, replied);
              return json({
                cursor: 2,
                events: [{ _tag: 'NoteReplied', seq: 2, note: replied, reply: agentReply }],
              });
            }),
          ],
          { href: labAt(1), mode: 'note' },
        );
        yield* waitFor(page, '.lab-note-item[data-id="n1"] .lab-reply.agent');
        yield* textIs(page, '.lab-reply.agent .lab-reply-text', 'moved rise to {lift}');
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a lost feed says so, and connects again',
    () =>
      Effect.gen(function* () {
        const tries: Array<number> = [];
        const { page } = yield* openLab(
          [
            route('GET', /^\/notes$/, () => {
              tries.push(tries.length);
              if (tries.length === 1)
                return refused(
                  ServerFailed.make({ tag: 'StoreFailed', reason: 'notes.json is being written' }),
                );
              return notesFile(0, []);
            }),
          ],
          { href: labAt(1), mode: 'note' },
        );
        // The feed says nothing while it connects again, before the read goes
        // out, so the test waits for the read that succeeds, not the quiet.
        const again = yield* page.nextAnswer(
          (r) => r.url.endsWith('/notes') && r.status >= 200 && r.status < 300,
        );
        yield* textHas(page, '.lab-feed', 'notes.json is being written');
        // The retry's wait, on the page's clock.
        yield* page.clock.fastForward(RETRY_MS);
        yield* again;
        yield* textIs(page, '.lab-feed', '');
        expect(tries).toHaveLength(2);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

describe('walking the notes', () => {
  /** Three notes in time order, the middle one resolved. */
  const three = [
    noteJson('n1', { T: 1, frame: 30 }),
    noteJson('n2', { T: 1.5, frame: 45, seq: 2, status: 'resolved' }),
    noteJson('n3', { T: 2, frame: 60, seq: 3 }),
  ];

  it.live(
    '⇧N and ⌥⇧N step through the open notes by time, and Go to finds one by its words',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([route('GET', /^\/notes$/, () => notesFile(3, three))], {
          href: labAt(0.2),
          mode: 'note',
        });
        yield* waitFor(page, '.lab-note-item[data-id="n3"]');
        yield* page.press('Shift+N');
        yield* evaluates(page, NOTE_IN_URL, 'n1');
        yield* page.until(`Math.abs(${URL_T} - 1) < 0.01`);
        // The resolved note is passed over.
        yield* page.press('Shift+N');
        yield* evaluates(page, NOTE_IN_URL, 'n3');
        yield* page.press('Alt+Shift+N');
        yield* evaluates(page, NOTE_IN_URL, 'n1');
        yield* page.press('/');
        yield* page.fill('.lab-command-query', 'go to note n2');
        yield* page.pressIn('.lab-command-query', 'Enter');
        yield* evaluates(page, NOTE_IN_URL, 'n2');
      }).pipe(Effect.scoped),
    SLOW,
  );
});
