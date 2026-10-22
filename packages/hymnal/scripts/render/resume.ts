/**
 * The resume: a hymn's key is the sha256 of its MIDI file and the config
 * (`configHash`: the style, the instrument lock, the sampler's sha256,
 * NodeAV's version, the credits and the modules that shape the sound,
 * `AUDIO_SOURCES` in `run.ts`). A hymn whose record holds its key, or a key
 * of a config that sounds the same (`SAME_SOUND`), and whose MP3 still has
 * the recorded sha256, stands: it is checked again from its record and kept
 * when it passes. Any other is rendered. Pure.
 */

/** The sha256 of each named part, in order: one hash of a list (a file goes in as its own sha256). */
export const hashOf = (parts: ReadonlyArray<readonly [string, string]>) => {
  const hasher = new Bun.CryptoHasher('sha256');
  for (const [name, text] of parts) {
    hasher.update(`${name}\0`);
    hasher.update(text);
    hasher.update('\0');
  }
  return hasher.digest('hex');
};

/** A hymn's key: its MIDI file's sha256 under one config. */
export const keyOf = (config: string, midiSha256: string) =>
  hashOf([
    ['config', config],
    ['midi', midiSha256],
  ]);

/**
 * Configs whose recordings are byte for byte those of a later config: a
 * hymn rendered under `config` stands while today's config is `sounds`.
 * Each pair holds only for that later config, so any change to what shapes
 * the sound ends it. A pair is proved once, by the same audio sources and
 * by MP3s rendered under `sounds` whose sha256 equals the records' under
 * `config` (`tmp/orchestrate/hymnapp/render/round-2-request.md`).
 *
 * - `681f4a71…`: the config of `e41d01667`, under which `warm-1` was
 *   rendered; its key hashed every file in `scripts/render/`.
 */
export const SAME_SOUND: ReadonlyArray<{ readonly config: string; readonly sounds: string }> = [
  {
    config: '681f4a71a8bc3f8ab2604f9f07f55435f092b05bd5abf6ba0b489d81794a7c4f',
    sounds: 'd64f5b1fbd0f75c088169515be5754b0fe0112b2b723da82ead194ba20a3b9e4',
  },
];

/** Every key a hymn's record may hold and stand under `config`: its own, and each earlier config's that sounds the same. */
export const keysOf = (
  config: string,
  midiSha256: string,
  same: ReadonlyArray<{ readonly config: string; readonly sounds: string }> = SAME_SOUND,
) => [
  keyOf(config, midiSha256),
  ...same.filter((s) => s.sounds === config).map((s) => keyOf(s.config, midiSha256)),
];

/** What the resume makes of a hymn's last record. */
export type Resume = 'render' | 'check';

/** Check a hymn again when its record holds one of `keys` and its MP3 is the recorded file; else render it. */
export const resumeOf = (
  record: { readonly key: string; readonly sha256: string } | undefined,
  keys: ReadonlyArray<string>,
  mp3Sha256: string | undefined,
): Resume =>
  record !== undefined && keys.includes(record.key) && record.sha256 === mp3Sha256
    ? 'check'
    : 'render';
