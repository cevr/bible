// The Source view in a browser over the probe film: closed at rest and reading
// nothing; opened by the Code button (a step Back walks) or by `?code=follow`
// and `?code=<line>`; the cues lit in the code are the cues lit on the strip at
// every settled frame; the inspector's `file:line` opens it held on that line;
// and on a phone it is a face of the selection's sheet, or a sheet of its own.

import { Effect, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { PHONE, json, openLab, route } from '../../../src/lab/fixtures/harness.ts';
import { PROBE, probeFilm } from '../../../src/lab/fixtures/probe-film.ts';
import { fitsPhone } from '../../../src/lab/fixtures/phone-fit.ts';
import { attributeIs, countIs, evaluates, textIs } from '../../../src/lab/fixtures/settled.ts';
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
const PAINTED = `(() => {
  const text = document.querySelector('.lab-source-text code')?.textContent ?? '';
  const live = CSS.highlights.get('lab-live');
  return [...(live ?? [])].map((r) => text.slice(r.startOffset, r.endOffset).split(':')[0]).sort();
})()`;

describe('the Source view at rest', () => {
  it.live('is closed, reads nothing, and the Code button offers it', () =>
    Effect.gen(function* () {
      const { page, asked } = yield* openLab([codeRoute], { href: labOne(1) });
      yield* countIs(page, '.lab-source', 0);
      yield* attributeIs(page, '.lab-strip [data-act="code"]', 'aria-pressed', 'false');
      expect(asked.filter((a) => a.path.endsWith('/code'))).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.live('the Code button opens the view as a step Back walks, and Close shuts it', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], { href: labOne(1) });
      yield* page.click('.lab-strip [data-act="code"]');
      yield* page.waitFor('.lab-source-col .lab-source-text');
      yield* attributeIs(page, '.lab-strip [data-act="code"]', 'aria-pressed', 'true');
      yield* evaluates(page, `location.search.includes('code=follow')`, true);
      yield* page.back;
      yield* countIs(page, '.lab-source', 0);
      yield* page.forward;
      yield* page.waitFor('.lab-source-col .lab-source-text');
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
        yield* page.waitFor('.lab-source-col .lab-source-text');
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
        yield* page.waitFor('.lab-source-col .lab-source-text');
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
      yield* page.waitFor('.lab-source-col .lab-source-text');
      yield* attributeIs(page, '.lab-source-held', 'data-line', String(RISE_LINE));
    }).pipe(Effect.scoped),
  );

  it.live('the inspector’s file:line opens the view held on the cue’s line', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([codeRoute], { href: labOne(1, { cue: 'rise' }) });
      yield* textIs(page, '.lab-source-at', `scenes/one.ts:${RISE_LINE}`);
      yield* page.click('.lab-source-at');
      yield* page.waitFor('.lab-source-col .lab-source-text');
      yield* attributeIs(page, '.lab-source-held', 'data-line', String(RISE_LINE));
      yield* evaluates(page, `location.search.includes('code=${RISE_LINE}')`, true);
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
      yield* page.waitFor('.lab-selection-sheet');
      yield* page.click('.lab-selection-sheet [data-act="sheet"]');
      yield* page.waitFor('.lab-selection-sheet .lab-source-text');
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
      yield* page.waitFor('[data-role="source"] .lab-source-text');
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
      yield* page.waitFor('.lab-selection-sheet .lab-source-text');
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
      yield* page.waitFor('[data-role="source"] .lab-source-text');
      yield* page.click('.lab-source-sheet [data-act="close-inspector"]');
      yield* countIs(page, '[data-role="source"]', 0);
      yield* evaluates(page, `location.search.includes('code=')`, false);
    }).pipe(Effect.scoped),
  );
});
