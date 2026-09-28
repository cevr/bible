// Paper by meaning (DIRECTION, "Edges" and "Ink"): a piece of a film's world
// is a cutout whose edge says what it is. People and made things are cut
// clean with a thin light core; earth, cloud and the paper of the world are
// torn with a fibrous white rim; the letters of a prop are ink. Figures keep a
// thin ink outline; scenery keeps none. A piece names its role, so the look
// follows from what the piece is, never from a copied number.

import { cutout } from './cutout.ts';
import { type Hand, type Pt, stroke, sub } from './ink.ts';

/** How a piece was made: cut with scissors, torn by hand, or inked on. */
export type PaperKind = 'cut' | 'torn' | 'ink';

/** What a piece is in the picture: part of a figure (a person, what they wear and hold) or scenery. */
export type PieceRole = 'figure' | 'scenery';

/** Each kind's edge: its roughness and the width of its white core, in px. */
export const PAPER_EDGES = {
  cut: { torn: 0.6, rim: 1.5 },
  torn: { torn: 3.5, rim: 3 },
  ink: { torn: 0.6, rim: 0 },
} satisfies Record<PaperKind, { readonly torn: number; readonly rim: number }>;

/** A figure's ink outline, in px; scenery has none. */
export const FIGURE_LINE = 3;

export interface PieceStyle {
  readonly color: string;
  /** Figure or scenery: decides the kind and the outline a piece takes by default. */
  readonly role: PieceRole;
  /** The ink an outline is drawn in. */
  readonly outline: string;
  /** Default: a figure is cut, scenery torn. */
  readonly kind?: PaperKind;
  /** The ink outline's width in px. Default: `FIGURE_LINE` for a figure, none for scenery. */
  readonly line?: number;
  /** Torn-edge roughness in px, over the kind's. */
  readonly torn?: number;
  /** Shadow strength 0..1 (0.35). */
  readonly shadow?: number;
  /** Pastel grain strength 0..1 (0.5). */
  readonly grain?: number;
  readonly alpha?: number;
}

/** The kind a piece is made as: its own, or its role's. */
export const kindOf = (style: Pick<PieceStyle, 'role' | 'kind'>): PaperKind =>
  style.kind ?? (style.role === 'figure' ? 'cut' : 'torn');

/** The outline a piece is drawn with, in px: its own, or its role's. */
export const lineOf = (style: Pick<PieceStyle, 'role' | 'line'>): number =>
  style.line ?? (style.role === 'figure' ? FIGURE_LINE : 0);

/**
 * One piece of paper: a cutout with its kind's edge and core, and, for a
 * figure, an ink outline that boils on the piece's own seed.
 */
export const piece = (
  ctx: CanvasRenderingContext2D,
  shape: ReadonlyArray<Pt>,
  style: PieceStyle,
  hand: Hand,
) => {
  const alpha = style.alpha ?? 1;
  if (alpha <= 0) return;
  const edge = PAPER_EDGES[kindOf(style)];
  cutout(
    ctx,
    shape,
    {
      color: style.color,
      torn: style.torn ?? edge.torn,
      rim: edge.rim,
      shadow: style.shadow ?? 0.35,
      grain: style.grain ?? 0.5,
      alpha,
    },
    hand,
  );
  const width = lineOf(style);
  if (width > 0)
    stroke(
      ctx,
      [...shape, shape[0] ?? [0, 0]],
      { color: style.outline, width, jitter: 0.7, taper: 0, pressure: 0.15, alpha },
      sub(hand, 7),
    );
};
