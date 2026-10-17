// The paper-cut figures' line, as the generator (`parts.ts`) reads it: the
// edge of a cut and its ink, from the RimWorld study's questions
// (`.claude/skills/film/reference/rimworld-study.md` §3). `DIRECTION` is K1's
// (the owner's pick, 2026-10-13, `.claude/skills/film/reference/character-design.md`):
// A3, the thick outline with a light core inside it, in B1, the warm ink.

import type { Hex } from '@bible/film/canvas';
import { ramps } from '../../palette.ts';

/**
 * The figure's edge:
 * - `line` (A0): one warm line centred on every cut edge, its weight by what
 *   it carries (`INK` in `parts.ts`);
 * - `thick` (A1): RimWorld's outline, laid outside a silhouette piece (head,
 *   tunic, legs, hands, robe: an `outer` or `small` line), about 3 % of the
 *   figure's height; trim keeps its centred line;
 * - `edge` (A2): no ink, a light core on every cut edge;
 * - `both` (A3): the thick outline with the light core inside it, so the
 *   edge stays cut paper, not a sticker (the study's conflict B).
 */
export type Outline = 'line' | 'thick' | 'edge' | 'both';

/** The ink of every figure line and face mark. */
export const INKS = { warm: ramps.ink.base, black: '#000000' } as const;

/** A figure's line: its edge, its ink and its weight. */
export interface Direction {
  readonly outline: Outline;
  readonly ink: keyof typeof INKS;
  /**
   * The silhouette and trim ink's weight against the study's (1, the
   * default): a film whose concept draws its people's line heavier sets it.
   */
  readonly weight?: number;
}

/** The figures' line: K1's, A3 in B1. */
export const DIRECTION: Direction = { outline: 'both', ink: 'warm' };

/** The ink of `d`. */
export const inkOf = (d: Direction): Hex => INKS[d.ink];
