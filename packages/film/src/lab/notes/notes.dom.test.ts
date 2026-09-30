// The notes in a browser, over the probe film with the lab API faked: a click
// on the frame pins a point and opens the composer at that frame, a drag
// draws a box, the pen draws ink, `n` notes the whole frame and Escape closes;
// a save posts the note with its still and lists it, selected, with a pin on
// the timeline; a refused save says the server's reason; a reply and a
// resolve post to the note's thread; a change the long-poll brings in shows
// as it lands; and a lost feed says so and connects again.

import { Effect, Option, Predicate } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import type { Page } from 'playwright-core';
import {
  type Asked,
  type FakeRoute,
  type Json,
  json,
  openLab,
  refused,
  route,
} from '../fixtures/harness.ts';
import { ServerFailed } from '../../core/api.ts';
import { PROBE } from '../fixtures/probe-film.ts';
import { RETRY_MS } from './feed.ts';
import type { Note, Reply } from '../../core/schema.ts';

/** Long enough to open the lab, draw, save and read the list back. */
const SLOW = 15_000;

type JsonObject = { readonly [key: string]: Json };

const click = (page: Page, selector: string) => Effect.promise(() => page.click(selector));

/**
 * Do `act` and wait for the answer to the request whose URL ends `suffix`,
 * listening before `act` starts: a fake route answers at once, so a listener
 * added after the act can miss the answer and wait forever.
 */
const answered = (page: Page, suffix: string, act: () => Promise<unknown>) =>
  Effect.gen(function* () {
    const answer = page.waitForResponse((r) => r.url().endsWith(suffix));
    yield* Effect.promise(act);
    yield* Effect.promise(() => answer);
  });

const waitFor = (page: Page, selector: string) =>
  Effect.promise(() => page.waitForSelector(selector));

/** Present in the page, shown or not (a hidden composer). */
const waitAttached = (page: Page, selector: string) =>
  Effect.promise(() => page.waitForSelector(selector, { state: 'attached' }));

const textOf = (page: Page, selector: string, part: string) =>
  Effect.promise(() =>
    page.waitForFunction(
      ([sel, want]) => (document.querySelector(sel ?? '')?.textContent ?? '').includes(want ?? ''),
      [selector, part],
    ),
  );

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
const onFrame = (page: Page, x: number, y: number) =>
  Effect.promise(() => page.locator('.lab-overlay').boundingBox()).pipe(
    Effect.flatMap(Effect.fromNullishOr),
    Effect.orDie,
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

const drag = (page: Page, from: readonly [number, number], to: readonly [number, number]) =>
  Effect.gen(function* () {
    const a = yield* onFrame(page, from[0], from[1]);
    const b = yield* onFrame(page, to[0], to[1]);
    yield* Effect.promise(() => page.mouse.move(a.x, a.y));
    yield* Effect.promise(() => page.mouse.down());
    yield* Effect.promise(() => page.mouse.move(b.x, b.y, { steps: 5 }));
    yield* Effect.promise(() => page.mouse.up());
  });

const save = (page: Page, words: string) =>
  Effect.gen(function* () {
    yield* Effect.promise(() => page.fill('.lab-compose textarea', words));
    yield* click(page, '.lab-compose button[type="submit"]');
  });

describe('marking a frame', () => {
  it.live(
    'a click pins a point, the composer says where, and a save posts and lists it',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openLab(store(), { hash: '#1' });
        yield* waitFor(page, '.lab-overlay');
        const at = yield* onFrame(page, 520, 300);
        yield* Effect.promise(() => page.mouse.click(at.x, at.y));
        yield* waitFor(page, '.lab-compose:not([hidden])');
        yield* textOf(page, '.lab-where', 'one · 1.00s · f30');
        yield* waitAttached(page, '.lab-overlay circle.lab-draft');
        yield* save(page, 'the ball rises too early');
        yield* waitFor(page, '.lab-notes .lab-note-item.selected[data-id="n1"]');
        const body = theNote(asked);
        expect(field(body, 'scene')).toEqual(Option.some('one'));
        expect(field(body, 'T')).toEqual(Option.some(1));
        expect(field(body, 'frame')).toEqual(Option.some(30));
        expect(field(body, 'text')).toEqual(Option.some('the ball rises too early'));
        expect(field(body, 'box')).toEqual(Option.some({ x: 520, y: 300, w: 0, h: 0 }));
        const still = Option.getOrElse(field(body, 'still'), () => '');
        expect(String(still).length).toBeGreaterThan(100);
        yield* waitAttached(page, '.lab-compose[hidden]');
        yield* waitAttached(page, '.track .tick.note');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a drag draws a box',
    () =>
      Effect.gen(function* () {
        const { page, asked } = yield* openLab(store(), { hash: '#1' });
        yield* waitFor(page, '.lab-overlay');
        yield* drag(page, [420, 60], [600, 160]);
        yield* waitAttached(page, '.lab-overlay rect.lab-draft');
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
        const { page, asked } = yield* openLab(store(), { hash: '#1' });
        yield* waitFor(page, '[data-act="pen"]');
        yield* click(page, '[data-act="pen"]');
        yield* waitFor(page, '[data-act="pen"].on');
        yield* waitAttached(page, '.lab-overlay .lab-notes-surface.pen');
        yield* drag(page, [420, 60], [560, 140]);
        yield* waitAttached(page, '.lab-overlay polyline.lab-draft-ink');
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
    'the marks and pins mount with no cleanup Solid cannot run',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab(
          [route('GET', /^\/notes$/, () => notesFile(1, [noteJson('n1')]))],
          { hash: '#1' },
        );
        const warned: Array<string> = [];
        page.on('console', (m) => warned.push(m.text()));
        yield* Effect.promise(() => page.reload());
        yield* waitAttached(page, '.track .tick.note');
        yield* waitFor(page, '.lab-overlay');
        expect(warned.filter((w) => w.includes('NO_OWNER_CLEANUP'))).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'n notes the whole frame, and Escape closes the composer',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab(store(), { hash: '#1' });
        yield* waitFor(page, '.lab-overlay');
        yield* Effect.promise(() => page.keyboard.press('n'));
        yield* waitFor(page, '.lab-compose:not([hidden])');
        yield* Effect.promise(() => page.keyboard.press('Escape'));
        yield* waitAttached(page, '.lab-compose[hidden]');
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
          { hash: '#1' },
        );
        yield* waitFor(page, '.lab-overlay');
        yield* Effect.promise(() => page.keyboard.press('n'));
        yield* save(page, 'hold longer');
        yield* textOf(page, '.lab-status', 'the notes file is locked');
        const status = yield* Effect.promise(() => page.textContent('.lab-status'));
        expect(status).toBe('the notes file is locked');
        yield* waitFor(page, '.lab-compose:not([hidden])');
        const kept = yield* Effect.promise(() => page.inputValue('.lab-compose textarea'));
        expect(kept).toBe('hold longer');
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
          { hash: '#3' },
        );
        yield* waitFor(page, '.lab-note-item[data-id="n1"]');
        yield* click(page, '.lab-note-item[data-id="n1"] .lab-note-text');
        yield* waitFor(page, '.lab-note-item.selected .lab-reply-input');
        yield* Effect.promise(() => page.fill('.lab-reply-input', 'see frame 31'));
        yield* answered(page, '/notes/n1/reply', () => page.press('.lab-reply-input', 'Enter'));
        yield* answered(page, '/notes/n1/resolve', () => page.click('.lab-resolve'));
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
          { hash: '#1' },
        );
        yield* waitFor(page, '.lab-note-item[data-id="n1"] .lab-reply.agent');
        const reply = yield* Effect.promise(() =>
          page.textContent('.lab-reply.agent .lab-reply-text'),
        );
        expect(reply).toBe('moved rise to {lift}');
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
          { hash: '#1' },
        );
        // The feed says nothing while it connects again, before the read goes
        // out, so the test waits for the read that succeeds, not the quiet.
        const again = page.waitForResponse((r) => r.url().endsWith('/notes') && r.ok());
        yield* textOf(page, '.lab-feed', 'notes.json is being written');
        // The retry's wait, on the page's clock.
        yield* Effect.promise(() => page.clock.fastForward(RETRY_MS));
        yield* Effect.promise(() => again);
        yield* Effect.promise(() =>
          page.waitForFunction(
            () => (document.querySelector('.lab-feed')?.textContent ?? 'absent') === '',
          ),
        );
        expect(tries).toHaveLength(2);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
