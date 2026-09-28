// Fixture for film/no-unprobed-ink: each line marked RED fires the rule, and
// nothing else does.
import * as Canvas from '@bible/film/canvas';
import { stroke, unprobed, unprobed as texture } from '@bible/film/canvas';

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
