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

/** Each rule of `css` that resets a button by its type, and weighs something. */
const weighedResets = (css: string): ReadonlyArray<string> =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => /font:\s*inherit/.test(body ?? ''))
    .map(([, selector]) => (selector ?? '').trim())
    .filter((selector) => /(^|[\s>+~,(])button\b/.test(selector))
    .filter((selector) => outsideWhere(selector).trim() !== '');

describe("a bare button's reset", () => {
  it.effect('is found weighing when any of its selector stands outside `:where`', () =>
    Effect.sync(() => {
      expect(
        weighedResets(
          '.st-app button:where(:not(.sh-btn)) { font: inherit; } :where(.a) :where(button) { font: inherit; } .chip { font: inherit; }',
        ),
      ).toEqual(['.st-app button:where(:not(.sh-btn))']);
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
