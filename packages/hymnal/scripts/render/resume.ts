/**
 * The resume: a hymn's key is the sha256 of its MIDI file and the config
 * (`configHash`: the style, the instrument lock, the sampler's sha256,
 * NodeAV's version and the render's own sources). A hymn whose record holds
 * its key, passed, and whose MP3 still has the recorded sha256 is kept; any
 * other is rendered. Pure.
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

/** What the resume makes of a hymn's last record. */
export type Resume = 'render' | 'keep';

/** Keep a hymn only when its record holds today's key, passed, and its MP3 is the recorded file. */
export const resumeOf = (
  record: { readonly key: string; readonly passed: boolean; readonly sha256: string } | undefined,
  key: string,
  mp3Sha256: string | undefined,
): Resume =>
  record !== undefined && record.key === key && record.passed && record.sha256 === mp3Sha256
    ? 'keep'
    : 'render';
