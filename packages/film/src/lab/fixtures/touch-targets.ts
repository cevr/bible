// What a finger reaches on a page: every shown interactive element whose hit
// area is under the phone's touch target (`--hit`, 44 px; the design
// language's "every touch target on the phone ≥ 44 px through padding").
// The hit area is measured as a tap meets it, not as the element's box: from
// the middle of the target outward, a pixel at a time, while
// `document.elementFromPoint` still lands on it, so padding and a
// pseudo-element hit-slop (`::before` past the box) both count, and a target
// covered by another counts as what shows of it. A visually hidden field
// (a 1 px checkbox) is reached through its labels, which are then its target.
//
// Not a target at all: an element out of both the accessibility tree and the
// tab order (`aria-hidden` and `tabindex="-1"`), such as the hidden form
// input a number field keeps beside its visible one; the visible one is
// measured.
//
// Exceptions are by principle, never by page:
// - Inline (WCAG 2.5.8): a link inside a sentence, its size set by the line
//   of text it sits in.
// - Spacing (WCAG 2.5.8's, at the phone's 44 px): a target at least 24 px
//   each way whose 44 px circle, on its middle, touches no other target, so
//   a finger aimed at it cannot land on a neighbour.

import { jsonOf } from './tab.ts';

/** The phone's touch target, in CSS pixels (`--hit` under a coarse pointer). */
export const HIT = 44;

/** The smallest target the spacing exception keeps (WCAG 2.5.8's 24 px). */
const SPACED_MIN = 24;

/** What a finger can operate: the elements a page's touch targets are. */
const TARGETS =
  'button, a[href], [role=button], summary, input:not([type=hidden]), select, [tabindex]:not([tabindex="-1"])';

/**
 * An expression run in the page: each shown target whose hit area is under
 * `HIT` either way and no exception keeps, as `tag.class "text" W×H` (the
 * hit area's width and height through its middle); none, `[]`. It scrolls
 * each target into view to reach it, and leaves the page scrolled to the top.
 */
export const undersizedTargets = `(() => {
  const HIT = ${HIT}, SPACED_MIN = ${SPACED_MIN}, SCAN = ${HIT + 20};
  const els = [...document.querySelectorAll(${jsonOf(TARGETS)})];
  const boxOf = (el) => el.getBoundingClientRect();
  const shown = (el) => {
    if (el.tabIndex < 0 && el.closest('[aria-hidden="true"]')) return false;
    const r = boxOf(el);
    return r.width > 0 && r.height > 0 && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  };
  // A field reached by its labels: every labelable one but a slider, whose track is what moves it.
  const setOf = (el) => {
    const labels = 'labels' in el && el.labels && !(el instanceof HTMLInputElement && el.type === 'range') ? [...el.labels] : [];
    return [el, ...labels.filter(shown)];
  };
  const area = (r) => r.width * r.height;
  const inSet = (set, hit) => hit !== null && set.some((t) => t === hit || t.contains(hit));
  const reach = (set, x, y, dx, dy) => {
    let n = 0;
    while (n < SCAN && inSet(set, document.elementFromPoint(x + dx * (n + 1), y + dy * (n + 1)))) n += 1;
    return n;
  };
  // A link in running text: inline, on a line of its block that has words of its own (text, or inline text that is no target).
  const inline = (el) => {
    if (el.tagName !== 'A' || getComputedStyle(el).display !== 'inline') return false;
    let block = el.parentElement;
    while (block && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement;
    if (!block) return false;
    const words = (n) =>
      n.nodeType === 3 ? n.textContent
      : n.nodeType !== 1 || n.matches(${jsonOf(TARGETS)}) || !getComputedStyle(n).display.startsWith('inline') ? ''
      : [...n.childNodes].map(words).join('');
    return [...block.childNodes].map(words).join('').trim().length > 0;
  };
  const touches = (cx, cy, r) => {
    const nx = Math.max(r.left, Math.min(cx, r.right)), ny = Math.max(r.top, Math.min(cy, r.bottom));
    return Math.hypot(nx - cx, ny - cy) < HIT / 2;
  };
  const named = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() !== '' ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
    const kind = el instanceof HTMLInputElement ? '[type=' + el.type + ']' : '';
    const text = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 32);
    return el.tagName.toLowerCase() + kind + cls + ' "' + text + '"';
  };
  const targets = els.filter(shown);
  const out = [];
  for (const el of targets) {
    if (inline(el)) continue;
    const set = setOf(el);
    const lead = set.reduce((a, b) => (area(boxOf(b)) > area(boxOf(a)) ? b : a));
    lead.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = boxOf(lead);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
    const at = inSet(set, document.elementFromPoint(cx, cy));
    const w = at ? 1 + reach(set, cx, cy, -1, 0) + reach(set, cx, cy, 1, 0) : 0;
    const h = at ? 1 + reach(set, cx, cy, 0, -1) + reach(set, cx, cy, 0, 1) : 0;
    if (w >= HIT && h >= HIT) continue;
    const spaced = w >= SPACED_MIN && h >= SPACED_MIN &&
      targets.every((other) => set.includes(other) || other.contains(el) || el.contains(other) || !shown(other) || !touches(cx, cy, boxOf(other)));
    if (spaced) continue;
    out.push(named(el) + ' ' + w + '×' + h);
  }
  scrollTo(0, 0);
  return out;
})()`;
