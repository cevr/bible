// The house's rules for a figure, by id: what each says, where the owner's
// words for it are written, and its way out (`Way`): none, the owner's word
// asked first, or an override citing his decision on the figure
// (`override.ts`). A part, a paper or a figure the house refuses as it is
// made names the rule it breaks and its way out (`decode.ts`), so the
// refusal reads as the rule, not as a schema's words; a locked figure whose
// print is not its lock's names FigureLock (`lock.ts`). Pure.

/**
 * How a rule may be freed. `none`: by nothing (the owner's "never",
 * "ever"). `owner`: by his word alone, since no part carries an override of
 * it, so a change to it is asked of him first. `override`: by an override a
 * part carries, citing his decision on the figure, in his words or by his
 * pick (`override.ts`).
 */
export type Way = 'none' | 'owner' | 'override';

/** A rule: what it says, where it is written, and its way out. */
interface Rule {
  readonly says: string;
  readonly source: string;
  readonly way: Way;
}

export const RULES = {
  GreyShade: {
    says: 'a shade is a colour of its own, never the paper greyed or blackened',
    source: 'CRAFT.md rule 12, "Shade with colour, never with black" (owner, 2026-10-12)',
    way: 'none',
  },
  CircleHands: {
    says: 'a hand is a circle of one paper and a share of the head',
    source:
      'character-design.md, K1: "no thumb, no fingers" (owner, 2026-10-12); a hand ends its arm\'s sleeve (look ledger: "they have sleeves and like arms", owner, 2026-10-18)',
    way: 'none',
  },
  KitA: {
    says: 'the face is Kit A: two eyes, two brows and a mouth, placed and sized',
    source: 'character-design.md, K1: "three marks" (Kit A, owner, 2026-10-13)',
    way: 'owner',
  },
  InteriorInk: {
    says: 'no ink inside a figure: one line round the silhouette, none inside it',
    source:
      'director-vision.md, Paper-cut figures rule 1: "no inner lines but the face\'s, since form is the crease"',
    way: 'owner',
  },
  InnerRim: {
    says: "the rim runs inside a piece's own line, never inside a part laid within it",
    source:
      'RBF journal, round 6: an ear\'s light rim inside the outline (owner: "an inner border")',
    way: 'owner',
  },
  FigureLock: {
    says: 'a locked figure is drawn as the owner kept it, its print the one its lock holds',
    source:
      'ask a92f276635e: "Keep and lock them: the first locked rigs" (owner, 2026-10-17); the aim, to "lock in a rig and a style" (owner, RBF ledger, 2026-10-17)',
    way: 'override',
  },
} as const satisfies Record<string, Rule>;

/** A rule, by its id. */
export type RuleId = keyof typeof RULES;
