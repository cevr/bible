// The card, as the title page of an old Bible would set it: the same period
// serif, black on the cream rag paper inside a ruled border, the words
// centred and landing as they are said, the payoff "just" set large in the
// gold of the Word with a glory of engraved rays behind it. Over the flood
// the ground is the verse's gold wash spreading over the sheet and drying
// back to the cream, so the card grows out of the highlight.

import type { Box, CardStyle, CardWord } from '@bible/film/canvas';
import { fullCard } from '@bible/film/canvas';
import type { JobFrame } from '../../scenes/job.ts';
import { FACE } from './page.ts';
import { GOLD_INK, GOLD_WASH, INK, layPaper, ruledBox } from './print.ts';

/** The glory behind the payoff: fine rays fanned out to either side of it, longest level with it. */
const glory = (ctx: CanvasRenderingContext2D, box: Box) => {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h * 0.5;
  const inner = box.w * 0.62;
  ctx.save();
  ctx.fillStyle = GOLD_INK;
  ctx.globalAlpha = 0.5;
  for (const side of [-1, 1]) {
    for (let i = -13; i <= 13; i++) {
      const a = (i / 13) * 0.42;
      const reach = inner + box.w * (0.55 - 0.35 * Math.abs(i / 13)) * (i % 2 === 0 ? 1 : 0.62);
      const half = 1.6;
      const dx = Math.cos(a) * side;
      const dy = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cx + dx * inner - dy * half, cy + dy * inner * 0.5 + dx * half);
      ctx.lineTo(cx + dx * reach, cy + dy * reach * 0.5);
      ctx.lineTo(cx + dx * inner + dy * half, cy + dy * inner * 0.5 - dx * half);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
};

/** The card's sheet: the paper, its ruled border, and over the flood the wash drying back. */
const sheet = (flood: number) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  layPaper(ctx, w, h, 11);
  ctx.save();
  ctx.fillStyle = INK;
  ruledBox(ctx, 64, 50, w - 128, h - 100, 3);
  ruledBox(ctx, 76, 62, w - 152, h - 124, 1);
  if (flood < 1) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.72 * (1 - flood * flood);
    ctx.fillStyle = GOLD_WASH;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
};

export const card = (f: JobFrame, words: ReadonlyArray<CardWord>) => {
  const style: CardStyle = {
    ground: sheet(f.at('flood')),
    type: { family: FACE, size: 92, weight: 500, color: INK, leading: 1.22 },
    payoffScale: 2.7,
    payoffColor: GOLD_INK,
    payoffType: { weight: 600 },
    case: 'said',
    align: 'center',
    treatment: { under: true, draw: glory },
  };
  fullCard(f, words, style);
};
