/**
 * The emblems as drawings laid in the page, so their parts can move when a
 * card is pointed at or focused (`.emblem` in `../styles.css`): the path's
 * sun and the remedies' sun rise from their horizons, the land's tree stirs,
 * and the book turns a leaf. The book gains the leaf here: a copy of its
 * right page and that page's lines, laid over them under the spine, so at
 * rest the drawing is the same and a turn shows the leaf crossing to the left.
 */

/** The spine's group in the book's drawing, which the leaf goes under. */
const SPINE = '<g><clipPath id="k15">';

const PAGE = 'M50 36C60 30 74 30 86 34L86 74C74 70 60 70 50 76Z';
const LINES = 'M56 45C62 42 70 42 78 44M56 53C62 50 70 50 78 52';

/** A shape drawn as the emblems draw one: its fill, its shade, its paper highlight, its ink. */
const drawing = (id: string, d: string, fill: string, shade: string) =>
  [
    `<clipPath id="${id}"><path d="${d}"/></clipPath>`,
    `<path d="${d}" fill="${fill}"/>`,
    shade,
    `<path d="${d}" fill="none" stroke="#fcfbf0" stroke-width="3.84" clip-path="url(#${id})" opacity=".85"/>`,
    `<path d="${d}" fill="none" stroke="#2c4542" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`,
  ].join('');

/** The leaf: the right page, its shade (which its back does not have), and its lines. */
const LEAF = [
  '<g class="leaf">',
  drawing(
    'k20',
    PAGE,
    '#fcfbf0',
    `<path class="leaf-shade" d="${PAGE}" fill="#bac9db" clip-path="url(#k20)"/>`,
  ),
  drawing('k21', LINES, '#776357', ''),
  '</g>',
].join('');

/** The book's drawing with its leaf laid under the spine, or the drawing as it is if it has no spine where the leaf expects one. */
export const withLeaf = (book: string) => {
  const at = book.indexOf(SPINE);
  if (at < 0) return book;
  return `${book.slice(0, at)}${LEAF}${book.slice(at)}`;
};
