// A film's scenes' stills on its Project (design language §7): each scene's
// card shows a still of its middle drawn from the film's code as it stands,
// by the studio's one source of stills (`player/stills.ts`, the Scenes tape's
// own), lazily the way the tape draws: the film's code loaded only once its
// Project is open (the app's `Films`, `mountReview`), its faces loaded first,
// then one still a turn, the cards on screen ahead of the rest. A film the
// app has no code for has no stills: its cards keep their blank picture. The
// drawing is the browser's (`draw-stills.ts`, handed in by the page's
// browser entry): the server's render draws none.

import { Effect, Equivalence, Fiber, Option } from 'effect';
import { type Accessor, createMemo, createSignal, onCleanup, untrack } from 'solid-js';
import { monotonicMs } from '../../../browser/host.ts';
import { Frames } from '../../../browser/frames.ts';
import { useReview } from '../context.tsx';

/** A film's scenes' stills, as its Project's cards show them. */
export interface SceneStills {
  /** The still of scene `scene`'s middle, once drawn. */
  readonly of: (scene: string) => Option.Option<HTMLCanvasElement>;
  /** Draw scene `scene`'s still ahead of the rest while `el` (its card) is on screen, until the returned stop. */
  readonly watch: (scene: string, el: HTMLElement) => () => void;
}

/** A film's stills as they are drawn (`player/stills.ts`), and each of its scenes' middles, in film seconds. */
interface FilmStills {
  readonly at: (t: number) => Option.Option<HTMLCanvasElement>;
  readonly want: (times: ReadonlyArray<number>) => void;
  readonly onDrawn: (listener: (t: number) => void) => () => void;
  readonly stop: () => void;
  readonly middles: ReadonlyMap<string, number>;
}

/**
 * How the page draws a film's stills, given its turn between two and its
 * clock: the film's code loaded, then its stills made (`drawStills`, the
 * browser's); none for a film the page has no code for.
 */
export type DrawStills = (
  film: string,
  how: { readonly turn: () => Promise<unknown>; readonly now: () => number },
) => Option.Option<Effect.Effect<FilmStills, 'load-failed'>>;

/** No film's stills: the server's render, which draws no film. */
export const noStills: DrawStills = () => Option.none();

/**
 * The stills of `film`'s scenes, while the calling component lives: drawn
 * from its code (none when the app has none, or it fails to load: said in
 * the page's log), a still a turn, the scenes on screen first.
 */
export const useSceneStills = (film: string): SceneStills => {
  const { meta } = useReview();
  const fromHost = { ownedWrite: true } as const;
  // Bumped as each still lands: a card reads its still again then.
  const [drawn, setDrawn] = createSignal(0, fromHost);
  const [ready, setReady] = createSignal(
    Option.none<{
      readonly at: (t: number) => Option.Option<HTMLCanvasElement>;
      readonly want: (times: ReadonlyArray<number>) => void;
      readonly middles: ReadonlyMap<string, number>;
    }>(),
    fromHost,
  );
  const onScreen = new Set<string>();
  /** Ask for the scenes on screen first. */
  const wantOnScreen = () =>
    Option.map(untrack(ready), (r) =>
      r.want(
        [...onScreen].flatMap((s) => Option.toArray(Option.fromUndefinedOr(r.middles.get(s)))),
      ),
    );
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!(entry.target instanceof HTMLElement)) continue;
        const scene = entry.target.dataset['still'] ?? '';
        if (entry.isIntersecting) onScreen.add(scene);
        else onScreen.delete(scene);
      }
      wantOnScreen();
    },
    { rootMargin: '120px 0px' },
  );
  onCleanup(() => watcher.disconnect());
  const now = monotonicMs(meta.host);
  const draw = meta.draw(film, {
    turn: () => Effect.runPromiseWith(meta.host)(Frames.use((f) => f.next)),
    now,
  });
  // The stills, once they are made, stopped with the page: their queue and listener go,
  // so a left Project draws nothing more.
  let stop = () => {};
  onCleanup(() => stop());
  const drawing = Effect.gen(function* () {
    const stills = yield* Option.getOrElse(draw, () => Effect.fail('no-code' as const));
    const { middles } = stills;
    yield* Effect.sync(() => {
      stills.onDrawn(() => setDrawn((n) => n + 1));
      stop = stills.stop;
      // Every scene's still in film order; the cards on screen go ahead of them as they are seen.
      stills.want([...middles.values()]);
      setReady(Option.some({ at: stills.at, want: stills.want, middles }));
      wantOnScreen();
    });
    yield* Effect.logInfo(`project.stills film=${film} scenes=${middles.size}`);
  }).pipe(Effect.catch((why) => Effect.logInfo(`project.stills-none film=${film} reason=${why}`)));
  const fiber = Effect.runForkWith(meta.host)(drawing);
  onCleanup(() => Effect.runFork(Fiber.interrupt(fiber)));
  return {
    of: (scene) => {
      drawn();
      return Option.flatMap(ready(), (r) =>
        Option.flatMap(Option.fromUndefinedOr(r.middles.get(scene)), r.at),
      );
    },
    watch: (scene, el) => {
      el.dataset['still'] = scene;
      watcher.observe(el);
      return () => {
        watcher.unobserve(el);
        onScreen.delete(scene);
      };
    },
  };
};

/**
 * A scene's still as its card shows it: the still itself once drawn, in a box
 * its card's picture fills, watched so a card on screen is drawn first. The
 * card's tile holds the still; another place shows `copy`, a copy of it.
 */
export const Still = (props: {
  readonly stills: SceneStills;
  readonly scene: string;
  readonly copy?: boolean;
}) => {
  // Read again as each still lands; the same canvas is the same picture (by reference:
  // a structural compare would walk the element's DOM).
  const still: Accessor<Option.Option<HTMLCanvasElement>> = createMemo(
    () => props.stills.of(props.scene),
    { equals: Option.makeEquivalence(Equivalence.strictEqual<HTMLCanvasElement>()) },
  );
  const shown = createMemo(() =>
    Option.map(still(), (canvas) => {
      if (props.copy !== true) return canvas;
      const twin = document.createElement('canvas');
      twin.width = canvas.width;
      twin.height = canvas.height;
      twin.getContext('2d')?.drawImage(canvas, 0, 0);
      return twin;
    }),
  );
  let unwatched = () => {};
  onCleanup(() => unwatched());
  return (
    <div
      class="pj-still"
      data-drawn={String(Option.isSome(still()))}
      ref={(el: HTMLDivElement) => {
        // A card's scene is fixed for its life: watched once.
        unwatched = untrack(() => props.stills.watch(props.scene, el));
      }}
    >
      {Option.getOrUndefined(shown())}
    </div>
  );
};
