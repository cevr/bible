// The studio's edits as an agent and the page make them, over a film in
// memory whose clock is laid from its script as it stands (the fresh read the
// lab makes, here in the test's process): a beat moved through `beat_move`
// lands in the script's order and the timeline follows it (the later beats
// move up, the movement on it moves with it) and its work is filed on the
// production's ledger; `undo` puts the script back byte for byte and
// withdraws the work; a hold set through `beat_hold` is snapped and held to
// its floor; two edits undo one at a time, and an older one asked by id is
// refused while a newer stands; a move that would break the acts or the
// movements is refused and writes nothing; the page's routes and the tools
// step one history; a note is withdrawn while it is unanswered.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, Result, Schema } from 'effect';
import { filmClock } from '../core/film-timeline.ts';
import { layout } from '../core/layout.ts';
import { RenderCatalogue } from './catalogue.ts';
import { ProductionStore } from './production-store.ts';
import {
  type LabFetch,
  MCP_BASE,
  echoPages,
  freshFilm,
  labInMemory,
  labWithMcp,
  mcpBound,
  mcpSession,
  text,
  writesInMemory,
} from './testing.ts';

const SCRIPT = '/films/f/script.ts';

const WRITTEN = `export const script = [
  // The open.
  { id: 'cold', say: 'one two three four five six' },
  { id: 'look', say: 'seven eight' },
  { id: 'title', say: 'nine ten eleven' },
];
`;

/** RBF's shape: a voiced beat, a silent title, and a thesis its `min` holds longer than its words. */
const LIKE_RBF = `export const script = [
  { id: 'cold', say: 'one two three four five six' },
  { id: 'title' },
  { id: 'thesis', say: 'seven eight', min: 28 },
];
`;

/** The acts and the score's movements the film declares, each on the beat it begins on. */
const ACTS = [
  { from: 'cold', name: 'open' },
  { from: 'title', name: 'close' },
];
const MOVEMENTS = [
  { from: 'cold', name: 'calm' },
  { from: 'look', name: 'rise' },
];

/** Every stat names a newer mtime, so the lab reads the clock fresh each time, as it would after each write. */
class Ticking extends Map<string, number> {
  private n = 0;
  override get(_key: string) {
    this.n += 1;
    return this.n;
  }
}

/** Each beat line of a script (`{ id: 'cold', say: '…', tail: 3 }`, one a line): its id, its words, its holds and its `min`. */
const BEAT_LINE = /\{ id: '(\w+)'(.*)\}/;
const SAY = /say: '([^']*)'/;
const HOLD = /(lead|tail|min): ([\d.]+)/g;

/** The beats a script writes, in order: their ids, words, declared holds and `min`, read as its text stands. */
const beatsOf = (source: string) =>
  source.split('\n').flatMap((line) =>
    Option.match(Option.fromNullishOr(BEAT_LINE.exec(line)), {
      onNone: () => [],
      onSome: ([, id = '', rest = '']) => [
        {
          id,
          ...Option.match(Option.fromNullishOr(SAY.exec(rest)), {
            onNone: () => ({}),
            onSome: ([, say = '']) => ({ say }),
          }),
          ...Object.fromEntries(
            [...rest.matchAll(HOLD)].map(([, edge = '', v = '']) => [edge, Number(v)]),
          ),
        },
      ],
    }),
  );

/** The clock of `files`' script as it now stands: its beats in order, their declared holds, laid out. */
const clockOf = (files: Map<string, Uint8Array>) =>
  Effect.sync(() => {
    const beats = beatsOf(new TextDecoder().decode(files.get(SCRIPT)));
    const placed = Result.getOrThrow(layout(beats, { voice: '', scenes: {} }));
    // The parts on beats this script holds.
    const on = (parts: ReadonlyArray<{ readonly from: string; readonly name: string }>) =>
      parts.filter((p) => beats.some((b) => b.id === p.from));
    return Result.getOrThrow(
      filmClock(placed, { acts: on(ACTS), movements: on(MOVEMENTS), drawn: () => true }),
    );
  });

const provided = <A, E, R>(
  self: (files: Map<string, Uint8Array>) => Effect.Effect<A, E, R>,
  script = WRITTEN,
) => {
  const files = new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    [SCRIPT, text(script)],
  ]);
  return self(files).pipe(
    Effect.scoped,
    Effect.provide(
      RenderCatalogue.layer.pipe(
        Layer.provideMerge(
          labInMemory(files, echoPages, {
            mtimes: new Ticking(),
            film: freshFilm({ clock: () => clockOf(files) }),
            writes: writesInMemory,
          }),
        ),
      ),
    ),
  );
};

/** Film `f`'s production, one version open on its registered files. */
const produced = Effect.flatMap(ProductionStore, (productions) =>
  productions.start('f', {
    title: 'F',
    film: Option.some('f'),
    blurb: Option.none(),
    first: 'the first cut',
    at: 1,
  }),
);

/** The notes the ledger holds, as `[text, by]`. */
const ledgerNotes = Effect.gen(function* () {
  const file = Option.getOrThrow(yield* (yield* ProductionStore).read('f'));
  return file.said.map((s) => [s.text, Option.getOrElse(s.by, () => '')]);
});

const scriptNow = (files: Map<string, Uint8Array>) => new TextDecoder().decode(files.get(SCRIPT));

const Json = Schema.fromJsonString(Schema.Json);

/** A POST to the lab's API, as the page sends it: its status and its body. */
const post = (lab: LabFetch, path: string, body: Schema.Json) =>
  Effect.gen(function* () {
    const sent = yield* Effect.orDie(Schema.encodeEffect(Json)(body));
    const answer = yield* Effect.promise(() =>
      lab(
        new Request(`${MCP_BASE.slice(0, -1)}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: sent,
        }),
        mcpBound,
      ),
    );
    // Read as the page reads JSON: the test names the fields it checks.
    const read = yield* Effect.promise(() => answer.json());
    return { status: answer.status, body: read };
  });

/** A GET of the lab's API, as the page sends it: its status and its body. */
const get = (lab: LabFetch, path: string) =>
  Effect.gen(function* () {
    const answer = yield* Effect.promise(() =>
      lab(new Request(`${MCP_BASE.slice(0, -1)}${path}`), mcpBound),
    );
    const read = yield* Effect.promise(() => answer.json());
    return { status: answer.status, body: read };
  });

/** The beats the script lane shows, as `[beat, start]`. */
const scriptLane = (timeline: { lanes: ReadonlyArray<{ track: string; clips: any }> }) =>
  timeline.lanes
    .find((l) => l.track === 'script')
    ?.clips.map((c: { beat: string; start: number }) => [c.beat, c.start]);

describe('beat_move and undo', () => {
  it.effect(
    'moves a beat in the script, the timeline following, files the work, and undoes it byte for byte',
    () =>
      provided((files) =>
        Effect.gen(function* () {
          yield* produced;
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const before = yield* tool('timeline', { film: 'f' });
          const [, lookAt] = scriptLane(before)[1];
          const moved = yield* tool('beat_move', {
            film: 'f',
            beat: 'title',
            before: 'look',
            by: 'painter',
          });
          expect(moved.said).toBe('Moved title before look. Agents re-time and re-check.');
          expect(moved.target).toBe('move title before look');
          expect(beatsOf(scriptNow(files)).map((b) => b.id)).toEqual(['cold', 'title', 'look']);
          expect(scriptNow(files)).toContain('// The open.');
          // The rest follows: look plays later, its movement starts with it.
          const after = yield* tool('timeline', { film: 'f' });
          const lane = scriptLane(after);
          expect(lane.map(([beat]: [string]) => beat)).toEqual(['cold', 'title', 'look']);
          expect(lane[2][1]).toBeGreaterThan(lookAt);
          const rise = after.lanes
            .find((l: { track: string }) => l.track === 'sound')
            .clips.find((c: { movement: string }) => c.movement === 'rise');
          expect(rise.start).toBe(lane[2][1]);
          expect(yield* ledgerNotes).toEqual([
            ['Moved title before look. Re-time, re-check seams, re-render.', 'painter'],
          ]);
          const undone = yield* tool('undo', { film: 'f', change: moved.change });
          expect(undone.said).toBe('Undone: Moved title before look.');
          expect(scriptNow(files)).toBe(WRITTEN);
          expect(yield* ledgerNotes).toEqual([]);
        }),
      ),
  );

  it.effect(
    'refuses a move that breaks the acts or the movements, or is no move, writing nothing',
    () =>
      provided((files) =>
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const ask = (beat: string, before: string) =>
            tool('beat_move', { film: 'f', beat, before, by: 'painter' });
          expect((yield* ask('title', 'cold')).refused).toContain(
            "the move would break the film's parts",
          );
          expect((yield* ask('look', 'cold')).refused).toContain(
            "the move would break the film's parts",
          );
          expect((yield* ask('look', 'title')).refused).toContain('"look" is already there');
          expect((yield* ask('look', 'look')).refused).toContain('cannot go before itself');
          expect((yield* ask('nope', 'cold')).refused).toContain('the script has no beat "nope"');
          expect(scriptNow(files)).toBe(WRITTEN);
        }),
      ),
  );
});

describe('beat_hold', () => {
  it.effect('holds a beat snapped to a tenth, and back on its floor as the default', () =>
    provided((files) =>
      Effect.gen(function* () {
        const { lab } = yield* labWithMcp;
        const { tool } = yield* mcpSession(lab);
        const held = yield* tool('beat_hold', {
          film: 'f',
          beat: 'look',
          edge: 'tail',
          seconds: 3.04,
          by: 'painter',
        });
        expect(held.said).toBe('Held look +2.9 s after its words. Agents re-time and re-check.');
        // The seams it moved, as the version reads after it: into look, and out of it.
        expect(held.seams).toEqual([
          { from: 'cold', to: 'look', seconds: 0.6 },
          { from: 'look', to: 'title', seconds: 3.5 },
        ]);
        expect(beatsOf(scriptNow(files)).find((b) => b.id === 'look')).toMatchObject({ tail: 3 });
        // Below its floor: the default, written as none.
        yield* tool('beat_hold', { film: 'f', beat: 'look', edge: 'tail', seconds: 0, by: 'p' });
        expect(beatsOf(scriptNow(files)).find((b) => b.id === 'look')).not.toHaveProperty('tail');
        // A lead asked under its floor, where the layout already holds it: nothing to write.
        const floor = yield* tool('beat_hold', {
          film: 'f',
          beat: 'cold',
          edge: 'lead',
          seconds: 0.2,
          by: 'p',
        });
        expect(floor.change).toBeUndefined();
        expect(floor.said).toBe('cold already holds 0.5 s before its words.');
        const lead = yield* tool('beat_hold', {
          film: 'f',
          beat: 'cold',
          edge: 'lead',
          seconds: 1.24,
          by: 'p',
        });
        expect(lead.target).toBe('hold cold lead');
        expect(beatsOf(scriptNow(files)).find((b) => b.id === 'cold')).toMatchObject({ lead: 1.2 });
      }),
    ),
  );
});

describe('beat_hold on a beat a hold cannot change', () => {
  it.effect('refuses a hold on a silent beat, in words, on the tool and the page alike', () =>
    provided(
      (files) =>
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const asked = yield* tool('beat_hold', {
            film: 'f',
            beat: 'title',
            edge: 'tail',
            seconds: 5,
            by: 'painter',
          });
          expect(asked.refused).toContain('title has no words to hold: it lasts 3.0 s');
          const page = yield* post(lab, '/api/films/f/beats/hold', {
            beat: 'title',
            edge: 'lead',
            seconds: 2,
          });
          expect(page.status).toBe(422);
          expect(page.body._tag).toBe('HoldUnchanged');
          expect(page.body.reason).toContain('title has no words to hold: it lasts 3.0 s');
          expect(scriptNow(files)).toBe(LIKE_RBF);
        }),
      LIKE_RBF,
    ),
  );

  it.effect(
    'refuses a tail its min absorbs, and lays a lead or a longer tail as the layout does',
    () =>
      provided(
        (files) =>
          Effect.gen(function* () {
            const { lab } = yield* labWithMcp;
            const { tool } = yield* mcpSession(lab);
            const thesis = () =>
              Effect.map(tool('timeline', { film: 'f' }), (t) =>
                t.lanes
                  .find((l: { track: string }) => l.track === 'script')
                  .clips.find((c: { beat: string }) => c.beat === 'thesis'),
              );
            const before = yield* thesis();
            expect(before.dur).toBe(28);
            const absorbed = yield* tool('beat_hold', {
              film: 'f',
              beat: 'thesis',
              edge: 'tail',
              seconds: 1,
              by: 'painter',
            });
            expect(absorbed.refused).toContain('thesis is held at 28.0 s by its min');
            expect(scriptNow(files)).toBe(LIKE_RBF);
            // A lead still moves its words inside the 28 s.
            const lead = yield* tool('beat_hold', {
              film: 'f',
              beat: 'thesis',
              edge: 'lead',
              seconds: 2,
              by: 'painter',
            });
            expect(lead.target).toBe('hold thesis lead');
            const led = yield* thesis();
            expect(led.dur).toBe(28);
            expect(led.speech.start - led.start).toBe(2);
            // A tail past what the min holds lengthens it, as the layout lays it.
            expect(led.hold.tail).toBeLessThan(27);
            const tail = yield* tool('beat_hold', {
              film: 'f',
              beat: 'thesis',
              edge: 'tail',
              seconds: 27,
              by: 'painter',
            });
            expect(tail.target).toBe('hold thesis tail');
            const words = led.speech.end - led.speech.start;
            expect((yield* thesis()).dur).toBeCloseTo(2 + words + 27, 3);
            // Back to 1 s, its min takes some of the change: the receipt says what plays.
            const back = yield* tool('beat_hold', {
              film: 'f',
              beat: 'thesis',
              edge: 'tail',
              seconds: 1,
              by: 'painter',
            });
            const plays = (28 - 2 - words - 27).toFixed(1);
            expect(back.said).toBe(
              `Held thesis −${plays.replace('-', '')} s after its words. Agents re-time and re-check.`,
            );
            expect((yield* thesis()).dur).toBe(28);
          }),
        LIKE_RBF,
      ),
  );
});

describe('one history', () => {
  it.effect(
    'two edits undo one at a time; an older one asked by id is refused while a newer stands',
    () =>
      provided((files) =>
        Effect.gen(function* () {
          yield* produced;
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          // The owner moves on the page; the agent holds through its tool.
          const moved = yield* post(lab, '/api/films/f/beats/move', { beat: 'look' });
          expect(moved.status).toBe(200);
          expect(moved.body.said).toBe('Moved look to the end. Agents re-time and re-check.');
          expect(moved.body.steps.undo.target).toBe('move look to the end');
          const afterMove = scriptNow(files);
          const held = yield* tool('beat_hold', {
            film: 'f',
            beat: 'cold',
            edge: 'tail',
            seconds: 2,
            by: 'painter',
          });
          expect(yield* ledgerNotes).toEqual([
            ['Moved look to the end. Re-time, re-check seams, re-render.', 'the studio'],
            ['Held cold +1.9 s after its words. Re-time, re-check seams, re-render.', 'painter'],
          ]);
          const older = yield* tool('undo', { film: 'f', change: moved.body.change });
          expect(older.refused).toContain('hold cold tail');
          // ⌘Z on the page sends the newest step it knows: its own move, refused while the hold stands.
          const stale = yield* post(lab, '/api/films/f/edits/undo', {
            change: moved.body.steps.undo.change,
          });
          expect(stale.status).toBe(409);
          expect(stale.body._tag).toBe('StepNotNewest');
          expect(stale.body.reason).toContain('hold cold tail came after it');
          // The page reads the history again, and its next ⌘Z sends the agent's hold.
          const history = yield* get(lab, '/api/films/f/steps');
          expect(history.body.undo.change).toBe(held.change);
          const first = yield* post(lab, '/api/films/f/edits/undo', {
            change: history.body.undo.change,
          });
          expect(first.body.said).toBe('Undone: Held cold +1.9 s after its words.');
          expect(first.body.change).toBe(held.change);
          expect(scriptNow(files)).toBe(afterMove);
          expect(yield* ledgerNotes).toEqual([
            ['Moved look to the end. Re-time, re-check seams, re-render.', 'the studio'],
          ]);
          const second = yield* post(lab, '/api/films/f/edits/undo', {
            change: first.body.steps.undo.change,
          });
          expect(second.body.said).toBe('Undone: Moved look to the end.');
          expect(scriptNow(files)).toBe(WRITTEN);
          expect(yield* ledgerNotes).toEqual([]);
          // ⇧⌘Z makes the move again, and files its work again: each names the step its answer gave.
          const redone = yield* post(lab, '/api/films/f/edits/redo', {
            change: second.body.steps.redo.change,
          });
          expect(redone.body.said).toBe('Redone: Moved look to the end.');
          expect(scriptNow(files)).toBe(afterMove);
          expect((yield* ledgerNotes).length).toBe(1);
          const again = yield* post(lab, '/api/films/f/edits/redo', {
            change: redone.body.steps.redo.change,
          });
          expect(again.body.change).toBe(held.change);
          expect((yield* ledgerNotes).length).toBe(2);
          // Nothing left undone: the page shows no Redo, and the lab refuses one asked.
          expect(again.body.steps.redo).toBeUndefined();
          const nothing = yield* post(lab, '/api/films/f/edits/redo', {});
          expect(nothing.status).toBe(409);
        }),
      ),
  );
});

describe('a note withdrawn', () => {
  it.effect('is taken back while it is unanswered, and stands once answered', () =>
    provided(() =>
      Effect.gen(function* () {
        const { lab } = yield* labWithMcp;
        const draft = {
          scene: 'look',
          T: 3,
          frame: 90,
          text: 'too dark here',
          still: 'iVBORw0KGgo=',
        };
        const added = yield* post(lab, '/api/films/f/notes', draft);
        expect(added.status).toBe(200);
        const withdrawn = yield* post(lab, `/api/films/f/notes/${added.body.id}/withdraw`, {});
        expect(withdrawn.status).toBe(200);
        expect(withdrawn.body.text).toBe('too dark here');
        const { tool } = yield* mcpSession(lab);
        expect((yield* tool('notes', { film: 'f', status: 'all' })).notes).toEqual([]);
        const kept = yield* post(lab, '/api/films/f/notes', draft);
        yield* tool('reply', { film: 'f', note: kept.body.id, text: 'lifted the lamp' });
        const late = yield* post(lab, `/api/films/f/notes/${kept.body.id}/withdraw`, {});
        expect(late.status).toBe(409);
        expect(late.body._tag).toBe('NoteAnswered');
      }),
    ),
  );
});
