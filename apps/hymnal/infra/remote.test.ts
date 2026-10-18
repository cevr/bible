import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';

import { HYMNS_HOST, audioKey, audioUrl } from '../src/remote.ts';

describe('where the recordings are', () => {
  it.effect('names each 1985 hymnal recording by its unpadded number under audio/sdah/', () =>
    Effect.sync(() => {
      expect(audioUrl(1)).toBe('https://hymns.cvr.im/audio/sdah/1.mp3');
      expect(audioKey(388)).toBe('audio/sdah/388.mp3');
      expect(HYMNS_HOST).toBe('hymns.cvr.im');
    }),
  );
});
