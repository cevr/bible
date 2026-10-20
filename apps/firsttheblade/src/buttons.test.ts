import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';

const test = it.effect.layer(BunServices.layer);

const TRIM = 'text-box: trim-both cap alphabetic;';

/** The rule a selector opens in the stylesheet, its closing brace left out; empty when no rule opens there. */
const ruleOf = (css: string, selector: string) => {
  const open = css.indexOf(`${selector} {`);
  return css.slice(open, css.indexOf('}', open));
};

const read = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(path.join(import.meta.dir, file));
  });

describe('the buttons', () => {
  test('a pill and a button label are trimmed to the cap height and the baseline, so their letters sit in the middle', () =>
    Effect.gen(function* () {
      const css = yield* read('styles.css');
      expect(ruleOf(css, '.button-label')).toContain(TRIM);
      const supported = css.slice(css.indexOf('@supports (text-box: trim-both cap alphabetic)'));
      expect(ruleOf(supported, '  .pill')).toContain(TRIM);
    }));

  test('every button wraps its words in a trimmed label', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const files = yield* fs.readDirectory(import.meta.dir, { recursive: true });
      let seen = 0;
      for (const file of files.filter((name) => name.endsWith('.tsx'))) {
        const source = yield* read(file);
        for (const [, first = ''] of source.matchAll(/<a class="button[^"]*"[^>]*>\s*([^\n]*)/g)) {
          seen += 1;
          expect(first).toStartWith('<span class="button-label">');
        }
      }
      expect(seen).toBeGreaterThanOrEqual(3);
    }));
});
