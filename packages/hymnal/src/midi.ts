/**
 * Standard MIDI File reading: the notes, programs, meters and keys a hymn's
 * file holds, by track. Times are in ticks; `ticksPerBeat` turns them into
 * quarter-note beats.
 */

import { Effect, Schema } from 'effect';

export class MidiParseError extends Schema.TaggedError<MidiParseError>()('MidiParseError', {
  offset: Schema.Finite,
  reason: Schema.String,
}) {}

export interface Note {
  readonly start: number;
  readonly end: number;
  readonly key: number;
  readonly channel: number;
}

export interface Track {
  readonly name: string;
  readonly notes: readonly Note[];
  /** The first program change on the track, when it has one. */
  readonly program: number | undefined;
}

export interface TimeSignature {
  readonly tick: number;
  readonly numerator: number;
  readonly denominator: number;
}

export interface KeySignature {
  readonly tick: number;
  /** Flats are negative, sharps positive (-7..7). */
  readonly fifths: number;
  readonly minor: boolean;
}

export interface Midi {
  readonly ticksPerBeat: number;
  readonly tracks: readonly Track[];
  readonly timeSignatures: readonly TimeSignature[];
  readonly keySignatures: readonly KeySignature[];
}

class Malformed {
  constructor(
    readonly offset: number,
    readonly reason: string,
  ) {}
}

class Reader {
  offset = 0;
  constructor(private readonly bytes: Uint8Array) {}

  get done() {
    return this.offset >= this.bytes.length;
  }

  u8(): number {
    const byte = this.bytes[this.offset];
    if (byte === undefined) throw new Malformed(this.offset, 'unexpected end of file');
    this.offset += 1;
    return byte;
  }

  u16(): number {
    return (this.u8() << 8) | this.u8();
  }

  u32(): number {
    return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0;
  }

  /** A variable-length quantity: seven bits a byte, the high bit set on all but the last. */
  varint(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Malformed(this.offset, 'variable-length quantity longer than four bytes');
  }

  ascii(length: number): string {
    return String.fromCharCode(...this.take(length));
  }

  take(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) {
      throw new Malformed(this.offset, 'unexpected end of file');
    }
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}

const latin1 = new TextDecoder('latin1');

/** A track as it is read: the running status, its name and program, and the notes still sounding. */
class TrackReader {
  tick = 0;
  status = 0;
  name = '';
  program: number | undefined;
  readonly notes: Note[] = [];
  // Sounding notes by channel and key, oldest first, so a re-struck key closes in order.
  private readonly sounding = new Map<number, number[]>();

  constructor(
    private readonly reader: Reader,
    private readonly meters: TimeSignature[],
    private readonly keys: KeySignature[],
  ) {}

  /** A meta event; false at the end of the track. */
  meta(): boolean {
    const type = this.reader.u8();
    const data = this.reader.take(this.reader.varint());
    if (type === 0x03 && this.name === '') this.name = latin1.decode(data).trim();
    if (type === 0x58 && data.length >= 2) {
      this.meters.push({
        tick: this.tick,
        numerator: data[0] ?? 4,
        denominator: 2 ** (data[1] ?? 2),
      });
    }
    if (type === 0x59 && data.length >= 2) {
      this.keys.push({
        tick: this.tick,
        fifths: ((data[0] ?? 0) << 24) >> 24,
        minor: data[1] === 1,
      });
    }
    return type !== 0x2f;
  }

  channel(byte: number) {
    this.status = byte;
    const kind = byte & 0xf0;
    const channel = byte & 0x0f;
    if (kind === 0xc0 || kind === 0xd0) {
      const value = this.reader.u8();
      if (kind === 0xc0 && this.program === undefined) this.program = value;
      return;
    }
    const key = this.reader.u8();
    const velocity = this.reader.u8();
    const at = channel * 128 + key;
    if (kind === 0x90 && velocity > 0) {
      this.sounding.set(at, [...(this.sounding.get(at) ?? []), this.tick]);
    } else if (kind === 0x80 || kind === 0x90) {
      const started = this.sounding.get(at)?.shift();
      if (started !== undefined) this.notes.push({ start: started, end: this.tick, key, channel });
    }
  }

  /** The next event; false at the end of the track. */
  event(): boolean {
    this.tick += this.reader.varint();
    let byte = this.reader.u8();
    if (byte < 0x80) {
      if (this.status === 0) {
        throw new Malformed(this.reader.offset - 1, 'data byte with no running status');
      }
      this.reader.offset -= 1;
      byte = this.status;
    }
    if (byte === 0xff) return this.meta();
    if (byte === 0xf0 || byte === 0xf7) this.reader.take(this.reader.varint());
    else this.channel(byte);
    return true;
  }
}

const readTrack = (
  reader: Reader,
  end: number,
  meters: TimeSignature[],
  keys: KeySignature[],
): Track => {
  const track = new TrackReader(reader, meters, keys);
  while (reader.offset < end && track.event()) {}
  reader.offset = end;
  const notes = track.notes.sort((a, b) => a.start - b.start || a.key - b.key);
  return { name: track.name, notes, program: track.program };
};

const read = (bytes: Uint8Array): Midi => {
  const reader = new Reader(bytes);
  if (reader.ascii(4) !== 'MThd') throw new Malformed(0, 'not a MIDI file');
  const headerEnd = reader.u32() + reader.offset;
  reader.u16();
  const count = reader.u16();
  const division = reader.u16();
  if (division & 0x8000) throw new Malformed(12, 'SMPTE time division is not supported');
  reader.offset = headerEnd;

  const tracks: Track[] = [];
  const timeSignatures: TimeSignature[] = [];
  const keySignatures: KeySignature[] = [];
  while (tracks.length < count && !reader.done) {
    const id = reader.ascii(4);
    const end = reader.u32() + reader.offset;
    if (id === 'MTrk') tracks.push(readTrack(reader, end, timeSignatures, keySignatures));
    else reader.offset = end;
  }
  const byTick = <A extends { readonly tick: number }>(xs: A[]) =>
    xs.sort((a, b) => a.tick - b.tick);
  return {
    ticksPerBeat: division,
    tracks,
    timeSignatures: byTick(timeSignatures),
    keySignatures: byTick(keySignatures),
  };
};

/** Reads a Standard MIDI File (format 0 or 1, metrical time). */
export const parse = (bytes: Uint8Array): Effect.Effect<Midi, MidiParseError> =>
  Effect.try({
    try: () => read(bytes),
    catch: (error) =>
      error instanceof Malformed
        ? MidiParseError.make({ offset: error.offset, reason: error.reason })
        : MidiParseError.make({ offset: -1, reason: String(error) }),
  });
