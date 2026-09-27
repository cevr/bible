// Fixture for film/no-unprobed-ink: each line marked RED fires the rule, and
// nothing else does.
declare const ctx: CanvasRenderingContext2D;
declare const unprobed: (ctx: CanvasRenderingContext2D, draw: () => void) => void;
declare const stroke: (ctx: CanvasRenderingContext2D) => void;

export const draw = () => {
  ctx.stroke(); // RED film/no-unprobed-ink
  ctx.strokeRect(0, 0, 10, 10); // RED film/no-unprobed-ink
  ctx.fillText('word', 0, 0); // RED film/no-unprobed-ink
  ctx.strokeText('word', 0, 0); // RED film/no-unprobed-ink
  unprobed(ctx, () => ctx.stroke());
  unprobed(ctx, () => {
    [1, 2].forEach(() => ctx.stroke());
  });
  stroke(ctx);
  ctx.fill();
  ctx.fillRect(0, 0, 10, 10);
};
