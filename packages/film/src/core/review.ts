// The review on the wire: the folders it lists (a film's project folder by
// its catalogue, a montage by its manifest), each with its comparison sets
// (render choice points, `choice.ts`) and the files in no set. Pure: the
// review's server and its page share them.

import { Array as Arr, Effect, Option, Schema } from 'effect';
import { ChoicePoint } from './choice.ts';
import { Clip } from './point.ts';
import { Seconds, maybe } from './schema.ts';
import { ReviewFile, ReviewVideo } from './served.ts';

export { ReviewFile, ReviewVideo } from './served.ts';

/** A key a JSON file may leave out, read as `fallback` when it does. */
const orElse = <S extends Schema.Top>(schema: S, fallback: S['Encoded']) =>
  schema.pipe(Schema.withDecodingDefaultKey(Effect.succeed(fallback)));

const ManifestVariant = Schema.Struct({
  label: maybe(Schema.String),
  /** A line under the label: what the variant is. */
  tag: maybe(Schema.String),
  /** What was said of it, in words: shown under its label. */
  verdict: maybe(Schema.String),
  /** A markdown file of notes, relative to the folder. */
  notes: maybe(Schema.String),
  /**
   * The video, relative to the folder, when it is not beside it as
   * `<clip>.<id>.share.mp4` (preferred) or `<clip>.<id>.mp4`.
   */
  file: maybe(Schema.String),
});

const ManifestSet = Schema.Struct({
  title: maybe(Schema.String),
  /** Variant ids, first to last; the rest follow by name. */
  order: orElse(Schema.Array(Schema.String), []),
  /** Where every video starts, in seconds. */
  start: orElse(Seconds, 0),
  /** The instants the Moments view shows; five spread over the first variant otherwise. */
  moments: maybe(Schema.Array(Seconds)),
  variants: orElse(Schema.Record(Schema.String, ManifestVariant), {}),
});

const isClip = Schema.is(Clip);

/**
 * The sets by clip. A clip that is empty or named like an address (`film`,
 * `act:…`) is refused, not dropped, so the review's warning names it and no
 * montage's id reads back as a film's render.
 */
const ManifestSets = Schema.Record(Schema.String, ManifestSet).check(
  Schema.makeFilter((sets) =>
    Option.match(
      Arr.findFirst(Object.keys(sets), (clip) => !isClip(clip)),
      {
        onNone: () => true,
        onSome: (bad) => `a set's clip is never empty nor named like an address ("${bad}")`,
      },
    ),
  ),
);

/**
 * A montage's `review.json`: the record the review lists a folder of
 * hand-made clips by (a film's renders are listed by their catalogue). A
 * title and a line for the folder, the videos, images, docs and downloads it shows, and
 * per comparison set (by clip) its title, order, start, moments, and each
 * variant's label, tag, verdict, notes, or file when it lies elsewhere. A set
 * lists the variants its `order` and `variants` name. Every key may be left
 * out; a file it does not name is not shown.
 */
export const ReviewManifest = Schema.Struct({
  title: maybe(Schema.String),
  blurb: maybe(Schema.String),
  /** Text files (markdown, logs), relative to the folder, shown with it. */
  docs: orElse(Schema.Array(Schema.String), []),
  /** Images, relative to the folder, shown with it. */
  images: orElse(Schema.Array(Schema.String), []),
  /** Videos in no set, relative to the folder, shown with it. */
  videos: orElse(Schema.Array(Schema.String), []),
  /** Explicit file downloads, relative to the folder, including masters too large to stream inline. */
  downloads: orElse(Schema.Array(Schema.String), []),
  sets: orElse(ManifestSets, {}),
});
export type ReviewManifest = typeof ReviewManifest.Type;

export const ReviewManifestJson = Schema.fromJsonString(ReviewManifest);

/**
 * A folder of renders: its comparison sets (render choice points, each
 * variant seen), and what is in no set.
 */
export const ReviewFolder = Schema.Struct({
  /** The folder's ref: its root's label, then its path under the root. */
  ref: Schema.String,
  title: maybe(Schema.String),
  blurb: maybe(Schema.String),
  /** Its newest file's mtime. */
  mtime: Schema.Finite,
  sets: Schema.Array(ChoicePoint),
  videos: Schema.Array(ReviewVideo),
  images: Schema.Array(ReviewFile),
  docs: Schema.Array(ReviewFile),
  /** Authored file links; omitted by older servers and by project folders. */
  downloads: Schema.optionalKey(Schema.Array(ReviewFile)),
});
export type ReviewFolder = typeof ReviewFolder.Type;

/** `GET /api/review/index`: every folder under the roots with something to review, newest first. */
export const ReviewIndex = Schema.Struct({ folders: Schema.Array(ReviewFolder) });
export type ReviewIndex = typeof ReviewIndex.Type;

/** `GET /review/duration`: a video's length. */
export const ReviewDuration = Schema.Struct({ seconds: Seconds });
export type ReviewDuration = typeof ReviewDuration.Type;

/** `GET /api/films`: the app's films, each with its choices at `?film=<film>`. */
export const ReviewFilms = Schema.Struct({ films: Schema.Array(Schema.String) });
export type ReviewFilms = typeof ReviewFilms.Type;
