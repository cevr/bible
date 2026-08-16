import { describe, expect, it } from 'effect-bun-test';

import { Effect } from 'effect';

import { writingsDownloadLabel } from './writings-download-label.js';

describe('writings library controls', () => {
  it.effect('gives each download control a publication-specific accessible name', () =>
    Effect.sync(() => {
      expect(writingsDownloadLabel('Download', 'Patriarchs and Prophets', 'PP')).toBe(
        'Download Patriarchs and Prophets (PP)',
      );
      expect(writingsDownloadLabel('Retry', 'The Desire of Ages', 'DA')).not.toBe(
        writingsDownloadLabel('Retry', 'Patriarchs and Prophets', 'PP'),
      );
    }),
  );
});
