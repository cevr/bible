// Whether a page fits a phone (G8, the design language's Mobile-first): it
// never scrolls sideways, each of its controls (`[data-act]`) shows inside
// the window's width, and its chrome (the bars that stay while the page
// scrolls: a sticky header, a dock, the tab bar) holds at most a quarter of
// the window's height. One script, so every page is asked the same way.
//
// A control counts where it shows: its box clipped by each ancestor that
// clips (a strip that scrolls sideways shows a part of its row; what it
// scrolled away is reached by scrolling it, not cut off), and nothing when
// that leaves nothing. The chrome is measured where it holds most: at the
// page's top, its middle and its end, each the union of the rows its fixed
// and stuck (sticky, with an edge set, to the window rather than to a box
// that scrolls on its own) elements cover in the window; a see-through frame
// (a sheet's viewport over the whole window, taking no pointer) is what it
// holds, so a sheet lowered to its peek counts as the peek. A layer the page
// has open (a scene's sheet, as an inspector is), with the frame that holds
// it in the window, is no chrome: it is shut to go back to the page. Its
// width and its controls are measured as the page's are.

import { jsonOf } from './tab.ts';
import type { Tab } from './tab.ts';

/** The most of the window's height a page's chrome may hold. */
const CHROME_MAX = 0.25;

/**
 * A script answering how the page fits: `sideways`, the page's width past
 * the window's in px (0 when it never scrolls sideways); `outside`, the
 * controls shown past the window's sides, each as its `data-act` and its
 * box's sides; `chrome`, the chrome's largest share of the window's height,
 * 0 to 1; `bars`, the chrome's bars where it holds most, each as its class
 * and its rows. It scrolls the page to measure its chrome, and back to where
 * it was. `layer` (a selector) is the open layer, left out of the chrome.
 */
export const phoneFit = (layer?: string) => `(() => {
  const root = document.documentElement;
  const LAYER = ${jsonOf(layer ?? '')};
  const clipping = (el) => {
    const s = getComputedStyle(el);
    return s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.contain.includes('paint');
  };
  const shown = (el) => {
    if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: false })) return null;
    const r = el.getBoundingClientRect();
    let box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    for (let a = el.parentElement; a && a !== document.body && a !== root; a = a.parentElement) {
      if (!clipping(a)) continue;
      const c = a.getBoundingClientRect();
      box = {
        left: Math.max(box.left, c.left),
        right: Math.min(box.right, c.right),
        top: Math.max(box.top, c.top),
        bottom: Math.min(box.bottom, c.bottom),
      };
    }
    return box.right - box.left > 0.5 && box.bottom - box.top > 0.5 ? box : null;
  };
  const outside = [...document.querySelectorAll('[data-act]')].flatMap((el) => {
    const b = shown(el);
    if (b === null || (b.left >= -0.5 && b.right <= innerWidth + 0.5)) return [];
    return [el.dataset.act + ' ' + Math.round(b.left) + '..' + Math.round(b.right)];
  });
  // Sticky inside a box that scrolls on its own (a strip's words) stays in that box, not the window.
  const inScroller = (el) => {
    for (let a = el.parentElement; a && a !== document.body && a !== root; a = a.parentElement)
      if (clipping(a)) return true;
    return false;
  };
  const stays = (el) => {
    const s = getComputedStyle(el);
    if (s.position === 'fixed') return true;
    return s.position === 'sticky' && (s.top !== 'auto' || s.bottom !== 'auto') && !inScroller(el);
  };
  // A frame that holds pieces in the window (a sheet's viewport) draws nothing and takes no
  // pointer: its bar is what it holds (a sheet lowered to a peek holds the peek's rows), not itself.
  const frame = (el) => {
    const s = getComputedStyle(el);
    return s.pointerEvents === 'none' && s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.borderTopStyle === 'none' && s.boxShadow === 'none';
  };
  const barsNow = () => {
    const rows = [];
    const row = (el) => {
      const r = el.getBoundingClientRect();
      const top = Math.max(0, r.top);
      const bottom = Math.min(innerHeight, r.bottom);
      // A visually hidden field (1 × 1, fixed so it never moves the page) is no bar.
      if (bottom - top > 2 && r.width > 2) rows.push({ name: el.className || el.tagName, top, bottom });
    };
    for (const el of document.body.querySelectorAll('*')) {
      // The open layer, and the frame that holds it in the window (a sheet's viewport), are no bar.
      const layered = LAYER !== '' && (el.closest(LAYER) !== null || el.querySelector(LAYER) !== null);
      if (!stays(el) || !el.checkVisibility() || layered) continue;
      // What stays on its own is a bar of its own.
      if (frame(el)) for (const held of el.children) if (!stays(held) && held.checkVisibility()) row(held);
      if (!frame(el)) row(el);
    }
    rows.sort((a, b) => a.top - b.top);
    let held = 0;
    let reach = 0;
    for (const row of rows) {
      const from = Math.max(row.top, reach);
      if (row.bottom > from) held += row.bottom - from;
      reach = Math.max(reach, row.bottom);
    }
    return { share: held / innerHeight, rows };
  };
  const was = scrollY;
  const end = Math.max(0, root.scrollHeight - innerHeight);
  let most = { share: 0, rows: [] };
  for (const y of [0, end / 2, end]) {
    scrollTo({ top: y, behavior: 'instant' });
    const now = barsNow();
    if (now.share > most.share) most = now;
  }
  scrollTo({ top: was, behavior: 'instant' });
  return {
    sideways: Math.max(0, root.scrollWidth - innerWidth),
    outside,
    chrome: most.share,
    bars: most.rows.map((r) => r.name + ' ' + Math.round(r.top) + '..' + Math.round(r.bottom)),
  };
})()`;

/**
 * A script answering whether the page fits its window: no sideways scroll,
 * every control inside the width, chrome at most `CHROME_MAX`; `layer`, the
 * open layer, is no chrome.
 */
export const fits = (layer?: string) =>
  `(() => { const f = ${phoneFit(layer)}; return f.sideways === 0 && f.outside.length === 0 && f.chrome <= ${CHROME_MAX}; })()`;

/**
 * Wait until the page fits its window (a phone's: 390 × 844), by `fits`;
 * `layer`, the layer it has open, is no chrome. A timeout fails with what the
 * page answers then (`phoneFit`), so the bar or the control over is named.
 */
export const fitsPhone = (page: Tab, layer?: string) =>
  page.until(fits(layer), {
    now: phoneFit(layer),
    say: (found) => `the page does not fit the window (chrome at most ${CHROME_MAX}): ${found}`,
  });

/**
 * A script naming each box at or inside `selector` that holds more than its
 * width shows and scrolls sideways to reach it (`fitsPhone` reads the page's
 * own scroll, which a box that scrolls on its own hides): a code view's inner
 * scroller, not a strip that scrolls on purpose. Empty when none does.
 */
export const sidewaysBoxes = (selector: string) => `(() => {
  const roots = [...document.querySelectorAll(${jsonOf(selector)})];
  const boxes = roots.flatMap((r) => [r, ...r.querySelectorAll('*')]);
  return boxes
    .filter((el) => {
      const s = getComputedStyle(el);
      const reaches = s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden';
      return reaches && el.checkVisibility() && el.scrollWidth > el.clientWidth + 1;
    })
    .map((el) => el.className + ' ' + el.scrollWidth + '>' + el.clientWidth);
})()`;

/** Wait until nothing at or inside `selector` holds more than its width shows. */
export const noSidewaysBox = (page: Tab, selector: string) =>
  page.until(`${sidewaysBoxes(selector)}.length === 0`, {
    now: sidewaysBoxes(selector),
    say: (found) => `a box scrolls sideways inside ${selector}: ${found}`,
  });
