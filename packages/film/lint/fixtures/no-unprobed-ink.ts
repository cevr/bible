// Fixture for film/no-unprobed-ink: each line marked RED fires the rule, and
// nothing else does.
import * as Canvas from '@bible/film/canvas';
import { stroke, unprobed, unprobed as texture } from '@bible/film/canvas';
import * as other from '../../src/lab/pressed.ts';
import { unprobed as notKit } from '../../src/lab/pressed.ts';

declare const ctx: CanvasRenderingContext2D;

export const draw = () => {
  ctx.stroke(); // RED film/no-unprobed-ink
  ctx.strokeRect(0, 0, 10, 10); // RED film/no-unprobed-ink
  ctx.fillText('word', 0, 0); // RED film/no-unprobed-ink
  ctx.strokeText('word', 0, 0); // RED film/no-unprobed-ink
  ctx['stroke'](); // RED film/no-unprobed-ink
  ctx.fillText.call(ctx, 'word', 0, 0); // RED film/no-unprobed-ink
  const { fillText } = ctx; // RED film/no-unprobed-ink
  fillText.call(ctx, 'word', 0, 0);
  unprobed(ctx, () => ctx.stroke());
  unprobed(ctx, () => {
    [1, 2].forEach(() => ctx.stroke());
  });
  texture(ctx, () => ctx.stroke());
  Canvas.unprobed(ctx, () => ctx.stroke());
  stroke(ctx);
  Canvas.stroke(ctx);
  ctx.fill();
  ctx.fillRect(0, 0, 10, 10);
};

export const shadowed = () => {
  const unprobed = (draw: () => void) => draw();
  unprobed(() => ctx.stroke()); // RED film/no-unprobed-ink
};

// Another module's `unprobed` is not the kit's: it exempts nothing.
export const elsewhere = () => {
  other.unprobed(ctx, () => ctx.stroke()); // RED film/no-unprobed-ink
  notKit(ctx, () => ctx.stroke()); // RED film/no-unprobed-ink
};
