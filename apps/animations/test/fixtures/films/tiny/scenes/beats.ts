// The fixture film's drawings: plain fills, enough for a cue, a knob and a
// scene with neither. `turn_` is exported under another name than its beat,
// so the lab's locator must follow the registry to find it.

import { drawing } from '@bible/film/canvas';

/** A band of paper rising on "begins". */
export const open = drawing({
  timeline: {
    /** The band rises as the word lands. */
    rise: { mark: 'begins', dur: 0.5 },
  },
  draw: (f) => {
    f.ctx.fillStyle = '#eeddc8';
    f.ctx.fillRect(0, 0, 1920, 1080);
    f.ctx.fillStyle = '#ab8163';
    f.ctx.fillRect(0, 1080 - 400 * f.at('rise'), 1920, 400);
  },
});

/** A card folding over on "page", its corner a knob. */
export const turn_ = drawing({
  timeline: {
    /** The card folds over. */
    fold: { mark: 'page', dur: 0.8 },
  },
  knobs: {
    /** Where the card's corner rests. */
    corner: [960, 540],
  },
  draw: (f) => {
    const [x, y] = f.knob('corner');
    f.ctx.fillStyle = '#eeddc8';
    f.ctx.fillRect(0, 0, 1920, 1080);
    f.ctx.fillStyle = '#e6b347';
    f.ctx.fillRect(x - 200, y - 150, 400 * (1 - f.at('fold')), 300);
  },
});

/** The last page, with nothing to cue or tweak. */
export const close = {
  draw: (f: { readonly ctx: CanvasRenderingContext2D }) => {
    f.ctx.fillStyle = '#1b150d';
    f.ctx.fillRect(0, 0, 1920, 1080);
  },
};
