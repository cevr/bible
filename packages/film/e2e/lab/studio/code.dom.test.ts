// The studio's code view over the probe film, on a laptop (1440 × 900) and a
// phone (390 × 844): the inspector's Code section shows scene one's file lit
// by the playhead while it is in the beat (the playing cue's literal and the
// read that fires, a meter under its line, the band naming it), unlit once it
// leaves, and unlit on a version kept in its own folder; a tap on a line puts
// the playhead where the line next plays, and selects nothing. The Script
// pane: closed at rest, S opens it on the beat at the playhead, Play lights a
// line and the view follows it, a scrub lights the frame's lines, a tap on a
// line seeks, a selection's inspector covers it and Escape shows it again,
// Escape and S close it, `?pane=script` holds it through Back, and on a
// phone a tap on the reading block's head opens it. Every wait is on what
// the page shows, never on time.

import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import {
  DESK,
  PHONE,
  type Viewport,
  json,
  openPlayer,
  route,
} from '../../../src/lab/fixtures/harness.ts';
import { PROBE, probeFilm } from '../../../src/lab/fixtures/probe-film.ts';
import { probeTimeline } from '../../../src/lab/fixtures/probe-timeline.ts';
import type { Tab } from '../../../src/lab/fixtures/tab.ts';
import {
  attributeIs,
  countIs,
  evaluates,
  textIs,
  until,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;

const SIZES = [
  { name: 'a laptop', viewport: DESK },
  { name: 'a phone', viewport: PHONE },
] as const;

/** Scene one's file as the lab reads it: each cue's literal on a line of its own, read by the draw. */
const TEXT = [
  "import { drawing } from './drawing.ts';",
  '',
  'export const ball = drawing({',
  '  timeline: {',
  "    rise: { mark: 'rise', dur: 0.6 },",
  "    fall: { mark: 'fall', dur: 0.4 },",
  '  },',
  '  draw: (f) => {',
  "    const lift = f.at('rise');",
  // Lines between the two reads, so the view scrolls to follow the second.
  ...Array.from({ length: 40 }, (_, n) => `    // the draw's line ${n + 1}`),
  "    const drop = f.at('fall');",
  '    f.ctx.arc(320, 100 - 80 * lift + 80 * drop, 24, 0, 7);',
  "    f.mark('rise'); f.mark('fall');",
  '  },',
  '});',
  '',
].join('\n');

/** The range of the first `needle` in `TEXT`. */
const range = (needle: string): readonly [number, number] => {
  const from = TEXT.indexOf(needle);
  return [from, from + needle.length];
};

/** The line (from 1) of `TEXT` that writes `needle`. */
const lineOf = (needle: string) => TEXT.slice(0, TEXT.indexOf(needle)).split('\n').length;

const CODE = {
  scene: 'one',
  file: 'scenes/one.ts',
  text: TEXT,
  cues: [
    { name: 'rise', at: range("rise: { mark: 'rise', dur: 0.6 }"), reads: [range("f.at('rise')")] },
    { name: 'fall', at: range("fall: { mark: 'fall', dur: 0.4 }"), reads: [range("f.at('fall')")] },
  ],
  knobs: [],
  marks: [
    { name: 'rise', reads: [range("f.mark('rise')")], speaks: [] },
    { name: 'fall', reads: [range("f.mark('fall')")], speaks: [] },
  ],
  refused: [],
};

const RISE_LINE = lineOf("rise: { mark: 'rise'");
const RISE_READ_LINE = lineOf("f.at('rise')");
const FALL_READ_LINE = lineOf("f.at('fall')");
/** A line that plays twice: on the word each mark is said on. */
const MARKS_LINE = lineOf("f.mark('rise')");

/** Scene one's cues in film seconds, where the probe film plays them. */
const film = probeFilm();
const one = film.placed[0];
const two = film.placed[1];
const span = (name: string) => {
  const cue = one?.cues.get(name);
  const start = one?.start ?? 0;
  return { start: start + (cue?.start ?? 0), end: start + (cue?.end ?? 0) };
};
const middle = (name: string) => (span(name).start + span(name).end) / 2;
/** Where scene one's voice says mark `name`, in film seconds. */
const said = (name: string) =>
  (one?.start ?? 0) + (one?.speechStart ?? 0) + (one?.voice.marks.get(name) ?? 0);
/** Half a frame into `s`: where a tap seeks for what starts at `s`, so the frame landed on plays it. */
const into = (s: number) => s + 0.5 / film.fps;

/** The film seconds in `#t=`. */
const HASH_T = `Number(new URLSearchParams(location.hash.slice(1)).get('t'))`;

/** What the code view paints as playing: the highlight's ranges, read back as the text they cover. */
const PAINTED = `[...(CSS.highlights.get('code-live') ?? [])].map((r) => r.toString()).sort()`;

/** The inspector's Code section. */
const CODE_SECTION = '.st-pane .st-sec[data-section="Code"]';

/** The number of the marks' line, in the Code section: a button. */
const MARKS_NUMBER = `${CODE_SECTION} .st-code-line[data-line="${MARKS_LINE}"] .st-code-n`;

/** The text of rise's read, in the Code section. */
const RISE_TEXT = `${CODE_SECTION} .st-code-line[data-line="${RISE_READ_LINE}"] .st-code-t`;

/** The Script pane. */
const PANE = '.st-script';

/** The address's `?pane=`: `closed` when it has none. */
const PANE_Q = `new URLSearchParams(location.search).get('pane') ?? 'closed'`;

const PLAY = '.st-key[data-act="play.toggle"]';

/** Whether the transport's timecode text stands inside its box (within a pixel's rounding), none of it under the keys beside it. */
const TC_FITS = `(() => {
  const tc = document.querySelector('.st-tc');
  const text = document.createRange();
  text.selectNodeContents(tc);
  return text.getBoundingClientRect().right <= tc.getBoundingClientRect().right + 1;
})()`;

/** Whether line `n` of the pane's code stands whole in its box, and the box is scrolled `scrolled` (down from its top, or not). */
const inView = (n: number, scrolled: boolean) => `(() => {
  const box = document.querySelector('${PANE} .st-code-scroll');
  const row = box?.querySelector('[data-line="${n}"]');
  if (!box || !row) return false;
  const b = box.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  return r.top >= b.top && r.bottom <= b.bottom && (box.scrollTop > 0) === ${scrolled};
})()`;

/**
 * The probe's v1, kept in its own folder, with the open version's scenes lane:
 * a past version whose beats have scenes, which no staged film draws.
 */
const FOLDER_WITH_SCENES = {
  ...probeTimeline(1),
  lanes: [
    ...probeTimeline(1).lanes,
    ...probeTimeline(2).lanes.filter((lane) => lane.track === 'scenes'),
  ],
};

/** Scene one's file read at its route. */
const ROUTES = [route('GET', /^\/scenes\/one\/code$/, () => json(CODE))];

/** The studio at `T` with nothing selected, the Script pane open or not, its timeline drawn. */
const studioAt = (viewport: Viewport, T: number, pane: 'closed' | 'script' = 'closed') =>
  openPlayer(
    { href: pageHref.studio(PROBE, { pane }, Option.some(T)), viewport },
    '.st-timeline .st-clip',
    ROUTES,
  );

/** Script clip `beat`. */
const clip = (beat: string) => `.st-lane[data-track="script"] .st-clip[data-beat="${beat}"]`;

/** Press on the ruler at film second `from`, drag to `to` and let go: a scrub. */
const scrub = (page: Tab, from: number, to: number) =>
  Effect.gen(function* () {
    const ruler = yield* page.box('.st-ruler');
    const x = (T: number) => ruler.x + (ruler.width * T) / film.duration;
    const y = ruler.y + ruler.height / 2;
    yield* page.mouse.move(x(from), y);
    yield* page.mouse.down;
    yield* page.mouse.move((x(from) + x(to)) / 2, y);
    yield* page.mouse.move(x(to), y);
    yield* page.mouse.up;
  });

/** Select the whole text of `selector` on the page, as a drag over it would. */
const selects = (page: Tab, selector: string) =>
  evaluates(
    page,
    `(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('${selector}'));
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.isCollapsed;
    })()`,
    false,
  );

/**
 * Keep each time the transport's timecode shows from now on, in `window.__times`: every seek redraws it, where
 * the address's `#t` keeps only the last of seeks close together.
 */
const HEAR_TIMES = `(() => {
  const tc = document.querySelector('.st-tc');
  window.__times = [];
  new MutationObserver(() => window.__times.push(tc.textContent)).observe(tc, {
    subtree: true,
    childList: true,
    characterData: true,
  });
})()`;

/** Whether every time the timecode showed since `HEAR_TIMES` is the one it shows now. */
const ONE_TIME = `window.__times.length > 0 && window.__times.every((t) => t === document.querySelector('.st-tc').textContent)`;

/**
 * Whether the text of `selector`, scrolled into sight, stands still: where it stands (its left and right edges and
 * its middle's height, kept in `window.__span`) is where it stood at the last ask, and the page's hit there is it.
 */
const textStands = (selector: string) => `(() => {
  const text = document.querySelector('${selector}');
  text.scrollIntoView({ block: 'center', behavior: 'instant' });
  const range = document.createRange();
  range.selectNodeContents(text);
  const r = range.getBoundingClientRect();
  const span = { x0: r.left, x1: r.right, y: r.top + r.height / 2 };
  const was = window.__span;
  window.__span = span;
  return (
    was !== undefined &&
    JSON.stringify(was) === JSON.stringify(span) &&
    text.contains(document.elementFromPoint((span.x0 + span.x1) / 2, span.y))
  );
})()`;

/** The studio at `T` with beat one selected and its Code section open, its code read. */
const codeAt = (viewport: Viewport, T: number, v = 0) =>
  Effect.gen(function* () {
    const open = yield* openPlayer(
      { href: pageHref.studio(PROBE, { v, sel: 'beat:one' }, Option.some(T)), viewport },
      '.st-timeline .st-clip',
      [...ROUTES, route('GET', /^\/timeline\?v=1(&|$)/, () => json(FOLDER_WITH_SCENES))],
    );
    yield* open.page.click(`${CODE_SECTION} > summary`);
    yield* waitFor(open.page, `${CODE_SECTION}[open] .st-code-line[data-line="${RISE_LINE}"]`);
    return open;
  });

for (const size of SIZES)
  describe(`the studio's code view on ${size.name}`, () => {
    it.live(
      'lights the cue playing and its read, names it in the band, and meters its line',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* codeAt(size.viewport, middle('rise'));
          yield* attributeIs(page, `${CODE_SECTION} .st-code`, 'data-lit', 'true');
          yield* textIs(page, `${CODE_SECTION} .st-code-live`, 'rise');
          yield* evaluates(page, PAINTED, ["f.at('rise')", "rise: { mark: 'rise', dur: 0.6 }"]);
          yield* attributeIs(
            page,
            `${CODE_SECTION} .st-code-line[data-line="${RISE_LINE}"] .st-code-meter`,
            'data-cue',
            'rise',
          );
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      'a tap on a line puts the playhead where it next plays, and selects nothing',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* codeAt(size.viewport, middle('rise'));
          yield* page.click(
            `${CODE_SECTION} .st-code-line[data-line="${FALL_READ_LINE}"] .st-code-t`,
          );
          yield* until(page, `Math.abs(${HASH_T} - ${into(span('fall').start)}) < 0.002`);
          yield* textIs(page, `${CODE_SECTION} .st-code-live`, 'fall');
          yield* evaluates(page, `new URLSearchParams(location.search).get('sel')`, 'beat:one');
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      "a tap on a line's number, and Enter on it, seek once each: to where the line next plays",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* codeAt(size.viewport, middle('rise'));
          const n = `${CODE_SECTION} .st-code-line[data-line="${MARKS_LINE}"] .st-code-n`;
          // Between the line's two plays: to the second, and the playhead stays there.
          yield* page.click(n);
          yield* until(page, `Math.abs(${HASH_T} - ${into(said('fall'))}) < 0.002`);
          yield* textIs(page, `${CODE_SECTION} .st-code-live`, 'fall');
          // Past its last: round to the first.
          yield* page.focus(n);
          yield* page.press('Enter');
          yield* until(page, `Math.abs(${HASH_T} - ${into(said('rise'))}) < 0.002`);
          yield* textIs(page, `${CODE_SECTION} .st-code-live`, 'rise');
          yield* evaluates(page, `new URLSearchParams(location.search).get('sel')`, 'beat:one');
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    for (const held of [
      { where: 'in the code', selector: RISE_TEXT },
      { where: 'outside the pane', selector: '.st-tc' },
    ])
      it.live(
        `with text selected ${held.where}, a tap on a line's number and Enter on it still seek`,
        () =>
          Effect.gen(function* () {
            const { page, errors } = yield* codeAt(size.viewport, middle('rise'));
            yield* selects(page, held.selector);
            yield* page.click(MARKS_NUMBER);
            yield* until(page, `Math.abs(${HASH_T} - ${into(said('fall'))}) < 0.002`);
            yield* selects(page, held.selector);
            yield* page.focus(MARKS_NUMBER);
            yield* page.press('Enter');
            yield* until(page, `Math.abs(${HASH_T} - ${into(said('rise'))}) < 0.002`);
            expect(errors).toEqual([]);
          }).pipe(Effect.scoped),
        SLOW,
      );

    it.live(
      "a drag that selects a line's text seeks nothing",
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* codeAt(size.viewport, middle('rise'));
          // The read of rise would seek to rise's first frame, and the number of the marks' line to fall's:
          // after the drag, the number's tap is the only seek the timecode shows.
          yield* page.evaluate(HEAR_TIMES);
          yield* until(page, textStands(RISE_TEXT));
          const text = yield* page.evaluate<{ x0: number; x1: number; y: number }>('window.__span');
          yield* page.mouse.move(text.x0 + 1, text.y);
          yield* page.mouse.down;
          yield* page.mouse.move((text.x0 + text.x1) / 2, text.y);
          yield* page.mouse.move(text.x1 - 1, text.y);
          yield* page.mouse.up;
          yield* evaluates(page, 'getSelection()?.isCollapsed', false);
          yield* page.click(MARKS_NUMBER);
          yield* until(page, `Math.abs(${HASH_T} - ${into(said('fall'))}) < 0.002`);
          yield* evaluates(page, ONE_TIME, true);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      'is unlit while the playhead is in another beat',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* codeAt(size.viewport, (two?.start ?? 0) + 0.1);
          yield* attributeIs(page, `${CODE_SECTION} .st-code`, 'data-lit', 'false');
          yield* evaluates(page, PAINTED, []);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

    it.live(
      'is unlit on a version kept in its own folder, and says it is lit for the open one',
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* codeAt(size.viewport, middle('rise'), 1);
          yield* attributeIs(page, `${CODE_SECTION} .st-code`, 'data-lit', 'false');
          yield* textIs(page, `${CODE_SECTION} .st-code-live`, 'Lit for the open version');
          yield* evaluates(page, PAINTED, []);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );
  });

describe("the studio's Script pane", () => {
  it.live(
    'is closed at rest; S opens it on the beat at the playhead, Play lights a line and the view follows it, S closes it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK, middle('rise'));
        yield* countIs(page, PANE, 0);
        yield* page.press('s');
        yield* attributeIs(page, `${PANE} .st-code`, 'data-lit', 'true');
        yield* evaluates(page, PANE_Q, 'script');
        yield* attributeIs(page, '.st-key[data-act="studio.script"]', 'aria-pressed', 'true');
        yield* textIs(page, `${PANE} .st-code-live`, 'rise');
        yield* until(page, inView(RISE_READ_LINE, false));
        // Play: the fall's read begins far down the file, and the view scrolls to it.
        yield* page.click(PLAY);
        yield* textIs(page, `${PANE} .st-code-live`, 'fall');
        yield* until(page, inView(FALL_READ_LINE, true));
        yield* page.click(PLAY);
        yield* page.press('s');
        yield* countIs(page, PANE, 0);
        yield* evaluates(page, PANE_Q, 'closed');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a scrub lights the frame's lines, and a tap on a line puts the playhead where it next plays",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK, 0.1, 'script');
        yield* attributeIs(page, `${PANE} .st-code`, 'data-lit', 'true');
        yield* evaluates(page, PAINTED, []);
        yield* scrub(page, 0.1, middle('rise'));
        yield* until(page, `Math.abs(${HASH_T} - ${middle('rise')}) < 0.1`);
        yield* textIs(page, `${PANE} .st-code-live`, 'rise');
        yield* evaluates(page, PAINTED, ["f.at('rise')", "rise: { mark: 'rise', dur: 0.6 }"]);
        // A tap on the fall's read: the playhead goes where it next plays, the view with it.
        yield* page.click(`${PANE} .st-code-line[data-line="${FALL_READ_LINE}"] .st-code-t`);
        yield* until(page, `Math.abs(${HASH_T} - ${into(span('fall').start)}) < 0.002`);
        yield* textIs(page, `${PANE} .st-code-live`, 'fall');
        yield* until(page, inView(FALL_READ_LINE, true));
        yield* evaluates(page, `new URLSearchParams(location.search).get('sel') ?? ''`, '');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a selection's inspector covers it and Escape shows it again; Escape closes it, and Back opens it again",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(DESK, middle('rise'), 'script');
        yield* waitFor(page, `${PANE} .st-code-line[data-line="${RISE_LINE}"]`);
        yield* page.click(clip('one'));
        yield* waitFor(page, '.st-pane[data-beat="one"]');
        yield* countIs(page, PANE, 0);
        yield* page.press('Escape');
        yield* waitFor(page, `${PANE} .st-code-line[data-line="${RISE_LINE}"]`);
        yield* evaluates(page, PANE_Q, 'script');
        yield* page.press('Escape');
        yield* countIs(page, PANE, 0);
        yield* evaluates(page, PANE_Q, 'closed');
        yield* page.back;
        yield* waitFor(page, `${PANE} .st-code-line[data-line="${RISE_LINE}"]`);
        yield* evaluates(page, PANE_Q, 'script');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'under a selection, S shows it and lets the selection go; Back gives the selection back',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* codeAt(DESK, middle('rise'));
        yield* countIs(page, PANE, 0);
        yield* page.press('s');
        yield* attributeIs(page, `${PANE} .st-code`, 'data-lit', 'true');
        yield* evaluates(page, PANE_Q, 'script');
        yield* evaluates(page, `new URLSearchParams(location.search).get('sel') ?? ''`, '');
        yield* attributeIs(page, '.st-key[data-act="studio.script"]', 'aria-pressed', 'true');
        yield* page.back;
        yield* waitFor(page, '.st-pane[data-beat="one"]');
        yield* countIs(page, PANE, 0);
        yield* attributeIs(page, '.st-key[data-act="studio.script"]', 'aria-pressed', 'false');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "on a phone, a tap on the reading block's head opens it in the block's place; no Script key takes the timecode's room",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* studioAt(PHONE, middle('rise'));
        yield* countIs(page, PANE, 0);
        yield* page.click('.st-reading [data-act="open-script"]');
        yield* evaluates(
          page,
          `getComputedStyle(document.querySelector('.st-key[data-act="studio.script"]')).display`,
          'none',
        );
        yield* evaluates(page, TC_FITS, true);
        yield* attributeIs(page, `${PANE} .st-code`, 'data-lit', 'true');
        yield* evaluates(page, PANE_Q, 'script');
        yield* evaluates(
          page,
          `getComputedStyle(document.querySelector('.st-reading')).display`,
          'none',
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
