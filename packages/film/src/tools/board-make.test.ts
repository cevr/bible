// The storyboard's tools: the board store keeps its record and images and
// knows a missing or changed one; a run draws each planned panel twice with
// the style's reference (and the beat's first panel as the second), records
// every try as it lands and skips what is drawn; a beat boarded by hand keeps
// its own panels; a tweak adds to a panel's history from its note; the image
// route never sends `--model` and refuses a prompt naming anything private.

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Deferred,
  Effect,
  Exit,
  Layer,
  Option,
  Path,
  Ref,
  Result,
  Sink,
  Stream,
} from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { type BoardFile, BoardName } from '../core/board.ts';
import { ActName } from '../core/address-schema.ts';
import type { Act, Note } from '../core/schema.ts';
import { Segment } from '../core/segment.ts';
import { makeBoard, type makeLine, tweakPanel } from './board-make.ts';
import { type BoardBeat, actOf, panelPrompt } from './board-prompt.ts';
import { BoardStore } from './board-store.ts';
import { ContentStore } from './content-store.ts';
import { FilmFolder, FilmName } from './film-repo.ts';
import { ImageRoute } from './image-route.ts';
import { memoryFileSystem, memoryLocks, text } from './testing.ts';

/** One image asked of the route. */
type ImageRequest = Parameters<(typeof ImageRoute)['Service']['draw']>[0];
/** A line a run prints. */
type MakeLine = Parameters<typeof makeLine>[0];

const film = FilmName.make('f');
const COLD = BoardName.make('cold');
const TITLE = BoardName.make('title');
const ROOM = BoardName.make('room');
const RIGHTEOUS = BoardName.make('righteous');

const beats: ReadonlyArray<BoardBeat> = [
  {
    id: COLD,
    say: Option.some('A {room}court. The {judge}judge says {righteous}righteous.'),
    picture: Option.some('A court (`room`); the gavel falls on `righteous`.'),
  },
  { id: TITLE, say: Option.none(), picture: Option.some('A sky over a city.') },
];
const acts: ReadonlyArray<Act> = [
  { from: 'cold', name: ActName.make('cold open'), luma: [140, 165], saturation: [0.15, 0.25] },
];

const style = {
  id: BoardName.make('9005'),
  name: 'K1',
  block: 'A paper-cut frame.',
  ref: Segment.make('style.9005.png'),
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
        // The beat's second panel (its tries the run's third and fourth calls) carries its first panel's shown try
        // as the second reference.
        const second = calls[2];
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
  /** What a run of beat `cold`, `tries` tries a panel, draws over `panels`: the files of the tries it adds. */
  const drawnOver = (panels: BoardFile['panels'], tries = 1) =>
    Effect.gen(function* () {
      yield* styled;
      const store = yield* BoardStore;
      yield* store.modify(film, (b) => Result.succeed({ ...b, panels }));
      const had = new Set(panels.flatMap((p) => p.tries.map((t) => t.file)));
      yield* makeBoard(
        film,
        beats,
        acts,
        { beats: ['cold'], tries, lanes: 1, dryRun: false },
        quiet,
      );
      return (yield* store.read(film)).panels.flatMap((p) =>
        p.tries.map((t) => t.file).filter((f) => !had.has(f)),
      );
    }).pipe(Effect.provide(boardOver(new Map(), [])));
  it.effect('a beat boarded by hand keeps its own panels', () =>
    Effect.gen(function* () {
      const drawn = yield* drawnOver([
        {
          id: 'cold.judge',
          beat: COLD,
          at: BoardName.make('judge'),
          tries: [
            { n: 1, file: Segment.make('a.png'), sha256: 's', made: 'import', refs: [], at: 'x' },
          ],
        },
      ]);
      expect(drawn).toEqual([]);
    }),
  );
  it.effect('a card or a verse on a planned mark is not drawn', () =>
    Effect.gen(function* () {
      const drawn = yield* drawnOver([
        {
          id: 'cold.righteous',
          beat: COLD,
          at: RIGHTEOUS,
          tries: [],
          text: { _tag: 'Card', payoff: 'righteous' },
        },
      ]);
      expect(drawn).toEqual([Segment.make('cold.room.1.png')]);
    }),
  );
  it.effect(
    'a panel a stopped run began is finished; one kept, imported or tweaked is left as it is',
    () =>
      Effect.gen(function* () {
        const tried = (n: number, made: 'generate' | 'import' | 'tweak') => ({
          n,
          file: Segment.make(`t${n}.png`),
          sha256: 's',
          made,
          refs: [],
          at: 'x',
        });
        const begun = yield* drawnOver(
          [{ id: 'cold.room', beat: COLD, at: ROOM, tries: [tried(1, 'generate')] }],
          2,
        );
        expect(begun).toEqual([
          Segment.make('cold.room.2.png'),
          Segment.make('cold.righteous.1.png'),
          Segment.make('cold.righteous.2.png'),
        ]);
        const settled = yield* drawnOver(
          [
            { id: 'cold.room', beat: COLD, at: ROOM, tries: [tried(1, 'generate')], kept: 1 },
            { id: 'cold.righteous', beat: COLD, at: RIGHTEOUS, tries: [tried(1, 'tweak')] },
          ],
          2,
        );
        expect(settled).toEqual([]);
      }),
  );
});

describe('two runs at once', () => {
  it.effect('drawing one panel, never share a number or an image', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      yield* styled;
      // Each draw waits until both have started, so both runs read the panel before either records a try.
      const both = yield* Deferred.make<void>();
      const started = yield* Ref.make(0);
      const route = ImageRoute.of({
        draw: (request) =>
          Effect.gen(function* () {
            const n = yield* Ref.updateAndGet(started, (k) => k + 1);
            if (n === 2) yield* Deferred.done(both, Exit.void);
            yield* Deferred.await(both);
            files.set(request.out, text(`image ${n}`));
          }),
      });
      const run = makeBoard(
        film,
        beats,
        acts,
        { beats: ['title'], tries: 1, lanes: 1, dryRun: false },
        quiet,
      ).pipe(Effect.provideService(ImageRoute, route));
      yield* Effect.all([run, run], { concurrency: 2, discard: true });
      const store = yield* BoardStore;
      expect(
        (yield* store.read(film)).panels.flatMap((p) => p.tries.map((t) => [t.n, t.file])),
      ).toEqual([
        [1, Segment.make('title.start.1.png')],
        [2, Segment.make('title.start.2.png')],
      ]);
      expect(yield* store.problems(film)).toEqual([]);
    }).pipe(Effect.provide(boardOver(files, [])));
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
  /** The prompt for `beat`'s first panel, in an act of the given measures. */
  const promptOf = (beat: BoardBeat, act: Act) =>
    panelPrompt({
      style,
      act: actOf([act], [beat.id], beat.id),
      beat,
      at: 'start',
      shot: false,
      tweak: Option.none(),
    });
  test("takes the style image's look but not its floating hands: every hand is at the end of a sleeved arm", () => {
    expect(prompt).toContain(
      'take its line, shapes, colour handling, faces, paper texture and light',
    );
    expect(prompt).not.toContain('faces, hands,');
    expect(prompt).toContain(
      'Its hands float free beside the body, which this film no longer draws',
    );
    expect(prompt).toContain('Hands are plain round circles at the end of an arm in its sleeve');
  });
  test('keeps every spoken word off the picture: the film sets them as cards', () => {
    expect(prompt).toContain('TEXT: no captions, no subtitles, no narration');
    expect(prompt).toContain('the film sets every spoken word as a full-screen card');
    expect(prompt).not.toContain('`');
  });
  test('reads a mark as at most six words, up to the next mark, and a mark the line lacks as its name', () => {
    expect(prompt).toContain('A court («court. The»)');
    const lacking = {
      id: BoardName.make('x'),
      say: Option.some('Nothing marked.'),
      picture: Option.some('on `nope`'),
    };
    expect(promptOf(lacking, { from: 'x', name: ActName.make('x') })).toContain('on nope');
  });
  test("says an act's light from its measures", () => {
    const lit = { id: BoardName.make('a'), say: Option.none(), picture: Option.some('A field.') };
    expect(
      promptOf(lit, {
        from: 'a',
        name: ActName.make('b'),
        luma: [160, 170],
        saturation: [0.3, 0.4],
      }),
    ).toContain('a bright, high-key frame, with rich, warm colour');
  });
});

describe('the image route', () => {
  /**
   * `okra image` as the route runs it, over memory: each command it was given (program and arguments), each
   * exiting 0 having drawn the output `/o.png`.
   */
  const okraOver = (commands: Array<ReadonlyArray<string>>) => {
    const files = new Map<string, Uint8Array>([['/o.png', text('drawn')]]);
    const spawner = ChildProcessSpawner.make((command) => {
      if (command._tag === 'StandardCommand') commands.push([command.command, ...command.args]);
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(0),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Sink.drain,
          stdout: Stream.empty,
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          unref: Effect.succeed(Effect.void),
        }),
      );
    });
    return ImageRoute.layer.pipe(
      Layer.provide([
        Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
        memoryFileSystem(files),
      ]),
    );
  };
  it.effect('calls okra image with the size, each reference and the output: never --model', () => {
    const commands: Array<ReadonlyArray<string>> = [];
    return Effect.gen(function* () {
      yield* (yield* ImageRoute).draw({
        prompt: 'p',
        refs: ['/a.png', '/b.png'],
        size: '1536x1024',
        out: '/o.png',
      });
      expect(commands).toEqual([
        [
          'okra',
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
        ],
      ]);
    }).pipe(Effect.provide(okraOver(commands)));
  });
  it.effect(
    'refuses a prompt naming a home path, an email or a key, saying only what kind, and sends nothing',
    () => {
      const commands: Array<ReadonlyArray<string>> = [];
      return Effect.gen(function* () {
        const route = yield* ImageRoute;
        const found = (prompt: string) =>
          route.draw({ prompt, refs: [], size: '1x1', out: '/o.png' }).pipe(
            Effect.match({
              onFailure: (e) => Option.some(e._tag === 'PromptPersonal' && e.found),
              onSuccess: () => Option.none(),
            }),
          );
        expect(yield* found('see /Users/someone/notes.txt')).toEqual(Option.some('a home path'));
        expect(yield* found('mail a.b@example.com')).toEqual(Option.some('an email address'));
        expect(yield* found('key sk-abcdefghijklmnop')).toEqual(Option.some('a key'));
        expect(commands).toEqual([]);
        expect(yield* found('A small grey figure stands before a tall bench.')).toEqual(
          Option.none(),
        );
        expect(commands).toHaveLength(1);
      }).pipe(Effect.provide(okraOver(commands)));
    },
  );
  it.effect('the fake route refuses a personal prompt too, and draws nothing', () => {
    const files = new Map<string, Uint8Array>();
    const calls: Array<ImageRequest> = [];
    return Effect.gen(function* () {
      const failed = yield* Effect.flip(
        (yield* ImageRoute).draw({ prompt: 'ask a@b.co', refs: [], size: '1x1', out: '/o.png' }),
      );
      expect(failed._tag).toBe('PromptPersonal');
      expect(calls).toEqual([]);
      expect(files.has('/o.png')).toBe(false);
    }).pipe(Effect.provide(boardOver(files, calls)));
  });
});
