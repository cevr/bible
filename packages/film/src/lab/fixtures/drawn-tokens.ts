// What a page draws, read back from the browser: every colour, font family,
// size, weight, leading, tracking, radius, border and outline width and
// spacing the studio's chrome is drawn with, and every colour in its
// gradients, shadows, filters, strokes and stops, in the element and in its
// `::before` and `::after` (and a shown placeholder's `::placeholder`, a list
// item's `::marker` and a modal's `::backdrop`, the colour each draws),
// resolves to a token of `player/tokens.css`, as the
// page's own `:root` resolves it at its width and pointer. Only the tokens
// that file declares count: a variable a page or a part declares for itself
// is no token, so a value it carries is read as the literal it is. The
// source guard (`style-tokens.test.ts`) reads how a value is spelled; this
// reads what is drawn, so a value no rule spells (a user agent's default: a
// `<p>`'s margin, `bold`'s 700, a native field's colour) or one built where
// no regex looks (a computed `calc`, a style set from data) is read the same
// as a literal.
//
// Each kind of length is read against its own scale: a font size against
// `--fs-*`, leading against `--lh-*`, a radius against `--r-*`, and a
// padding, margin, gap, border or outline width or offset against `--s-*`,
// `--gutter` and `GEOMETRY`, so a size that equals another scale's token
// (a 56 px font, which is `--tabbar-h`) is still off its own. Computed
// styles do not depend on where the page is scrolled, so no element is
// skipped for lying below the fold or past the window's side.
//
// Allowed beside the tokens, each by name:
// - a token negated (a gutter pulled back by `calc(-1 * var(--gutter))`);
// - a colour a token's value holds (`--shadow-pop`'s shade);
// - a scene's hue, `hsl(<hue> var(--scene-sat) var(--scene-light))`: any
//   hue at the tokens' saturation and lightness, on a scene's swatch only
//   (an element that carries `--hue`, or a `data-scene`, `.sc-hue`, `.seg`);
// - a native part the engine colours itself: a range's and a select's own
//   colours (text, ground, edge) and leading (`NATIVE`);
// - a visually hidden field (1 × 1 or less), never seen;
// - a margin set to `auto`, which pushes a part along and is no step;
// - letter-spacing of `--track-caps` (and uppercase only with it), or none;
// - italic from the elements that mean emphasis (`EMPHASIS`);
// - an opacity of 1, or the ones in `OPACITY`, each by its reason;
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
    "a hairline: the seam between stills, a band's scenes, a strip's frames; the playhead centred on it; a border and a picked still's outline",
  '2px': "a focus outline's width and its gap to the part",
  '3px':
    "a tape mark's reach either side (`--tick-slop`): a transparent border that widens its press",
  '3.5px': "half a tape mark's 7 px: the mark centred on its time",
  '5px': "a cue bar's grip at either end (`--cue-grip`): the edge a drag takes",
  '14px':
    "the scene line's time dropped by one line of its own leading (`--lh-1`), so it sits on the line's first baseline",
  '56px':
    "the room the phone's tab bar holds under the page (`--tabbar-h`): the page's last row clears it",
  '73px':
    "a phone's dock and a step under it (`--dock-h` + `--s-3`): the page's room below its last row",
} satisfies Readonly<Record<string, string>>;

/** The elements whose own meaning is emphasis: the user agent draws them in italic. */
const EMPHASIS = ['EM', 'I', 'CITE', 'DFN', 'VAR', 'ADDRESS'];

/**
 * The opacities a part is drawn at other than 1, by the value: a part set
 * back, not a colour.
 */
const OPACITY = {
  '0': 'a part not shown yet (a fade in or out), which has no look to read',
  '0.55': 'a resolved note, set back from the open ones',
  '0.85': "a picked scene's still, dimmed under its outline",
} satisfies Readonly<Record<string, string>>;

/**
 * Sites that draw off the tokens today, each as the check names it, with why:
 * a part the design has not yet answered. Each is a design change (a reset of
 * a paragraph's margin, one focus ring for the whole lab), not a value to
 * allow, so the check stays on for every other part.
 */
const SITES = {
  'marginTop 11px: rv-main > p.rv-hint':
    "a hint paragraph keeps the user agent's margin of 1em (11 px): a reset is a layout change to answer in the review's design",
  'marginBottom 11px: rv-main > p.rv-hint': 'the same hint, its margin below',
  'marginTop 11px: rv-group > p.rv-hint': 'the same hint inside an options group',
  'marginBottom 11px: rv-group > p.rv-hint': 'the same hint inside an options group, below',
  'marginTop 11px: lab-inspector-body > p.rv-hint': 'the same hint in an inspector',
  'marginBottom 11px: lab-inspector-body > p.rv-hint': 'the same hint in an inspector, below',
  'marginTop 11px: lab-keys-group > p.keys':
    "the keys dialog's group note keeps the user agent's margin of 1em (11 px)",
  'marginBottom 11px: lab-keys-group > p.keys': 'the same note, below',
  'marginTop 13px: rv-pending > p.rv-row':
    "a pending row's paragraph keeps the user agent's margin of 1em (13 px)",
  'marginBottom 13px: rv-pending > p.rv-row': 'the same row, below',
  'outline-color rgb(238, 238, 238): lab-keys-actions > button':
    "the user agent's focus ring on the keys dialog's focused button: the lab has one ring in the shell and the review (`--focus-ring`), none for a dialog's own",
  'outline-color rgb(238, 238, 238): lab-compose > textarea':
    "the user agent's focus ring on a note's composer, which has no ring of the lab's own",
  'outline-color rgb(238, 238, 238): lab-command-menu > input.lab-command-query':
    "the user agent's focus ring on the command menu's query field",
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
 * one line per value and property (its first element named, `::before` and
 * `::after` after it); none, `[]`.
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
  const weights = new Set();
  const families = new Set();
  // Each kind of length has its own scale: the type's sizes, the leading, the radii and the spacing.
  const scales = { type: new Set(['0px']), leading: new Set(['0px']), radius: new Set(['0px']), space: new Set(['0px']) };
  const scaleOf = (name) => {
    if (/^--(fs-|body-fs)/.test(name)) return scales.type;
    if (/^--(lh-|body-lh)/.test(name)) return scales.leading;
    if (/^--r-/.test(name)) return scales.radius;
    return /^--(s-\\d|gutter$)/.test(name) ? scales.space : null;
  };
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
    const scale = scaleOf(name);
    if (scale !== null && (/^-?[\\d.]+px$/.test(raw) || raw.startsWith('calc(') || raw.startsWith('var(')) && width.endsWith('px')) scale.add(width);
    if (/%$/.test(raw) && /^--r-/.test(name)) scales.radius.add(raw);
    if (/^\\d{3}$/.test(raw)) weights.add(raw);
    probe.style.fontFamily = 'var(' + name + ')';
    if (name === '--font') families.add(getComputedStyle(probe).fontFamily);
  }
  // Read as a padding is (a width snaps to the layout's 1/64 px; a padding does not).
  for (const composed of ${arrayOf(Object.keys(COMPOSED))}) {
    probe.style.paddingLeft = composed;
    scales.space.add(getComputedStyle(probe).paddingLeft);
  }
  const trackCaps = parseFloat(rootStyle.getPropertyValue('--track-caps'));
  probe.remove();
  for (const v of ${arrayOf(Object.keys(GEOMETRY))}) scales.space.add(v);
  const negated = (v) => (v.startsWith('-') ? v.slice(1) : '-' + v);
  const within = (scale, v) => scale.has(v) || scale.has(negated(v));
  const rgb = (v) => (/^rgba?\\(([\\d.]+), ([\\d.]+), ([\\d.]+)/.exec(v) ?? []).slice(1).map(Number);
  // A scene's hue is a swatch's: the saturation and lightness of the tokens, at any hue.
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
  const swatch = (el) => el.matches('[style*="--hue"], [data-scene], .sc-hue, .seg');
  const isColour = (v, el) => v === 'rgba(0, 0, 0, 0)' || colours.has(v) || (swatch(el) && sceneHue(v));
  // The colours a computed gradient, shadow or filter draws with, each as the engine writes a colour.
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
  // Every site of an off-scale value, so an allowed site cannot hide another's.
  const found = new Set();
  const off = (property, value, el, pseudo) => {
    found.add(property + ' ' + value + ': ' + name(el) + pseudo);
  };
  // A line has no inside to fill: only its stroke is drawn.
  const FILLED = new Set(['path', 'circle', 'rect', 'polyline', 'polygon', 'ellipse', 'text']);
  const SHAPES = new Set([...FILLED, 'line']);
  const EMPHASIS = ${arrayOf(EMPHASIS)};
  const OPACITY = ${arrayOf(Object.keys(OPACITY))};
  // Tracking is the caps token's, or none; uppercase goes with the caps token's.
  const caps = (s) => Math.abs(parseFloat(s.letterSpacing) - trackCaps * parseFloat(s.fontSize)) < 0.02;
  const tracked = (s) => s.letterSpacing === 'normal' || parseFloat(s.letterSpacing) === 0 || caps(s);
  // What an element, or its ::before or ::after (\`pseudo\`), draws, read from its computed style \`s\`.
  const read = (el, s, pseudo) => {
    const svg = el instanceof SVGElement;
    const texted = pseudo !== ''
      ? /^"./.test(s.content)
      : [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
    if (!svg && (texted || (pseudo === '' && el.matches('input, textarea, select, button')))) {
      if (!families.has(s.fontFamily)) off('font-family', s.fontFamily, el, pseudo);
      if (!within(scales.type, s.fontSize)) off('font-size', s.fontSize, el, pseudo);
      if (!weights.has(s.fontWeight)) off('font-weight', s.fontWeight, el, pseudo);
      if (!within(scales.leading, s.lineHeight) && !(NATIVE(el) && s.lineHeight === 'normal')) off('line-height', s.lineHeight, el, pseudo);
      if (!isColour(s.color, el) && !NATIVE(el)) off('color', s.color, el, pseudo);
      if (s.textShadow !== 'none')
        for (const c of s.textShadow.match(COLOURS_IN) ?? []) if (!isColour(c, el)) off('text-shadow', c, el, pseudo);
      if (!tracked(s)) off('letter-spacing', s.letterSpacing, el, pseudo);
      if (s.textTransform === 'uppercase' ? !caps(s) : s.textTransform !== 'none') off('text-transform', s.textTransform, el, pseudo);
      if (s.fontStyle !== 'normal' && !EMPHASIS.includes(el.tagName)) off('font-style', s.fontStyle, el, pseudo);
      if (s.textDecorationLine !== 'none' && !isColour(s.textDecorationColor, el)) off('text-decoration-color', s.textDecorationColor, el, pseudo);
    }
    if (svg && SHAPES.has(el.tagName)) {
      if (FILLED.has(el.tagName) && s.fill !== 'none' && !s.fill.startsWith('url(') && !isColour(s.fill, el)) off('fill', s.fill, el, pseudo);
      if (s.stroke !== 'none' && !s.stroke.startsWith('url(') && !isColour(s.stroke, el)) off('stroke', s.stroke, el, pseudo);
    }
    if (!svg) {
      if (!isColour(s.backgroundColor, el) && !NATIVE(el)) off('background-color', s.backgroundColor, el, pseudo);
      for (const [p, key] of [['backgroundImage', 'background-image'], ['boxShadow', 'box-shadow'], ['filter', 'filter']]) {
        if (s[p] === 'none') continue;
        for (const c of s[p].match(COLOURS_IN) ?? []) if (!isColour(c, el)) off(key, c, el, pseudo);
      }
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (s['border' + side + 'Style'] === 'none' || s['border' + side + 'Width'] === '0px') continue;
        if (!isColour(s['border' + side + 'Color'], el) && !NATIVE(el)) off('border-color', s['border' + side + 'Color'], el, pseudo);
        if (!within(scales.space, s['border' + side + 'Width']) && !NATIVE(el)) off('border-width', s['border' + side + 'Width'], el, pseudo);
      }
      if (s.outlineStyle !== 'none' && s.outlineWidth !== '0px') {
        if (!isColour(s.outlineColor, el)) off('outline-color', s.outlineColor, el, pseudo);
        if (!within(scales.space, s.outlineWidth)) off('outline-width', s.outlineWidth, el, pseudo);
        if (!within(scales.space, s.outlineOffset)) off('outline-offset', s.outlineOffset, el, pseudo);
      }
      for (const corner of ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft']) {
        const v = s['border' + corner + 'Radius'];
        if (!within(scales.radius, v)) off('border-radius', v, el, pseudo);
      }
      for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'rowGap', 'columnGap']) {
        const v = s[p];
        if (v === 'normal' || within(scales.space, v) || (pseudo === '' && autoMargin(el, p))) continue;
        off(p, v, el, pseudo);
      }
      // Neither applies to a generated box: it inherits the part's own, read on the part.
      // (Left unset, each resolves to the part's own colour, which is read as the part's.)
      for (const p of pseudo === '' ? ['caret-color', 'accent-color'] : []) {
        const v = s.getPropertyValue(p);
        if (v !== 'auto' && v !== s.color && !isColour(v, el)) off(p, v, el, pseudo);
      }
      if (s.opacity !== '1' && !OPACITY.includes(s.opacity)) off('opacity', s.opacity, el, pseudo);
    }
  };
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META', 'CANVAS'].includes(el.tagName)) continue;
    // A gradient's stop has no box: its colour is read when the picture it paints shows.
    if (el.tagName === 'stop') {
      const picture = el.ownerSVGElement;
      if (picture !== null && picture.checkVisibility({ visibilityProperty: true }) && !isColour(getComputedStyle(el).stopColor, el)) off('stop-color', getComputedStyle(el).stopColor, el, '');
      continue;
    }
    if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 && r.height <= 1) continue;
    read(el, getComputedStyle(el), '');
    for (const pseudo of ['::before', '::after']) {
      const s = getComputedStyle(el, pseudo);
      if (s.content !== 'none' && s.content !== 'normal') read(el, s, pseudo);
    }
    // The pseudo-elements that draw a colour of their own: a shown placeholder, a list item's marker, a modal's backdrop.
    const colourOfPseudo = (pseudo, property, key) => {
      const value = getComputedStyle(el, pseudo)[property];
      if (!isColour(value, el)) off(key, value, el, pseudo);
    };
    if (el.matches('input, textarea') && el.placeholder !== '' && el.value === '') colourOfPseudo('::placeholder', 'color', 'color');
    if (getComputedStyle(el).display === 'list-item') colourOfPseudo('::marker', 'color', 'color');
    if (el.matches(':modal, :popover-open')) colourOfPseudo('::backdrop', 'backgroundColor', 'background-color');
  }
  const SITES = ${arrayOf(Object.keys(SITES))};
  return [...found].filter((line) => !SITES.includes(line)).sort();
})()`;
