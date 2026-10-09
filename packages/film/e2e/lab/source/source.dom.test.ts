// The Source view in a browser over the probe film: closed at rest and reading
// nothing; opened by ⇧C (a step Back walks) or by `?code=follow`
// and `?code=<line>`; the cues lit in the code are the cues lit on the strip at
// every settled frame; the inspector's `file:line` opens it held on that line;
// and on a phone it is a face of the selection's sheet, or a sheet of its own.

import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { HeadUnavailable } from '../../../src/core/refusals.ts';
import { MENU_ITEMS, rightClick } from '../../../src/lab/fixtures/gestures.ts';
import {
  PHONE,
  json,
  openLab,
  refused,
  route,
  sourceOne,
} from '../../../src/lab/fixtures/harness.ts';
import { PROBE, probeFilm } from '../../../src/lab/fixtures/probe-film.ts';
import { fitsPhone, noSidewaysBox } from '../../../src/lab/fixtures/phone-fit.ts';
import {
  attributeIs,
  countIs,
  evaluates,
  textHas,
  textIs,
} from '../../../src/lab/fixtures/settled.ts';
import { PHONE_HIT, undersizedTargets } from '../../../src/lab/fixtures/touch-targets.ts';

/** The lab on scene `one` (the probe film's first, so its time is the film's) at `T` seconds, with `picked`. */
const labOne = (
  T: number,
  picked: { readonly cue?: string; readonly code?: string } = {},
): string => pageHref.labScene(PROBE, 'one', picked, Option.some(T));

/** The file the fake lab reads for scene `one`: each cue's literal on a line of its own, read once by the draw. */
const TEXT = [
  "import { drawing } from './drawing.ts';",
  '',
  'export const ball = drawing({',
  '  timeline: {',
  "    rise: { mark: 'rise', dur: 0.6 },",
  "    fall: { mark: 'fall', dur: 0.4 },",
  '  },',
  '  knobs: { spot: [320, 200], size: 24 },',
  '  draw: (f) => {',
  "    const lift = f.at('rise');",
  "    const drop = f.at('fall');",
  "    f.ctx.arc(f.knob('spot')[0], 100 - 80 * lift + 80 * drop, f.knob('size'), 0, 7);",
  '  },',
  '});',
  `// ${'a long line of the file wraps under its own number rather than scrolling sideways, '.repeat(3)}`,
  '',
].join('\n');

/** The range of the first `needle` in `TEXT`. */
const range = (needle: string): readonly [number, number] => {
  const from = TEXT.indexOf(needle);
  return [from, from + needle.length];
};

const RISE = range("rise: { mark: 'rise', dur: 0.6 }");

const CODE = {
  scene: 'one',
  file: 'scenes/one.ts',
  text: TEXT,
  cues: [
    { name: 'rise', at: RISE, reads: [range("f.at('rise')")] },
    {
      name: 'fall',
      at: range("fall: { mark: 'fall', dur: 0.4 }"),
      reads: [range("f.at('fall')")],
    },
  ],
  knobs: [{ name: 'spot', at: range('spot: [320, 200]'), reads: [range("f.knob('spot')")] }],
  marks: [],
  refused: [],
};

/** The line (from 1) that writes the `rise` cue. */
const RISE_LINE = TEXT.slice(0, RISE[0]).split('\n').length;

const codeRoute = route('GET', /^\/scenes\/one\/code$/, () => json(CODE));

/** The line (from 1) that writes `needle`. */
const lineOfText = (needle: string) => TEXT.slice(0, TEXT.indexOf(needle)).split('\n').length;
const FALL_LINE = lineOfText("fall: { mark: 'fall'");
const SPOT_LINE = lineOfText('spot: [320, 200]');
/** The long comment's line: it wraps. */
const LONG_LINE = lineOfText('// a long line');

/** Scene one's small source answer, as the server gives it: each cue and knob with the line that writes it. */
const sourceRoute = route('GET', /^\/scenes\/one\/source$/, () =>
  json({
    ...sourceOne,
    cues: sourceOne.cues.map((c, i) => ({ ...c, line: [RISE_LINE, FALL_LINE][i] ?? 0 })),
    knobs: sourceOne.knobs.map((k) => ({ ...k, line: SPOT_LINE })),
  }),
);

/** Scene `one`'s cues in film seconds: where the probe film plays them. */
const one = probeFilm().placed[0];
const span = (name: string) => {
  const cue = one?.cues.get(name);
  const start = one?.start ?? 0;
  return { start: start + (cue?.start ?? 0), end: start + (cue?.end ?? 0) };
};
const middle = (name: string) => (span(name).start + span(name).end) / 2;

/** The names of the cue lanes lit on the strip. */
const LANES = `[...document.querySelectorAll('.lab-cue[data-live]')].map((e) => e.dataset.cue).sort()`;

/** The names of the cue literals the code view paints as playing: the highlight's ranges, read back as the text they cover. */
const painted = (name: string) =>
  `(() => [...(CSS.highlights.get('${name}') ?? [])].map((r) => r.toString()).sort())()`;
const PAINTED = `(() => [...(CSS.highlights.get('lab-live') ?? [])].map((r) => r.toString().split(':')[0]).sort())()`;

/** A screen of comment lines, to put a literal below a box's first screen. */
const FILLER = Array.from({ length: 60 }, (_, i) => `// filler ${i + 1}`).join('\n');
/** Scene one's code answer for `text`: `TEXT`'s cues and knob, found where `text` writes them. */
const codeOf = (text: string) => {
  const at = (needle: string): readonly [number, number] => {
    const from = text.indexOf(needle);
    return [from, from + needle.length];
  };
  return {
    ...CODE,
    text,
    cues: [
      { name: 'rise', at: at("rise: { mark: 'rise', dur: 0.6 }"), reads: [at("f.at('rise')")] },
      { name: 'fall', at: at("fall: { mark: 'fall', dur: 0.4 }"), reads: [at("f.at('fall')")] },
    ],
    knobs: [{ name: 'spot', at: at('spot: [320, 200]'), reads: [at("f.knob('spot')")] }],
  };
};
/** The line (from 1) of `text` that writes `needle`. */
const lineIn = (text: string, needle: string) =>
  text.slice(0, text.indexOf(needle)).split('\n').length;
/** `rise`'s literal near the end of the file, below its first screen. */
const LONG_TEXT = `${FILLER}\n${TEXT}`;
const LONG_RISE_LINE = lineIn(LONG_TEXT, "rise: { mark: 'rise'");
const longRoute = route('GET', /^\/scenes\/one\/code$/, () => json(codeOf(LONG_TEXT)));
/**
 * The timeline at the top, the knobs and the draw a screen below it, and a
 * screen after them: before any cue Follow looks at the knob the frame read,
 * mid-file, and a cue edge takes it to the top.
 */
const TEXT_LINES = TEXT.split('\n');
const KNOBS_AT = TEXT_LINES.findIndex((l) => l.includes('knobs:'));
const SPLIT_TEXT = [
  ...TEXT_LINES.slice(0, KNOBS_AT),
  FILLER,
  ...TEXT_LINES.slice(KNOBS_AT),
  FILLER,
].join('\n');
const splitRoute = route('GET', /^\/scenes\/one\/code$/, () => json(codeOf(SPLIT_TEXT)));
const SPLIT_SPOT_LINE = lineIn(SPLIT_TEXT, 'spot: [320, 200]');
/** Two animation frames: a scroll's event and a resize's observation are both in. */
const FRAMES = `new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`;

describe('the Source view at rest', () => {
  it.live('is closed, reads nothing, and puts no control on the page for it', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([codeRoute], { href: labOne(1) });
      yield* countIs(page, '.lab-source', 0);
      yield* countIs(page, '[data-act="code"]', 0);
      expect(asked.filter((a) => a.path.endsWith('/code'))).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('⇧C opens the view as a step Back walks, and Close shuts it', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], { href: labOne(1) });
      yield* page.press('Shift+C');
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* evaluates(page, `location.search.includes('code=follow')`, true);
      yield* page.back;
      yield* countIs(page, '.lab-source', 0);
      yield* page.forward;
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* page.click('.lab-source-col [data-act="close-source"]');
      yield* countIs(page, '.lab-source', 0);
    }).pipe(Effect.scoped),
  );
});

describe('what is lit', () => {
  const frames = [
    ['before any cue', 0.05],
    ['inside rise', middle('rise')],
    ['inside fall', middle('fall')],
    ['after both', span('fall').end + 0.3],
  ] as const;
  for (const [name, T] of frames)
    it.live(`the cues lit in the code are the lanes lit on the strip, ${name}`, () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([codeRoute], {
          href: labOne(T, { code: 'follow', cue: 'rise' }),
        });
        yield* page.waitFor('.lab-source-col .lab-source-page');
        yield* evaluates(page, `JSON.stringify(${LANES}) === JSON.stringify(${PAINTED})`, true);
      }).pipe(Effect.scoped),
    );

  it.live(
    'a frame inside rise lights rise’s literal, names it in the head and meters its line',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([codeRoute], {
          href: labOne(middle('rise'), { code: 'follow' }),
        });
        yield* page.waitFor('.lab-source-col .lab-source-page');
        yield* textIs(page, '.lab-source-live', 'rise');
        yield* evaluates(page, PAINTED, ['rise']);
        yield* attributeIs(page, '.lab-source-meter', 'data-cue', 'rise');
      }).pipe(Effect.scoped),
  );
});

describe('a line held', () => {
  it.live('?code=<line> holds that line, in the column', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], { href: labOne(1, { code: `${RISE_LINE}` }) });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* attributeIs(page, '.lab-source-held', 'data-line', String(RISE_LINE));
    }).pipe(Effect.scoped),
  );

  it.live('the inspector’s file:line opens the view held on the cue’s line', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(1, { cue: 'rise' }),
      });
      yield* textIs(page, '.lab-source-at', `scenes/one.ts:${RISE_LINE}`);
      yield* page.click('.lab-source-at');
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* attributeIs(page, '.lab-source-held', 'data-line', String(RISE_LINE));
      yield* evaluates(page, `location.search.includes('code=${RISE_LINE}')`, true);
    }).pipe(Effect.scoped),
  );
});

describe('a note cites the line held', () => {
  it.live(
    'the composer’s scope chip names file:line, and its × writes the note about the frame',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([codeRoute], {
          href: labOne(1, { code: `${RISE_LINE}` }),
          mode: 'note',
        });
        yield* page.waitFor('.lab-source-col .lab-source-page');
        yield* page.press('n');
        yield* textIs(
          page,
          '[data-role="note-scope"] .lab-scope-text',
          `one · scenes/one.ts:${RISE_LINE}`,
        );
        yield* page.click('[data-role="note-scope"] [data-act="clear-scope"]');
        yield* countIs(page, '[data-role="note-scope"]', 0);
      }).pipe(Effect.scoped),
  );

  it.live('a view that only follows cites no line', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(1, { code: 'follow' }),
        mode: 'note',
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* page.press('n');
      yield* page.waitFor('.lab-compose:not([hidden])');
      yield* countIs(page, '[data-role="note-scope"]', 0);
    }).pipe(Effect.scoped),
  );
});

describe('on a phone, held to the phone rules', () => {
  const touch = { ...PHONE, coarse: true };

  it.live('the code in the selection’s sheet fits the window, its targets a finger’s size', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(middle('rise'), { cue: 'rise', code: 'follow' }),
        viewport: touch,
      });
      yield* page.waitFor('.lab-selection-sheet .lab-source-page');
      yield* fitsPhone(page, '.lab-selection-sheet');
      const now = undersizedTargets(PHONE_HIT, '.lab-selection-sheet');
      yield* page.until(`${now}.length === 0`, { now, say: (found) => `under a finger: ${found}` });
    }).pipe(Effect.scoped),
  );

  it.live('the code in a sheet of its own fits the window, its targets a finger’s size', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(middle('rise'), { code: 'follow' }),
        viewport: touch,
      });
      yield* page.waitFor('[data-role="source"] .lab-source-page');
      yield* fitsPhone(page, '.lab-source-sheet');
      const now = undersizedTargets(PHONE_HIT, '.lab-source-sheet');
      yield* page.until(`${now}.length === 0`, { now, say: (found) => `under a finger: ${found}` });
    }).pipe(Effect.scoped),
  );
});

describe('on a phone', () => {
  it.live('is a face of the selection’s sheet, and Inspect gives the inspector back', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(1, { cue: 'rise' }),
        viewport: PHONE,
      });
      yield* page.waitFor('.lab-selection-sheet');
      yield* countIs(page, '.lab-source-col', 0);
      yield* page.click('.lab-selection-sheet [data-act="sheet"]');
      yield* page.click('.lab-selection-sheet [data-face="source"]');
      yield* page.waitFor('.lab-selection-sheet .lab-source-page');
      yield* evaluates(page, `location.search.includes('code=follow')`, true);
      yield* page.click('.lab-selection-sheet [data-face="inspect"]');
      yield* countIs(page, '.lab-selection-sheet .lab-source', 0);
    }).pipe(Effect.scoped),
  );

  it.live('is a sheet of its own while nothing is selected, and Close shuts it', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(1, { code: 'follow' }),
        viewport: PHONE,
      });
      yield* page.waitFor('[data-role="source"] .lab-source-page');
      yield* page.click('.lab-source-sheet [data-act="close-inspector"]');
      yield* countIs(page, '[data-role="source"]', 0);
      yield* evaluates(page, `location.search.includes('code=')`, false);
    }).pipe(Effect.scoped),
  );
});

/** Whether the URL names a cue or the Source view. */
const NAMES_CUE_OR_CODE = `location.search.includes('cue=') || location.search.includes('code=')`;

describe('on a phone, one sheet to close and one place to look', () => {
  const picked = { cue: 'rise', code: 'follow' } as const;

  it.live('closing the Source face closes the sheet: no second Source sheet opens', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(middle('rise'), picked),
        viewport: PHONE,
      });
      yield* page.waitFor('.lab-selection-sheet .lab-source-page');
      yield* page.click('.lab-selection-sheet [data-act="close-inspector"]');
      yield* countIs(page, '[data-role="source"]', 0);
      yield* countIs(page, '.lab-selection-sheet', 0);
      yield* evaluates(page, NAMES_CUE_OR_CODE, false);
    }).pipe(Effect.scoped),
  );

  it.live('switching Edit to Note keeps the open Source view in sight', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(middle('rise'), picked),
        viewport: PHONE,
      });
      yield* page.waitFor('.lab-selection-sheet .lab-source-page');
      // The sheet lowers to its peek to reach the mode tray, as a hand would.
      yield* page.click('.lab-selection-sheet [data-act="sheet"]');
      yield* page.click('.lab-modes [data-mode-pick="note"]');
      yield* page.waitFor('.lab-panel[data-mode="note"]');
      yield* page.waitFor('.lab-source-sheet .lab-source-page');
      yield* evaluates(
        page,
        `document.querySelector('.lab-source-sheet .lab-source-page').checkVisibility()`,
        true,
      );
      yield* evaluates(page, `location.search.includes('code=follow')`, true);
    }).pipe(Effect.scoped),
  );

  it.live('a line tapped in the sheet’s own Source selects its cue and opens it whole', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(1, { code: 'follow' }),
        viewport: PHONE,
      });
      yield* page.waitFor('[data-role="source"] .lab-source-page');
      yield* page.click(`.lab-source-line[data-line="${RISE_LINE}"]`);
      yield* page.waitFor('.lab-selection-sheet .lab-source-page');
      yield* evaluates(page, `location.search.includes('cue=rise')`, true);
      yield* attributeIs(page, '.lab-source-held', 'data-line', String(RISE_LINE));
      yield* page.click('.lab-selection-sheet [data-act="close-inspector"]');
      yield* countIs(page, '[data-role="source"]', 0);
      yield* evaluates(page, NAMES_CUE_OR_CODE, false);
    }).pipe(Effect.scoped),
  );

  // The address bar's dismissal is the one rule: Back over the line's step
  // would land on the Source view, not where the Close writes (neither), so
  // the Close rewrites the step and Back is the view again.
  it.live('the sheet closed after a line held in its own Source: Back is the view', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(1, { code: 'follow' }),
        viewport: PHONE,
      });
      yield* page.waitFor('[data-role="source"] .lab-source-page');
      yield* page.click(`.lab-source-line[data-line="${RISE_LINE}"]`);
      yield* page.waitFor('.lab-selection-sheet .lab-source-page');
      yield* page.click('.lab-selection-sheet [data-act="close-inspector"]');
      yield* countIs(page, '.lab-selection-sheet', 0);
      yield* evaluates(page, NAMES_CUE_OR_CODE, false);
      yield* page.back;
      yield* evaluates(
        page,
        `location.search.includes('code=follow') && !location.search.includes('cue=')`,
        true,
      );
    }).pipe(Effect.scoped),
  );
});

describe('on a phone, Close in every mode lets go of the cue with the view', () => {
  for (const mode of ['note', 'motion', 'compare', 'record'] as const)
    it.live(
      `in ${mode} the Source sheet's Close leaves neither the view nor the cue in the address`,
      () =>
        Effect.gen(function* () {
          const { page } = yield* openLab([codeRoute, sourceRoute], {
            href: labOne(middle('rise'), { cue: 'rise', code: 'follow' }),
            viewport: PHONE,
          });
          yield* page.waitFor('.lab-selection-sheet .lab-source-page');
          yield* page.click('.lab-selection-sheet [data-act="sheet"]');
          yield* page.click(`.lab-modes [data-mode-pick="${mode}"]`);
          yield* page.waitFor('.lab-source-sheet .lab-source-page');
          yield* page.click('.lab-source-sheet [data-act="close-inspector"]');
          yield* countIs(page, '[data-role="source"]', 0);
          yield* evaluates(page, NAMES_CUE_OR_CODE, false);
        }).pipe(Effect.scoped),
    );
});

describe('on a phone, the highlights stay with the one text that is shown', () => {
  it.live('paused: Edit to Note and back to Edit keeps what was lit', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(middle('rise'), { cue: 'rise', code: 'follow' }),
        viewport: PHONE,
      });
      yield* page.waitFor('.lab-selection-sheet .lab-source-page');
      const lit = `JSON.stringify([${painted('lab-live')}, ${painted('lab-read')}, ${painted('lab-picked')}].map((r) => r.length > 0))`;
      yield* evaluates(page, lit, '[true,true,true]');
      yield* page.click('.lab-selection-sheet [data-act="sheet"]');
      yield* page.click('.lab-modes [data-mode-pick="note"]');
      yield* page.waitFor('.lab-source-sheet .lab-source-page');
      yield* evaluates(page, lit, '[true,true,true]');
      yield* page.click('.lab-source-sheet [data-act="sheet"]');
      yield* page.click('.lab-modes [data-mode-pick="edit"]');
      yield* page.waitFor('.lab-selection-sheet');
      yield* evaluates(page, `document.querySelectorAll('.lab-source-page').length`, 1);
      yield* evaluates(page, lit, '[true,true,true]');
    }).pipe(Effect.scoped),
  );
});

describe('code that wraps rather than scrolls sideways', () => {
  it.live('on a phone the code scroller holds no more than its width shows', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(1, { code: `${LONG_LINE}` }),
        viewport: PHONE,
      });
      yield* page.waitFor('[data-role="source"] .lab-source-page');
      yield* fitsPhone(page, '.lab-source-sheet');
      yield* noSidewaysBox(page, '.lab-source-scroll');
      // The long line is taller than a line, and its held band and number sit on the whole row.
      yield* evaluates(
        page,
        `(() => {
          const row = document.querySelector('.lab-source-line[data-line="${LONG_LINE}"]');
          const held = row.querySelector('.lab-source-held');
          const lh = parseFloat(getComputedStyle(row).lineHeight);
          return row.offsetHeight > lh * 1.5 && held.offsetHeight === row.offsetHeight
            && row.querySelector('.lab-source-n').offsetTop === 0;
        })()`,
        true,
      );
    }).pipe(Effect.scoped),
  );

  it.live('on a laptop the column wraps too: one layout', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], { href: labOne(1, { code: 'follow' }) });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* noSidewaysBox(page, '.lab-source-col .lab-source-scroll');
    }).pipe(Effect.scoped),
  );
});

describe('on a phone, the sheet’s code scrolls to its line', () => {
  const touch = { ...PHONE, coarse: true };
  const FOLLOW_SHEET = '.lab-source-sheet [data-act="follow-source"]';
  const BOX = `document.querySelector('.lab-source-sheet .lab-source-scroll')`;

  /** Whether line `n` of the sheet's code shows inside the box that scrolls it (the nearest ancestor of the rows that scrolls). */
  const showing = (n: number) => `(() => {
    const row = document.querySelector('.lab-source-sheet .lab-source-line[data-line="${n}"]');
    let box = row.parentElement;
    while (box && !(box.scrollHeight > box.clientHeight && getComputedStyle(box).overflowY !== 'visible')) box = box.parentElement;
    if (!box) return false;
    const r = row.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return r.top >= b.top && r.bottom <= b.bottom && r.bottom <= window.innerHeight;
  })()`;

  it.live('?code=follow at a frame inside rise shows rise’s line, and Follow is pressed', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([longRoute], {
        href: labOne(middle('rise'), { code: 'follow' }),
        viewport: touch,
      });
      yield* page.waitFor('.lab-source-sheet .lab-source-page');
      yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
      yield* evaluates(page, showing(LONG_RISE_LINE), true);
    }).pipe(Effect.scoped),
  );

  it.live('?code=<line> shows the held line', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([longRoute], {
        href: labOne(1, { code: `${LONG_RISE_LINE}` }),
        viewport: touch,
      });
      yield* page.waitFor('.lab-source-sheet .lab-source-page');
      yield* evaluates(page, showing(LONG_RISE_LINE), true);
    }).pipe(Effect.scoped),
  );

  it.live(
    'a press and release on the box with no scroll, then a resize that hides the line, places it again and leaves Follow pressed',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([longRoute], {
          href: labOne(middle('rise'), { code: 'follow' }),
          viewport: touch,
        });
        yield* page.waitFor('.lab-source-sheet .lab-source-page');
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
        yield* page.evaluate(`window.__before = ${BOX}.scrollTop`);
        yield* page.evaluate(
          `(() => { const box = ${BOX}; box.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })); box.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' })); })()`,
        );
        yield* page.resize(390, 360);
        yield* page.evaluate(FRAMES);
        // The shorter box left the line below its edge: the view placed it again.
        yield* evaluates(page, `${BOX}.scrollTop !== window.__before`, true);
        yield* evaluates(page, showing(LONG_RISE_LINE), true);
        yield* page.evaluate(FRAMES);
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
      }).pipe(Effect.scoped),
  );

  it.live('code that grows above the line (a font arriving, a re-wrap) places it again', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([splitRoute], {
        href: labOne(0.05, { code: 'follow' }),
        viewport: touch,
      });
      yield* page.waitFor('.lab-source-sheet .lab-source-page');
      yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
      yield* evaluates(page, showing(SPLIT_SPOT_LINE), true);
      yield* page.evaluate(`window.__before = ${BOX}.scrollTop`);
      // A row above the line takes a screen more room; the box keeps its size.
      yield* page.evaluate(
        `document.querySelector('.lab-source-sheet .lab-source-line[data-line="1"]').style.minHeight = '600px'`,
      );
      yield* page.evaluate(FRAMES);
      yield* evaluates(page, `${BOX}.scrollTop > window.__before`, true);
      yield* evaluates(page, showing(SPLIT_SPOT_LINE), true);
      yield* page.evaluate(FRAMES);
      yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
    }).pipe(Effect.scoped),
  );

  it.live('a resize that clamps the box’s scroll leaves Follow pressed', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([longRoute], {
        href: labOne(middle('rise'), { code: 'follow' }),
        viewport: { ...touch, height: 480 },
      });
      yield* page.waitFor('.lab-source-sheet .lab-source-page');
      yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
      yield* evaluates(page, showing(LONG_RISE_LINE), true);
      yield* page.evaluate(`window.__before = ${BOX}.scrollTop`);
      yield* page.resize(390, 1400);
      yield* page.evaluate(FRAMES);
      // The taller box shows the file's end: layout clamped the scroll up to it.
      yield* evaluates(page, `${BOX}.scrollTop < window.__before`, true);
      yield* evaluates(
        page,
        `Math.abs(${BOX}.scrollTop - (${BOX}.scrollHeight - ${BOX}.clientHeight)) <= 1`,
        true,
      );
      yield* page.evaluate(FRAMES);
      yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
    }).pipe(Effect.scoped),
  );

  it.live('twenty half-pixel scrolls add up to a reader’s and suspend Follow', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([splitRoute], {
        href: labOne(0.05, { code: 'follow' }),
        viewport: touch,
      });
      yield* page.waitFor('.lab-source-sheet .lab-source-page');
      yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
      yield* evaluates(page, showing(SPLIT_SPOT_LINE), true);
      // The box drawn at two device pixels to its pixel, as a phone's screen draws the page, so
      // half a pixel is a step it can take (at one, Chrome snaps the scroll to whole pixels).
      yield* page.evaluate(`${BOX}.style.zoom = '2'`);
      yield* page.evaluate(FRAMES);
      yield* page.evaluate(FRAMES);
      yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
      yield* page.evaluate(
        `(async () => { const box = ${BOX}; const from = box.scrollTop; window.__from = from; window.__steps = []; for (let i = 1; i <= 20; i += 1) { box.scrollTop = from + i * 0.5; await ${FRAMES}; window.__steps.push(box.scrollTop); } })()`,
      );
      // Each step moved the box by half a pixel, and the steps add up to ten.
      yield* evaluates(page, `window.__steps.some((s) => !Number.isInteger(s))`, true);
      yield* evaluates(page, `Math.round(${BOX}.scrollTop - window.__from)`, 10);
      yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'false');
    }).pipe(Effect.scoped),
  );

  it.live(
    'Follow taken back with its line in sight measures the reader’s next scroll from where the box stands',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([splitRoute], {
          href: labOne(0.05, { code: 'follow' }),
          viewport: touch,
        });
        yield* page.waitFor('.lab-source-sheet .lab-source-page');
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
        yield* evaluates(page, showing(SPLIT_SPOT_LINE), true);
        yield* page.evaluate(`window.__placed = ${BOX}.scrollTop; ${BOX}.scrollTop -= 3`);
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'false');
        yield* page.click(FOLLOW_SHEET);
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
        // The line still shows three pixels up, so Follow took the box where it stood.
        yield* page.evaluate(FRAMES);
        yield* evaluates(
          page,
          `${BOX}.scrollTop`,
          yield* page.evaluate<number>('window.__placed - 3'),
        );
        // Two pixels on is the reader's, though it lands within a pixel of where the view first put the box.
        yield* page.evaluate(`${BOX}.scrollTop += 2`);
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'false');
      }).pipe(Effect.scoped),
  );

  it.live('a resize that moves nothing, then a reader’s jump, suspends Follow', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([splitRoute], {
        href: labOne(0.05, { code: 'follow' }),
        viewport: touch,
      });
      yield* page.waitFor('.lab-source-sheet .lab-source-page');
      yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
      yield* evaluates(page, showing(SPLIT_SPOT_LINE), true);
      yield* page.evaluate(`window.__box = [${BOX}.scrollTop, ${BOX}.clientHeight]`);
      yield* page.resize(390, 900);
      yield* page.evaluate(FRAMES);
      // The box grew, and nothing scrolled: no event told the view.
      yield* evaluates(page, `${BOX}.clientHeight > window.__box[1]`, true);
      yield* evaluates(page, `${BOX}.scrollTop === window.__box[0]`, true);
      yield* page.evaluate(FRAMES);
      yield* page.evaluate(`${BOX}.scrollTop = window.__box[0] + 200`);
      yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'false');
    }).pipe(Effect.scoped),
  );

  it.live(
    'a scroll with no input event (find-in-page, assistive tech) suspends Follow; Follow takes it back',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([longRoute], {
          href: labOne(middle('rise'), { code: 'follow' }),
          viewport: touch,
        });
        yield* page.waitFor('.lab-source-sheet .lab-source-page');
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
        yield* evaluates(page, showing(LONG_RISE_LINE), true);
        yield* page.evaluate(
          `(() => { const box = document.querySelector('.lab-source-sheet .lab-source-scroll'); box.scrollTop = 0; })()`,
        );
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'false');
        yield* page.click(FOLLOW_SHEET);
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
        yield* evaluates(page, showing(LONG_RISE_LINE), true);
      }).pipe(Effect.scoped),
  );
});

describe('a line of the code', () => {
  it.live('a tap holds it and selects the cue written there', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(1, { code: 'follow' }),
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* page.click(`.lab-source-line[data-line="${FALL_LINE}"]`);
      yield* attributeIs(page, '.lab-source-held', 'data-line', String(FALL_LINE));
      yield* evaluates(page, `location.search.includes('cue=fall')`, true);
      yield* evaluates(page, `location.search.includes('code=${FALL_LINE}')`, true);
    }).pipe(Effect.scoped),
  );

  it.live('a tap on a line that writes nothing holds it and leaves the selection', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(1, { code: 'follow' }),
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* page.click('.lab-source-line[data-line="1"]');
      yield* attributeIs(page, '.lab-source-held', 'data-line', '1');
      yield* evaluates(page, `location.search.includes('cue=')`, false);
    }).pipe(Effect.scoped),
  );

  it.live('its context menu offers Note this line and Copy link; Note this line cites it', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(1, { code: 'follow' }),
        mode: 'note',
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* rightClick(page, `.lab-source-line[data-line="${RISE_LINE}"]`);
      yield* evaluates(
        page,
        `${MENU_ITEMS}.includes('notes.line') && ${MENU_ITEMS}.includes('link.copy')`,
        true,
      );
      yield* page.click('[data-role="context-menu"] [data-command="notes.line"]');
      yield* textIs(
        page,
        '[data-role="note-scope"] .lab-scope-text',
        `one · scenes/one.ts:${RISE_LINE}`,
      );
    }).pipe(Effect.scoped),
  );

  it.live('a menu opened in one scene never notes the same-numbered line of the next', () =>
    Effect.gen(function* () {
      const TWO = {
        scene: 'two',
        file: 'scenes/two.ts',
        text: ['// two', 'a', 'b', 'c', 'const d = 4;', 'e'].join('\n'),
        cues: [],
        knobs: [],
        marks: [],
        refused: [],
      };
      const twoRoute = route('GET', /^\/scenes\/two\/code$/, () => json(TWO));
      const secondScene = probeFilm().placed[1]?.start ?? 0;
      const { page } = yield* openLab([codeRoute, twoRoute], {
        href: labOne(secondScene - 0.3, { code: 'follow' }),
        mode: 'note',
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* rightClick(page, `.lab-source-line[data-line="${RISE_LINE}"]`);
      yield* evaluates(page, `${MENU_ITEMS}.includes('notes.line')`, true);
      // Playback crosses into scene two while the menu is still open.
      yield* page.evaluate(`document.querySelector('.bar [data-act="play"]').click()`);
      yield* page.clock.runFor(600);
      yield* page.waitFor('[data-role="source"][data-scene="two"] .lab-source-page');
      // The line the menu was opened on is scene one's: the command is no longer offered for it.
      yield* evaluates(page, `${MENU_ITEMS}.includes('notes.line')`, false);
      yield* page.evaluate(
        `(() => { const item = document.querySelector('[data-role="context-menu"] [data-command="notes.line"]'); if (item) item.click(); })()`,
      );
      yield* page.evaluate(`document.querySelector('.bar [data-act="play"]').click()`);
      yield* evaluates(
        page,
        `[...document.querySelectorAll('[data-role="note-scope"] .lab-scope-text')].some((e) => e.textContent.includes('two.ts'))`,
        false,
      );
    }).pipe(Effect.scoped),
  );
});

describe('Follow', () => {
  /** A window short enough that the file scrolls in the column. */
  const short = { width: 1440, height: 340 };
  const FOLLOW_BUTTON = '.lab-source-col [data-act="follow-source"]';
  /** A scroll to the box's end that no event but the scroll announces: what find-in-page or assistive tech does. */
  const HAND = `(() => { const box = document.querySelector('.lab-source-col .lab-source-scroll'); box.scrollTop = box.scrollHeight; })()`;

  it.live('a hand on the scroll suspends it; Follow takes it back', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(middle('rise'), { code: 'follow' }),
        viewport: short,
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* attributeIs(page, FOLLOW_BUTTON, 'aria-pressed', 'true');
      yield* page.evaluate(HAND);
      yield* attributeIs(page, FOLLOW_BUTTON, 'aria-pressed', 'false');
      yield* page.click(FOLLOW_BUTTON);
      yield* attributeIs(page, FOLLOW_BUTTON, 'aria-pressed', 'true');
    }).pipe(Effect.scoped),
  );

  it.live('Play takes it back', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(middle('rise'), { code: 'follow' }),
        viewport: short,
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* page.evaluate(HAND);
      yield* attributeIs(page, FOLLOW_BUTTON, 'aria-pressed', 'false');
      yield* page.click('.bar [data-act="play"]');
      yield* attributeIs(page, FOLLOW_BUTTON, 'aria-pressed', 'true');
      yield* page.click('.bar [data-act="play"]');
    }).pipe(Effect.scoped),
  );

  it.live(
    'a command key (the next cue edge) with the code focused scrolls it to the cue, and Follow stays pressed',
    () =>
      Effect.gen(function* () {
        // The column, not a phone's sheet: a sheet is a dialog, whose focus takes its own keys
        // (`command/context.ts` focusOf), so `.` seeks only with the column's code focused.
        const COL_BOX = `document.querySelector('.lab-source-col .lab-source-scroll')`;
        const inBox = (n: number) =>
          `(() => { const r = document.querySelector('.lab-source-col .lab-source-line[data-line="${n}"]').getBoundingClientRect(); const b = ${COL_BOX}.getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom; })()`;
        const { page } = yield* openLab([splitRoute], {
          href: labOne(0.05, { code: 'follow' }),
          viewport: short,
        });
        yield* page.waitFor('.lab-source-col .lab-source-page');
        yield* attributeIs(page, FOLLOW_BUTTON, 'aria-pressed', 'true');
        // Before any cue the view follows the knob the frame read, a screen down the file.
        yield* evaluates(page, inBox(SPLIT_SPOT_LINE), true);
        yield* evaluates(page, `${COL_BOX}.scrollTop > 0`, true);
        yield* page.evaluate(`window.__before = ${COL_BOX}.scrollTop`);
        yield* page.focus('.lab-source-col .lab-source-page');
        yield* page.press('.');
        // The edge plays a cue written at the top: the view scrolled there itself.
        yield* evaluates(
          page,
          `Math.abs(Number(location.hash.slice('#t='.length)) - ${span('rise').start}) < 0.02`,
          true,
        );
        yield* evaluates(page, inBox(RISE_LINE), true);
        yield* evaluates(page, `${COL_BOX}.scrollTop < window.__before`, true);
        yield* page.evaluate(FRAMES);
        yield* page.evaluate(FRAMES);
        yield* attributeIs(page, FOLLOW_BUTTON, 'aria-pressed', 'true');
      }).pipe(Effect.scoped),
  );

  it.live('a held line is not following; Follow lets go of it', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(1, { code: `${RISE_LINE}` }),
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* attributeIs(page, FOLLOW_BUTTON, 'aria-pressed', 'false');
      yield* page.click(FOLLOW_BUTTON);
      yield* evaluates(page, `location.search.includes('code=follow')`, true);
    }).pipe(Effect.scoped),
  );
  it.live('a still target costs no layout read however many frames play', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(span('rise').start + 0.02, { code: 'follow' }),
        viewport: short,
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* page.evaluate(
        `window.__reads = 0; const rect = Element.prototype.getBoundingClientRect; Element.prototype.getBoundingClientRect = function (...r) { if (this.classList.contains('lab-source-line')) window.__reads += 1; return rect.apply(this, r); }; const was = window.getComputedStyle.bind(window); window.getComputedStyle = (el, ...r) => { if (el.classList && el.classList.contains('lab-source-line')) window.__reads += 1; return was(el, ...r); }; window.__frames = 0; const meter = () => { const m = document.querySelector('.lab-source-meter'); return m ? m.style.getPropertyValue('--done') : window.__meter; }; window.__meter = meter(); window.__moved = false; const tick = () => { window.__frames += 1; if (meter() !== window.__meter) window.__moved = true; requestAnimationFrame(tick); }; requestAnimationFrame(tick);`,
      );
      yield* page.click('.bar [data-act="play"]');
      yield* page.clock.runFor(200);
      yield* page.click('.bar [data-act="play"]');
      // Frames played and the meter moved with them; the target (one line) did not.
      yield* evaluates(page, `window.__frames >= 10`, true);
      yield* evaluates(page, `window.__moved`, true);
      yield* evaluates(page, `window.__reads <= 1`, true);
    }).pipe(Effect.scoped),
  );
  it.live('a playing cue’s meter is one element its progress moves, not one made each frame', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(span('rise').start + 0.02, { code: 'follow' }),
      });
      yield* page.waitFor('.lab-source-col .lab-source-meter');
      yield* page.evaluate(
        `window.__meterEl = document.querySelector('.lab-source-meter[data-cue="rise"]'); window.__done = window.__meterEl.style.getPropertyValue('--done'); window.__made = 0; new MutationObserver((records) => { for (const r of records) for (const n of r.addedNodes) if (n instanceof Element && (n.matches('.lab-source-meter[data-cue="rise"]') || n.querySelector('.lab-source-meter[data-cue="rise"]'))) window.__made++; }).observe(document.querySelector('.lab-source-col'), { childList: true, subtree: true });`,
      );
      yield* page.click('.bar [data-act="play"]');
      yield* page.clock.runFor(200);
      yield* page.click('.bar [data-act="play"]');
      yield* evaluates(
        page,
        `window.__meterEl.style.getPropertyValue('--done') !== window.__done`,
        true,
      );
      // A meter made each frame is added a dozen times in 200 ms; the kept one is added never. One
      // allowed: new code (another case's write to the probe film, read fresh) draws new lines and
      // their meters once. The cue ending under a slow box takes its meter away, adding none.
      yield* evaluates(page, `window.__made <= 1`, true);
    }).pipe(Effect.scoped),
  );
});

describe('what the selection and the frame’s reads light', () => {
  it.live('the cue selected is lit where it is written, with nothing playing', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(0.05, { cue: 'fall', code: 'follow' }),
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* evaluates(page, painted('lab-picked'), ["fall: { mark: 'fall', dur: 0.4 }"]);
    }).pipe(Effect.scoped),
  );

  it.live('the knobs the frame read are lit as reads', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(middle('rise'), { code: 'follow' }),
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* evaluates(
        page,
        `${painted('lab-read')}.includes('spot: [320, 200]') && ${painted('lab-read')}.includes("f.knob('spot')")`,
        true,
      );
    }).pipe(Effect.scoped),
  );
});

describe('a code view that cannot read', () => {
  /** The first read is refused; the ones after it are answered. */
  const flaky = () => {
    let refusals = 1;
    return route('GET', /^\/scenes\/one\/code$/, () => {
      if (refusals > 0) {
        refusals -= 1;
        return refused(HeadUnavailable.make({ file: 'scenes/one.ts', reason: 'the file is busy' }));
      }
      return json(CODE);
    });
  };

  it.live('says why, and Retry reads it again', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([flaky()], { href: labOne(1, { code: 'follow' }) });
      yield* page.waitFor('.lab-source-col [data-act="retry-source"]');
      yield* textHas(page, '.lab-source-col .lab-source-note', 'Could not read one');
      yield* page.click('.lab-source-col [data-act="retry-source"]');
      yield* page.waitFor('.lab-source-col .lab-source-page');
    }).pipe(Effect.scoped),
  );

  it.live('Close shuts the refused view', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([flaky()], { href: labOne(1, { code: 'follow' }) });
      yield* page.click('.lab-source-col [data-act="close-source"]');
      yield* countIs(page, '.lab-source', 0);
    }).pipe(Effect.scoped),
  );
});

describe('the code is read when the view opens', () => {
  it.live('selecting a cue cites its file:line from the small answer and reads no code', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(1, { cue: 'rise' }),
      });
      yield* textIs(page, '.lab-source-at', `scenes/one.ts:${RISE_LINE}`);
      expect(asked.filter((a) => a.path.endsWith('/code'))).toEqual([]);
      yield* page.click('.lab-source-at');
      yield* page.waitFor('.lab-source-col .lab-source-page');
      expect(asked.filter((a) => a.path.endsWith('/code')).length).toBeGreaterThan(0);
    }).pipe(Effect.scoped),
  );
});
