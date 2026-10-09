// What a finger or a pointer reaches on a page: every shown interactive
// element whose usable hit area holds no square of the touch target
// (`--hit`: 44 px on the phone, 28 px on the laptop; the design language's
// "every touch target ≥ --hit through padding").
//
// The usable area is measured as a tap meets it, not as the element's box:
// a grid of points every `STEP` px over the target's box and a margin of half
// a target round it, each asked `document.elementFromPoint`; the points that
// land on the target or a label of it, with no other control nearer (a link
// inside a label is the link's), are its area. So padding and a
// pseudo-element hit-slop (`::before` past the box) count, and a part another
// element covers does not. The target passes when a square of `hit` px fits
// in that area (the square in the middle of its largest box is asked first:
// whole, it passes on that alone). Sampled every 2 px, a region under `hit - 2` px always fails
// and one of `hit` px always passes. A visually hidden field (a 1 px
// checkbox) is reached through its labels, which are then its target.
//
// Not a target at all: a backing input, out of the accessibility tree and
// the tab order (`aria-hidden`, `tabindex="-1"`) and physically hidden
// (clipped away, 1 × 1, or transparent with no pointer events), such as the
// form input a number field keeps beside its visible one; the visible one is
// measured. A popup's focus guard (in the tab order only to send the focus
// on, and as hidden) is none either. Anything shown that a pointer can land
// on is measured.
//
// A hit-slop stays off its neighbours: where a target's slop (a positioned
// `::before` or `::after` drawn past its padding box) lies over another
// control's box, one that neither holds nor is held by it, a tap on that
// control's edge is the target's, though both still hold a square. The
// slop's rectangle is worked out exactly from its own offsets and size,
// and every whole pixel where it meets the neighbour's box is asked who a
// tap there reaches; the target fails, as `… reaches over …`, on any one
// that is its. A slop that cannot be placed exactly (its target is not its
// containing block, or it, its target or an ancestor beyond a move is
// transformed) fails as `… hit-slop is not anchored to its target`. The
// studio's hit areas are a target's own box (its padding and minimum
// size), and `::before` slops (a name's, the note scope's ×, the findings
// chip's); a child element or padding never reaches past the target's box,
// so neither is in this check's scope.
//
// Exceptions are WCAG 2.5.8's (target size, minimum), never by page:
// - Inline: a link in running text, with words before or after it on its
//   own line, so the line of text sets its size.
// - Spacing: a target whose usable area holds a square of `SPACED_MIN`
//   (24 px), and whose `hit`-wide circle, on the middle of that area, lands
//   on no other target's usable area (hit-slops included), so a finger aimed
//   at it cannot land on a neighbour. A target that encloses it is its
//   container, not its neighbour.

import { jsonOf } from './tab.ts';

/** The phone's touch target, in CSS pixels (`--hit` under a coarse pointer). */
export const PHONE_HIT = 44;

/** The laptop's target, in CSS pixels (`--hit` with a fine pointer on a wide screen). */
export const DESK_HIT = 28;

/** The smallest target the spacing exception keeps (WCAG 2.5.8's 24 px). */
const SPACED_MIN = 24;

/** The sampling grid's pitch, in CSS pixels. */
const STEP = 2;

/**
 * What a finger can operate: the elements, and the roles, a page's touch
 * targets are, as one selector. The touch-target check and the phone-fit
 * check ask the same one.
 */
export const TARGETS = [
  'button',
  'a[href]',
  'summary',
  'input:not([type=hidden])',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
  ...[
    'button',
    'link',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'tab',
    'checkbox',
    'radio',
    'switch',
    'slider',
  ].map((role) => `[role=${role}]`),
].join(', ');

/**
 * The page-side words every measure of the controls shares: `boxOf`;
 * `backing`, a backing input (out of the tree and the tab order, and nothing
 * of it to see or press); `named`, how a failure names a control.
 */
export const CONTROL_WORDS = `
  const boxOf = (el) => el.getBoundingClientRect();
  const backing = (el) => {
    // A focus guard is in the tab order only to send the focus on at once: nothing to press either.
    const passing = el.tabIndex < 0 || el.hasAttribute('data-base-ui-focus-guard');
    if (!(passing && el.closest('[aria-hidden="true"]'))) return false;
    const r = boxOf(el), s = getComputedStyle(el);
    return (r.width <= 1 && r.height <= 1) || /inset\\(50%/.test(s.clipPath) || s.clip === 'rect(0px, 0px, 0px, 0px)' ||
      (Number(s.opacity) === 0 && s.pointerEvents === 'none');
  };
  const named = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() !== '' ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
    const kind = el instanceof HTMLInputElement ? '[type=' + el.type + ']' : '';
    const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 32);
    return el.tagName.toLowerCase() + kind + cls + ' "' + text + '"';
  };`;

/** `CONTROL_WORDS`, and `shown`: a target the page shows. */
const SHOWN = `${CONTROL_WORDS}
  const shown = (el) => {
    if (backing(el)) return false;
    const r = boxOf(el);
    return r.width > 0 && r.height > 0 && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  };`;

/**
 * The controls that hold their own words and pictures: a button's label, a
 * link's text, the image inside either is that one control, never a second
 * thing seen. A focusable container (`[tabindex]`) and a slider are counted,
 * but what they hold is counted on its own.
 */
const OWNERS = [
  'button',
  'a[href]',
  'summary',
  'select',
  'textarea',
  ...['button', 'link', 'menuitem', 'option', 'tab', 'checkbox', 'radio', 'switch'].map(
    (role) => `[role=${role}]`,
  ),
].join(', ');

/** What a view shows that the eye counts as one thing: every target, and every picture and player. */
const SEEN = `${TARGETS}, video, audio, canvas, img`;

/**
 * An expression run in the page: everything the view shows on its first
 * screen, the clutter the at-rest budget holds, as the UI-reduction
 * sweep's `count.js` counts it: each control (a target, a picture, a player
 * or a canvas: `C tag.class "text"`) and each text leaf (an element with
 * words of its own, not inside a control: `T …`). A disabled control is
 * still seen, so it counts. Something below the fold, or scrolled out of an
 * inner scroller's box, is not on the first screen and does not count; a
 * visually hidden one (1 px, clipped to nothing) and a backing input never
 * count. Over the `page` (a long view's whole length) the fold and the
 * scrollers' boxes do not exclude: what a visit scrolls to counts too.
 */
export const firstScreenItems = (reach: 'screen' | 'page' = 'screen'): string => `(() => {
  const SEEN = ${jsonOf(SEEN)}, OWNERS = ${jsonOf(OWNERS)}, ONLY_ON_SCREEN = ${reach === 'screen'};
  ${SHOWN}
  const vw = innerWidth, vh = innerHeight;
  const hidden = (el) => {
    const r = boxOf(el);
    return (r.width <= 1 && r.height <= 1) || /inset\\(50%/.test(getComputedStyle(el).clipPath);
  };
  // Some of its box lies on the viewport and inside every scroller's box that clips it
  // (up to a fixed layer, which no scroller below it clips).
  const onScreen = (el) => {
    const r = boxOf(el);
    let l = Math.max(r.left, 0), t = Math.max(r.top, 0), rt = Math.min(r.right, vw), b = Math.min(r.bottom, vh);
    for (let n = el; n && n !== document.body && rt > l && b > t; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (n !== el && s.display !== 'contents') {
        const c = boxOf(n);
        if (s.overflowX !== 'visible') { l = Math.max(l, c.left); rt = Math.min(rt, c.right); }
        if (s.overflowY !== 'visible') { t = Math.max(t, c.top); b = Math.min(b, c.bottom); }
      }
      if (s.position === 'fixed') break;
    }
    return rt > l && b > t;
  };
  const items = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    if (el.parentElement && el.parentElement.closest(OWNERS)) continue;
    const control = el.matches(SEEN);
    const words = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
    if (!control && !words) continue;
    if (!shown(el) || hidden(el) || (ONLY_ON_SCREEN && !onScreen(el))) continue;
    items.push((control ? 'C ' : 'T ') + named(el));
  }
  return items;
})()`;

/**
 * An expression run in the page: each shown target in `within` (a selector;
 * the whole page when none) whose usable area holds no `hit`-px square and
 * no exception keeps, as `tag.class "text" W×H □S` (the area's width and
 * height, and the side of the largest square in it), and each whose hit-slop
 * lies over a neighbour's box, as `… reaches over <the neighbour>`; none, `[]`. It scrolls
 * each target into view to reach it, and leaves the page scrolled to the top;
 * one that scrolling leaves wholly out of the window is `… out of the window`.
 * A layer (a sheet, a menu, a dialog) is measured `within` itself: what lies
 * under it is measured with it closed.
 */
export const undersizedTargets = (hit: number, within = ':root'): string => `(() => {
  const HIT = ${hit}, SPACED_MIN = ${SPACED_MIN}, STEP = ${STEP}, MARGIN = ${Math.ceil(hit / 2)};
  const TARGETS = ${jsonOf(TARGETS)}, WITHIN = ${jsonOf(within)};
  ${SHOWN}
  // A field reached by its labels: every labelable one but a slider, whose track is what moves it.
  const setOf = (el) => {
    const labels = 'labels' in el && el.labels && !(el instanceof HTMLInputElement && el.type === 'range') ? [...el.labels] : [];
    return [el, ...labels.filter(shown)];
  };
  const inSet = (set, node) => node !== null && set.some((t) => t === node || t.contains(node));
  // A link in running text: inline, with words (text no target holds) on one of its own lines.
  const inline = (el) => {
    if (el.tagName !== 'A' || getComputedStyle(el).display !== 'inline') return false;
    let block = el.parentElement;
    while (block && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
    if (!block) return false;
    const lines = [...el.getClientRects()];
    const walk = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.textContent.trim() === '' || el.contains(n) || (n.parentElement && n.parentElement.closest(TARGETS))) continue;
      range.selectNodeContents(n);
      for (const w of range.getClientRects()) {
        if (w.width === 0) continue;
        if (lines.some((l) => Math.min(l.bottom, w.bottom) - Math.max(l.top, w.top) > Math.min(l.height, w.height) / 2)) return true;
      }
    }
    return false;
  };
  const largestSquare = (grid, cols, rows) => {
    const run = new Array(cols).fill(0);
    let best = 0;
    for (let j = 0; j < rows; j += 1) {
      let prev = 0;
      for (let i = 0; i < cols; i += 1) {
        const up = run[i];
        run[i] = grid[j * cols + i] ? 1 + Math.min(up, i > 0 ? run[i - 1] : 0, prev) : 0;
        prev = up;
        if (run[i] > best) best = run[i];
      }
    }
    return best;
  };
  const targets = [...new Set([...document.querySelectorAll(WITHIN)].flatMap((root) => [root, ...root.querySelectorAll(TARGETS)]))]
    .filter((el) => el.matches(TARGETS) && shown(el));
  const px = (v) => parseFloat(v) || 0;
  const turned = (s) => s.transform !== 'none' || s.translate !== 'none' || s.rotate !== 'none' || s.scale !== 'none';
  // An ancestor's transform that is more than a move: a box under it is not where its offsets say.
  const bent = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.rotate !== 'none' || s.scale !== 'none') return true;
      if (s.transform !== 'none' && !/^matrix\\(1, 0, 0, 1, /.test(s.transform)) return true;
    }
    return false;
  };
  // A target's hit-slops: each positioned \`::before\` or \`::after\` it draws past its padding box, as its
  // rectangle in the window, worked out from the slop's resolved offsets and size (px for a positioned
  // box) from the target's padding box, its containing block; \`loose\` when that cannot be exact: the
  // target is not the slop's containing block (static, or a broken inline), or the target, the slop or
  // an ancestor (beyond a move) is transformed. A pseudo-element inside the padding box draws on the
  // target and reaches nothing.
  const slopsOf = (el) => {
    const host = getComputedStyle(el);
    const r = boxOf(el);
    const pw = r.width - px(host.borderLeftWidth) - px(host.borderRightWidth);
    const ph = r.height - px(host.borderTopWidth) - px(host.borderBottomWidth);
    const slops = [];
    for (const part of ['::before', '::after']) {
      const s = getComputedStyle(el, part);
      if (s.content === 'none' || s.content === 'normal' || s.display === 'none' || s.pointerEvents === 'none') continue;
      if (s.position !== 'absolute' && s.position !== 'fixed') continue;
      const edges = s.boxSizing === 'border-box' ? [0, 0] : [
        px(s.paddingLeft) + px(s.paddingRight) + px(s.borderLeftWidth) + px(s.borderRightWidth),
        px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth),
      ];
      const x = px(s.left) + px(s.marginLeft), y = px(s.top) + px(s.marginTop);
      const w = px(s.width) + edges[0], h = px(s.height) + edges[1];
      const anchored = s.position === 'absolute' && host.position !== 'static' &&
        (host.display !== 'inline' || el.getClientRects().length === 1);
      if (anchored && x >= 0 && y >= 0 && x + w <= pw && y + h <= ph) continue;
      if (!anchored || turned(s) || turned(host) || bent(el)) {
        slops.push('loose');
        continue;
      }
      const ox = r.left + px(host.borderLeftWidth) - el.scrollLeft, oy = r.top + px(host.borderTopWidth) - el.scrollTop;
      slops.push({ left: ox + x, top: oy + y, right: ox + x + w, bottom: oy + y + h });
    }
    return slops;
  };
  // Where a hit-slop lies over another control's box (one that neither holds nor is held by the
  // target): each whole pixel of that overlap, outside the target's own box, asked
  // \`elementFromPoint\` at its corner (the browser hit-tests a point as the pixel from it), so the
  // slop counts only where it is on top. \`loose\`: a slop that cannot be placed exactly.
  const over = (el, set) => {
    const slops = slopsOf(el);
    if (slops.includes('loose')) return 'loose';
    const b = boxOf(el);
    const mine = (node) => {
      if (node === null || !inSet(set, node)) return false;
      const owner = node.closest(TARGETS);
      return owner === null || owner === el || owner.contains(el);
    };
    return targets.filter((other) => {
      if (other === el || other.contains(el) || el.contains(other) || inSet(set, other)) return false;
      const o = boxOf(other);
      return slops.some((s) => {
        const l = Math.max(o.left, s.left), r = Math.min(o.right, s.right);
        const t = Math.max(o.top, s.top), bt = Math.min(o.bottom, s.bottom);
        for (let y = Math.floor(t); y < bt; y += 1)
          for (let x = Math.floor(l); x < r; x += 1) {
            // This pixel's share of the overlap, when all of it is in the target's own box, is no slop's.
            const inBox = Math.max(x, l) >= b.left && Math.min(x + 1, r) <= b.right &&
              Math.max(y, t) >= b.top && Math.min(y + 1, bt) <= b.bottom;
            if (!inBox && mine(document.elementFromPoint(x, y))) return true;
          }
        return false;
      });
    });
  };
  const out = [];
  for (const el of targets) {
    if (inline(el)) continue;
    const set = setOf(el);
    const lead = set.reduce((a, b) => (boxOf(b).width * boxOf(b).height > boxOf(a).width * boxOf(a).height ? b : a));
    lead.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const reached = over(el, set);
    if (reached === 'loose') out.push(named(el) + ' hit-slop is not anchored to its target');
    else for (const other of reached) out.push(named(el) + ' reaches over ' + named(other));
    const boxes = set.map(boxOf);
    const left = Math.max(0, Math.min(...boxes.map((b) => b.left)) - MARGIN);
    const top = Math.max(0, Math.min(...boxes.map((b) => b.top)) - MARGIN);
    const right = Math.min(innerWidth, Math.max(...boxes.map((b) => b.right)) + MARGIN);
    const bottom = Math.min(innerHeight, Math.max(...boxes.map((b) => b.bottom)) + MARGIN);
    // Scrolled to, a target with none of it in the window cannot be tapped.
    if (!boxes.some((b) => b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight)) {
      out.push(named(el) + ' out of the window');
      continue;
    }
    // Each point: 1 on the target, 2 on another (not one that encloses it), 0 on nothing that counts.
    const x0 = Math.floor(left) + 0.5, y0 = Math.floor(top) + 0.5;
    const cols = Math.max(0, Math.ceil((right - x0) / STEP)), rows = Math.max(0, Math.ceil((bottom - y0) / STEP));
    const grid = new Uint8Array(cols * rows), asked = new Uint8Array(cols * rows);
    const at = (i, j) => {
      const k = j * cols + i;
      if (asked[k]) return grid[k];
      asked[k] = 1;
      const node = document.elementFromPoint(x0 + i * STEP, y0 + j * STEP);
      if (node === null) return (grid[k] = 0);
      // The point's owner is the nearest control holding it: a link inside a
      // label is the link's, never the label's field's (HTML: a label's
      // activation leaves out its interactive descendants).
      const owner = node.closest(TARGETS);
      if (inSet(set, node) && (owner === null || owner === el || owner.contains(el))) return (grid[k] = 1);
      return (grid[k] = owner && !owner.contains(el) && shown(owner) ? 2 : 0);
    };
    // Most targets pass on the square in the middle of their largest box: asked first, it spares the rest.
    const n = Math.ceil(HIT / STEP), lb = boxOf(lead);
    const i0 = Math.round((lb.left + lb.width / 2 - x0) / STEP - n / 2), j0 = Math.round((lb.top + lb.height / 2 - y0) / STEP - n / 2);
    let whole = i0 >= 0 && j0 >= 0 && i0 + n <= cols && j0 + n <= rows;
    for (let j = j0; whole && j < j0 + n; j += 1) for (let i = i0; whole && i < i0 + n; i += 1) whole = at(i, j) === 1;
    if (whole) continue;
    let minI = cols, maxI = -1, minJ = rows, maxJ = -1;
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        if (at(i, j) !== 1) continue;
        minI = Math.min(minI, i); maxI = Math.max(maxI, i); minJ = Math.min(minJ, j); maxJ = Math.max(maxJ, j);
      }
    }
    const mine = Uint8Array.from(grid, (v) => (v === 1 ? 1 : 0));
    const side = largestSquare(mine, cols, rows) * STEP;
    if (side >= HIT) continue;
    if (side >= SPACED_MIN) {
      const cx = (minI + maxI) / 2, cy = (minJ + maxJ) / 2, r = HIT / 2 / STEP;
      let clear = true;
      for (let j = 0; j < rows && clear; j += 1)
        for (let i = 0; i < cols && clear; i += 1)
          if (grid[j * cols + i] === 2 && Math.hypot(i - cx, j - cy) < r) clear = false;
      if (clear) continue;
    }
    const w = maxI < 0 ? 0 : (maxI - minI + 1) * STEP, h = maxJ < 0 ? 0 : (maxJ - minJ + 1) * STEP;
    out.push(named(el) + ' ' + w + '×' + h + ' □' + side);
  }
  scrollTo(0, 0);
  return out;
})()`;

/** A target's attributes that do not name it: its hydration key, and those its state changes. */
const UNNAMING = [
  '_hk',
  'class',
  'style',
  'tabindex',
  'disabled',
  'value',
  'aria-pressed',
  'aria-selected',
  'aria-expanded',
  'aria-checked',
  'aria-current',
  'aria-disabled',
  'data-active',
  'data-state',
  'data-checked',
  'data-pressed',
  'data-selected',
  'data-disabled',
  'data-highlighted',
  'data-popup-open',
];

/** How `targetBoxes` writes a box (`box`, its four numbers), by its unit. */
const BOX_AS = { whole: "box.map(Math.round).join(',')", exact: 'box' } as const;

/**
 * An expression run in the page: each shown target (the elements and roles
 * `undersizedTargets` measures) and its box on the page, `left,top,width,height`
 * from the page's top-left, keyed by what names it (its tag and its
 * attributes but `UNNAMING`, a link's `href` without its hash: the page
 * bar's tabs carry the playhead's `#t=` once the film is staged) and its
 * place among the targets named the same: `{ key: box }`. `whole` (the
 * default): each box a string of whole CSS pixels, compared as it is;
 * `exact`: each box the four numbers as the layout has them, so a check
 * that allows a sub-pixel difference measures it before any rounding.
 */
export const targetBoxes = (unit: keyof typeof BOX_AS = 'whole'): string => `(() => {
  const TARGETS = ${jsonOf(TARGETS)}, UNNAMING = ${jsonOf(UNNAMING)};
  const counted = new Map();
  const boxes = {};
  for (const el of document.querySelectorAll(TARGETS)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const named = [el.tagName.toLowerCase(), ...[...el.attributes].filter((a) => !UNNAMING.includes(a.name)).map((a) => a.name + '=' + (a.name === 'href' ? a.value.split('#')[0] : a.value)).sort()].join(' ');
    const n = (counted.get(named) ?? 0) + 1;
    counted.set(named, n);
    const box = [r.left + scrollX, r.top + scrollY, r.width, r.height];
    boxes[named + ' #' + n] = ${BOX_AS[unit]};
  }
  return boxes;
})()`;
