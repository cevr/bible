// The storyboard's tools: the board store keeps its record and images and
// knows a missing or changed one; a run draws each planned panel twice with
// the style's reference (and the beat's first panel as the second), records
// every try as it lands and skips what is drawn; a beat boarded by hand keeps
// its own panels; a tweak adds to a panel's history from its note; the image
// route never sends `--model` and refuses a prompt naming anything private.

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Layer, Option, Path, Result } from 'effect';
import { type BoardFile, emptyBoard } from '../core/board.ts';
import type { Act, Note } from '../core/schema.ts';
import { type MakeLine, makeBoard, toDraw, tweakPanel } from './board-make.ts';
import {
  type BoardBeat,
  TEXT_RULE,
  actOf,
  briefOf,
  lightOf,
  markWords,
  panelPrompt,
} from './board-prompt.ts';
import { BoardStore } from './board-store.ts';
import { ContentStore } from './content-store.ts';
import { FilmFolder, FilmName } from './film-repo.ts';
import { type ImageRequest, ImageRoute, okraArgs, personalIn } from './image-route.ts';
import { memoryFileSystem, memoryLocks, text } from './testing.ts';

const film = FilmName.make('f');

const beats: ReadonlyArray<BoardBeat> = [
  {
    id: 'cold',
    say: Option.some('A {room}court. The {judge}judge says {righteous}righteous.'),
    picture: Option.some('A court (`room`); the gavel falls on `righteous`.'),
  },
  { id: 'title', say: Option.none(), picture: Option.some('A sky over a city.') },
];
const acts: ReadonlyArray<Act> = [
  { from: 'cold', name: 'cold open', luma: [140, 165], saturation: [0.15, 0.25] },
];

const style = {
  id: '9005',
  name: 'K1',
  block: 'A paper-cut frame.',
  ref: 'style.9005.png',
  sha256: 'x',
  world: 'A parchment world.',
};

/** A board over memory: the film `f` under `/films`, its record and images there; every call the route took. */
const boardOver = (files: Map<string, Uint8Array>, calls: Array<ImageRequest>) => {
  files.set('/films/f/scenes/index.ts', text('export default []'));
  const route = ImageRoute.fake((request) => {
    calls.push(request);
    return text(`image ${calls.length}`);
  });
  return Layer.mergeAll(BoardStore.layer, route).pipe(
    Layer.provide(ContentStore.layer),
    Layer.provideMerge(FilmFolder.layer('/films')),
    Layer.provideMerge([
      memoryFileSystem(files),
      memoryLocks,
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: '/out' })),
    ]),
  );
};

/** The board as `f` has it, with a style set. */
const styled = Effect.gen(function* () {
  const store = yield* BoardStore;
  const sha256 = yield* store.put(film, 'style.9005.png', text('style'));
  yield* store.modify(film, (b) => Result.succeed({ ...b, style: { ...style, sha256 } }));
});

const quiet = (_: MakeLine) => Effect.void;

describe('a run of the board', () => {
  it.effect(
    'draws each planned panel twice, the first panel riding along, and records every try',
    () => {
      const files = new Map<string, Uint8Array>();
      const calls: Array<ImageRequest> = [];
      return Effect.gen(function* () {
        yield* styled;
        const lines: Array<MakeLine> = [];
        yield* makeBoard(film, beats, acts, { beats: [], tries: 2, lanes: 1, dryRun: false }, (l) =>
          Effect.sync(() => lines.push(l)),
        );
        const board = yield* (yield* BoardStore).read(film);
        expect(board.panels.map((p) => [p.id, p.tries.map((t) => t.n)])).toEqual([
          ['cold.room', [1, 2]],
          ['cold.righteous', [1, 2]],
          ['title.start', [1, 2]],
        ]);
        // The beat's second panel carries its first panel's shown try as the second reference.
        const second = calls.filter((c) => c.out.endsWith('cold.righteous.1.png'))[0];
        expect(second?.refs).toEqual([
          '/films/f/board/style.9005.png',
          '/films/f/board/cold.room.1.png',
        ]);
        expect(board.panels[1]?.tries[0]?.refs).toEqual(['style.9005.png', 'cold.room.1.png']);
        expect(lines.filter((l) => l._tag === 'Made')).toHaveLength(6);
        // A second run draws nothing: every planned panel has its tries.
        yield* makeBoard(
          film,
          beats,
          acts,
          { beats: [], tries: 2, lanes: 1, dryRun: false },
          quiet,
        );
        expect(calls).toHaveLength(6);
        expect(yield* (yield* BoardStore).problems(film)).toEqual([]);
      }).pipe(Effect.provide(boardOver(files, calls)));
    },
  );

  it.effect('knows an image missing from the folder, or changed', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* styled;
      yield* makeBoard(
        film,
        beats,
        acts,
        { beats: ['title'], tries: 2, lanes: 1, dryRun: false },
        quiet,
      );
      files.delete('/films/f/board/title.start.1.png');
      files.set('/films/f/board/title.start.2.png', text('other'));
      expect(yield* (yield* BoardStore).problems(film)).toEqual([
        { file: 'title.start.1.png', problem: 'missing' },
        { file: 'title.start.2.png', problem: 'changed' },
      ]);
    }).pipe(Effect.provide(boardOver(files, [])));
  });

  it.effect(
    'a dry run sends nothing; a run with no style is refused, saying how to set one',
    () => {
      const files = new Map<string, Uint8Array>();
      const calls: Array<ImageRequest> = [];
      return Effect.gen(function* () {
        const refused = yield* Effect.flip(
          makeBoard(film, beats, acts, { beats: [], tries: 2, lanes: 1, dryRun: false }, quiet),
        );
        expect(refused.message).toContain('film board style');
        yield* styled;
        const lines: Array<MakeLine> = [];
        yield* makeBoard(
          film,
          beats,
          acts,
          { beats: ['cold'], tries: 2, lanes: 1, dryRun: true },
          (l) => Effect.sync(() => lines.push(l)),
        );
        expect(calls).toEqual([]);
        expect(lines.map((l) => l._tag)).toEqual(['Planned', 'Planned', 'Planned', 'Planned']);
      }).pipe(Effect.provide(boardOver(files, calls)));
    },
  );

  it.effect('a tweak adds two tries from the note, its sketch as the third reference', () => {
    const files = new Map<string, Uint8Array>();
    const calls: Array<ImageRequest> = [];
    return Effect.gen(function* () {
      yield* styled;
      yield* makeBoard(
        film,
        beats,
        acts,
        { beats: ['title'], tries: 2, lanes: 1, dryRun: false },
        quiet,
      );
      files.set('/lab/f/stills/n4.png', text('sketched'));
      const note: Note = {
        id: 'n4',
        scene: 'title',
        T: 0,
        frame: 0,
        text: 'move the figure left',
        panel: { id: 'title.start', try: 2, ask: 'tweak' },
        sketch: [
          { _tag: 'Arrow', id: 'a', ink: 'red', from: { x: 0.6, y: 0.7 }, to: { x: 0.3, y: 0.7 } },
        ],
        still: 'n4.png',
        status: 'open',
        thread: [],
        film: 'f',
        seq: 4,
        createdAt: '2026-10-14T00:00:00.000Z',
        changed: 4,
      };
      const done = yield* tweakPanel(film, beats, acts, note, '/lab/f/stills/n4.png', 2, quiet);
      expect(done).toEqual({ panel: 'title.start', tries: [3, 4] });
      expect(calls.at(-1)?.refs).toEqual([
        '/films/f/board/style.9005.png',
        '/films/f/board/title.start.2.png',
        '/films/f/board/title.start.n4.sketch.png',
      ]);
      expect(calls.at(-1)?.prompt).toContain('fails it): move the figure left');
      const panel = (yield* (yield* BoardStore).read(film)).panels[0];
      expect(panel?.tries.map((t) => [t.n, t.made, Option.fromUndefinedOr(t.note)])).toEqual([
        [1, 'generate', Option.none()],
        [2, 'generate', Option.none()],
        [3, 'tweak', Option.some('n4')],
        [4, 'tweak', Option.some('n4')],
      ]);
    }).pipe(Effect.provide(boardOver(files, calls)));
  });
});

describe("a beat's panels to draw", () => {
  const board = (b: Partial<BoardFile>): BoardFile => ({ ...emptyBoard('f'), ...b });
  test('a beat boarded by hand keeps its own panels', () => {
    const own = board({
      panels: [
        {
          id: 'cold.judge',
          beat: 'cold',
          at: 'judge',
          tries: [{ n: 1, file: 'a.png', sha256: 's', made: 'import', refs: [], at: 'x' }],
        },
      ],
    });
    expect(toDraw(own, beats[0] as BoardBeat)).toEqual([]);
  });
  test('a card or a verse on a planned mark is not drawn', () => {
    const carded = board({
      panels: [
        {
          id: 'cold.righteous',
          beat: 'cold',
          at: 'righteous',
          tries: [],
          text: { _tag: 'Card', payoff: 'righteous' },
        },
      ],
    });
    expect(toDraw(carded, beats[0] as BoardBeat)).toEqual(['room']);
  });
});

describe('the scene prompt', () => {
  const prompt = panelPrompt({
    style,
    act: actOf(acts, ['cold', 'title'], 'title'),
    beat: beats[0] as BoardBeat,
    at: 'righteous',
    shot: true,
    tweak: Option.none(),
  });
  test('opens on the style block and reads each mark as the words said there', () => {
    expect(prompt.startsWith('A paper-cut frame.')).toBe(true);
    expect(prompt).toContain('the gavel falls on «righteous.»');
    expect(prompt).toContain("THE MOMENT: this frame holds from the narrator's words «righteous.»");
    expect(prompt).toContain("THE FILM'S WORLD: A parchment world.");
    expect(prompt).toContain('THE ACT: "cold open": a bright, high-key frame');
  });
  test('keeps every spoken word off the picture: the film sets them as cards', () => {
    expect(prompt).toContain(TEXT_RULE);
    expect(prompt).not.toContain('`');
  });
  test('reads a mark as at most six words, up to the next mark', () => {
    expect(markWords(beats[0] as BoardBeat).get('room')).toBe('court. The');
    expect(briefOf('on `nope`', new Map())).toBe('on nope');
  });
  test("says an act's light from its measures", () => {
    expect(lightOf({ from: 'a', name: 'b', luma: [160, 170], saturation: [0.3, 0.4] })).toBe(
      'a bright, high-key frame, with rich, warm colour',
    );
  });
});

describe('the image route', () => {
  test('calls okra image with the size, each reference and the output: never --model', () => {
    const args = okraArgs({
      prompt: 'p',
      refs: ['/a.png', '/b.png'],
      size: '1536x1024',
      out: '/o.png',
    });
    expect(args).toEqual([
      'image',
      'p',
      '--size',
      '1536x1024',
      '--ref',
      '/a.png',
      '--ref',
      '/b.png',
      '-o',
      '/o.png',
    ]);
    expect(args).not.toContain('--model');
  });
  test('refuses a prompt naming a home path, an email or a key, saying only what kind', () => {
    expect(personalIn('see /Users/someone/notes.txt')).toEqual(Option.some('a home path'));
    expect(personalIn('mail a.b@example.com')).toEqual(Option.some('an email address'));
    expect(personalIn('key sk-abcdefghijklmnop')).toEqual(Option.some('a key'));
    expect(personalIn('A small grey figure stands before a tall bench.')).toEqual(Option.none());
  });
  it.effect('the fake route refuses a personal prompt too, and draws nothing', () =>
    Effect.gen(function* () {
      const files = new Map<string, Uint8Array>();
      const failed = yield* Effect.flip(
        (yield* ImageRoute).draw({ prompt: 'ask a@b.co', refs: [], size: '1x1', out: '/o.png' }),
      );
      expect(failed._tag).toBe('PromptPersonal');
      expect(files.size).toBe(0);
    }).pipe(Effect.provide(boardOver(new Map(), []))),
  );
});
