/**
 * What the upload (`./upload.ts`) does with each hymn of a rendered set,
 * decided from the set's manifest and R2's listing and nothing else: no
 * store is called here.
 *
 * A set is immutable once uploaded: a key R2 holds with the manifest's size
 * and MD5 is kept, a key R2 lacks is uploaded, and a key R2 holds with any
 * other bytes is a conflict, never replaced. That is what makes the
 * `immutable` cache header true: changed recordings are a new set.
 */
import { Array as Arr, Data, Option } from 'effect';
import { RECORDING_SET, recordingKey } from '@bible/hymnal/recordings';
import type { ManifestHymn, RecordingManifest } from '@bible/hymnal/recording-manifest';

import { SDAH_HYMNS, holds } from './plan.ts';
import type { TargetObject } from './stores.ts';

/** Each recording is never replaced under its key, so the edge keeps it a year. */
export const SET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** The bucket key of a hymn of `set`. */
export const setKey = (set: string, hymn: number) => `audio/${set}/${recordingKey(hymn)}`;

/** Where a set's recordings are in R2. */
export const setPrefix = (set: string) => `audio/${set}/sdah/`;

export type UploadItem = Data.TaggedEnum<{
  /** R2 holds the key with the manifest's size and MD5. */
  Keep: { readonly hymn: ManifestHymn; readonly key: string };
  /** R2 lacks the key. */
  Upload: { readonly hymn: ManifestHymn; readonly key: string };
  /** R2 holds the key with other bytes: refused, the set must be bumped. */
  Conflict: { readonly hymn: ManifestHymn; readonly key: string; readonly held: TargetObject };
}>;
export const UploadItem = Data.taggedEnum<UploadItem>();

/**
 * Why a manifest cannot be uploaded, each reason a line: it is not the set
 * the app plays, it does not hold every hymn 1 to 695 once with its own key,
 * or a hymn did not pass its checks. Empty when it can.
 */
export const manifestRefusals = (manifest: RecordingManifest): ReadonlyArray<string> => {
  const numbers = manifest.hymns.map((h) => h.hymn);
  const missing = SDAH_HYMNS.filter((n) => !numbers.includes(n));
  const extra = numbers.filter((n, k) => !SDAH_HYMNS.includes(n) || numbers.indexOf(n) !== k);
  const miskeyed = manifest.hymns.filter((h) => h.key !== recordingKey(h.hymn)).map((h) => h.hymn);
  const failed = manifest.hymns.filter((h) => !h.passed).map((h) => h.hymn);
  const list = (hymns: ReadonlyArray<number>) =>
    [
      hymns.slice(0, 12).join(', '),
      ...Arr.of(`and ${hymns.length - 12} more`).filter(() => hymns.length > 12),
    ].join(' ');
  const checks: ReadonlyArray<readonly [boolean, () => string]> = [
    [
      manifest.set !== RECORDING_SET,
      () => `the set is ${manifest.set}, the app plays ${RECORDING_SET}`,
    ],
    [
      manifest.hymns.length !== SDAH_HYMNS.length,
      () => `the manifest has ${manifest.hymns.length} hymns, not ${SDAH_HYMNS.length}`,
    ],
    [missing.length > 0, () => `missing hymns ${list(missing)}`],
    [extra.length > 0, () => `hymns outside 1 to 695 or twice: ${list(extra)}`],
    [miskeyed.length > 0, () => `hymns whose key is not sdah/<n>.mp3: ${list(miskeyed)}`],
    [failed.length > 0, () => `hymns that did not pass their checks: ${list(failed)}`],
  ];
  return checks.filter(([refused]) => refused).map(([, reason]) => reason());
};

/** Each hymn's item, in number order, against R2's listing of the set's prefix. */
export const planUpload = (
  manifest: RecordingManifest,
  listing: ReadonlyMap<string, TargetObject>,
): ReadonlyArray<UploadItem> =>
  [...manifest.hymns]
    .sort((a, b) => a.hymn - b.hymn)
    .map((hymn) => {
      const key = setKey(manifest.set, hymn.hymn);
      return Option.match(Option.fromUndefinedOr(listing.get(key)), {
        onNone: () => UploadItem.Upload({ hymn, key }),
        onSome: (held) => {
          if (holds(held, hymn.bytes, hymn.md5)) return UploadItem.Keep({ hymn, key });
          return UploadItem.Conflict({ hymn, key, held });
        },
      });
    });
