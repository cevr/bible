// What a page draws, read back from the browser: every colour, font family,
// size, weight, leading, radius and
// spacing the studio's chrome is drawn with, and every colour in its
// gradients and shadows, resolves to a token of `player/tokens.css`, as the
// page's own `:root` resolves it at its width and pointer. Only the tokens
// that file declares count: a variable a page or a part declares for itself
// is no token, so a value it carries is read as the literal it is. The
// source guard (`style-tokens.test.ts`) reads how a value is spelled; this
// reads what is drawn, so a value no rule spells (a user agent's default: a
// `<p>`'s margin, `bold`'s 700, a native field's colour) or one built where
// no regex looks (a computed `calc`, a style set from data) is read the same
// as a literal.
//
// Allowed beside the tokens, each by name:
// - a token negated (a gutter pulled back by `calc(-1 * var(--gutter))`);
// - a colour a token's value holds (`--shadow-pop`'s shade);
// - a scene's hue, `hsl(<hue> var(--scene-sat) var(--scene-light))`: any
//   hue at the tokens' saturation and lightness;
// - a native part the engine colours itself: a range's and a select's own
//   colours (text, ground, edge) and leading (`NATIVE`);
// - a visually hidden field (1 × 1 or less), never seen;
// - a margin set to `auto`, which pushes a part along and is no step;
// - the compositions in `COMPOSED`, each tokens summed, or a share of the
//   window, for a part's room;
// - the geometry in `GEOMETRY`, each a size a shape needs, not a step of
//   the scale.

import { Schema } from 'effect';

/**
 * Sizes a part composes of tokens or of the window, by the expression that
 * composes them: each resolved at the page's window as the tokens are, and
 * drawn as a token is.
 */
const COMPOSED = {
  'calc(2 * var(--s-8) + var(--s-2))':
    "the lab strip's cue-name column (`--cue-names`): each name, then a step of room before its row",
  '75dvh':
    "a phone's open sheet (`--cmd-sheet-height`): the room the page keeps under it, so all of the page scrolls above it",
  '40dvh':
    "the room the Scenes' tape keeps under a selected scene's sheet, so its last row scrolls above it",
} satisfies Readonly<Record<string, string>>;

/**
 * Sizes a shape needs, by the value drawn (a negated one too): each is a
 * hairline, centres a mark on its line, or sums two tokens in a `calc`,
 * and is no step of the spacing scale.
 */
const GEOMETRY = {
  '1px':
    "a hairline: the seam between stills, a band's scenes, a strip's frames; the playhead centred on it",
  '3.5px': "half a tape mark's 7 px: the mark centred on its time",
  '73px':
    "a phone's dock and a step under it (`--dock-h` + `--s-3`): the page's room below its last row",
} satisfies Readonly<Record<string, string>>;

/** A list of strings as a script's array literal. */
const arrayOf = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)));

/** The tokens `css` (`player/tokens.css`'s text) declares, by name, each once. */
const tokenNames = (css: string): ReadonlyArray<string> => [
  ...new Set([...css.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)].flatMap((m) => m.slice(1, 2))),
];

/**
 * A script answering every value the page draws that resolves to no token
 * of `tokensCss` (`player/tokens.css`'s text), as `property value: element`,
 * one line per value and property (its first element named); none, `[]`.
 */
export const untokened = (tokensCss: string) => `(() => {
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  const TOKENS = ${arrayOf(tokenNames(tokensCss))};
  const probe = document.createElement('i');
  probe.style.cssText = 'position:absolute;display:block;visibility:hidden;left:0;top:0';
  document.body.append(probe);
  const colourOf = (v) => {
    probe.style.color = 'rgb(1, 2, 3)';
    probe.style.color = v;
    return getComputedStyle(probe).color;
  };
  // A colour inside a value: a colour function, a hex, or a colour's name.
  const COLOUR_PARTS = /[a-z-]+\\((?:[^()]|\\([^()]*\\))*\\)|#[0-9a-f]{3,8}\\b|[a-z]+/gi;
  const colours = new Set();
  const lengths = new Set();
  const weights = new Set();
  const families = new Set();
  // Each token as the root resolves it (at this width and pointer).
  for (const name of TOKENS) {
    const raw = rootStyle.getPropertyValue(name).trim();
    if (raw === '') continue;
    const colour = colourOf('var(' + name + ')');
    if (CSS.supports('color', raw) || (raw.startsWith('var(') && colour !== 'rgb(1, 2, 3)')) colours.add(colour);
    for (const part of raw.match(COLOUR_PARTS) ?? []) if (CSS.supports('color', part)) colours.add(colourOf(part));
    probe.style.width = '';
    probe.style.width = 'var(' + name + ')';
    const width = getComputedStyle(probe).width;
    if (/^-?[\\d.]+(px|r?em)$|^calc\\(/.test(raw) || raw.startsWith('var(')) {
      if (width.endsWith('px')) lengths.add(width);
    }
    if (/%$/.test(raw)) lengths.add(raw);
    if (/^\\d{3}$/.test(raw)) weights.add(raw);
    probe.style.fontFamily = 'var(' + name + ')';
    if (name === '--font') families.add(getComputedStyle(probe).fontFamily);
  }
  // Read as a padding is (a width snaps to the layout's 1/64 px; a padding does not).
  for (const composed of ${arrayOf(Object.keys(COMPOSED))}) {
    probe.style.paddingLeft = composed;
    lengths.add(getComputedStyle(probe).paddingLeft);
  }
  probe.remove();
  lengths.add('0px');
  for (const v of ${arrayOf(Object.keys(GEOMETRY))}) lengths.add(v);
  const negated = (v) => (v.startsWith('-') ? v.slice(1) : '-' + v);
  const isLength = (v) => lengths.has(v) || lengths.has(negated(v));
  const rgb = (v) => (/^rgba?\\(([\\d.]+), ([\\d.]+), ([\\d.]+)/.exec(v) ?? []).slice(1).map(Number);
  const sceneHue = (v) => {
    const [r, g, b] = rgb(v).map((c) => c / 255);
    if (r === undefined) return false;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    const sat = parseFloat(rootStyle.getPropertyValue('--scene-sat')) / 100;
    const light = parseFloat(rootStyle.getPropertyValue('--scene-light')) / 100;
    return Math.abs(s - sat) < 0.02 && Math.abs(l - light) < 0.01;
  };
  const isColour = (v) => v === 'rgba(0, 0, 0, 0)' || colours.has(v) || sceneHue(v);
  // The colours a computed gradient or shadow draws with, each as the engine writes a colour.
  const COLOURS_IN = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\([^()]*\\)/g;
  const NATIVE = (el) => el.matches('input[type="range"], select');
  // A margin set to auto: its computed value (the typed one; the resolved one is the px it took).
  const autoMargin = (el, p) =>
    p.startsWith('margin') && el.computedStyleMap().get(p.replace(/[A-Z]/, (c) => '-' + c.toLowerCase())).toString() === 'auto';
  const name = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    const parent = el.parentElement && typeof el.parentElement.className === 'string' && el.parentElement.className.trim() ? el.parentElement.className.trim().split(/\\s+/)[0] + ' > ' : '';
    return parent + el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  };
  const found = new Map();
  const off = (property, value, el) => {
    const key = property + ' ' + value;
    if (!found.has(key)) found.set(key, name(el));
  };
  // A line has no inside to fill: only its stroke is drawn.
  const FILLED = new Set(['path', 'circle', 'rect', 'polyline', 'polygon', 'ellipse', 'text']);
  const SHAPES = new Set([...FILLED, 'line']);
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META', 'CANVAS'].includes(el.tagName)) continue;
    if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 && r.height <= 1) continue;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight * 4 || r.left > innerWidth) continue;
    const s = getComputedStyle(el);
    const svg = el instanceof SVGElement;
    const texted = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
    if (!svg && (texted || el.matches('input, textarea, select, button'))) {
      if (!families.has(s.fontFamily)) off('font-family', s.fontFamily, el);
      if (!lengths.has(s.fontSize)) off('font-size', s.fontSize, el);
      if (!weights.has(s.fontWeight)) off('font-weight', s.fontWeight, el);
      if (!lengths.has(s.lineHeight) && !(NATIVE(el) && s.lineHeight === 'normal')) off('line-height', s.lineHeight, el);
      if (!isColour(s.color) && !NATIVE(el)) off('color', s.color, el);
      if (s.textShadow !== 'none')
        for (const c of s.textShadow.match(COLOURS_IN) ?? []) if (!isColour(c)) off('text-shadow', c, el);
    }
    if (svg && SHAPES.has(el.tagName)) {
      if (FILLED.has(el.tagName) && s.fill !== 'none' &&!s.fill.startsWith('url(') && !isColour(s.fill)) off('fill', s.fill, el);
      if (s.stroke !== 'none' && !s.stroke.startsWith('url(') && !isColour(s.stroke)) off('stroke', s.stroke, el);
    }
    if (!svg) {
      if (!isColour(s.backgroundColor) && !NATIVE(el)) off('background-color', s.backgroundColor, el);
      for (const [p, key] of [['backgroundImage', 'background-image'], ['boxShadow', 'box-shadow']]) {
        if (s[p] === 'none') continue;
        for (const c of s[p].match(COLOURS_IN) ?? []) if (!isColour(c)) off(key, c, el);
      }
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (s['border' + side + 'Style'] === 'none' || s['border' + side + 'Width'] === '0px') continue;
        if (!isColour(s['border' + side + 'Color']) && !NATIVE(el)) off('border-color', s['border' + side + 'Color'], el);
      }
      for (const corner of ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft']) {
        const v = s['border' + corner + 'Radius'];
        if (!isLength(v)) off('border-radius', v, el);
      }
      for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'rowGap', 'columnGap']) {
        const v = s[p];
        if (v === 'normal' || isLength(v) || autoMargin(el, p)) continue;
        off(p, v, el);
      }
    }
  }
  return [...found].map(([key, el]) => key + ': ' + el).sort();
})()`;
