/**
 * What each stem of a hymn plays: its parts by the style, transposed and
 * humanised by the listening pilot's seed. The render writes these notes as
 * the stems' MIDI files, and the checks read where each stem's last note
 * ends. Pure.
 */

import type { Voices } from '../../src/voices.js';
import { type StemNote, stemNotes } from './stems.js';
import type { Stem, Style } from './style.js';

/** The pilot's seed of a stem's velocities, the hymn padded as its file is named: the same velocities the owner heard. */
export const stemSeed = (hymn: number, style: Pick<Style, 'name'>, stem: Pick<Stem, 'name'>) =>
  `${String(hymn).padStart(3, '0')}-${style.name}-${stem.name}`;

/** Each stem of `style` with its notes for `hymn`, in the style's order. */
export const planOf = (
  parts: Voices,
  style: Pick<Style, 'name' | 'stems' | 'humanise'>,
  hymn: number,
): ReadonlyArray<{ readonly stem: Stem; readonly notes: ReadonlyArray<StemNote> }> =>
  style.stems.map((stem) => ({
    stem,
    notes: stemNotes(parts, stem, stemSeed(hymn, style, stem), style.humanise),
  }));
