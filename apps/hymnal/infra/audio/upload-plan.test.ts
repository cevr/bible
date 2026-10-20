/**
 * The upload's plan from a manifest and R2's listing alone: which hymns are
 * kept, uploaded or in conflict, and which manifests are refused.
 */
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';
import type { RecordingManifest } from '@bible/hymnal/recording-manifest';

import { SDAH_HYMNS } from './plan.ts';
import { UploadItem, manifestRefusals, planUpload, setKey, setPrefix } from './upload-plan.ts';

const md5Of = (hymn: number) => hymn.toString(16).padStart(32, '0');

const manifestOf = (hymns: ReadonlyArray<number> = SDAH_HYMNS): RecordingManifest => ({
  set: 'warm-1',
  style: 'C Warm band',
  platform: 'darwin-arm64',
  configHash: 'c'.repeat(64),
  tools: { sfizz: { version: '1.2.3', sha256: 's' }, nodeAv: { version: '6.1.1' } },
  hymns: hymns.map((hymn) => ({
    hymn,
    key: `sdah/${hymn}.mp3`,
    file: `${hymn}.mp3`,
    bytes: 1000 + hymn,
    sha256: 'a'.repeat(64),
    md5: md5Of(hymn),
    seconds: 60,
    lufs: -16,
    truePeak: -2.5,
    lagMs: 3,
    passed: true,
  })),
});

describe('the upload plan', () => {
  it.effect('names each hymn under audio/<set>/sdah/', () =>
    Effect.sync(() => {
      expect(setKey('warm-1', 1)).toBe('audio/warm-1/sdah/1.mp3');
      expect(setPrefix('warm-1')).toBe('audio/warm-1/sdah/');
    }),
  );

  it.effect('uploads what R2 lacks, keeps what it holds, and refuses to replace other bytes', () =>
    Effect.sync(() => {
      const listing = new Map([
        [setKey('warm-1', 1), { size: 1001, etag: `"${md5Of(1)}"` }],
        [setKey('warm-1', 2), { size: 1002, etag: `"${'f'.repeat(32)}"` }],
        [setKey('warm-1', 3), { size: 9, etag: `"${md5Of(3)}"` }],
      ]);
      const items = planUpload(manifestOf(), listing);
      expect(items.length).toBe(695);
      expect(items.slice(0, 4).map((item) => item._tag)).toEqual([
        'Keep',
        'Conflict',
        'Conflict',
        'Upload',
      ]);
      expect(items.filter(UploadItem.$is('Upload')).length).toBe(692);
      expect(items.map((item) => item.hymn.hymn)).toEqual([...SDAH_HYMNS]);
    }),
  );

  it.effect('passes a whole, passed manifest of the set the app plays', () =>
    Effect.sync(() => {
      expect(manifestRefusals(manifestOf())).toEqual([]);
    }),
  );

  it.effect('refuses a manifest short of a hymn, a twice-listed hymn or another set', () =>
    Effect.sync(() => {
      const short = manifestRefusals(manifestOf(SDAH_HYMNS.filter((n) => n !== 388)));
      expect(short).toEqual(['the manifest has 694 hymns, not 695', 'missing hymns 388']);
      const twice = manifestRefusals(manifestOf([...SDAH_HYMNS.filter((n) => n !== 2), 1]));
      expect(twice).toEqual(['missing hymns 2', 'hymns outside 1 to 695 or twice: 1']);
      expect(manifestRefusals({ ...manifestOf(), set: 'warm-2' })).toEqual([
        'the set is warm-2, the app plays warm-1',
      ]);
    }),
  );

  it.effect('refuses a hymn that did not pass or whose key is not its own', () =>
    Effect.sync(() => {
      const manifest = manifestOf();
      const padded = new Map([[93, 'sdah/093.mp3']]);
      const hymns = manifest.hymns.map((h) => ({
        ...h,
        passed: h.hymn !== 46,
        key: Option.getOrElse(Option.fromUndefinedOr(padded.get(h.hymn)), () => h.key),
      }));
      expect(manifestRefusals({ ...manifest, hymns })).toEqual([
        'hymns whose key is not sdah/<n>.mp3: 93',
        'hymns that did not pass their checks: 46',
      ]);
    }),
  );
});
