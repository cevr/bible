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
// measured. Anything shown that a pointer can land on is measured.
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

/** What a finger can operate: the elements, and the roles, a page's touch targets are. */
const TARGETS = [
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
 * An expression run in the page: each shown target in `within` (a selector;
 * the whole page when none) whose usable area holds no `hit`-px square and
 * no exception keeps, as `tag.class "text" W×H □S` (the area's width and
 * height, and the side of the largest square in it); none, `[]`. It scrolls
 * each target into view to reach it, and leaves the page scrolled to the top.
 * A layer (a sheet, a menu, a dialog) is measured `within` itself: what lies
 * under it is measured with it closed.
 */
export const undersizedTargets = (hit: number, within = ':root'): string => `(() => {
  const HIT = ${hit}, SPACED_MIN = ${SPACED_MIN}, STEP = ${STEP}, MARGIN = ${Math.ceil(hit / 2)};
  const TARGETS = ${jsonOf(TARGETS)}, WITHIN = ${jsonOf(within)};
  const boxOf = (el) => el.getBoundingClientRect();
  // A backing input: out of the tree and the tab order, and nothing of it to see or press.
  const backing = (el) => {
    if (!(el.tabIndex < 0 && el.closest('[aria-hidden="true"]'))) return false;
    const r = boxOf(el), s = getComputedStyle(el);
    return (r.width <= 1 && r.height <= 1) || /inset\\(50%/.test(s.clipPath) || s.clip === 'rect(0px, 0px, 0px, 0px)' ||
      (Number(s.opacity) === 0 && s.pointerEvents === 'none');
  };
  const shown = (el) => {
    if (backing(el)) return false;
    const r = boxOf(el);
    return r.width > 0 && r.height > 0 && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  };
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
  const named = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() !== '' ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
    const kind = el instanceof HTMLInputElement ? '[type=' + el.type + ']' : '';
    const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 32);
    return el.tagName.toLowerCase() + kind + cls + ' "' + text + '"';
  };
  const targets = [...new Set([...document.querySelectorAll(WITHIN)].flatMap((root) => [root, ...root.querySelectorAll(TARGETS)]))]
    .filter((el) => el.matches(TARGETS) && shown(el));
  const out = [];
  for (const el of targets) {
    if (inline(el)) continue;
    const set = setOf(el);
    const lead = set.reduce((a, b) => (boxOf(b).width * boxOf(b).height > boxOf(a).width * boxOf(a).height ? b : a));
    lead.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const boxes = set.map(boxOf);
    const left = Math.max(0, Math.min(...boxes.map((b) => b.left)) - MARGIN);
    const top = Math.max(0, Math.min(...boxes.map((b) => b.top)) - MARGIN);
    const right = Math.min(innerWidth, Math.max(...boxes.map((b) => b.right)) + MARGIN);
    const bottom = Math.min(innerHeight, Math.max(...boxes.map((b) => b.bottom)) + MARGIN);
    if (right <= left || bottom <= top) continue;
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
