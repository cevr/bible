/** Margin-note presentational helpers — pure string formatting, framework-
 *  agnostic. Renderers use these to produce the footnote letter (`a`, `b`,
 *  …, `aa`, `ab`, …) and the popover prefix (`Heb. `, `Gr. `, `Or, `). */

/** Convert a 0-based note index to a lowercase letter label.
 *  `0 → "a"`, `25 → "z"`, `26 → "aa"`, `27 → "ab"`, … */
export const noteLabel = (index: number): string => {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    n--;
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
};

/** Format a margin-note `type` discriminator as the popover prefix string.
 *  Unknown types (`name`, `other`, anything else) produce an empty prefix. */
export const formatNoteType = (noteType: string): string => {
  switch (noteType) {
    case 'hebrew':
      return 'Heb. ';
    case 'greek':
      return 'Gr. ';
    case 'alternate':
      return 'Or, ';
    default:
      return '';
  }
};
