// What the Board's picture paints for a shot of the animatic, on a canvas the
// film's size: a picture panel's try (the image, covering the frame as the
// film's 16:9 picture crops it), a card or a verse panel set by the engine's
// own card code (`fullCard`, `verse`, in the film's card style: the words
// exactly as spoken, CRAFT rule 1; never lettering an image route drew),
// and a beat with no panel as a quiet storyboard card naming it. The
// sketch's still (`stillOf`) is painted the same way, the sketch over it.

import { Option, Predicate, Result } from 'effect';
import { type CardWord, cardWords, fullCard, verse } from './card.ts';
import type { Film } from './film.ts';
import type { Hand } from './ink.ts';
import type { PanelText } from '../core/board.ts';
import type { Placed } from '../core/layout.ts';

/** A seed for a card's hands: the board's cards never boil, so one hand is all they need. */
const STILL_HAND = (key: string | number): Hand => ({
  boil: 0,
  seed: Predicate.isNumber(key) ? key : [...key].reduce((n, c) => n * 31 + c.charCodeAt(0), 7),
});

/** `image` over the whole `w` × `h` frame, cropped to it from its middle (the film's own crop of a 3:2 panel). */
export const paintImage = (
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { readonly width: number; readonly height: number },
  w: number,
  h: number,
) => {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, 0, 0, w, h);
};

/** How long a verse panel's highlight takes to sweep its phrase, from its mark. */
const SWEEP_S = 1.2;

/**
 * Text panel `text` of beat `p` at film second `T` (shown from its mark said
 * at film second `at`), in the film's card style: a card's words rising in
 * as they are heard, a verse with its phrase swept. Why not, when the film
 * declares no card style or its words do not read (a mark its line lacks).
 */
export const paintText = (
  ctx: CanvasRenderingContext2D,
  film: Film,
  p: Placed,
  text: PanelText,
  mark: string,
  at: number,
  T: number,
): Result.Result<void, string> => {
  const { width: w, height: h } = film;
  return Option.match(Option.fromUndefinedOr(film.look.card), {
    onNone: () => Result.fail(`${film.title} sets no card style (FilmSpec.card)`),
    onSome: (look) => {
      if (text._tag === 'Card')
        return Result.map(
          cardWords(p.spec.id, p.voice, p.speechStart, {
            from: mark,
            payoff: text.payoff,
            ...Option.match(Option.fromUndefinedOr(text.to), {
              onNone: () => ({}),
              onSome: (to) => ({ to }),
            }),
          }),
          (words: ReadonlyArray<CardWord>) =>
            fullCard({ ctx, w, h, t: T - p.start, hand: STILL_HAND }, words, look.style),
        );
      return Option.match(Option.fromUndefinedOr(look.verse), {
        onNone: () => Result.fail(`${film.title} sets no verse style (FilmSpec.card.verse)`),
        onSome: (style) => {
          ctx.save();
          if (Predicate.isString(look.style.ground)) {
            ctx.fillStyle = look.style.ground;
            ctx.fillRect(0, 0, w, h);
          } else look.style.ground(ctx, w, h);
          verse(
            ctx,
            { text: text.text, phrase: text.phrase },
            style,
            { x: w * 0.14, y: h * 0.36, highlight: Math.max(0, Math.min(1, (T - at) / SWEEP_S)) },
            STILL_HAND('verse'),
          );
          ctx.restore();
          return Result.succeed(undefined);
        },
      });
    },
  });
};

/** The board's paper: what a frame with no picture yet is painted on. */
export const BOARD_PAPER = '#f3ede0';

/** What a beat with no panel shows: its id and its picture's brief, quiet on the paper, as the film's own storyboard card is. */
export const paintUnboarded = (
  ctx: CanvasRenderingContext2D,
  film: Film,
  beat: string,
  brief: Option.Option<string>,
) => {
  const { width: w, height: h } = film;
  ctx.save();
  ctx.fillStyle = BOARD_PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#c9bfa9';
  ctx.lineWidth = h * 0.003;
  ctx.setLineDash([h * 0.012, h * 0.012]);
  ctx.strokeRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8);
  ctx.setLineDash([]);
  ctx.fillStyle = '#8a3b2a';
  ctx.font = `600 ${Math.round(h * 0.03)}px system-ui, sans-serif`;
  ctx.fillText(`no panel yet · ${beat}`, w * 0.12, h * 0.2);
  ctx.fillStyle = '#3a3f46';
  ctx.font = `${Math.round(h * 0.026)}px system-ui, sans-serif`;
  const words = Option.getOrElse(brief, () => '').split(/\s+/);
  const lines: Array<string> = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last !== undefined && ctx.measureText(`${last} ${word}`).width < w * 0.76)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  for (const [i, line] of lines.slice(0, 12).entries())
    ctx.fillText(line, w * 0.12, h * 0.28 + i * h * 0.042);
  ctx.restore();
};
