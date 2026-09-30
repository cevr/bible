// A file the review serves where it lies, named by its ref: what a variant
// is seen or heard as, and what a folder lists. Pure.

import { Schema } from 'effect';

/**
 * A file the review serves where it lies, named by `ref`: its review root's
 * label, then its path under that root (`out/art3/roof.A.share.mp4`). Every
 * review route takes a ref, never a path on the box.
 */
export const ReviewFile = Schema.Struct({
  ref: Schema.String,
  name: Schema.String,
  size: Schema.Finite,
  /** Last modified, ms since the epoch. */
  mtime: Schema.Finite,
});
export type ReviewFile = typeof ReviewFile.Type;

/**
 * A video, and its 720p phone copy's state: only a big video gets one (a
 * phone streams it in place of the master), made in the background.
 */
export const ReviewVideo = Schema.Struct({
  ...ReviewFile.fields,
  phone: Schema.Literals(['none', 'pending', 'ready']),
});
export type ReviewVideo = typeof ReviewVideo.Type;
