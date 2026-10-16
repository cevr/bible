// The studio's tools through the lab's MCP, as an agent calls them: a film's
// timeline at its production's open version (a version folder's clock, read
// fresh with its folder), at a version asked (the registered files', its Board
// on its lane), a version it has not refused by name, and only the lanes
// asked; an agent's "doing now" line on the header, replaced by its next and
// cleared when it says it is done. The lines themselves clear after half an
// hour of silence (`Working`, on the test clock).

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

/** Film `f`'s registered clock: a voiced beat with a mark, its take staged, and a silent one. */
const registered: FilmClock = {
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

/** Its v2 folder's clock: the script rewritten, no take yet. */
const written: FilmClock = {
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

const board: BoardFile = {
  film: 'f',
  panels: [
    {
      id: 'cold.judge',
      beat: BoardName.make('cold'),
      at: BoardName.make('judge'),
      tries: [
        {
          n: 1,
          file: Segment.make('cold.judge.1.png'),
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
};

/** Film `f` with its Board and a version folder's script. */
const files = () =>
  new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    ['/films/f/board.json', text(Schema.encodeSync(BoardFileJson)(board))],
    ['/films/f/v2/script.ts', text('export const script = [];\n')],
  ]);

/** The folders the fresh clock was asked for, in order. */
const asked: Array<Option.Option<string>> = [];

const provided = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  self.pipe(
    Effect.scoped,
    Effect.provide(
      RenderCatalogue.layer.pipe(
        Layer.provideMerge(
          labInMemory(files(), echoPages, {
            film: freshFilm({
              clock: (_film, folder) =>
                Effect.sync(() => {
                  asked.push(folder);
                  return Option.match(folder, { onNone: () => registered, onSome: () => written });
                }),
            }),
          }),
        ),
      ),
    ),
  );

/** Film `f`'s production, its v2 open: written from scratch in its folder. */
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
            files: 'folder',
          });
          expect(open.lanes.map((l: { track: string }) => l.track)).toEqual(['script']);
          expect(open.next.starts).toBe('Board starts from the kept concept frames');
          expect(open.lab).toEqual({
            local: 'http://localhost:4401/',
            phone: 'http://100.64.0.9:8230/',
          });
          // The Board's one beat, every picture kept, waits on the owner's approval.
          expect(open.header.waits).toEqual({
            count: 1,
            items: [{ kind: 'approve', beat: 'cold', href: '/films/f/board/cold' }],
          });
          const v1 = yield* tool('timeline', { film: 'f', version: 1 });
          expect(v1.version.files).toBe('film');
          expect(v1.lanes.map((l: { track: string }) => l.track)).toEqual([
            'script',
            'board',
            'voice',
            'scenes',
          ]);
          expect(v1.lanes[1].clips).toEqual([
            {
              start: 3,
              dur: 3,
              state: 'kept',
              clock: 'measured',
              panel: 'cold.judge',
              beat: 'cold',
              mark: 'judge',
              try: 1,
              card: false,
            },
          ]);
          expect(v1.bands.map((b: { name: string }) => b.name)).toEqual(['open']);
          const only = yield* tool('timeline', { film: 'f', version: 1, tracks: ['voice'] });
          expect(only.lanes.map((l: { track: string }) => l.track)).toEqual(['voice']);
          expect(asked).toEqual([Option.some('v2'), Option.none()]);
          expect((yield* tool('timeline', { film: 'f', version: 5 })).refused).toBe(
            'f has no v5 (its versions: v1, v2)',
          );
          expect((yield* tool('timeline', { film: 'nope' })).refused).toContain('no film "nope"');
        }),
      ),
  );
});

describe('working', () => {
  it.effect(
    "says an agent's line on the header, replaces it with its next, and clears it on done",
    () =>
      provided(
        Effect.gen(function* () {
          const { lab } = yield* labWithMcp;
          const { tool } = yield* mcpSession(lab);
          const said = yield* tool('working', { film: 'f', text: 'drawing cold', by: 'painter' });
          expect(said.working.map((l: { by: string; text: string }) => [l.by, l.text])).toEqual([
            ['painter', 'drawing cold'],
          ]);
          yield* tool('working', { film: 'f', text: 'checking the seams' });
          yield* tool('working', { film: 'f', text: 'drawing title', by: 'painter' });
          const header = (yield* tool('timeline', { film: 'f' })).header.working;
          expect(
            header.map((l: { by: string; text: string }) => [l.by, l.text]).toSorted(),
          ).toEqual([
            ['agent', 'checking the seams'],
            ['painter', 'drawing title'],
          ]);
          const done = yield* tool('working', {
            film: 'f',
            text: 'drew title',
            by: 'painter',
            done: true,
          });
          expect(done.working.map((l: { by: string }) => l.by)).toEqual(['agent']);
          expect((yield* tool('working', { film: 'nope', text: 'x' })).refused).toContain('nope');
        }),
      ),
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
