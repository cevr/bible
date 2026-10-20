import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path } from 'effect';

import { CONFIRM_FORM_ID } from './mail/paths.ts';

const test = it.effect.layer(BunServices.layer);

const read = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(path.join(import.meta.dir, file));
  });

describe('confirming from the letter', () => {
  test("is one step: the confirm page's form carries the id the browser's entry posts as it opens", () =>
    Effect.gen(function* () {
      const page = yield* read('ui/mail.tsx');
      const confirm = page.slice(page.indexOf('export const Confirm ='));
      expect(confirm).toContain('<form method="post" id={CONFIRM_FORM_ID}>');
      const entry = yield* read('client.tsx');
      expect(entry).toContain('document.getElementById(CONFIRM_FORM_ID)');
      expect(entry).toContain("const loadConfirm = () => import('./confirm.ts');");
      expect(entry).toContain('confirmInPlace(confirmForm)');
      expect(CONFIRM_FORM_ID).toBe('confirm');
    }));

  test('loads into the next step: a skeleton while the post runs, the answer drawn in place, the button only with no script', () =>
    Effect.gen(function* () {
      const inPlace = yield* read('confirm.ts');
      expect(inPlace).toContain('HttpClientRequest.post(location.href)');
      expect(inPlace).toContain("history.replaceState(history.state, '', path)");
      expect(inPlace).toContain("shown.classList.add('confirm-arrived')");
      expect(inPlace).toContain('const HOLD = Duration.millis(600);');
      const page = yield* read('ui/mail.tsx');
      const confirm = page.slice(page.indexOf('export const Confirm ='));
      expect(confirm.indexOf('confirm-pending')).toBeLessThan(
        confirm.indexOf('<div class="confirm-press">'),
      );
      expect(confirm).toContain('<div class="wrap lost" role="status" aria-busy="true">');
      const styles = yield* read('styles.css');
      expect(styles).toContain(
        '@media (scripting: none) {\n  .confirm-pending {\n    display: none;',
      );
      expect(styles).toContain(
        '.confirm-arrived > :not(img) {\n  animation: confirm-arrive 300ms ease-out both;',
      );
    }));
});
