// The Source view in a browser over the probe film: closed at rest and reading
// nothing; opened by ⇧C (a step Back walks) or by `?code=follow`
// and `?code=<line>`; the cues lit in the code are the cues lit on the strip at
// every settled frame; the inspector's `file:line` opens it held on that line;
// and on a phone it is a face of the selection's sheet, or a sheet of its own.

import { Deferred, Effect, Exit, Option } from 'effect';
import { describe, expect, it, test } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { HeadUnavailable } from '../../../src/core/refusals.ts';
import {
  MENU_ITEMS,
  menuEntry,
  openCommandMenu,
  rightClick,
  touch as fingerDown,
} from '../../../src/lab/fixtures/gestures.ts';
import {
  PHONE,
  json,
  labAt,
  later,
  openLab,
  openServed,
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
  pressedLook,
  sheetsStand,
  textHas,
  textIs,
  valueIs,
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
/** The file's last line: the long comment, before the newline that ends the file. */
const LAST_LINE = LONG_LINE;
/** The draw's reads of each cue: the probe's draw reads both every frame, so each fires while its cue plays. */
const RISE_READ_LINE = lineOfText("f.at('rise')");
const FALL_READ_LINE = lineOfText("f.at('fall')");

/** Scene one's small source answer, as the server gives it: each cue and knob with the line that writes it. */
const sourceAnswer = () =>
  json({
    ...sourceOne,
    cues: sourceOne.cues.map((c, i) => ({ ...c, line: [RISE_LINE, FALL_LINE][i] ?? 0 })),
    knobs: sourceOne.knobs.map((k) => ({ ...k, line: SPOT_LINE })),
  });
const sourceRoute = route('GET', /^\/scenes\/one\/source$/, sourceAnswer);
/** Scene one's small source answer, landing once `gate` is done. */
const sourceLater = (gate: Deferred.Deferred<void>) =>
  route('GET', /^\/scenes\/one\/source$/, () => later(gate, sourceAnswer()));

/** Scene `one`'s cues in film seconds: where the probe film plays them. */
const one = probeFilm().placed[0];
const span = (name: string) => {
  const cue = one?.cues.get(name);
  const start = one?.start ?? 0;
  return { start: start + (cue?.start ?? 0), end: start + (cue?.end ?? 0) };
};
const middle = (name: string) => (span(name).start + span(name).end) / 2;
/** The film seconds in `#t=`. */
const HASH_T = `Number(location.hash.slice('#t='.length))`;
/** Half a frame into `s`: where a tap seeks for what starts at `s`, so the frame landed on plays it. */
const into = (s: number) => s + 0.5 / probeFilm().fps;

/** The names of the cue lanes lit on the strip. */
const LANES = `[...document.querySelectorAll('.lab-cue[data-live]')].map((e) => e.dataset.cue).sort()`;

/** What the code view paints as `name`: the highlight's ranges, read back as the text they cover. */
const painted = (name: string) =>
  `(() => [...(CSS.highlights.get('${name}') ?? [])].map((r) => r.toString()).sort())()`;
/** The names of the cue literals the code view paints as playing: what plays, the reads firing with them (`f.at(…)`) left out. */
const PAINTED = `${painted('lab-live')}.filter((r) => !r.startsWith('f.')).map((r) => r.split(':')[0])`;

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
/** The draw's read of `rise` in `LONG_TEXT`: what Follow shows while rise plays, as the frame reads it. */
const LONG_READ_LINE = lineIn(LONG_TEXT, "f.at('rise')");
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
const SPLIT_FALL_LINE = lineIn(SPLIT_TEXT, "fall: { mark: 'fall'");
/**
 * The timeline and the knobs at the top, and the draw that reads them a
 * screen below: before any cue Follow looks at the knob the frame read, at
 * the top, and a cue edge takes it down to the read that fires.
 */
const DRAW_AT = TEXT_LINES.findIndex((l) => l.includes('draw:'));
const READ_TEXT = [
  ...TEXT_LINES.slice(0, DRAW_AT),
  FILLER,
  ...TEXT_LINES.slice(DRAW_AT),
  FILLER,
].join('\n');
const readRoute = route('GET', /^\/scenes\/one\/code$/, () => json(codeOf(READ_TEXT)));
const READ_SPOT_LINE = lineIn(READ_TEXT, 'spot: [320, 200]');
const READ_RISE_LINE = lineIn(READ_TEXT, "f.at('rise')");
/** Whether line `n` of the code in the selection's sheet shows inside the box that scrolls it. */
const inSheet = (n: number) => `(() => {
  const row = document.querySelector('.lab-selection-sheet .lab-source-line[data-line="${n}"]');
  const box = document.querySelector('.lab-selection-sheet .lab-source-scroll').getBoundingClientRect();
  const r = row.getBoundingClientRect();
  return r.top >= box.top && r.bottom <= box.bottom && r.bottom <= window.innerHeight;
})()`;
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
    'a frame inside rise lights rise’s literal, names it in the band over the code and meters its line',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([codeRoute], {
          href: labOne(middle('rise'), { code: 'follow' }),
        });
        yield* page.waitFor('.lab-source-col .lab-source-page');
        yield* textIs(page, '.lab-source-beat .lab-source-live', 'rise');
        yield* evaluates(page, PAINTED, ['rise']);
        yield* attributeIs(page, '.lab-source-meter', 'data-cue', 'rise');
        // The meter runs under the line's text, never its number: from where the text starts, as far along it as
        // the cue is done.
        yield* evaluates(
          page,
          `(() => {
            const row = document.querySelector('.lab-source-col .lab-source-line[data-line="${RISE_LINE}"]');
            const meter = row.querySelector('.lab-source-meter');
            const text = row.querySelector('.lab-source-t');
            const box = text.getBoundingClientRect();
            const from = box.left + parseFloat(getComputedStyle(text).paddingLeft);
            const to = box.right - parseFloat(getComputedStyle(text).paddingRight);
            const done = Number(meter.style.getPropertyValue('--done'));
            const drawn = meter.getBoundingClientRect();
            return done > 0 && Math.abs(drawn.left - from) < 1 && Math.abs(drawn.width - done * (to - from)) < 1;
          })()`,
          true,
        );
      }).pipe(Effect.scoped),
  );

  it.live(
    'a timeline the lab cannot locate says why in the band, where the strip lights a cue the code cannot',
    () =>
      Effect.gen(function* () {
        const reason = 'it is `make()`, not an object literal';
        const computed = route('GET', /^\/scenes\/one\/code$/, () =>
          json({ ...CODE, cues: [], refused: [{ field: 'timeline', reason }] }),
        );
        const { page } = yield* openLab([computed], {
          href: labOne(middle('rise'), { code: 'follow' }),
        });
        yield* page.waitFor('.lab-source-col .lab-source-page');
        yield* evaluates(page, LANES, ['rise']);
        yield* textIs(page, '.lab-source-beat .lab-source-live', `timeline not lit: ${reason}`);
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

  it.live('a line past the file’s end holds its last line, and the note cites that one', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(1, { code: '999' }),
        mode: 'note',
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      // The file ends in a newline, which ends its last line and opens none.
      yield* attributeIs(page, '.lab-source-held', 'data-line', String(LAST_LINE));
      yield* page.press('n');
      yield* textIs(
        page,
        '[data-role="note-scope"] .lab-scope-text',
        `one · scenes/one.ts:${LAST_LINE}`,
      );
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
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(1, { cue: 'rise' }),
        viewport: PHONE,
      });
      yield* page.waitFor('.lab-selection-sheet');
      yield* countIs(page, '.lab-source-col', 0);
      yield* page.click('.lab-selection-sheet [data-act="sheet"]');
      yield* page.click('.lab-selection-sheet [data-face="source"]');
      yield* page.waitFor('.lab-selection-sheet .lab-source-page');
      yield* evaluates(page, `new URLSearchParams(location.search).get('code')`, `${RISE_LINE}`);
      // The pressed face wears the kit's pressed segment (`.sh-seg`): the raised surface, the brightest ink.
      yield* evaluates(
        page,
        `(() => {
          const tab = getComputedStyle(document.querySelector('.lab-selection-sheet [data-face="source"]'));
          const kit = document.createElement('i');
          kit.style.background = 'var(--surface-3)';
          kit.style.color = 'var(--text-1)';
          document.body.append(kit);
          const want = getComputedStyle(kit);
          const same = tab.backgroundColor === want.backgroundColor && tab.color === want.color;
          kit.remove();
          return same;
        })()`,
        true,
      );
      yield* page.click('.lab-selection-sheet [data-face="inspect"]');
      yield* countIs(page, '.lab-selection-sheet .lab-source', 0);
    }).pipe(Effect.scoped),
  );

  it.live(
    'a number typed and not yet sent is written once when Source is pressed, and Inspect shows it',
    () =>
      Effect.gen(function* () {
        const { page, asked, errors } = yield* openLab([codeRoute, sourceRoute], {
          href: labOne(1, { cue: 'rise' }),
          viewport: PHONE,
        });
        yield* page.waitFor('.lab-selection-sheet');
        yield* page.click('.lab-selection-sheet [data-act="sheet"]');
        const dur = '.lab-selection-sheet input[data-field="dur"]';
        yield* page.waitFor(`${dur}:not([disabled])`);
        yield* valueIs(page, dur, '0.6');
        // Typed, no Enter: the press on Source leaves the inspector, and the field's blur writes it.
        yield* page.fill(dur, '0.9');
        yield* page.click('.lab-selection-sheet [data-face="source"]');
        yield* page.waitFor('.lab-selection-sheet .lab-source-page');
        yield* page.click('.lab-selection-sheet [data-face="inspect"]');
        yield* page.waitFor(`${dur}:not([disabled])`);
        yield* valueIs(page, dur, '0.9');
        const writes = asked
          .filter((a) => a.method === 'POST')
          .map((a) => ({ path: a.path, body: a.body }));
        expect(writes).toEqual([
          { path: '/scenes/one/cues/rise', body: Option.some({ dur: 0.9 }) },
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live(
    'a press on Source from the sheet’s Close keeps focus in the sheet, so Tab moves in it and the cue stays',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab([codeRoute, sourceRoute], {
          href: labOne(1, { cue: 'rise' }),
          viewport: PHONE,
        });
        yield* page.waitFor('.lab-selection-sheet');
        yield* page.click('.lab-selection-sheet [data-act="sheet"]');
        const inSheet = "document.activeElement.closest('.lab-selection-sheet') !== null";
        yield* page.focus('.lab-selection-sheet [data-act="close-inspector"]');
        // A press on chrome inside the sheet moves focus to the sheet, as the platform does, never off it.
        yield* page.click('.lab-selection-sheet [data-face="source"]');
        yield* page.waitFor('.lab-selection-sheet .lab-source-page');
        yield* evaluates(page, inSheet, true);
        // Tab is the sheet's (it moves through its controls), not the Lab's "next cue".
        yield* page.press('Tab');
        yield* evaluates(page, "document.activeElement.matches('[role=dialog]')", false);
        yield* evaluates(page, inSheet, true);
        yield* evaluates(page, "new URLSearchParams(location.search).get('cue')", 'rise');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
  );

  it.live('opened from a selected cue with nothing playing, it shows the cue’s literal', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([splitRoute, sourceRoute], {
        href: labOne(0.05, { cue: 'fall' }),
        viewport: { ...PHONE, coarse: true },
      });
      yield* page.waitFor('.lab-selection-sheet');
      yield* page.click('.lab-selection-sheet [data-act="sheet"]');
      yield* page.click('.lab-selection-sheet [data-face="source"]');
      yield* page.waitFor('.lab-selection-sheet .lab-source-page');
      // The frame read a knob a screen down the file; the selection's literal is at its top, and it is shown.
      yield* evaluates(page, inSheet(SPLIT_FALL_LINE), true);
      yield* evaluates(page, inSheet(SPLIT_SPOT_LINE), false);
    }).pipe(Effect.scoped),
  );

  for (const heard of ['heard', 'still on its way'] as const) {
    it.live(
      `a reader’s scroll before the selection’s line is known keeps the view where the hand put it, its event ${heard}`,
      () =>
        Effect.gen(function* () {
          // The code read answers first and writes no `fall` (as a spread timeline lists none); the reader scrolls;
          // only then does the small read name `fall`'s line. The hand has the view: it stays following, unsettled.
          // A busy page may tell the view of the scroll only after the answer lands (the page's clock runs its
          // animation frames, not the browser's drawing): the scroll is the hand's all the same.
          const gate = yield* Deferred.make<void>();
          const noFall = route('GET', /^\/scenes\/one\/code$/, () =>
            json({
              ...codeOf(LONG_TEXT),
              cues: codeOf(LONG_TEXT).cues.filter((c) => c.name !== 'fall'),
            }),
          );
          const { page } = yield* openLab([noFall, sourceLater(gate)], {
            href: labOne(middle('rise'), { cue: 'fall' }),
            viewport: PHONE,
          });
          yield* page.waitFor('.lab-selection-sheet');
          yield* page.click('.lab-selection-sheet [data-act="sheet"]');
          yield* page.click('.lab-selection-sheet [data-face="source"]');
          yield* page.waitFor('.lab-selection-sheet .lab-source-page');
          yield* evaluates(page, `new URLSearchParams(location.search).get('code')`, 'follow');
          const box = `(() => { let up = document.querySelector('.lab-selection-sheet .lab-source-page').parentElement; while (up && !['auto', 'scroll'].includes(getComputedStyle(up).overflowY)) up = up.parentElement; return up; })()`;
          // Follow placed the playing line, a screen down the file; the reader scrolls back to the top.
          yield* page.until(`${box}.scrollTop > 0`);
          if (heard === 'still on its way')
            // The box's scroll events go unheard until the answer has landed.
            yield* page.evaluate(
              `(() => { const box = ${box}; const hold = (event) => { if (event.target === box) event.stopImmediatePropagation(); }; window.addEventListener('scroll', hold, { capture: true }); window.__hear = () => window.removeEventListener('scroll', hold, { capture: true }); })()`,
            );
          yield* page.evaluate(`${box}.scrollTop = 0`);
          yield* page.evaluate(FRAMES);
          const landed = yield* page.nextAnswer((a) => a.url.endsWith('/scenes/one/source'));
          yield* Deferred.done(gate, Exit.void);
          yield* landed;
          yield* page.evaluate(FRAMES);
          yield* page.evaluate(FRAMES);
          if (heard === 'still on its way') yield* page.evaluate('window.__hear()');
          // The answer has landed and the page has run on: a settle would have written its line by now.
          yield* evaluates(page, `new URLSearchParams(location.search).get('code')`, 'follow');
          yield* evaluates(page, `${box}.scrollTop`, 0);
        }).pipe(Effect.scoped),
    );
  }

  it.live(
    'handed from the selection’s face to its own sheet (Edit to Note), a reader’s scroll still on its way before the line is known keeps the view where the hand put it',
    () =>
      Effect.gen(function* () {
        // As above, the reader's scroll in the view the face handed over to: the text the own sheet mounts as the
        // face's goes (both read the mode), so the view asked whether a hand has it is the one shown.
        const gate = yield* Deferred.make<void>();
        const noFall = route('GET', /^\/scenes\/one\/code$/, () =>
          json({
            ...codeOf(LONG_TEXT),
            cues: codeOf(LONG_TEXT).cues.filter((c) => c.name !== 'fall'),
          }),
        );
        const { page } = yield* openLab([noFall, sourceLater(gate)], {
          href: labOne(middle('rise'), { cue: 'fall' }),
          viewport: PHONE,
        });
        yield* page.waitFor('.lab-selection-sheet');
        yield* page.click('.lab-selection-sheet [data-act="sheet"]');
        yield* page.click('.lab-selection-sheet [data-face="source"]');
        yield* page.waitFor('.lab-selection-sheet .lab-source-page');
        yield* evaluates(page, `new URLSearchParams(location.search).get('code')`, 'follow');
        // The sheet lowers to its peek to reach the mode tray, as a hand would.
        yield* page.click('.lab-selection-sheet [data-act="sheet"]');
        yield* page.click('.lab-modes [data-mode-pick="note"]');
        yield* page.waitFor('.lab-source-sheet .lab-source-page');
        yield* countIs(page, '.lab-source-page', 1);
        const box = `(() => { let up = document.querySelector('.lab-source-sheet .lab-source-page').parentElement; while (up && !['auto', 'scroll'].includes(getComputedStyle(up).overflowY)) up = up.parentElement; return up; })()`;
        // Follow placed the playing line, a screen down the file; the reader scrolls back to the top, its scroll
        // event held until the answer has landed.
        yield* page.until(`${box}.scrollTop > 0`);
        yield* page.evaluate(
          `(() => { const box = ${box}; const hold = (event) => { if (event.target === box) event.stopImmediatePropagation(); }; window.addEventListener('scroll', hold, { capture: true }); window.__hear = () => window.removeEventListener('scroll', hold, { capture: true }); })()`,
        );
        yield* page.evaluate(`${box}.scrollTop = 0`);
        yield* page.evaluate(FRAMES);
        const landed = yield* page.nextAnswer((a) => a.url.endsWith('/scenes/one/source'));
        yield* Deferred.done(gate, Exit.void);
        yield* landed;
        yield* page.evaluate(FRAMES);
        yield* page.evaluate(FRAMES);
        yield* page.evaluate('window.__hear()');
        // The answer has landed and the page has run on: a settle would have written its line by now.
        yield* evaluates(page, `new URLSearchParams(location.search).get('code')`, 'follow');
        yield* evaluates(page, `${box}.scrollTop`, 0);
      }).pipe(Effect.scoped),
  );

  it.live(
    'opened before the selection’s line is known, it holds that line once a read answers',
    () =>
      Effect.gen(function* () {
        // The small source read is still out at the tap: the face follows, then holds `fall`'s line once the code
        // read names it, the follow it wrote rewritten rather than a step of its own.
        const gate = yield* Deferred.make<void>();
        const { page } = yield* openLab([codeRoute, sourceLater(gate)], {
          href: labOne(middle('rise'), { cue: 'fall' }),
          viewport: PHONE,
        });
        yield* page.waitFor('.lab-selection-sheet');
        yield* page.click('.lab-selection-sheet [data-act="sheet"]');
        yield* page.click('.lab-selection-sheet [data-face="source"]');
        yield* page.waitFor('.lab-selection-sheet .lab-source-page');
        yield* evaluates(page, `new URLSearchParams(location.search).get('code')`, `${FALL_LINE}`);
        yield* attributeIs(
          page,
          '.lab-selection-sheet .lab-source-held',
          'data-line',
          `${FALL_LINE}`,
        );
        yield* Deferred.done(gate, Exit.void);
        yield* page.back;
        yield* evaluates(page, `new URLSearchParams(location.search).has('code')`, false);
      }).pipe(Effect.scoped),
  );

  it.live('opened from a selected cue while another plays, it holds the selection’s line', () =>
    Effect.gen(function* () {
      // `rise` plays at its middle; `fall` is selected: the face is the selection's, as its `file:line` door is.
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(middle('rise'), { cue: 'fall' }),
        viewport: PHONE,
      });
      yield* page.waitFor('.lab-selection-sheet');
      yield* page.click('.lab-selection-sheet [data-act="sheet"]');
      yield* page.click('.lab-selection-sheet [data-face="source"]');
      yield* page.waitFor('.lab-selection-sheet .lab-source-page');
      yield* evaluates(page, `new URLSearchParams(location.search).get('code')`, `${FALL_LINE}`);
      yield* attributeIs(
        page,
        '.lab-selection-sheet .lab-source-held',
        'data-line',
        `${FALL_LINE}`,
      );
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
      const lit = `JSON.stringify([${painted('lab-live')}, ${painted('lab-knob-read')}, ${painted('lab-picked')}].map((r) => r.length > 0))`;
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

  it.live(
    '?code=follow at a frame inside rise shows the line that reads it, and Follow is pressed',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([longRoute], {
          href: labOne(middle('rise'), { code: 'follow' }),
          viewport: touch,
        });
        yield* page.waitFor('.lab-source-sheet .lab-source-page');
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
        yield* evaluates(page, showing(LONG_READ_LINE), true);
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

  it.live('a reader who scrolls away from the held line keeps the box through a resize', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([longRoute], {
        href: labOne(1, { code: `${LONG_RISE_LINE}` }),
        viewport: touch,
      });
      yield* page.waitFor('.lab-source-sheet .lab-source-page');
      yield* evaluates(page, showing(LONG_RISE_LINE), true);
      yield* page.evaluate(`${BOX}.scrollTop = 0`);
      yield* page.evaluate(FRAMES);
      // The sheet lowered: the box resizes, and the reader's place stands.
      yield* page.resize(390, 600);
      yield* page.evaluate(FRAMES);
      yield* page.evaluate(FRAMES);
      yield* evaluates(page, `${BOX}.scrollTop`, 0);
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
        yield* evaluates(page, showing(LONG_READ_LINE), true);
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
      yield* evaluates(page, showing(LONG_READ_LINE), true);
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
        yield* evaluates(page, showing(LONG_READ_LINE), true);
        yield* page.evaluate(
          `(() => { const box = document.querySelector('.lab-source-sheet .lab-source-scroll'); box.scrollTop = 0; })()`,
        );
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'false');
        yield* page.click(FOLLOW_SHEET);
        yield* attributeIs(page, FOLLOW_SHEET, 'aria-pressed', 'true');
        yield* evaluates(page, showing(LONG_READ_LINE), true);
      }).pipe(Effect.scoped),
  );
});

describe('a line of the code', () => {
  it.live('a tap holds it, selects the cue written there and seeks to where it plays', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(1, { code: 'follow' }),
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* page.click(`.lab-source-line[data-line="${FALL_LINE}"]`);
      yield* attributeIs(page, '.lab-source-held', 'data-line', String(FALL_LINE));
      yield* evaluates(page, `location.search.includes('cue=fall')`, true);
      yield* evaluates(page, `location.search.includes('code=${FALL_LINE}')`, true);
      yield* evaluates(page, `Math.abs(${HASH_T} - ${into(span('fall').start)}) < 0.002`, true);
    }).pipe(Effect.scoped),
  );

  it.live('a tap on a read seeks to where it next fires, as one step Back walks', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(0.05, { code: 'follow' }),
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* page.click(`.lab-source-line[data-line="${RISE_READ_LINE}"]`);
      yield* attributeIs(page, '.lab-source-held', 'data-line', String(RISE_READ_LINE));
      // The read writes no cue: nothing is selected, and the frame is rise's first.
      yield* evaluates(page, `location.search.includes('cue=')`, false);
      yield* evaluates(page, `Math.abs(${HASH_T} - ${into(span('rise').start)}) < 0.002`, true);
      yield* page.back;
      yield* evaluates(page, `location.search.includes('code=follow')`, true);
      yield* evaluates(page, `Math.abs(${HASH_T} - 0.05) < 0.002`, true);
      yield* countIs(page, '.lab-source-held', 0);
    }).pipe(Effect.scoped),
  );

  it.live('a tap on a line that writes nothing holds it, leaves the selection and the frame', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute, sourceRoute], {
        href: labOne(1, { code: 'follow' }),
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* page.click('.lab-source-line[data-line="1"]');
      yield* attributeIs(page, '.lab-source-held', 'data-line', '1');
      yield* evaluates(page, `location.search.includes('cue=')`, false);
      yield* evaluates(page, `Math.abs(${HASH_T} - 1) < 0.002`, true);
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
      // The row the menu is on is marked under it, as the kit's rows are.
      yield* evaluates(
        page,
        `(() => {
          const probe = document.createElement('i');
          probe.style.background = 'var(--surface-3)';
          document.body.append(probe);
          const raised = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return getComputedStyle(document.querySelector('.lab-source-line[data-line="${RISE_LINE}"]')).backgroundColor === raised;
        })()`,
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

describe('a line of the code in a phone sheet, served', () => {
  /** Each phone sheet that shows the code: its own (nothing selected), and the selection's Source face. */
  const SHEETS = [
    { name: 'the Source sheet', sheet: '.lab-source-sheet', picked: {} },
    {
      name: 'the selection sheet’s Source face',
      sheet: '.lab-selection-sheet',
      picked: { cue: 'rise' },
    },
  ] as const;
  const NO_MENU = `document.querySelector('[data-role="context-menu"]') === null`;

  // Serial, each case here: a finger's touches (`film/touches-serial`).
  for (const { name, sheet, picked } of SHEETS) {
    const line = `${sheet} .lab-source-line[data-line="${RISE_LINE}"]`;
    test.serial(
      `in ${name}, a touch held still on a line opens its menu: Note this line, Copy link`,
      () =>
        Effect.gen(function* () {
          const { page } = yield* openServed('lab', [codeRoute, sourceRoute], {
            href: labOne(1, { ...picked, code: 'follow' }),
            viewport: PHONE,
          });
          yield* page.waitFor(line);
          // The finger lands on the sheet where it rests, not on one still scrolling in.
          yield* sheetsStand(page);
          yield* page.clock.hold;
          yield* fingerDown(page, line, 0);
          yield* page.clock.runFor(700);
          yield* page.waitFor('[data-role="context-menu"] [data-command="link.copy"]');
          yield* evaluates(page, `${MENU_ITEMS}.includes('notes.line')`, true);
          yield* page.finger.up;
        }).pipe(Effect.scoped, Effect.runPromise),
    );

    test.serial(`in ${name}, a right-click on a line opens its menu, not the browser's`, () =>
      Effect.gen(function* () {
        const { page } = yield* openServed('lab', [codeRoute, sourceRoute], {
          href: labOne(1, { ...picked, code: 'follow' }),
          viewport: PHONE,
        });
        yield* page.waitFor(line);
        expect(yield* rightClick(page, line)).toBe(false);
        yield* page.waitFor('[data-role="context-menu"] [data-command="link.copy"]');
      }).pipe(Effect.scoped, Effect.runPromise),
    );
  }

  test.serial("a field in a sheet keeps the browser's own menu, and opens none of ours", () =>
    Effect.gen(function* () {
      const { page } = yield* openServed('lab', [sourceRoute], {
        href: labAt(1, { selection: { _tag: 'Knob', scene: 'one', name: 'size' } }),
        viewport: PHONE,
      });
      const field = '.lab-selection-sheet .lab-knob[data-knob="size"] input';
      // The sheet raised whole: its knob's field in sight.
      yield* page.waitFor('.lab-selection-sheet [data-act="sheet"]');
      yield* page.click('.lab-selection-sheet [data-act="sheet"]');
      yield* page.waitFor(field);
      expect(yield* rightClick(page, field)).toBe(true);
      yield* page.clock.runFor(100);
      yield* evaluates(page, NO_MENU, true);
    }).pipe(Effect.scoped, Effect.runPromise),
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
      // Pressed, it wears the kit's one pressed look, as Scenes' Follow does.
      yield* evaluates(page, pressedLook(FOLLOW_BUTTON), true);
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
    'a command key (the next cue edge) with the code focused scrolls it to the read that fires, and Follow stays pressed',
    () =>
      Effect.gen(function* () {
        // The column, not a phone's sheet: a sheet is a dialog, whose focus takes its own keys
        // (`command/context.ts` focusOf), so `.` seeks only with the column's code focused.
        const COL_BOX = `document.querySelector('.lab-source-col .lab-source-scroll')`;
        const inBox = (n: number) =>
          `(() => { const r = document.querySelector('.lab-source-col .lab-source-line[data-line="${n}"]').getBoundingClientRect(); const b = ${COL_BOX}.getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom; })()`;
        const { page } = yield* openLab([readRoute], {
          href: labOne(0.05, { code: 'follow' }),
          viewport: short,
        });
        yield* page.waitFor('.lab-source-col .lab-source-page');
        yield* attributeIs(page, FOLLOW_BUTTON, 'aria-pressed', 'true');
        // Before any cue the view follows the knob the frame read, written at the top.
        yield* evaluates(page, inBox(READ_SPOT_LINE), true);
        yield* evaluates(page, inBox(READ_RISE_LINE), false);
        yield* page.evaluate(`window.__before = ${COL_BOX}.scrollTop`);
        yield* page.focus('.lab-source-col .lab-source-page');
        yield* page.press('.');
        // The edge plays a cue the draw reads a screen down: the view scrolled there itself.
        yield* evaluates(
          page,
          `Math.abs(Number(location.hash.slice('#t='.length)) - ${span('rise').start}) < 0.02`,
          true,
        );
        yield* evaluates(page, inBox(READ_RISE_LINE), true);
        yield* evaluates(page, `${COL_BOX}.scrollTop > window.__before`, true);
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
  it.live('one placement asks the line for its place once', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(span('rise').start + 0.02, { code: 'follow' }),
        viewport: short,
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* page.evaluate(
        `window.__reads = 0; const rect = Element.prototype.getBoundingClientRect; Element.prototype.getBoundingClientRect = function (...r) { if (this.classList.contains('lab-source-line')) window.__reads += 1; return rect.apply(this, r); };`,
      );
      // Two frames for any resize still on its way to land, then the count starts: it covers one placement only.
      const frames = `new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))`;
      yield* page.evaluate(frames);
      yield* page.evaluate(`window.__reads = 0`);
      // The content grows a pixel: a resize, so the view measures its target again, once.
      yield* page.evaluate(
        `(() => { const p = document.querySelector('.lab-source-col .lab-source-page'); p.style.minHeight = (p.getBoundingClientRect().height + 1) + 'px'; })()`,
      );
      yield* evaluates(page, `window.__reads`, 1);
      yield* page.evaluate(frames);
      yield* evaluates(page, `window.__reads`, 1);
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

  it.live('the knobs the frame read are marked as read, and never in the ink of what plays', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(middle('rise'), { code: 'follow' }),
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* evaluates(page, painted('lab-knob-read'), ["f.knob('spot')", 'spot: [320, 200]']);
      // What plays is rise's literal and its read, firing: the knob read on every frame is not among them.
      yield* evaluates(page, painted('lab-live'), [
        "f.at('rise')",
        "rise: { mark: 'rise', dur: 0.6 }",
      ]);
    }).pipe(Effect.scoped),
  );
});

/** How brightly line `n` of the column's code glows, to a tenth: 0 when nothing fires on it or has just fired. */
const glow = (n: number) =>
  `(() => { const row = document.querySelector('.lab-source-col .lab-source-line[data-line="${n}"]'); return Math.round(Number(row.style.getPropertyValue('--glow') || 0) * 10) / 10; })()`;
/** How strongly line `n`'s edge, at the row's left, is drawn, to a tenth: as its glow. */
const edge = (n: number) =>
  `(() => { const row = document.querySelector('.lab-source-col .lab-source-line[data-line="${n}"]'); return Math.round(Number(getComputedStyle(row, '::before').opacity) * 10) / 10; })()`;

describe('the reads that fire, and the beat they are on', () => {
  /** The reads of the clock lit as firing: what plays, the cues' literals left out. */
  const FIRING = `${painted('lab-live')}.filter((r) => r.startsWith('f.at('))`;

  const frames = [
    ['while rise plays, its read fires and glows', middle('rise'), 1, ["f.at('rise')"]],
    ['a moment after rise ends, its line still glows, fading', span('rise').end + 0.3, 0.5, []],
    ['past the trail, its line is dark again', span('rise').end + 0.7, 0, []],
  ] as const;
  for (const [name, T, rise, firing] of frames)
    it.live(name, () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([codeRoute], { href: labOne(T, { code: 'follow' }) });
        yield* page.waitFor('.lab-source-col .lab-source-page');
        yield* evaluates(page, glow(RISE_READ_LINE), rise);
        // Its edge at the row's left fades with it, so a trail reads down one column.
        yield* evaluates(page, edge(RISE_READ_LINE), rise);
        // Fall has not begun: its read neither fires nor glows.
        yield* evaluates(page, glow(FALL_READ_LINE), 0);
        yield* evaluates(page, edge(FALL_READ_LINE), 0);
        yield* evaluates(page, FIRING, firing);
      }).pipe(Effect.scoped),
    );

  it.live('a read the frame did not make stays dark while its cue plays', () =>
    Effect.gen(function* () {
      // Scene three's draw reads its knobs and never its cue: the cue's literal lights by the clock, and a
      // read of it the frame never made neither fires nor glows.
      const text = [
        'export const shot = drawing({',
        "  timeline: { push: { mark: 'near', until: 'held' } },",
        '  draw: (f) => {',
        "    const lean = f.at('push');",
        '  },',
        '});',
        '',
      ].join('\n');
      const at = (needle: string): readonly [number, number] => {
        const from = text.indexOf(needle);
        return [from, from + needle.length];
      };
      const three = route('GET', /^\/scenes\/three\/code$/, () =>
        json({
          scene: 'three',
          file: 'scenes/three.ts',
          text,
          cues: [
            {
              name: 'push',
              at: at("push: { mark: 'near', until: 'held' }"),
              reads: [at("f.at('push')")],
            },
          ],
          knobs: [],
          marks: [],
          refused: [],
        }),
      );
      const push = probeFilm().placed[2]?.cues.get('push');
      const t = ((push?.start ?? 0) + (push?.end ?? 0)) / 2;
      const { page } = yield* openLab([three], {
        href: pageHref.labScene(PROBE, 'three', { code: 'follow' }, Option.some(t)),
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      // What plays is the literal alone: the read the frame never made is not lit with it.
      yield* evaluates(page, painted('lab-live'), ["push: { mark: 'near', until: 'held' }"]);
      yield* evaluates(page, glow(text.split('\n').findIndex((l) => l.includes('f.at(')) + 1), 0);
      yield* textIs(page, '.lab-source-col [data-role="beat"]', 'three · {near}');
    }).pipe(Effect.scoped),
  );

  const beats = [
    ['before its first mark, the band names the scene alone', 0.05, 'one'],
    ['once its voice says a mark, the band names the mark too', middle('rise'), 'one · {rise}'],
    ['the mark it names is the last one said', middle('fall'), 'one · {fall}'],
  ] as const;
  for (const [name, T, words] of beats)
    it.live(name, () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([codeRoute], { href: labOne(T, { code: 'follow' }) });
        yield* page.waitFor('.lab-source-col .lab-source-page');
        yield* textIs(page, '.lab-source-col [data-role="beat"]', words);
      }).pipe(Effect.scoped),
    );
});

/** The code in Code mode: the column `?code=live` opens. */
const LIVE_COL = '.lab-source-col[data-code="live"]';
/**
 * A lab opened in Code mode is ready once its code stands (`openLab`'s
 * `ready`): the panel the harness waits on otherwise is set aside, and the
 * column stands only on a staged film.
 */
const LIVE_READY = `${LIVE_COL} .lab-source-page`;
/** The head's Code mode toggle. */
const CODE_MODE = '.lab-source-col [data-act="code-mode"]';
/** Whether the panel (the modes and their tools) shows. */
const PANEL_SHOWN = `document.querySelector('.lab-panel').checkVisibility()`;
/** Whether the strip shows its cue lanes, or has folded to its words. */
const LANES_SHOWN = `[...document.querySelectorAll('.lab-strip-row')].some((r) => r.checkVisibility())`;
/** How the view is open, as `?code=` says it. */
const CODE_KEY = `new URLSearchParams(location.search).get('code')`;

describe('Code mode', () => {
  it.live('?code=live gives the code the picture’s other half, the panel set aside', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(middle('rise'), { code: 'live' }),
        ready: LIVE_READY,
      });
      yield* evaluates(page, PANEL_SHOWN, false);
      yield* evaluates(
        page,
        `Math.abs(document.querySelector('.lab-source-col').getBoundingClientRect().width - document.querySelector('.stage').getBoundingClientRect().width) <= 1`,
        true,
      );
      // The strip keeps Edit's lanes, the one playing lit under the picture beside the code: the picture's half has
      // the room (a phone's strip folds to its words).
      yield* evaluates(page, `${LANES_SHOWN} && ${LANES}.join() === 'rise'`, true);
      yield* attributeIs(page, CODE_MODE, 'aria-pressed', 'true');
      // It follows the frame, and lights what Follow lights.
      yield* attributeIs(
        page,
        '.lab-source-col [data-act="follow-source"]',
        'aria-pressed',
        'true',
      );
      yield* evaluates(page, PAINTED, ['rise']);
      yield* evaluates(page, glow(RISE_READ_LINE), 1);
    }).pipe(Effect.scoped),
  );

  it.live(
    'Code mode in the head enters it as a step Back walks, and pressed again leaves to following',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([codeRoute], { href: labOne(1, { code: 'follow' }) });
        yield* page.waitFor('.lab-source-col .lab-source-page');
        yield* attributeIs(page, CODE_MODE, 'aria-pressed', 'false');
        yield* page.click(CODE_MODE);
        yield* evaluates(page, CODE_KEY, 'live');
        yield* attributeIs(page, CODE_MODE, 'aria-pressed', 'true');
        yield* evaluates(page, PANEL_SHOWN, false);
        yield* page.back;
        yield* evaluates(page, CODE_KEY, 'follow');
        yield* evaluates(page, PANEL_SHOWN, true);
        yield* page.forward;
        yield* attributeIs(page, CODE_MODE, 'aria-pressed', 'true');
        yield* page.click(CODE_MODE);
        yield* evaluates(page, CODE_KEY, 'follow');
        yield* evaluates(page, PANEL_SHOWN, true);
      }).pipe(Effect.scoped),
  );

  it.live('⌘K’s Code mode opens it from a shut view, and Leave code mode leaves to following', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], { href: labOne(1) });
      yield* openCommandMenu(page, 'code mode');
      yield* page.click(menuEntry('lab.source.live'));
      yield* page.waitFor(LIVE_READY);
      yield* evaluates(page, CODE_KEY, 'live');
      yield* openCommandMenu(page, 'code mode');
      yield* textHas(page, menuEntry('lab.source.live'), 'Leave code mode');
      yield* page.click(menuEntry('lab.source.live'));
      yield* evaluates(page, CODE_KEY, 'follow');
      yield* evaluates(page, PANEL_SHOWN, true);
    }).pipe(Effect.scoped),
  );

  it.live(
    'a tap on a playing literal seeks to its cue’s start, holding and selecting nothing',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([codeRoute, sourceRoute], {
          href: labOne(middle('rise'), { code: 'live' }),
          ready: LIVE_READY,
        });
        yield* page.click(`.lab-source-line[data-line="${RISE_LINE}"]`);
        yield* evaluates(page, `Math.abs(${HASH_T} - ${into(span('rise').start)}) < 0.002`, true);
        yield* countIs(page, '.lab-source-held', 0);
        yield* evaluates(page, 'location.search', '?code=live');
      }).pipe(Effect.scoped),
  );

  it.live(
    'a line still glowing after its read seeks to where it fired; a dark line, a cue not playing among them, stays still',
    () =>
      Effect.gen(function* () {
        const T = span('rise').end + 0.3;
        const { page } = yield* openLab([codeRoute, sourceRoute], {
          href: labOne(T, { code: 'live' }),
          ready: LIVE_READY,
        });
        // The pointer says which lines answer: the glowing one, and neither the dark one nor the cue not playing.
        const cursorOf = (line: number) =>
          `getComputedStyle(document.querySelector('.lab-source-line[data-line="${line}"]')).cursor`;
        yield* evaluates(
          page,
          `[${cursorOf(1)}, ${cursorOf(FALL_LINE)}, ${cursorOf(RISE_READ_LINE)}].join()`,
          'default,default,pointer',
        );
        yield* attributeIs(
          page,
          `.lab-source-line[data-line="${RISE_READ_LINE}"]`,
          'data-lit',
          'true',
        );
        yield* page.click('.lab-source-line[data-line="1"]');
        yield* page.click(`.lab-source-line[data-line="${FALL_LINE}"]`);
        yield* page.evaluate(FRAMES);
        yield* evaluates(page, `Math.abs(${HASH_T} - ${T}) < 0.002`, true);
        yield* page.click(`.lab-source-line[data-line="${RISE_READ_LINE}"]`);
        yield* evaluates(page, `Math.abs(${HASH_T} - ${into(span('rise').start)}) < 0.002`, true);
        yield* countIs(page, '.lab-source-held', 0);
        yield* evaluates(page, 'location.search', '?code=live');
      }).pipe(Effect.scoped),
  );

  it.live('a line’s menu still opens, and Note this line leaves Code mode to note it', () =>
    Effect.gen(function* () {
      // Noting from the Note mode, as the owner would: Code mode entered from it, and left by the note.
      const { page } = yield* openLab([codeRoute], {
        href: labOne(1, { code: 'follow' }),
        mode: 'note',
      });
      yield* page.waitFor('.lab-source-col .lab-source-page');
      yield* page.click(CODE_MODE);
      yield* page.waitFor(LIVE_READY);
      yield* rightClick(page, `.lab-source-line[data-line="${RISE_LINE}"]`);
      yield* evaluates(
        page,
        `${MENU_ITEMS}.includes('notes.line') && ${MENU_ITEMS}.includes('link.copy')`,
        true,
      );
      yield* page.click('[data-role="context-menu"] [data-command="notes.line"]');
      yield* evaluates(page, CODE_KEY, `${RISE_LINE}`);
      yield* textIs(
        page,
        '[data-role="note-scope"] .lab-scope-text',
        `one · scenes/one.ts:${RISE_LINE}`,
      );
    }).pipe(Effect.scoped),
  );

  it.live('a note begun leaves Code mode for the panel it is written in, as a step', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], {
        href: labOne(1, { code: 'live' }),
        ready: LIVE_READY,
      });
      yield* page.press('n');
      yield* evaluates(page, CODE_KEY, 'follow');
      yield* evaluates(page, PANEL_SHOWN, true);
      yield* attributeIs(page, '.lab-panel', 'data-mode', 'note');
      yield* evaluates(page, `document.querySelector('.lab-compose').checkVisibility()`, true);
      yield* page.back;
      yield* evaluates(page, CODE_KEY, 'live');
    }).pipe(Effect.scoped),
  );
});

describe('Code mode on a phone', () => {
  const touch = { ...PHONE, coarse: true };

  it.live(
    'the code takes the screen under the picture and over the dock, in no sheet; it fits the window and a finger',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([codeRoute], {
          href: labOne(middle('rise'), { code: 'live' }),
          viewport: touch,
          ready: LIVE_READY,
        });
        yield* countIs(page, '.lab-source-sheet', 0);
        yield* evaluates(page, PANEL_SHOWN, false);
        yield* evaluates(
          page,
          `(() => {
            const col = document.querySelector('.lab-source-col').getBoundingClientRect();
            const dock = document.querySelector('.bar > .row').getBoundingClientRect();
            return col.top >= document.querySelector('.stage').getBoundingClientRect().bottom && col.bottom <= dock.top + 1 && col.height > 200;
          })()`,
          true,
        );
        yield* fitsPhone(page);
        yield* noSidewaysBox(page, '.lab-source-col .lab-source-scroll');
        // What plays is named whole, in the band over the code: beside the head's buttons a phone had no room for it.
        yield* textIs(page, '.lab-source-col .lab-source-beat .lab-source-live', 'rise');
        yield* evaluates(
          page,
          `(() => { const live = document.querySelector('.lab-source-col .lab-source-live'); return live.scrollWidth <= live.clientWidth; })()`,
          true,
        );
        const now = undersizedTargets(PHONE_HIT, '.lab-source-col');
        yield* page.until(`${now}.length === 0`, {
          now,
          say: (found) => `under a finger: ${found}`,
        });
      }).pipe(Effect.scoped),
  );

  it.live(
    'with a cue selected, the code keeps the screen: no sheet rises, the pick lit in it',
    () =>
      Effect.gen(function* () {
        const { page } = yield* openLab([codeRoute, sourceRoute], {
          href: labOne(middle('rise'), { cue: 'rise', code: 'live' }),
          viewport: PHONE,
          ready: LIVE_READY,
        });
        // The selection's sheet is the panel's, set aside with it: its inspector stays in its place, hidden with the
        // panel, so one text owns the highlights; and the strip folds to its words, so its lanes leave the code its room.
        yield* countIs(page, '.lab-selection-sheet', 0);
        yield* countIs(page, '.lab-source-page', 1);
        yield* evaluates(page, LANES_SHOWN, false);
        yield* evaluates(
          page,
          `document.querySelector('.lab-source-col').getBoundingClientRect().height > 200`,
          true,
        );
        yield* evaluates(page, painted('lab-picked'), ["rise: { mark: 'rise', dur: 0.6 }"]);
        // Left, the panel stands again and the selection's sheet rises on its Source face, the code still open.
        yield* page.click(CODE_MODE);
        yield* evaluates(page, CODE_KEY, 'follow');
        yield* page.waitFor('.lab-selection-sheet .lab-source-page');
        yield* countIs(page, '.lab-source-col', 0);
        yield* countIs(page, '.lab-source-page', 1);
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
