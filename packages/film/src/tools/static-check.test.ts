// The lab reads `film check --static` from its printed lines: level, tag,
// message. Log lines and anything else it prints are not findings.

import { describe, expect, test } from 'bun:test';
import { checkLines } from './static-check.ts';

describe('static check lines', () => {
  test('each finding line becomes a finding; the rest are skipped', () => {
    const out = [
      'warning AssetMissing sound "coins" has not been generated; the mix plays without it',
      'error   CueLate      scene "hand": cue "topple" ends at 12.40s, after the scene (12.10s)',
      '[18:29:51.482] INFO (#2): check.done film=f layout=false errors=1 warnings=1',
      '',
    ].join('\n');
    expect(checkLines(out)).toEqual([
      {
        level: 'warning',
        tag: 'AssetMissing',
        message: 'sound "coins" has not been generated; the mix plays without it',
      },
      {
        level: 'error',
        tag: 'CueLate',
        message: 'scene "hand": cue "topple" ends at 12.40s, after the scene (12.10s)',
      },
    ]);
  });
});
