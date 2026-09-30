// The review on the wire: the folders it lists (a film's project folder by
// its catalogue, a montage by its manifest), each with its comparison sets
// (render choice points, `choice.ts`) and the files in no set. Pure: the
// review's server and its page share them.

import { Effect, Schema } from 'effect';
import { ChoicePoint } from './choice.ts';
import { ReviewFile, ReviewVideo } from './served.ts';

export { ReviewFile, ReviewVideo } from './served.ts';

const Seconds = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

/** A key a JSON file may leave out, read as an `Option`. */
const maybe = <S extends Schema.Top>(schema: S) => Schema.OptionFromOptionalKey(schema);

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

/**
 * A montage's `review.json`: the record the review lists a folder of
 * hand-made clips by (a film's renders are listed by their catalogue). A
 * title and a line for the folder, the videos, images and docs it shows, and
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
  sets: orElse(Schema.Record(Schema.String, ManifestSet), {}),
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
});
export type ReviewFolder = typeof ReviewFolder.Type;

/** `GET /review/index`: every folder under the roots with something to review, newest first. */
export const ReviewIndex = Schema.Struct({ folders: Schema.Array(ReviewFolder) });
export type ReviewIndex = typeof ReviewIndex.Type;

/** `GET /review/duration`: a video's length. */
export const ReviewDuration = Schema.Struct({ seconds: Seconds });
export type ReviewDuration = typeof ReviewDuration.Type;

/** `GET /review/films`: the app's films, each with its choices at `?film=<film>`. */
export const ReviewFilms = Schema.Struct({ films: Schema.Array(Schema.String) });
export type ReviewFilms = typeof ReviewFilms.Type;
