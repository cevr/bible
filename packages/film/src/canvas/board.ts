// What a Board panel paints on a canvas the film's size: a picture panel's
// try (`paintImage`: the image, covering the frame as the film's 16:9
// picture crops it), and a card or a verse panel set by the engine's own
// card code (`fullCard`, `verse`, in the film's card style: the words
// exactly as spoken, CRAFT rule 1; never lettering an image route drew).
// The studio's viewer sets its cards with it, and a panel note's still
// (`film-studio/panel-still.ts`) paints its try with it, the marks over it.

import { Boolean as Bool, Option, Predicate, Result } from 'effect';
import { type CardWord, cardWords, fullCard, verse } from './card.ts';
import type { Film } from './film.ts';
import type { Hand } from './ink.ts';
import { PANEL_START, type PanelText } from '../core/board.ts';
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
      // A panel held from the beat's start sets its card from the line's first word: `start` is the board's, not a mark
      // the line says (a line that does mark a `{start}` keeps its own).
      const voice = Bool.match(mark === PANEL_START && !p.voice.marks.has(PANEL_START), {
        onTrue: () => ({
          ...p.voice,
          marks: new Map([...p.voice.marks, [PANEL_START, Number.NEGATIVE_INFINITY]]),
        }),
        onFalse: () => p.voice,
      });
      if (text._tag === 'Card')
        return Result.map(
          cardWords(p.spec.id, voice, p.speechStart, {
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
