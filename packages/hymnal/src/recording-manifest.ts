/**
 * A rendered set's `manifest.json`: what the render made and what the upload
 * sends. The render writes it once every hymn is done (`scripts/render/`);
 * the upload (`apps/hymnal/infra/audio/upload.ts`) reads it, checks every
 * local file against it, and puts each hymn under `audio/<set>/<key>`.
 *
 * The set is rendered on one host (`platform`): another host's sampler and
 * FFmpeg builds give other bytes, so the tools that made it are recorded by
 * version and hash.
 */

import { Schema } from 'effect';

/** One hymn of the set: its file, its hashes and what its checks measured. */
const ManifestHymn = Schema.Struct({
  hymn: Schema.Int,
  /** The key inside the set (`recordingKey`). */
  key: Schema.String,
  /** The file's name in the set's folder. */
  file: Schema.String,
  bytes: Schema.Int,
  sha256: Schema.String,
  md5: Schema.String,
  seconds: Schema.Finite,
  lufs: Schema.Finite,
  truePeak: Schema.Finite,
  lagMs: Schema.Finite,
  /** Every check of the hymn's record passed. */
  passed: Schema.Boolean,
});

export const RecordingManifest = Schema.Struct({
  set: Schema.String,
  style: Schema.String,
  /** Where it was rendered: `darwin-arm64`. */
  platform: Schema.String,
  /** The sha256 of the style, the instrument lock and the tools: what every hymn's resume key shares. */
  configHash: Schema.String,
  tools: Schema.Struct({
    sfizz: Schema.Struct({ version: Schema.String, sha256: Schema.String }),
    nodeAv: Schema.Struct({ version: Schema.String }),
  }),
  hymns: Schema.Array(ManifestHymn),
});
export type RecordingManifest = typeof RecordingManifest.Type;

/** The manifest as its file's JSON text. */
export const ManifestJson = Schema.fromJsonString(RecordingManifest);
