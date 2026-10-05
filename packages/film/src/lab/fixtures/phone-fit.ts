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
// that scrolls on its own) elements cover in the window.

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
 * it was.
 */
const PHONE_FIT = `(() => {
  const root = document.documentElement;
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
  const barsNow = () => {
    const rows = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (!stays(el) || !el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      const top = Math.max(0, r.top);
      const bottom = Math.min(innerHeight, r.bottom);
      // A visually hidden field (1 × 1, fixed so it never moves the page) is no bar.
      if (bottom - top > 2 && r.width > 2) rows.push({ name: el.className || el.tagName, top, bottom });
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
 * Wait until the page fits its window (a phone's: 390 × 844): no sideways
 * scroll, every control inside the width, chrome at most `CHROME_MAX`. A
 * timeout fails with what the page answers then (`PHONE_FIT`), so the bar or
 * the control over is named.
 */
export const fitsPhone = (page: Tab) =>
  page.until(
    `(() => { const f = ${PHONE_FIT}; return f.sideways === 0 && f.outside.length === 0 && f.chrome <= ${CHROME_MAX}; })()`,
    {
      now: PHONE_FIT,
      say: (found) => `the page does not fit the window (chrome at most ${CHROME_MAX}): ${found}`,
    },
  );
