// The studio's one breakpoint: every width a stylesheet asks of the window
// is a phone's (`PHONE`) or wider than one (`WIDE`). The styles written in
// TypeScript say it through the two (`film/one-breakpoint` refuses a width
// written out there); the stylesheets that cannot are held to it here.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';
import { COMMAND_CSS } from './command/style.ts';
import { SHELL_CSS } from './page-shell-style.ts';
import { REVIEW_CSS } from './review/style.ts';
import { SCENES_CSS } from './scenes/style.ts';
import { PHONE, WIDE } from './viewport.ts';

/** Every `(max-width: …px)` and `(min-width: …px)` in `css`. */
const widthsIn = (css: string): ReadonlyArray<string> =>
  [...css.matchAll(/\((?:max|min)-width:\s*\d+px\)/g)].map((m) => m[0]);

/** The widths in `css` that are neither `PHONE` nor `WIDE`. */
const offWidths = (css: string) => widthsIn(css).filter((w) => w !== PHONE && w !== WIDE);

describe("the studio's breakpoint", () => {
  it.effect('is a phone up to 899 px, and wider from 900 px', () =>
    Effect.sync(() => {
      expect([PHONE, WIDE]).toEqual(['(max-width: 899px)', '(min-width: 900px)']);
      expect(offWidths('@media (max-width: 600px) {} @media (min-width: 900px) {}')).toEqual([
        '(max-width: 600px)',
      ]);
    }),
  );

  it.effect.layer(BunServices.layer)('is the only width any stylesheet asks of the window', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const sheet = (name: string) => fs.readFileString(`${import.meta.dir}/../player/${name}`);
      const sheets = {
        shell: SHELL_CSS,
        review: REVIEW_CSS,
        scenes: SCENES_CSS,
        command: COMMAND_CSS,
        player: yield* sheet('player.css'),
        tokens: yield* sheet('tokens.css'),
      };
      expect(Object.entries(sheets).map(([name, css]) => ({ name, off: offWidths(css) }))).toEqual(
        Object.keys(sheets).map((name) => ({ name, off: [] })),
      );
      // The TypeScript styles ask it too, through `PHONE` and `WIDE`.
      for (const css of [SHELL_CSS, REVIEW_CSS, SCENES_CSS, COMMAND_CSS])
        expect(widthsIn(css).length).toBeGreaterThan(0);
    }),
  );
});
