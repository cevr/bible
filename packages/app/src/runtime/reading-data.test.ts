import { describe, expect, test } from 'bun:test';

import { refreshWritingsCatalogAfter, writingsDownloadLabel } from './writings-cache.js';

describe('writings library cache coordination', () => {
  test('refreshes the installed catalog only after a successful download', async () => {
    let refreshes = 0;
    const result = await refreshWritingsCatalogAfter(Promise.resolve('downloaded'), () => {
      refreshes += 1;
      return Promise.resolve();
    });

    expect(result).toBe('downloaded');
    expect(refreshes).toBe(1);

    const failure = await refreshWritingsCatalogAfter(Promise.reject(new Error('offline')), () => {
      refreshes += 1;
      return Promise.resolve();
    }).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toHaveProperty('message', 'offline');
    expect(refreshes).toBe(1);
  });
});

test('download controls have publication-specific accessible names', () => {
  expect(writingsDownloadLabel('Download', 'Patriarchs and Prophets', 'PP')).toBe(
    'Download Patriarchs and Prophets (PP)',
  );
  expect(writingsDownloadLabel('Retry', 'The Desire of Ages', 'DA')).not.toBe(
    writingsDownloadLabel('Retry', 'Patriarchs and Prophets', 'PP'),
  );
});
