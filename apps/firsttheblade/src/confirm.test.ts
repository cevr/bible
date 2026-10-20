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
  test("is one step: the confirm page's form carries the id the browser's entry submits as it opens", () =>
    Effect.gen(function* () {
      const page = yield* read('ui/mail.tsx');
      const confirm = page.slice(page.indexOf('export const Confirm ='));
      expect(confirm).toContain('<form method="post" id={CONFIRM_FORM_ID}>');
      const entry = yield* read('client.tsx');
      expect(entry).toContain('document.getElementById(CONFIRM_FORM_ID)');
      expect(entry).toContain('confirmForm.requestSubmit()');
      expect(CONFIRM_FORM_ID).toBe('confirm');
    }));
});
