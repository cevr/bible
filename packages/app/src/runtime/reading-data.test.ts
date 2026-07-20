import { describe, expect, it } from 'effect-bun-test';

import { Effect, Exit } from 'effect';

import { refreshWritingsCatalogAfter, writingsDownloadLabel } from './writings-cache.js';

describe('writings library cache coordination', () => {
  it.effect('refreshes the installed catalog only after a successful download', () =>
    Effect.gen(function* () {
      let refreshes = 0;
      const refresh = () =>
        Effect.runPromise(
          Effect.sync(() => {
            refreshes += 1;
          }),
        );
      const result = yield* Effect.tryPromise(() =>
        refreshWritingsCatalogAfter(Effect.runPromise(Effect.succeed('downloaded')), refresh),
      );

      expect(result).toBe('downloaded');
      expect(refreshes).toBe(1);

      const failure = yield* Effect.exit(
        Effect.tryPromise(() =>
          refreshWritingsCatalogAfter(Effect.runPromise(Effect.fail('offline')), refresh),
        ),
      );
      expect(Exit.isFailure(failure)).toBe(true);
      expect(refreshes).toBe(1);
    }),
  );
});

it.effect('download controls have publication-specific accessible names', () =>
  Effect.sync(() => {
    expect(writingsDownloadLabel('Download', 'Patriarchs and Prophets', 'PP')).toBe(
      'Download Patriarchs and Prophets (PP)',
    );
    expect(writingsDownloadLabel('Retry', 'The Desire of Ages', 'DA')).not.toBe(
      writingsDownloadLabel('Retry', 'Patriarchs and Prophets', 'PP'),
    );
  }),
);
