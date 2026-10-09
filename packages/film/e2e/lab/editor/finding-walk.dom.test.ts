// The inspector's count of findings in other scenes names the way to them: on a
// laptop the key that walks (F), on a phone, which has no F, the command menu's
// row.

import { Effect } from 'effect';
import { describe, it } from 'effect-bun-test';
import { PHONE, json, labAt, openLab, route } from '../../../src/lab/fixtures/harness.ts';
import { textIs } from '../../../src/lab/fixtures/settled.ts';

const report = {
  findings: [
    {
      level: 'warning',
      tag: 'scene',
      message: 'two is quiet',
      address: { part: { _tag: 'Scenes', ids: ['two'] } },
    },
  ],
};

describe('the finding walk, named', () => {
  it.live('a phone names the command menu’s row, not a key it has not got', () =>
    Effect.gen(function* () {
      const { page } = yield* openLab([route('GET', /^\/check$/, () => json(report))], {
        href: labAt(0.2),
        viewport: PHONE,
        mode: 'edit',
      });
      yield* page.waitFor('.lab-findings-elsewhere');
      yield* textIs(
        page,
        '.lab-findings-elsewhere',
        '1 in other scenes · Next finding in the command menu walks to them',
      );
    }).pipe(Effect.scoped),
  );
});
