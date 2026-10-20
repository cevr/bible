/**
 * What the copy job does with each recording, decided from what the stores
 * answered and nothing else: no store is called here.
 *
 * S3 refuses to list, so the job asks for every number of the 1985 hymnal
 * (1 to 695). A number S3 has is copied from S3; one it lacks is filled from
 * the GitHub tree; one neither has is missing. A key R2 already holds with
 * the same size and the same MD5 is kept. When the MD5 is not known before
 * the bytes are read (a multipart ETag, or a fill), the job reads them and
 * decides then (`./job.ts`).
 */
import { Array as Arr, Data, Option, Result } from 'effect';

import { sourcedKey } from '../../src/remote.ts';
import type { FillEntry, SourceHead, TargetObject } from './stores.ts';

/** The 1985 SDA Hymnal's numbers. */
export const SDAH_HYMNS: ReadonlyArray<number> = Arr.range(1, 695);

/** Where the job finds the recordings in R2. */
export const AUDIO_PREFIX = 'audio/sdah/';

/** What a HEAD on S3 answered: present, absent (403 or 404), or no answer. */
export type Head = Data.TaggedEnum<{
  Present: { readonly head: SourceHead };
  Absent: {};
  Unanswered: { readonly reason: string };
}>;
export const Head = Data.taggedEnum<Head>();

export type Item = Data.TaggedEnum<{
  /** Copy from S3. `md5` is the ETag's when it is a plain MD5. */
  FromS3: {
    readonly hymn: number;
    readonly key: string;
    readonly size: number;
    readonly md5: Option.Option<string>;
    readonly existing: Option.Option<TargetObject>;
  };
  /** Copy from the GitHub tree: S3 lacks the key. */
  FromGitHub: {
    readonly hymn: number;
    readonly key: string;
    readonly entry: FillEntry;
    readonly existing: Option.Option<TargetObject>;
  };
  /** R2 already holds the key with S3's size and MD5. */
  Keep: {
    readonly hymn: number;
    readonly key: string;
    readonly size: number;
    readonly md5: string;
  };
  /** Neither S3 nor the GitHub tree has the key. */
  Missing: { readonly hymn: number; readonly key: string };
  /** No source could be read for the key. */
  Unreadable: { readonly hymn: number; readonly key: string; readonly reason: string };
}>;
export const Item = Data.taggedEnum<Item>();

/** An ETag without its quotes. */
export const unquote = (etag: string) => etag.replaceAll('"', '');

/** The MD5 an ETag holds: `None` for a multipart ETag (`<md5>-<parts>`). */
export const etagMd5 = (etag: string): Option.Option<string> => {
  const bare = unquote(etag).toLowerCase();
  if (bare.includes('-')) return Option.none();
  return Option.some(bare);
};

/** Whether R2's object is the recording: the same size and the same MD5. */
export const holds = (object: TargetObject, size: number, md5: string) =>
  object.size === size && unquote(object.etag).toLowerCase() === md5;

const fromS3 = (hymn: number, head: SourceHead, existing: Option.Option<TargetObject>): Item => {
  const key = sourcedKey(hymn);
  const md5 = etagMd5(head.etag);
  const kept = Option.flatMap(md5, (sum) =>
    Option.filter(existing, (object) => holds(object, head.size, sum)),
  );
  if (Option.isSome(kept) && Option.isSome(md5)) {
    return Item.Keep({ hymn, key, size: head.size, md5: md5.value });
  }
  return Item.FromS3({ hymn, key, size: head.size, md5, existing });
};

const fromFill = (
  hymn: number,
  fill: Result.Result<ReadonlyMap<number, FillEntry>, string>,
  existing: Option.Option<TargetObject>,
): Item => {
  const key = sourcedKey(hymn);
  return Result.match(fill, {
    onFailure: (reason) => Item.Unreadable({ hymn, key, reason: `absent from s3, ${reason}` }),
    onSuccess: (entries) =>
      Option.match(Option.fromUndefinedOr(entries.get(hymn)), {
        onNone: () => Item.Missing({ hymn, key }),
        onSome: (entry) => Item.FromGitHub({ hymn, key, entry, existing }),
      }),
  });
};

/**
 * Each hymn's item, in number order. `heads` holds every hymn's HEAD;
 * `fill` is the GitHub tree, read only when some key is absent (an empty map
 * otherwise); `target` is R2's listing (empty on a dry run, which reads none).
 */
export const plan = (
  heads: ReadonlyMap<number, Head>,
  fill: Result.Result<ReadonlyMap<number, FillEntry>, string>,
  target: ReadonlyMap<string, TargetObject>,
): ReadonlyArray<Item> =>
  SDAH_HYMNS.map((hymn) => {
    const existing = Option.fromUndefinedOr(target.get(sourcedKey(hymn)));
    const head = Option.getOrElse(Option.fromUndefinedOr(heads.get(hymn)), () =>
      Head.Unanswered({ reason: 'not asked' }),
    );
    return Head.$match(head, {
      Present: ({ head: present }) => fromS3(hymn, present, existing),
      Absent: () => fromFill(hymn, fill, existing),
      Unanswered: ({ reason }) => Item.Unreadable({ hymn, key: sourcedKey(hymn), reason }),
    });
  });

/** Whether some hymn is absent from S3, so the GitHub tree must be read. */
export const needsFill = (heads: ReadonlyMap<number, Head>) =>
  Arr.some([...heads.values()], Head.$is('Absent'));
