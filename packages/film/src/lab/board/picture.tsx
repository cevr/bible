// The Board's picture: a canvas pinned over the film (`Lab.Layer`), painting
// the animatic on the narration's clock (`animatic.ts`): the shot under the
// frame, its panel's try (the one the link previews on the panel it picks,
// else the kept one), its card or verse set by the engine, or a beat's
// storyboard card. In the draw view it holds the picked panel still under the
// sketch surface. In the compare view, while the frame is in the picked
// panel's span, the panel takes the picture's left half and the scene's own
// frame shows through the right; anywhere else it plays the animatic. A tag
// on the picture always says what it shows: a panel and its try (a preview
// named as one), the panel held to draw on, or the board beside the scene.

import { Option, Result } from 'effect';
import { createEffect } from 'solid-js';
import type { Shot } from './animatic.ts';
import { type BoardBeat, type PickedPanel, useBoard } from './context.tsx';
import {
  BOARD_PAPER,
  type TagInk,
  paintHalf,
  paintImage,
  paintTag,
  paintText,
  paintUnboarded,
} from '../../canvas/board.ts';
import type { BoardTry } from '../../core/board.ts';
import { Lab, useLab } from '../shell.tsx';

type Boarded = Extract<Shot, { _tag: 'Boarded' }>;

/** What the picture paints: a shot of the animatic, the picked panel held still, or the picked panel beside its scene. */
type Painted =
  | { readonly _tag: 'Shot'; readonly shot: Shot }
  | { readonly _tag: 'Held'; readonly picked: PickedPanel }
  | { readonly _tag: 'Beside'; readonly picked: PickedPanel };

/** The picked panel as a shot of its own, held from its mark. */
const heldShot = (p: PickedPanel): Boarded => ({
  _tag: 'Boarded',
  beat: p.beat.id,
  panel: p.panel,
  at: p.at,
  from: p.at,
});

export const Picture = () => {
  const { state: lab, meta: labMeta } = useLab();
  const board = useBoard();
  const film = labMeta.film;
  let canvas = Option.none<HTMLCanvasElement>();
  // The picture's own ink and shade, read from the tokens once the canvas is on the page.
  let tagInk = Option.none<TagInk>();
  const inkOf = (el: HTMLCanvasElement): TagInk =>
    Option.getOrElse(tagInk, () => {
      const style = getComputedStyle(el);
      const read = {
        ink: style.getPropertyValue('--on-picture').trim(),
        shade: style.getPropertyValue('--on-picture-shade').trim(),
      };
      tagInk = Option.some(read);
      return read;
    });
  const beatOf = (id: string): Option.Option<BoardBeat> =>
    Option.fromUndefinedOr(board.state.beats.find((b) => b.id === id));

  /** The try a boarded shot shows: the picked panel's previewed try, else its kept one, else its first. */
  const shownTry = (picked: Option.Option<PickedPanel>, shot: Boarded): Option.Option<BoardTry> =>
    Option.getOrElse(
      Option.map(
        Option.filter(picked, (p) => p.panel.id === shot.panel.id),
        (p) => p.tried,
      ),
      () =>
        Option.orElse(
          Option.flatMap(Option.fromUndefinedOr(shot.panel.kept), (n) =>
            Option.fromUndefinedOr(shot.panel.tries.find((t) => t.n === n)),
          ),
          () => Option.fromUndefinedOr(shot.panel.tries[0]),
        ),
    );

  /** What the tag says of a panel's try: its number, and a preview named as one. */
  const trySaid = (shot: Boarded, t: BoardTry): string =>
    Option.match(
      Option.filter(Option.fromUndefinedOr(shot.panel.kept), (k) => k !== t.n),
      {
        onNone: () => `try ${t.n}`,
        onSome: (k) => `try ${t.n} · preview (kept ${k})`,
      },
    );

  /** Paint `painted` at `T`: what it reads of the board (the pick, a brief) is passed in, read where it is tracked. */
  const paint = (
    el: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    painted: Painted,
    T: number,
    picked: Option.Option<PickedPanel>,
    brief: Option.Option<string>,
  ) => {
    const { width: w, height: h } = film;
    const colours = inkOf(el);
    const tag = (text: string, side: 'left' | 'right') => paintTag(ctx, w, h, text, side, colours);
    ctx.clearRect(0, 0, w, h);
    if (painted._tag === 'Beside') {
      const shot = heldShot(painted.picked);
      Option.map(
        Option.flatMap(shownTry(picked, shot), (t) =>
          Option.map(board.meta.image(t.file), (img) => ({ t, img })),
        ),
        ({ t, img }) => {
          paintHalf(ctx, img, w, h, colours.ink);
          tag(`board · ${shot.panel.id} · ${trySaid(shot, t)}`, 'left');
          tag(`scene · {${shot.panel.at}}`, 'right');
        },
      );
      return;
    }
    ctx.fillStyle = BOARD_PAPER;
    ctx.fillRect(0, 0, w, h);
    const boarded = (shot: Boarded, said: string) =>
      Option.match(Option.fromUndefinedOr(shot.panel.text), {
        onSome: (text) => {
          const kind = `${said} · ${text._tag.toLowerCase()}`;
          const set = Option.map(beatOf(shot.beat), (beat) =>
            paintText(ctx, film, beat.placed, text, shot.panel.at, shot.at, T),
          );
          // A card the engine cannot set says why on the tag, never a blank paper.
          const unset = Option.flatMap(set, (r) => Result.getFailure(r));
          tag(
            Option.match(unset, {
              onNone: () => kind,
              onSome: (why) => `${kind} · not set: ${why}`,
            }),
            'left',
          );
        },
        onNone: () =>
          Option.map(shownTry(picked, shot), (t) => {
            Option.map(board.meta.image(t.file), (img) => paintImage(ctx, img, w, h));
            tag(`${said} · ${trySaid(shot, t)}`, 'left');
          }),
      });
    if (painted._tag === 'Held') {
      const shot = heldShot(painted.picked);
      boarded(shot, `draw · ${shot.panel.id}`);
      return;
    }
    const shot = painted.shot;
    if (shot._tag === 'Boarded') {
      boarded(shot, shot.panel.id);
      return;
    }
    paintUnboarded(ctx, film, shot.beat, brief);
  };

  /** The brief a storyboard card shows, for a shot of a beat with no panel. */
  const briefOf = (p: Painted): Option.Option<string> => {
    if (p._tag === 'Shot' && p.shot._tag !== 'Boarded') return board.state.brief(p.shot.beat);
    return Option.none();
  };

  /** What the picture paints in `view` with `picked` picked, the frame on `shot`. */
  const paintedOf = (
    view: string,
    picked: Option.Option<PickedPanel>,
    shot: Option.Option<Shot>,
  ): Option.Option<Painted> => {
    const asShot = () => Option.map(shot, (s): Painted => ({ _tag: 'Shot', shot: s }));
    if (view === 'draw')
      return Option.orElse(
        Option.map(picked, (p): Painted => ({ _tag: 'Held', picked: p })),
        asShot,
      );
    const onPicked = Option.filter(picked, (p) =>
      Option.exists(shot, (s) => s._tag === 'Boarded' && s.panel.id === p.panel.id),
    );
    if (view === 'compare' && Option.isSome(onPicked))
      return Option.map(onPicked, (p): Painted => ({ _tag: 'Beside', picked: p }));
    return asShot();
  };

  createEffect(
    () => {
      board.meta.loaded();
      lab.drawn();
      const T = lab.T();
      const picked = board.state.picked();
      const painted = paintedOf(board.state.view(), picked, board.state.shot());
      return { painted, T, picked, brief: Option.flatMap(painted, briefOf) };
    },
    ({ painted, T, picked, brief }) => {
      Option.map(canvas, (el) => {
        el.hidden = Option.isNone(painted);
        Option.map(Option.fromNullishOr(el.getContext('2d')), (ctx) =>
          Option.map(painted, (p) => paint(el, ctx, p, T, picked, brief)),
        );
      });
    },
  );

  return (
    <Lab.Layer
      class="lab-board-picture"
      ref={(el) => {
        canvas = Option.some(el);
      }}
    />
  );
};
