/**
 * Each stem as a MIDI file for the sampler: the hymn file's own tempo,
 * meter and key events at their own ticks, and the stem's notes at their
 * original ticks. Only velocities are set (per part, humanised by a ±5 drawn
 * as the listening pilot drew it, by Python's `random` seeded by the hymn and
 * the stem) and a part may be transposed.
 * No onset moves, so the recording keeps the MIDI's clock.
 */

import type { Midi } from '../../src/midi.js';
import type { Voices } from '../../src/voices.js';
import { pythonRandom } from './random.js';
import type { Part, Stem } from './style.js';

/** A note the stem plays: ticks, key and velocity. */
export interface StemNote {
  readonly start: number;
  readonly end: number;
  readonly key: number;
  readonly velocity: number;
}

const PARTS: ReadonlyArray<Part> = ['S', 'A', 'T', 'B'];

const byTuple = (a: StemNote, b: StemNote) =>
  a.start - b.start || a.end - b.end || a.key - b.key || a.velocity - b.velocity;

/**
 * The stem's notes, by start: its parts, transposed and humanised. One key
 * sounds once at a time: a later onset ends the note before it, and two
 * onsets on one tick are one note, the longer and the louder.
 */
export const stemNotes = (
  voices: Voices,
  stem: Stem,
  seed: string,
  humanise: number,
): StemNote[] => {
  const { randint } = pythonRandom(seed);
  const notes: StemNote[] = [];
  for (const part of PARTS) {
    const velocity = stem.parts[part];
    if (velocity === undefined) continue;
    for (const note of voices[part]) {
      const moved = randint(-humanise, humanise);
      notes.push({
        start: note.start,
        end: note.end,
        key: note.key + stem.transpose,
        velocity: Math.max(1, Math.min(127, velocity + moved)),
      });
    }
  }
  const byKey = new Map<number, StemNote[]>();
  for (const note of notes.sort(byTuple)) {
    const merged = byKey.get(note.key) ?? [];
    const last = merged.at(-1);
    if (last !== undefined && last.start === note.start) {
      merged[merged.length - 1] = {
        ...last,
        end: Math.max(last.end, note.end),
        velocity: Math.max(last.velocity, note.velocity),
      };
      continue;
    }
    if (last !== undefined && last.end > note.start) {
      merged[merged.length - 1] = { ...last, end: note.start };
    }
    merged.push(note);
    byKey.set(note.key, merged);
  }
  return [...byKey.values()].flat().sort(byTuple);
};

const varint = (n: number): number[] => {
  const bytes = [n & 0x7f];
  for (let rest = n >>> 7; rest > 0; rest >>>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
};

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

const chunk = (id: string, body: ReadonlyArray<number>) => [
  ...[...id].map((c) => c.charCodeAt(0)),
  ...u32(body.length),
  ...body,
];

/** Events at absolute ticks as one track's bytes, in the order given, closed by end-of-track. */
const track = (events: ReadonlyArray<{ readonly tick: number; readonly bytes: number[] }>) => {
  const body: number[] = [];
  let last = 0;
  for (const event of events) {
    body.push(...varint(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  return chunk('MTrk', [...body, 0, 0xff, 0x2f, 0]);
};

/**
 * The hymn file's conductor: every tempo, meter and key event at its own
 * tick, by tick (the file's order at one tick). A meter is written with the
 * standard 24 clocks a click and 8 32nds a quarter: the sampler times by
 * tempo alone.
 */
const conductor = (midi: Midi) =>
  [
    ...midi.tempos.map((t) => ({
      tick: t.tick,
      bytes: [
        0xff,
        0x51,
        3,
        (t.microsPerQuarter >> 16) & 0xff,
        (t.microsPerQuarter >> 8) & 0xff,
        t.microsPerQuarter & 0xff,
      ],
    })),
    ...midi.timeSignatures.map((m) => ({
      tick: m.tick,
      bytes: [0xff, 0x58, 4, m.numerator, Math.log2(m.denominator), 24, 8],
    })),
    ...midi.keySignatures.map((k) => ({
      tick: k.tick,
      bytes: [0xff, 0x59, 2, k.fifths & 0xff, k.minor ? 1 : 0],
    })),
  ].sort((a, b) => a.tick - b.tick);

/**
 * A type 1 file of two tracks, the conductor and the notes on channel 1. A
 * note lasts at least a tick. At one tick the note-offs come before the
 * note-ons, each by key.
 */
export const stemMidi = (midi: Midi, notes: ReadonlyArray<StemNote>): Uint8Array => {
  const events = notes
    .flatMap((n) => [
      { tick: n.start, on: 1, key: n.key, bytes: [0x90, n.key, n.velocity] },
      { tick: Math.max(n.end, n.start + 1), on: 0, key: n.key, bytes: [0x80, n.key, 0] },
    ])
    .sort((a, b) => a.tick - b.tick || a.on - b.on || a.key - b.key);
  const tpb = midi.ticksPerBeat;
  return new Uint8Array([
    ...chunk('MThd', [0, 1, 0, 2, (tpb >> 8) & 0xff, tpb & 0xff]),
    ...track(conductor(midi)),
    ...track(events),
  ]);
};
