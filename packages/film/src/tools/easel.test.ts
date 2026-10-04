// The easel over a fake browser: a look opens the film's export page on the
// lab's own address once, draws each place's frame through the view and
// writes it under the film's out folder; the same build keeps the page, a new
// build reopens it, a failed build draws nothing and says why, a page that
// failed a frame is not trusted with the next, and a lab serving another
// checkout's films refuses. Live clock: the fake page sleeps a millisecond a frame.

import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Effect, Layer, Option, Path, Ref } from 'effect';
import type { SceneTimes, StillView } from '../core/easel.ts';
import { FrameFailed } from './errors.ts';
import { Easel } from './easel.ts';
import { FilmFolder, type FilmName } from './film-repo.ts';
import { LabPage, type PagesNow } from './lab-page.ts';
import { echoPages, emptyLedger, fakeRenderHost, memoryFileSystem } from './testing.ts';

const roof: SceneTimes = {
  id: 'roof',
  start: 2,
  dur: 10,
  marks: { see: 3 },
  cues: { lift: { start: 1, end: 3 } },
};

const view: StillView = { mode: 'value', captions: false, format: 'image/png' };

const film = 'f' as FilmName;

/** The pages' build as the test sets it: `now`, which a look asks. */
const pagesAt = (now: Ref.Ref<PagesNow>) =>
  Layer.effect(
    LabPage,
    Effect.map(Effect.service(LabPage), (echo) => LabPage.of({ ...echo, built: Ref.get(now) })),
  ).pipe(Layer.provide(echoPages));

const built = (build: number): PagesNow => ({
  build: { build, server: 's' },
  failed: Option.none(),
});

/** An easel over a fake browser whose page draws `frame`, with the build in `now`. */
const easelLayer = (
  files: Map<string, Uint8Array>,
  now: Ref.Ref<PagesNow>,
  ledger = emptyLedger(),
  frame: (i: number, page: number) => Effect.Effect<void, FrameFailed> = () => Effect.void,
) =>
  Easel.layer.pipe(
    Layer.provide([
      fakeRenderHost(ledger, { scenes: [roof], frame }),
      pagesAt(now),
      FilmFolder.layer('/films'),
    ]),
    Layer.provideMerge([
      memoryFileSystem(files),
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: '/out' })),
    ]),
  );

describe('the easel', () => {
  it.live('a look draws each place through the view and writes it under the out folder', () => {
    const files = new Map<string, Uint8Array>();
    const ledger = emptyLedger();
    return Effect.gen(function* () {
      const easel = yield* Easel;
      yield* easel.serve('http://0.0.0.0:4401/');
      const taken = yield* easel.look(film, {
        scene: 'roof',
        at: ['mark:see', 'cue:lift@1'],
        view,
      });
      expect(taken.build).toBe('s.1');
      expect(taken.looks.map((l) => [l.at, l.frame, l.width, l.height])).toEqual([
        ['mark:see', 150, 1920, 1080],
        ['cue:lift@1', 150, 1920, 1080],
      ]);
      expect(taken.looks[0]?.file).toBe('/out/f/look/roof/t0003.00.value.bs.1.png');
      expect(files.get('/out/f/look/roof/t0003.00.value.bs.1.png')).toEqual(
        new Uint8Array([150 % 256]),
      );
      expect(ledger.urls).toEqual(['http://127.0.0.1:4401/films/f/play?export']);
      expect(ledger.stills).toEqual([
        { frame: 150, view },
        { frame: 150, view },
      ]);
    }).pipe(Effect.provide(easelLayer(files, Ref.makeUnsafe(built(1)), ledger)));
  });

  it.live('the same build keeps the page; a new build reopens it', () => {
    const now = Ref.makeUnsafe(built(1));
    const ledger = emptyLedger();
    return Effect.gen(function* () {
      const easel = yield* Easel;
      yield* easel.serve('http://127.0.0.1:4401/');
      yield* easel.look(film, { scene: 'roof', at: ['1'], view });
      yield* easel.look(film, { scene: 'roof', at: ['2'], view });
      expect(ledger.pages).toEqual({ opened: 1, closed: 0 });
      yield* Ref.set(now, built(2));
      const taken = yield* easel.look(film, { scene: 'roof', at: ['2'], view });
      expect(taken.build).toBe('s.2');
      expect(ledger.pages).toEqual({ opened: 2, closed: 1 });
    }).pipe(Effect.provide(easelLayer(new Map(), now, ledger)));
  });

  it.live('a failed build draws nothing and says why', () => {
    const ledger = emptyLedger();
    const broken: PagesNow = { ...built(3), failed: Option.some('Unexpected ;') };
    return Effect.gen(function* () {
      const easel = yield* Easel;
      yield* easel.serve('http://127.0.0.1:4401/');
      const error = yield* Effect.flip(easel.look(film, { scene: 'roof', at: ['1'], view }));
      expect(error).toMatchObject({ _tag: 'PagesBroken', reason: 'Unexpected ;' });
      expect(ledger.pages.opened).toBe(0);
    }).pipe(Effect.provide(easelLayer(new Map(), Ref.makeUnsafe(broken), ledger)));
  });

  it.live('a scene the film lacks, and a place the scene lacks, are named', () =>
    Effect.gen(function* () {
      const easel = yield* Easel;
      yield* easel.serve('http://127.0.0.1:4401/');
      const scene = yield* Effect.flip(easel.look(film, { scene: 'nope', at: ['1'], view }));
      expect(scene).toMatchObject({ _tag: 'UnknownScene', scene: 'nope', known: ['roof'] });
      const place = yield* Effect.flip(easel.look(film, { scene: 'roof', at: ['mark:x'], view }));
      expect(place).toMatchObject({ _tag: 'LookPlaceUnknown', known: ['see'] });
      const late = yield* Effect.flip(easel.look(film, { scene: 'roof', at: ['11'], view }));
      expect(late._tag).toBe('LookOutOfRange');
    }).pipe(Effect.provide(easelLayer(new Map(), Ref.makeUnsafe(built(1))))),
  );

  it.live('a page that failed a frame is closed, and the next look opens a fresh one', () => {
    const ledger = emptyLedger();
    const frame = (_: number, page: number): Effect.Effect<void, FrameFailed> => {
      if (page === 1) return Effect.fail(FrameFailed.make({ frame: 0, reason: 'threw' }));
      return Effect.void;
    };
    return Effect.gen(function* () {
      const easel = yield* Easel;
      yield* easel.serve('http://127.0.0.1:4401/');
      const error = yield* Effect.flip(easel.look(film, { scene: 'roof', at: ['1'], view }));
      expect(error._tag).toBe('LookFailed');
      expect(ledger.pages).toEqual({ opened: 1, closed: 1 });
      yield* easel.look(film, { scene: 'roof', at: ['1'], view });
      expect(ledger.pages).toEqual({ opened: 2, closed: 1 });
    }).pipe(Effect.provide(easelLayer(new Map(), Ref.makeUnsafe(built(1)), ledger, frame)));
  });

  it.live("a lab serving another checkout's films refuses", () =>
    Effect.gen(function* () {
      const easel = yield* Easel;
      yield* easel.serve('http://127.0.0.1:4401/');
      const error = yield* Effect.flip(
        easel.look(film, { scene: 'roof', at: ['1'], view, from: '/elsewhere/films' }),
      );
      expect(error).toMatchObject({
        _tag: 'LabElsewhere',
        lab: '/films/f',
        here: '/elsewhere/films/f',
      });
      const same = yield* easel.look(film, { scene: 'roof', at: ['1'], view, from: '/films' });
      expect(same.looks).toHaveLength(1);
    }).pipe(Effect.provide(easelLayer(new Map(), Ref.makeUnsafe(built(1))))),
  );

  it.live(
    'a wedge draws a look at the level asked, the palette read as a pick would write it, unwritten',
    () => {
      const palette =
        "export const looks = { ground: { options: { now: 0, light: 0.5 }, play: 'now' } };\n";
      const files = new Map([['/films/f/palette.ts', new TextEncoder().encode(palette)]]);
      const ledger = emptyLedger();
      const swapped: Array<ReadonlyArray<readonly [string, string]>> = [];
      const wedging = Layer.effect(
        LabPage,
        Effect.map(Effect.service(LabPage), (echo) =>
          LabPage.of({
            ...echo,
            built: Effect.succeed(built(4)),
            wedge: (swaps) =>
              Effect.sync(() => void swapped.push([...swaps.entries()])).pipe(
                Effect.as({ ...built(4), wedge: '4-x' }),
              ),
          }),
        ),
      ).pipe(Layer.provide(echoPages));
      const layer = Easel.layer.pipe(
        Layer.provide([
          fakeRenderHost(ledger, { scenes: [roof] }),
          wedging,
          FilmFolder.layer('/films'),
        ]),
        Layer.provideMerge([
          memoryFileSystem(files),
          Path.layer,
          ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: '/out' })),
        ]),
      );
      return Effect.gen(function* () {
        const easel = yield* Easel;
        yield* easel.serve('http://127.0.0.1:4401/');
        const taken = yield* easel.look(film, {
          scene: 'roof',
          at: ['1'],
          view,
          levels: { ground: 'light' },
        });
        expect(swapped).toEqual([
          [['/films/f/palette.ts', palette.replace("play: 'now'", "play: 'light'")]],
        ]);
        expect(taken.build).toBe('s.4.4-x');
        expect(taken.looks[0]?.file).toBe(
          '/out/f/look/roof/t0001.00.value.wground-light.bs.4.4-x.png',
        );
        expect(ledger.urls).toEqual(['http://127.0.0.1:4401/films/f/play?export&wedge=4-x']);
        // The source is as it was: the pick is never written.
        expect(new TextDecoder().decode(files.get('/films/f/palette.ts'))).toBe(palette);
        const level = yield* Effect.flip(
          easel.look(film, { scene: 'roof', at: ['1'], view, levels: { ground: 'dark' } }),
        );
        expect(level).toMatchObject({
          _tag: 'LookLevelUnknown',
          missing: 'level',
          known: ['now', 'light'],
        });
        const look = yield* Effect.flip(
          easel.look(film, { scene: 'roof', at: ['1'], view, levels: { sky: 'light' } }),
        );
        expect(look).toMatchObject({
          _tag: 'LookLevelUnknown',
          missing: 'look',
          known: ['ground'],
        });
      }).pipe(Effect.provide(layer));
    },
  );
});
