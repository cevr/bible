// The lab's browser tests read the page only through these: each waits until
// the page shows what the test expects, so a value the page is still drawing
// (a status line mid-update, a list read again after a write) is never taken
// as its answer. A read that times out fails naming what it wanted and what the
// page last showed. `film/no-read-once` refuses a one-shot read (an asserted
// `evaluate`) in a `*.dom.test.ts`.

import { Predicate, Schema } from 'effect';
import type { Tab } from './tab.ts';

/** What is read at a selector: its text, its field's value, an attribute, or how many match. */
type Read =
  | { readonly _tag: 'Text' }
  | { readonly _tag: 'Value' }
  | { readonly _tag: 'Attribute'; readonly name: string }
  | { readonly _tag: 'Count' };

/**
 * What the read must be: the first match equal to a value or matching a
 * pattern, some match containing a part, or every match, in order, a list.
 */
type Want =
  | { readonly _tag: 'Is'; readonly value: string | number }
  | { readonly _tag: 'Matches'; readonly source: string; readonly flags: string }
  | { readonly _tag: 'Has'; readonly value: string }
  | { readonly _tag: 'List'; readonly values: ReadonlyArray<string> };

interface Probe {
  readonly selector: string;
  readonly read: Read;
  readonly want: Want;
}

/**
 * The page's side, as source the page runs with a probe `p` written in: what
 * the probe reads now (`now`), and whether it is what it wants (`settled`).
 */
const LOOK = `((p) => {
  const els = Array.from(document.querySelectorAll(p.selector));
  const one = (el) =>
    p.read._tag === 'Text' ? el.textContent ?? ''
    : p.read._tag === 'Value' ? el.value
    : el.getAttribute(p.read.name);
  if (p.read._tag === 'Count') return { now: els.length, settled: els.length === p.want.value };
  const all = els.map(one);
  const first = all.length > 0 ? all[0] : null;
  switch (p.want._tag) {
    case 'Is': return { now: first, settled: first === p.want.value };
    case 'Matches': return { now: first, settled: first !== null && new RegExp(p.want.source, p.want.flags).test(first) };
    case 'Has': return { now: all, settled: all.some((t) => (t ?? '').includes(p.want.value)) };
    case 'List': return { now: all, settled: JSON.stringify(all) === JSON.stringify(p.want.values) };
  }
})`;

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const lookIn = (probe: Probe, field: 'now' | 'settled') => `${LOOK}(${json(probe)}).${field}`;

/**
 * Wait until `settled`, run in the page, is true; a timeout fails with `failure`
 * of what `now`, run in the page, answers then, written as JSON.
 */
const waitOr = (
  page: Tab,
  check: { readonly settled: string; readonly now: string },
  failure: (now: string) => string,
) => page.until(check.settled, { now: check.now, say: failure });

/** Wait until the page shows what `probe` wants; a timeout fails naming what it last showed. */
const settle = (page: Tab, probe: Probe) =>
  waitOr(
    page,
    { settled: lookIn(probe, 'settled'), now: lookIn(probe, 'now') },
    (now) => `${probe.selector} never settled: wanted ${json(probe.want)}, last read ${now}`,
  );

const TEXT: Read = { _tag: 'Text' };

const wantOf = (want: string | RegExp): Want => {
  if (Predicate.isString(want)) return { _tag: 'Is', value: want };
  return { _tag: 'Matches', source: want.source, flags: want.flags };
};

/** Wait until the first element at `selector` reads exactly `want`, or matches it. */
export const textIs = (page: Tab, selector: string, want: string | RegExp) =>
  settle(page, { selector, read: TEXT, want: wantOf(want) });

/** Wait until some element at `selector` has text containing `part`. */
export const textHas = (page: Tab, selector: string, part: string) =>
  settle(page, { selector, read: TEXT, want: { _tag: 'Has', value: part } });

/** Wait until the elements at `selector`, in order, have text `want`. */
export const textsAre = (page: Tab, selector: string, want: ReadonlyArray<string>) =>
  settle(page, { selector, read: TEXT, want: { _tag: 'List', values: want } });

/** Wait until the elements at `selector`, in order, have attribute `name` equal to `want`. */
export const attributesAre = (
  page: Tab,
  selector: string,
  name: string,
  want: ReadonlyArray<string>,
) =>
  settle(page, {
    selector,
    read: { _tag: 'Attribute', name },
    want: { _tag: 'List', values: want },
  });

/** Wait until the first element at `selector` has attribute `name` equal to `want`, or matching it. */
export const attributeIs = (page: Tab, selector: string, name: string, want: string | RegExp) =>
  settle(page, { selector, read: { _tag: 'Attribute', name }, want: wantOf(want) });

/** Wait until the field at `selector` holds `want`. */
export const valueIs = (page: Tab, selector: string, want: string) =>
  settle(page, { selector, read: { _tag: 'Value' }, want: { _tag: 'Is', value: want } });

/** Wait until `n` elements match `selector`. */
export const countIs = (page: Tab, selector: string, n: number) =>
  settle(page, { selector, read: { _tag: 'Count' }, want: { _tag: 'Is', value: n } });

/** Wait until `selector` is in the page and shown. */
export const waitFor = (page: Tab, selector: string) => page.waitFor(selector);

/** Wait until `selector` is in the page, shown or not (a hidden composer, a folded row). */
export const attached = (page: Tab, selector: string) => page.attached(selector);

/** What a script run in the page can be waited on to answer. */
type Answer = boolean | number | string | ReadonlyArray<boolean | number | string>;

/**
 * Wait until `script`, an expression run in the page, answers `want`, compared
 * as JSON (a flag, a number, a string, a list); a timeout fails naming what it
 * last answered.
 */
export const evaluates = (page: Tab, script: string, want: Answer) =>
  waitOr(
    page,
    { settled: `JSON.stringify(${script}) === ${json(json(want))}`, now: script },
    (now) => `${script} never answered ${json(want)}: last answered ${now}`,
  );

/** Wait until `check`, run in the page, is true. */
export const until = (page: Tab, check: string) => page.until(check);

/**
 * An expression run in the page: every way the shown `labels` (each the
 * element holding a label's text) fail to read, as `text: why`; none, `[]`.
 * A label stays inside its room (its closest `room`, or itself): the span of
 * time it names. One whose text does not fit is shortened with an ellipsis,
 * keeping a letter and the ellipsis at least, or dropped; never cut mid-letter.
 * And no two shown labels overlap.
 */
export const labelsClash = (labels: string, room: string) =>
  `(() => {
    const out = [];
    const shown = [...document.querySelectorAll('${labels}')].filter((e) => {
      const s = getComputedStyle(e);
      return s.display !== 'none' && s.visibility !== 'hidden' && e.textContent.trim() !== '' && e.getBoundingClientRect().width > 0;
    });
    const boxes = shown.map((e) => {
      const r = e.getBoundingClientRect();
      const own = (e.closest('${room}') || e).getBoundingClientRect();
      const text = e.textContent.trim();
      if (r.left < own.left - 0.5 || r.right > own.right + 0.5) out.push(text + ': leaves its room');
      if (e.scrollWidth > e.clientWidth + 0.5) {
        const glyph = document.createRange();
        glyph.setStart(e.firstChild, 0);
        glyph.setEnd(e.firstChild, 1);
        if (getComputedStyle(e).textOverflow !== 'ellipsis') out.push(text + ': cut mid-letter');
        else if (e.clientWidth < 2 * glyph.getBoundingClientRect().width - 0.5) out.push(text + ': no letter left');
      }
      return { text, r };
    });
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => {
      if (a.r.left < b.r.right - 0.5 && b.r.left < a.r.right - 0.5 && a.r.top < b.r.bottom - 0.5 && b.r.top < a.r.bottom - 0.5)
        out.push(a.text + ': overlaps ' + b.text);
    }));
    return out;
  })()`;

/**
 * An expression run in the page: how many of the shown `labels` (as
 * `labelsClash` reads them) read their whole text, neither shortened nor
 * dropped. `labelsClash` passes a row with every label hidden; this says
 * the row was not emptied to pass.
 */
export const labelsInFull = (labels: string) =>
  `[...document.querySelectorAll('${labels}')].filter((e) => {
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden' && e.textContent.trim() !== '' && e.getBoundingClientRect().width > 0 && e.scrollWidth <= e.clientWidth + 0.5;
  }).length`;
