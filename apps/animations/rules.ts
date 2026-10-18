// The sections of the film skill's rule files that the judge and the critique
// quote to their counsel, each by its file and its heading line. Each heading
// is read as written: one its file lacks fails the judge's run and the
// critic's build, and `rules.test.ts` holds every one to its file.

/** The film skill's rule files: the craft rules and the director's vision. */
const SKILL = `${import.meta.dir}/../../.claude/skills/film`;
const CRAFT = `${SKILL}/CRAFT.md`;
const VISION = `${SKILL}/reference/director-vision.md`;

/**
 * What `film judge` quotes to its counsel: the rules that bear on a scene's
 * picture. The look, the palette, the colour script, the paper and what we
 * never do bear on every beat; a STORY beat adds human scale, figures and
 * staging; an IDEA beat adds words off the picture, repetition as layout and
 * type.
 */
export const JUDGE_RULES = [
  { file: CRAFT, heading: '## 3. Two registers', registers: [] },
  { file: CRAFT, heading: '## 12. The look', registers: [] },
  { file: VISION, heading: '### Palette logic', registers: [] },
  { file: VISION, heading: '### Colour script per act', registers: [] },
  { file: VISION, heading: '### Paper, light, texture', registers: [] },
  { file: VISION, heading: '## What we never do', registers: [] },
  { file: CRAFT, heading: '## 5. Human scale', registers: ['STORY'] },
  { file: VISION, heading: '### Figures, scale, hands and faces', registers: ['STORY'] },
  { file: VISION, heading: '## Camera and staging grammar', registers: ['STORY'] },
  { file: CRAFT, heading: '## 1. Words off the picture', registers: ['IDEA'] },
  { file: CRAFT, heading: '## 8. Repetition as layout', registers: ['IDEA'] },
  { file: VISION, heading: '### Type', registers: ['IDEA'] },
] as const;

/** The character sheets: how every figure is drawn. */
const CHARACTERS = `${SKILL}/reference/character-design.md`;

/**
 * What `film critique` quotes to its counsel beside a figure's two crops: how
 * a figure is drawn in the house look (the K1 look, the grammar every figure
 * shares, figures and faces, the look's rule).
 */
export const CRITIQUE_RULES = [
  { file: CHARACTERS, heading: '## The look these rules assume (K1)' },
  { file: CHARACTERS, heading: '### 2.1 The grammar every figure shares' },
  { file: VISION, heading: '### Figures, scale, hands and faces' },
  { file: CRAFT, heading: '## 12. The look' },
] as const;
