/**
 * Writes small Standard MIDI Files for the tests: each voice a list of
 * [key, beats] pairs (key 0 a rest), laid out as the hymnal's files are.
 */

export type Voice = ReadonlyArray<readonly [key: number, beats: number]>;

export interface FixtureTrack {
  readonly name?: string;
  readonly program?: number;
  /** Voices sharing the track, as the hymnal's "SA TB" files pair them. */
  readonly voices: readonly Voice[];
}

export interface Fixture {
  readonly ticksPerBeat?: number;
  readonly meter?: readonly [numerator: number, denominator: number];
  /** The key signature's sharps (flats below 0); `null` writes none, as 39 of the hymnal's files have none. */
  readonly fifths?: number | null;
  readonly tracks: readonly FixtureTrack[];
}

const varint = (n: number): number[] => {
  const bytes = [n & 0x7f];
  for (let rest = n >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
};

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const chunk = (id: string, body: readonly number[]) => [...ascii(id), ...u32(body.length), ...body];

/** Events at absolute ticks, written as delta times; note-offs sort before note-ons at a tick. */
const trackBody = (events: Array<{ tick: number; order: number; bytes: number[] }>) => {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  let last = 0;
  const body: number[] = [];
  for (const event of events) {
    body.push(...varint(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  return [...body, 0, 0xff, 0x2f, 0];
};

export const write = (fixture: Fixture): Uint8Array => {
  const tpb = fixture.ticksPerBeat ?? 384;
  const [numerator, denominator] = fixture.meter ?? [4, 4];
  const signature =
    fixture.fifths === null
      ? []
      : [{ tick: 0, order: 0, bytes: [0xff, 0x59, 2, (fixture.fifths ?? 0) & 0xff, 0] }];
  const conductor = trackBody([
    { tick: 0, order: 0, bytes: [0xff, 0x58, 4, numerator, Math.log2(denominator), 24, 8] },
    ...signature,
  ]);
  const tracks = fixture.tracks.map((track, i) => {
    const channel = i % 16;
    const events: Array<{ tick: number; order: number; bytes: number[] }> = [];
    if (track.name !== undefined) {
      const name = ascii(track.name);
      events.push({ tick: 0, order: 0, bytes: [0xff, 0x03, ...varint(name.length), ...name] });
    }
    if (track.program !== undefined) {
      events.push({ tick: 0, order: 0, bytes: [0xc0 | channel, track.program] });
    }
    for (const voice of track.voices) {
      let tick = 0;
      for (const [key, beats] of voice) {
        const end = tick + Math.round(beats * tpb);
        if (key > 0) {
          events.push({ tick, order: 2, bytes: [0x90 | channel, key, 80] });
          events.push({ tick: end, order: 1, bytes: [0x90 | channel, key, 0] });
        }
        tick = end;
      }
    }
    return chunk('MTrk', trackBody(events));
  });
  const header = chunk('MThd', [0, 1, 0, tracks.length + 1, (tpb >> 8) & 0xff, tpb & 0xff]);
  return new Uint8Array([...header, ...chunk('MTrk', conductor), ...tracks.flat()]);
};

/**
 * "Praise to the Lord" (SDA Hymnal 1, LOBE DEN HERREN, harm. W. S. Bennett,
 * 1863), bars 1 to 6 as the hymnal prints them: soprano, alto, tenor, bass.
 */
export const praiseToTheLord: readonly Voice[] = [
  [
    [65, 1],
    [65, 1],
    [72, 1],
    [69, 1.5],
    [67, 0.5],
    [65, 1],
    [64, 1],
    [62, 1],
    [60, 1],
    [62, 1],
    [64, 1],
    [65, 1],
    [67, 3],
    [65, 3],
  ],
  [
    [60, 1],
    [62, 1],
    [60, 1],
    [65, 1.5],
    [64, 0.5],
    [62, 1],
    [60, 1],
    [58, 1],
    [57, 1],
    [58, 1],
    [58, 1],
    [57, 1],
    [62, 1],
    [60, 1],
    [58, 1],
    [57, 3],
  ],
  [
    [57, 1],
    [57, 1],
    [55, 1],
    [60, 1.5],
    [60, 0.5],
    [57, 1],
    [57, 1],
    [53, 1],
    [53, 1],
    [53, 1],
    [55, 1],
    [53, 1],
    [53, 1],
    [52, 2],
    [53, 3],
  ],
  [
    [53, 1],
    [50, 1],
    [52, 1],
    [53, 1.5],
    [48, 0.5],
    [50, 1],
    [45, 1],
    [46, 1],
    [41, 1],
    [46, 1],
    [43, 1],
    [50, 1],
    [46, 1],
    [48, 2],
    [41, 3],
  ],
];
