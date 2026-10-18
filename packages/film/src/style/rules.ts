// The house's rules for a figure, by id: what each says, where the owner's
// words for it are written, and whether anything may free it. A part, a
// paper or a figure the house refuses as it is made names the rule it breaks
// (`decode.ts`), so the refusal reads as the rule, not as a schema's words.
// Pure.

/** A rule: what it says, where it is written, and its way out. */
interface Rule {
  readonly says: string;
  readonly source: string;
  /** `none`: nothing frees it (the owner's "never", "ever"); `override`: an override carrying his own words may. */
  readonly way: 'none' | 'override';
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
      'character-design.md, K1: "no thumb, no fingers, no arm, ever" (owner, 2026-10-12); ask a0590057595: "No arm"',
    way: 'none',
  },
  KitA: {
    says: 'the face is Kit A: two eyes, two brows and a mouth, placed and sized',
    source: 'character-design.md, K1: "three marks" (Kit A, owner, 2026-10-13)',
    way: 'override',
  },
  InteriorInk: {
    says: 'no ink inside a figure: one line round the silhouette, none inside it',
    source:
      'director-vision.md, Paper-cut figures rule 1: "no inner lines but the face\'s, since form is the crease"',
    way: 'override',
  },
  InnerRim: {
    says: "the rim runs inside a piece's own line, never inside a part laid within it",
    source:
      'RBF journal, round 6: an ear\'s light rim inside the outline (owner: "an inner border")',
    way: 'override',
  },
} as const satisfies Record<string, Rule>;

/** A rule, by its id. */
export type RuleId = keyof typeof RULES;
