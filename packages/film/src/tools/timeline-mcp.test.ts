// The studio's tools through the lab's MCP, as an agent calls them: a film's
// timeline at its production's open version (the registered files, read
// fresh), at a version asked (a version folder's clock, read fresh with its
// folder, and its own Board on its lane), a version it has not refused by
// name, and only the lanes asked; the header waits on the open version's
// Board whichever version is read; a clock is read once per stamp of the
// film's sources; an agent's "doing now" line on the header, said by name,
// replaced by its next and cleared when it says it is done. The lines
// themselves clear after half an hour of silence (`Working`, on the test
// clock).

import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Layer, Option, Result, Schema } from 'effect';
import { TestClock } from 'effect/testing';
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import type { FilmClock } from '../core/film-timeline.ts';
import { Segment } from '../core/segment.ts';
import { RenderCatalogue } from './catalogue.ts';
import { ProductionStore } from './production-store.ts';
import { echoPages, freshFilm, labInMemory, labWithMcp, mcpSession, text } from './testing.ts';
import { WORKING_HELD, Working } from './working.ts';

/** Film `f`'s v1, kept in its folder (`v1/`): a voiced beat with a mark, its take staged, and a silent one. */
const older: FilmClock = {
  beats: [
    {
      id: 'cold',
      start: 0,
      dur: 6,
      speech: { start: 0.5, end: 5.9 },
      marks: [{ name: 'judge', at: 3 }],
      voice: 'staging',
      drawn: true,
    },
    { id: 'title', start: 6, dur: 3, marks: [], voice: 'silent', drawn: true },
  ],
  acts: [{ name: 'open', from: 'cold', start: 0, end: 9 }],
  movements: [],
};

/** Its registered files' clock (v2, open): the script rewritten, no take yet. */
const registered: FilmClock = {
  beats: [
    {
      id: 'seed',
      start: 0,
      dur: 8,
      speech: { start: 0.5, end: 7.9 },
      marks: [],
      voice: 'estimated',
      drawn: false,
    },
  ],
  acts: [],
  movements: [],
};

/** A Board of one panel, its one try kept. */
const boardOf = (beat: string, at: string): BoardFile => ({
  film: 'f',
  panels: [
    {
      id: `${beat}.${at}`,
      beat: BoardName.make(beat),
      at: BoardName.make(at),
      tries: [
        {
          n: 1,
          file: Segment.make(`${beat}.${at}.1.png`),
          sha256: 's1',
          made: 'import',
          refs: [],
          at: '2026-10-14T00:00:00.000Z',
        },
      ],
      kept: 1,
    },
  ],
  approvals: [],
});

/** Film `f` with its Board, and its v1 folder with its own script and Board. */
const files = () =>
  new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    ['/films/f/board.json', text(Schema.encodeSync(BoardFileJson)(boardOf('seed', 'start')))],
    ['/films/f/v1/script.ts', text('export const script = [];\n')],
    ['/films/f/v1/board.json', text(Schema.encodeSync(BoardFileJson)(boardOf('cold', 'judge')))],
  ]);

/** The folders the fresh clock was asked for, in order. */
const asked: Array<Option.Option<string>> = [];

const provided = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  mtimes: ReadonlyMap<string, number> = new Map(),
) =>
  self.pipe(
    Effect.scoped,
    Effect.provide(
      RenderCatalogue.layer.pipe(
        Layer.provideMerge(
          labInMemory(files(), echoPages, {
            mtimes,
            film: freshFilm({
              clock: (_film, folder) =>
                Effect.sync(() => {
                  asked.push(folder);
                  return Option.match(folder, { onNone: () => registered, onSome: () => older });
                }),
            }),
          }),
        ),
      ),
    ),
  );

/** Film `f`'s production: v1 kept in its folder, v2 open on the registered files. */
const twoVersions = Effect.gen(function* () {
  const productions = yield* ProductionStore;
  yield* productions.start('f', {
    title: 'F',
    film: Option.some('f'),
    blurb: Option.none(),
    first: 'the canvas cut',
    at: 1,
  });
  yield* productions.modify('f', (current) =>
    Result.succeed({
      ...current,
      versions: [
        ...current.versions,
        { at: 2, title: 'written from scratch', because: Option.some('the owner said so') },
      ],
    }),
  );
});

/** What the open version's Board holds ready: its one beat waits on the owner's approval. */
const SEED_WAITS = {
  count: 1,
  items: [{ kind: 'approve', beat: 'seed', href: '/films/f/board/seed' }],
};

describe('timeline', () => {
  it.effect(
    'answers the open version, a version asked, only the lanes asked, and refuses one it has not',
    () =>
      provided(
        Effect.gen(function* () {
          asked.length = 0;
          yield* twoVersions;
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const open = yield* tool('timeline', { film: 'f' });
          expect(open.version).toEqual({
            n: 2,
            title: 'written from scratch',
            open: true,
            files: 'film',
          });
          expect(open.lanes.map((l: { track: string }) => l.track)).toEqual(['script', 'board']);
          expect(open.lanes[1].clips.map((c: { panel: string }) => c.panel)).toEqual([
            'seed.start',
          ]);
          expect(open.header.stage).toBe('board');
          expect(open.lab).toEqual({
            local: 'http://localhost:4401/',
            phone: 'http://100.64.0.9:8230/',
          });
          expect(open.header.waits).toEqual(SEED_WAITS);
          const v1 = yield* tool('timeline', { film: 'f', version: 1 });
          expect(v1.version.files).toBe('folder');
          expect(v1.lanes.map((l: { track: string }) => l.track)).toEqual([
            'script',
            'board',
            'voice',
            'scenes',
          ]);
          // Its own Board (`v1/board.json`): the beat's one panel shows from the beat's start.
          expect(v1.lanes[1].clips).toEqual([
            {
              start: 0,
              dur: 6,
              state: 'kept',
              clock: 'measured',
              panel: 'cold.judge',
              beat: 'cold',
              mark: 'judge',
              markAt: 3,
              try: 1,
              card: false,
            },
          ]);
          // The header still waits on the open version's Board, not v1's.
          expect(v1.header.waits).toEqual(SEED_WAITS);
          expect(v1.bands.map((b: { name: string }) => b.name)).toEqual(['open']);
          const only = yield* tool('timeline', { film: 'f', version: 1, tracks: ['voice'] });
          expect(only.lanes.map((l: { track: string }) => l.track)).toEqual(['voice']);
          expect(asked).toEqual([Option.none(), Option.some('v1')]);
          expect((yield* tool('timeline', { film: 'f', version: 5 })).refused).toBe(
            'f has no v5 (its versions: v1, v2)',
          );
          expect((yield* tool('timeline', { film: 'nope' })).refused).toContain('no film "nope"');
        }),
      ),
  );

  it.effect("reads a clock once per stamp of the film's sources, and again once it moves", () => {
    const mtimes = new Map([['/films/f/scenes/index.ts', 1]]);
    return provided(
      Effect.gen(function* () {
        asked.length = 0;
        const { lab } = yield* labWithMcp;
        const { tool } = yield* mcpSession(lab);
        yield* tool('timeline', { film: 'f' });
        yield* tool('timeline', { film: 'f' });
        expect(asked.length).toBe(1);
        mtimes.set('/films/f/scenes/index.ts', 2);
        yield* tool('timeline', { film: 'f' });
        expect(asked.length).toBe(2);
      }),
      mtimes,
    );
  });
});

describe('working', () => {
  it.effect(
    "says an agent's line on the header by name, replaces it with its next, and clears it on done",
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const said = yield* tool('working', { film: 'f', text: 'drawing cold', by: 'painter' });
          expect(said.working.map((l: { by: string; text: string }) => [l.by, l.text])).toEqual([
            ['painter', 'drawing cold'],
          ]);
          yield* tool('working', { film: 'f', text: 'checking the seams', by: 'checker' });
          yield* tool('working', { film: 'f', text: 'drawing title', by: 'painter' });
          const header = (yield* tool('timeline', { film: 'f' })).header.working;
          expect(
            header.map((l: { by: string; text: string }) => [l.by, l.text]).toSorted(),
          ).toEqual([
            ['checker', 'checking the seams'],
            ['painter', 'drawing title'],
          ]);
          // Done needs no words.
          const done = yield* tool('working', { film: 'f', by: 'painter', done: true });
          expect(done.working.map((l: { by: string }) => l.by)).toEqual(['checker']);
          // A line names who says it, and a line not done says something.
          expect((yield* tool('working', { film: 'f', text: 'x' })).refused).toContain('by');
          expect((yield* tool('working', { film: 'f', by: 'painter' })).refused).toBe(
            'say `text` (what you are doing now), or `done: true` to clear your line',
          );
          expect(
            (yield* tool('working', { film: 'nope', text: 'x', by: 'painter' })).refused,
          ).toContain('nope');
        }),
      ),
  );

  it.effect.layer(Working.layer)("a film's lines are its own", () =>
    Effect.gen(function* () {
      const working = yield* Working;
      yield* working.say('f', 'painter', 'drawing cold');
      expect((yield* working.on('f')).map((l) => l.by)).toEqual(['painter']);
      expect(yield* working.on('g')).toEqual([]);
    }),
  );

  it.effect.layer(Working.layer)(
    'a line clears after half an hour of silence; a newer one stays',
    () =>
      Effect.gen(function* () {
        const working = yield* Working;
        yield* working.say('f', 'painter', 'drawing cold');
        yield* TestClock.adjust(Duration.minutes(20));
        yield* working.say('f', 'checker', 'checking cold');
        expect((yield* working.on('f')).map((l) => l.by)).toEqual(['checker', 'painter']);
        yield* TestClock.adjust(Duration.subtract(Duration.minutes(10), Duration.millis(1)));
        expect((yield* working.on('f')).length).toBe(2);
        yield* TestClock.adjust(Duration.millis(1));
        expect((yield* working.on('f')).map((l) => l.by)).toEqual(['checker']);
        yield* TestClock.adjust(WORKING_HELD);
        expect(yield* working.on('f')).toEqual([]);
        expect(yield* working.on('g')).toEqual([]);
      }),
  );
});
