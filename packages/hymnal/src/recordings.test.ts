import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { creditText, RECORDING_SET, recordingKey } from './recordings.js';

describe('recordings', () => {
  it.effect('keys a hymn by its unpadded number inside the set', () =>
    Effect.sync(() => {
      expect(RECORDING_SET).toBe('warm-1');
      expect(recordingKey(1)).toBe('sdah/1.mp3');
      expect(recordingKey(695)).toBe('sdah/695.mp3');
    }),
  );

  it.effect('credits the piano as CC BY 3.0 asks, and the strings', () =>
    Effect.sync(() => {
      const text = creditText();
      for (const words of [
        'Salamander Grand Piano V3',
        'Alexander Holm',
        'CC BY 3.0',
        'https://creativecommons.org/licenses/by/3.0/',
        'VS Chamber Orchestra 2',
        'Versilian Studios',
        'CC0',
      ])
        expect(text).toContain(words);
      expect(text).toBe(
        "The recordings are played from the hymnal's own scores. " +
          'Piano: Salamander Grand Piano V3 by Alexander Holm, CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). ' +
          'Strings: VS Chamber Orchestra 2: Community Edition by Versilian Studios, CC0 1.0.',
      );
    }),
  );
});
