// The Board's picture: a canvas pinned over the film (`Lab.Layer`), painting
// the animatic on the narration's clock (`animatic.ts`): the shot under the
// frame, its panel's try (the one the link previews on the panel it picks,
// else the kept one), its card or verse set by the engine, or a beat's
// storyboard card. In the draw view it holds the picked panel still under the
// sketch surface; in the compare view it steps aside, so the scene's own
// frame at the panel's mark shows, the panel beside it in the column.

import { Option } from 'effect';
import { createEffect } from 'solid-js';
import type { Shot } from './animatic.ts';
import { type BoardBeat, type PickedPanel, useBoard } from './context.tsx';
import { BOARD_PAPER, paintImage, paintText, paintUnboarded } from '../../canvas/board.ts';
import { Lab, useLab } from '../shell.tsx';

/** What the picture paints: a shot of the animatic, or the picked panel held still. */
type Painted =
  | { readonly _tag: 'Shot'; readonly shot: Shot }
  | { readonly _tag: 'Held'; readonly picked: PickedPanel };

export const Picture = () => {
  const { state: lab, meta: labMeta } = useLab();
  const board = useBoard();
  const film = labMeta.film;
  let canvas = Option.none<HTMLCanvasElement>();
  const beatOf = (id: string): Option.Option<BoardBeat> =>
    Option.fromUndefinedOr(board.state.beats.find((b) => b.id === id));

  /** The try a boarded shot shows: the picked panel's previewed try, else its kept one. */
  const shownFile = (
    picked: Option.Option<PickedPanel>,
    shot: Extract<Shot, { _tag: 'Boarded' }>,
  ): Option.Option<string> =>
    Option.getOrElse(
      Option.map(
        Option.filter(picked, (p) => p.panel.id === shot.panel.id),
        (p) => Option.map(p.tried, (t) => t.file),
      ),
      () =>
        Option.map(
          Option.orElse(
            Option.flatMap(Option.fromUndefinedOr(shot.panel.kept), (n) =>
              Option.fromUndefinedOr(shot.panel.tries.find((t) => t.n === n)),
            ),
            () => Option.fromUndefinedOr(shot.panel.tries[0]),
          ),
          (t) => t.file,
        ),
    );

  /** The brief a storyboard card shows, for a shot of a beat with no panel. */
  const briefOf = (p: Painted): Option.Option<string> => {
    if (p._tag === 'Shot' && p.shot._tag !== 'Boarded') return board.state.brief(p.shot.beat);
    return Option.none();
  };

  /** Paint `painted` at `T`: what it reads of the board (the pick, a brief) is passed in, read where it is tracked. */
  const paint = (
    ctx: CanvasRenderingContext2D,
    painted: Painted,
    T: number,
    picked: Option.Option<PickedPanel>,
    brief: Option.Option<string>,
  ) => {
    const { width: w, height: h } = film;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BOARD_PAPER;
    ctx.fillRect(0, 0, w, h);
    const boarded = (beatId: string, panel: Extract<Shot, { _tag: 'Boarded' }>) =>
      Option.match(Option.fromUndefinedOr(panel.panel.text), {
        onSome: (text) =>
          Option.map(beatOf(beatId), (beat) =>
            paintText(ctx, film, beat.placed, text, panel.panel.at, panel.at, T),
          ),
        onNone: () =>
          Option.map(Option.flatMap(shownFile(picked, panel), board.meta.image), (img) =>
            paintImage(ctx, img, w, h),
          ),
      });
    if (painted._tag === 'Held') {
      const p = painted.picked;
      boarded(p.beat.id, {
        _tag: 'Boarded',
        beat: p.beat.id,
        panel: p.panel,
        at: p.at,
        from: p.at,
      });
      return;
    }
    const shot = painted.shot;
    if (shot._tag === 'Boarded') {
      boarded(shot.beat, shot);
      return;
    }
    paintUnboarded(ctx, film, shot.beat, brief);
  };

  createEffect(
    () => {
      board.meta.loaded();
      lab.drawn();
      const view = board.state.view();
      const T = lab.T();
      const picked = board.state.picked();
      const held = Option.filter(picked, () => view === 'draw');
      const painted = Option.orElse(
        Option.map(held, (picked): Painted => ({ _tag: 'Held', picked })),
        () => Option.map(board.state.shot(), (shot): Painted => ({ _tag: 'Shot', shot })),
      );
      // A beat with no panel shows its brief on a storyboard card.
      const brief = Option.flatMap(painted, briefOf);
      return { painted, T, picked, brief, hidden: view === 'compare' };
    },
    ({ painted, T, picked, brief, hidden }) => {
      Option.map(canvas, (el) => {
        el.hidden = hidden || Option.isNone(painted);
        Option.map(Option.fromNullishOr(el.getContext('2d')), (ctx) =>
          Option.map(painted, (p) => paint(ctx, p, T, picked, brief)),
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
