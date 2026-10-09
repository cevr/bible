// A sheet about a thing heads itself with the thing's kind in the panel
// title's caps; its name and values keep their own case below the language's
// rule (an ease is a literal: `inOutCubic`), and on a phone the peek shows its
// last value, not cut before it.

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { PHONE, labAt, openLab } from '../../src/lab/fixtures/harness.ts';
import { evaluates, textHas, waitFor } from '../../src/lab/fixtures/settled.ts';

const SLOW = 30_000;
const SHEET = '.lab-selection-sheet';

describe('a sheet about a thing', () => {
  it.live(
    "the phone Lab's cue peek: the kind in caps, the name and values in case, none cut",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openLab([], {
          href: labAt(1, { selection: { _tag: 'Cue', scene: 'one', name: 'rise' } }),
          viewport: PHONE,
        });
        yield* waitFor(page, `${SHEET} .lab-sheet-subject`);
        // Peeking, the line is the subject's alone.
        yield* evaluates(
          page,
          `getComputedStyle(document.querySelector('${SHEET} .lab-sheet-kind')).display`,
          'none',
        );
        yield* evaluates(
          page,
          `getComputedStyle(document.querySelector('${SHEET} .lab-sheet-subject')).textTransform`,
          'none',
        );
        // The ease keeps its case, and the line is not cut short of it.
        yield* textHas(page, `${SHEET} .lab-sheet-subject`, 'rise · offset');
        yield* textHas(page, `${SHEET} .lab-sheet-subject`, '· ease ');
        yield* evaluates(
          page,
          `(() => { const t = document.querySelector('${SHEET} .lab-sheet-title'); const head = document.querySelector('${SHEET} .lab-inspector-head'); return t.scrollWidth <= t.clientWidth && t.getBoundingClientRect().height <= head.getBoundingClientRect().height; })()`,
          true,
        );
        // Raised, the kind heads it in the panel title's caps.
        yield* page.click(`${SHEET} [data-act="sheet"]`);
        yield* textHas(page, `${SHEET} .lab-sheet-kind`, 'cue');
        yield* evaluates(
          page,
          `getComputedStyle(document.querySelector('${SHEET} .lab-sheet-kind')).textTransform`,
          'uppercase',
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
