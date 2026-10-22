// The repo's own ledger, read with every guard file it names. Those files lie
// anywhere in the repo, outside any input list turbo's cached `test` can name,
// so this case runs in the slow suite.
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Path } from 'effect';
import { ledgerProblems } from './ledger.ts';

describe('the lessons ledger', () => {
  it.effect.layer(BunServices.layer)(
    'of the repo holds every entry to its fields and every guard to what its file holds',
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const root = path.join(import.meta.dir, '..', '..', '..', '..');
        const { entries, problems } = yield* ledgerProblems(root);
        expect({ entries: entries > 50, problems }).toEqual({ entries: true, problems: [] });
      }),
  );
});
