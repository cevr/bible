// A recording as the studio posts it: one channel of 24-bit little-endian PCM
// in a RIFF/WAVE file, at the rate the capture ran at. The server keeps the
// upload byte for byte and makes a 24-bit FLAC master from it, so a 24-bit
// file loses nothing on the way (a 16-bit one would round away the quietest
// 8 bits the microphone gave). Pure: the page and the tests share it.

/** What the capture heard: mono samples in −1..1, at `rate` per second. */
export interface Pcm {
  readonly rate: number;
  readonly samples: Float32Array;
}

/** The canonical PCM header's length: RIFF, fmt and data chunk heads. */
export const WAV_HEADER_BYTES = 44;

const BYTES_PER_SAMPLE = 3;
const FULL_SCALE = 0x7fffff;

const writeAscii = (view: DataView, at: number, text: string) => {
  for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
};

/**
 * A sample as signed 24-bit PCM: clipped at full scale, never wrapped, and
 * rounded half away from zero, so a waveform and its inverse encode alike.
 */
const int24 = (x: number) => {
  const scaled = Math.max(-1, Math.min(1, x)) * FULL_SCALE;
  return Math.sign(scaled) * Math.round(Math.abs(scaled));
};

/** `pcm` as a 24-bit mono WAV file. */
export const encodeWav = (pcm: Pcm): Uint8Array => {
  const data = pcm.samples.length * BYTES_PER_SAMPLE;
  const bytes = new Uint8Array(WAV_HEADER_BYTES + data);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, WAV_HEADER_BYTES - 8 + data, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  // Format 1: integer PCM.
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, pcm.rate, true);
  view.setUint32(28, pcm.rate * BYTES_PER_SAMPLE, true);
  view.setUint16(32, BYTES_PER_SAMPLE, true);
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, data, true);
  for (let i = 0; i < pcm.samples.length; i++) {
    const v = int24(pcm.samples[i] ?? 0);
    const at = WAV_HEADER_BYTES + i * BYTES_PER_SAMPLE;
    view.setUint8(at, v & 0xff);
    view.setUint8(at + 1, (v >> 8) & 0xff);
    view.setUint8(at + 2, (v >> 16) & 0xff);
  }
  return bytes;
};

/** How long a WAV `encodeWav` made plays, in seconds. */
export const wavSeconds = (wav: Uint8Array): number => {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const rate = view.getUint32(24, true);
  if (rate === 0) return 0;
  return view.getUint32(40, true) / BYTES_PER_SAMPLE / rate;
};
