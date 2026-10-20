import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { HYMNS_HOST, audioKey, audioUrl, sourcedKey } from '../src/remote.ts';

describe('where the recordings are', () => {
  it.effect('plays each 1985 hymnal recording from the set warm-1, by its unpadded number', () =>
    Effect.sync(() => {
      expect(audioUrl(1)).toBe('https://hymns.cvr.im/audio/warm-1/sdah/1.mp3');
      expect(audioKey(695)).toBe('audio/warm-1/sdah/695.mp3');
      expect(HYMNS_HOST).toBe('hymns.cvr.im');
    }),
  );

  it.effect('keeps the recordings copied from S3 under audio/sdah/', () =>
    Effect.sync(() => {
      expect(sourcedKey(388)).toBe('audio/sdah/388.mp3');
    }),
  );
});
