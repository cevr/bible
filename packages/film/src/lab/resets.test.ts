// A bare button's reset weighs nothing: a rule that gives every button of a
// part the page's font (`font: inherit`) by its type is written in
// `:where(…)`, so any rule of the part's own sets over it, whatever its
// weight. A reset that weighs (0,1,1) outranks a chip's one class and sets
// a mark's chip that seeks in the page's face, not the code's
// (`docs/lessons.md`, `code-chip-font-under-button-reset`).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';
import { COMMAND_CSS } from './command/style.ts';
import { CODE_CSS, INSPECTOR_CSS, STUDIO_CSS } from './film-studio/style.ts';
import { SHELL_CSS } from './page-shell-style.ts';
import { REVIEW_CSS } from './review/style.ts';

/** `selector` with every `:where(…)` taken out, its parentheses balanced. */
const outsideWhere = (selector: string): string => {
  let out = '';
  for (let i = 0; i < selector.length;) {
    if (selector.startsWith(':where(', i)) {
      let depth = 0;
      for (i += ':where'.length; i < selector.length; i++) {
        if (selector[i] === '(') depth++;
        else if (selector[i] === ')' && --depth === 0) break;
      }
      i++;
    } else out += selector[i++];
  }
  return out;
};

/** `list` split at its top-level commas: each complex selector of a selector list. */
const complexSelectors = (list: string): ReadonlyArray<string> => {
  const out: Array<string> = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++;
    else if (list[i] === ')') depth--;
    else if (list[i] === ',' && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  return [...out, list.slice(start)].map((selector) => selector.trim());
};

/** Whether `selector` weighs anything: some simple selector stands outside `:where`. */
const weighs = (selector: string): boolean => outsideWhere(selector).replace(/[\s>+~]/g, '') !== '';

/** Each selector of `css` that resets a button by its type (`font: inherit`), and weighs something. */
const weighedResets = (css: string): ReadonlyArray<string> =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => /(^|[\s;])font\s*:\s*inherit\b/.test(body ?? ''))
    .flatMap(([, list]) => complexSelectors(list ?? ''))
    .filter((selector) => /(^|[\s>+~,(])button\b/.test(selector))
    .filter(weighs);

describe("a bare button's reset", () => {
  const cases: ReadonlyArray<readonly [string, string, ReadonlyArray<string>]> = [
    [
      'a class before it',
      '.st-app button:where(:not(.sh-btn)) { font: inherit; }',
      ['.st-app button:where(:not(.sh-btn))'],
    ],
    ['its declaration spaced', '.a button { font : inherit; }', ['.a button']],
    ['one selector of a list', ':where(.a button), .b button { font: inherit; }', ['.b button']],
    ['its type alone', 'button { color: red; font: inherit; }', ['button']],
    ['all of it in `:where`', ':where(.a) :where(button) { font: inherit; }', []],
    ['a combinator between two `:where`s', ':where(.a) > :where(button) { font: inherit; }', []],
    ['a list of `:where`s', ':where(.a button), :where(.b button) { font: inherit; }', []],
    ['a class with no button', '.chip { font: inherit; }', []],
    ['another font', '.a button { font: 12px mono; }', []],
  ];
  for (const [what, css, found] of cases)
    it.effect(
      `with ${what}, is found weighing iff a selector of it stands outside \`:where\``,
      () =>
        Effect.sync(() => {
          expect(weighedResets(css)).toEqual(found);
        }),
    );

  it.effect.layer(BunServices.layer)("weighs nothing in every one of the lab's sheets", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const player = yield* fs.readFileString(`${import.meta.dir}/../player/player.css`);
      const sheets = {
        shell: SHELL_CSS,
        review: REVIEW_CSS,
        studio: STUDIO_CSS,
        inspector: INSPECTOR_CSS,
        code: CODE_CSS,
        command: COMMAND_CSS,
        player,
      };
      expect(
        Object.entries(sheets).flatMap(([name, css]) =>
          weighedResets(css).map((selector) => `${name}: ${selector}`),
        ),
      ).toEqual([]);
    }),
  );
});
