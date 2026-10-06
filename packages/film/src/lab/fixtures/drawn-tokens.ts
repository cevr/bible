// What a page draws, read back from the browser (G9, the design language's
// DL-9): every colour, font family, size, weight, leading, radius and
// spacing the studio's chrome is drawn with resolves to a token of
// `player/tokens.css`, as the page's own `:root` resolves it at its width
// and pointer. The source guard (`style-tokens.test.ts`) reads how a value
// is spelled; this reads what is drawn, so a value no rule spells (a user
// agent's default: a `<p>`'s margin, `bold`'s 700, a native field's colour)
// or one built where no regex looks (a computed `calc`, a style set from
// data) is read the same as a literal.
//
// Allowed beside the tokens, each by name:
// - a token negated (a gutter pulled back by `calc(-1 * var(--gutter))`);
// - a scene's hue, `hsl(<hue> var(--scene-sat) var(--scene-light))`: any
//   hue at the tokens' saturation and lightness;
// - a native part the engine colours itself: a range's and a select's own
//   colours (text, ground, edge) and leading (`NATIVE`);
// - a visually hidden field (1 × 1 or less), never seen;
// - the geometry in `GEOMETRY`, each a size a shape needs, not a step of
//   the scale.

import { Schema } from 'effect';

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

/** The geometry's values, as a script's array literal. */
const GEOMETRY_VALUES = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)))(
  Object.keys(GEOMETRY),
);

/**
 * A script answering every value the page draws that resolves to no token,
 * as `property value: element`, one line per value and property (its first
 * element named); none, `[]`.
 */
export const UNTOKENED = `(() => {
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  // Each token, with where it is declared: the root's, and a part's own
  // (\`--cue-names\` on the strip), resolved inside the first element it is on.
  const declared = [];
  const collect = (rules) => {
    for (const rule of rules) {
      if (rule.cssRules) collect(rule.cssRules);
      if (!rule.style || !rule.selectorText) continue;
      for (const p of rule.style) if (p.startsWith('--')) declared.push([p, rule.selectorText]);
    }
  };
  for (const sheet of document.styleSheets) {
    try { collect(sheet.cssRules); } catch { /* a sheet from another origin */ }
  }
  const probe = document.createElement('i');
  probe.style.cssText = 'position:absolute;display:block;visibility:hidden;left:0;top:0';
  const colours = new Set();
  const lengths = new Set();
  const weights = new Set();
  const families = new Set();
  for (const [name, selector] of declared) {
    let host = null;
    try { host = selector === ':root' ? document.body : document.querySelector(selector); } catch { host = null; }
    if (host === null || host instanceof SVGElement) continue;
    host.append(probe);
    const raw = getComputedStyle(host).getPropertyValue(name).trim();
    if (raw === '') continue;
    probe.style.color = 'rgb(1, 2, 3)';
    probe.style.color = 'var(' + name + ')';
    const colour = getComputedStyle(probe).color;
    if (CSS.supports('color', raw) || (raw.startsWith('var(') && colour !== 'rgb(1, 2, 3)')) colours.add(colour);
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
  probe.remove();
  lengths.add('0px');
  for (const v of ${GEOMETRY_VALUES}) lengths.add(v);
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
  const NATIVE = (el) => el.matches('input[type="range"], select');
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
    }
    if (svg && SHAPES.has(el.tagName)) {
      if (FILLED.has(el.tagName) && s.fill !== 'none' &&!s.fill.startsWith('url(') && !isColour(s.fill)) off('fill', s.fill, el);
      if (s.stroke !== 'none' && !s.stroke.startsWith('url(') && !isColour(s.stroke)) off('stroke', s.stroke, el);
    }
    if (!svg) {
      if (!isColour(s.backgroundColor) && !NATIVE(el)) off('background-color', s.backgroundColor, el);
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
        if (v === 'normal' || isLength(v)) continue;
        off(p, v, el);
      }
    }
  }
  return [...found].map(([key, el]) => key + ': ' + el).sort();
})()`;
