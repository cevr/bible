/**
 * Series canon for every verse-driven Keynote deck: the painting style, the
 * palette references, and the recurring characters. Change it here and every
 * deck regenerates as one visual family.
 *
 * Reference paths are relative to `packages/cli/outputs/decks/`.
 */

export const STYLE =
  'LANDSCAPE 3:2 horizontal devotional fine-art oil painting, classical painterly style in warm muted earth tones, loose expressive brushwork with visible canvas texture, dramatic natural chiaroscuro light, no hard digital edges.';

export const NO_TEXT = 'NO text, NO lettering, NO numbers, NO words.';

export const IMAGE_SIZE = '1536x1024';

/** Every painting gets the palette ref; scene paintings add the scene ref. */
export const PALETTE_REF = 'what-is-truth/images/day3/00-title.png';
export const SCENE_REF = 'reading-102/images/title.png';

/**
 * A recurring person. `descriptor` goes into the concept text (use
 * `describe("jesus")` when writing a beat); `ref` replaces the scene ref so
 * the model sees the canonical face.
 */
export const CHARACTERS = {
  jesus: {
    descriptor:
      'Jesus matching the reference character with long dark brown hair, short beard, white robe with gold-trimmed sleeves and golden sash',
    ref: 'what-is-truth/images/day3/n20-father-and-son.png',
  },
  lucifer: {
    descriptor:
      'Lucifer matching the reference character exactly: youthful beardless face, golden curly shoulder-length hair, jeweled gold armor, crimson mantle, great golden wings',
    ref: 'what-is-truth/images/day3/01-covering-cherub.png',
  },
} as const;

export type Character = keyof typeof CHARACTERS;

export const describe = (character: Character) => CHARACTERS[character].descriptor;

export const prompt = (concept: string) => `${STYLE} Subject: ${concept}. ${NO_TEXT}`;

export const CANVAS = { w: 1920, h: 1080 } as const;

export const LAYOUTS = {
  A_imageRight: { text: [131, 408, 805, 264], image: [1037, 75, 750, 903] },
  B_imageLeft: { image: [133, 75, 750, 903], text: [984, 408, 805, 264] },
} as const;
