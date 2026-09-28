// A fake microphone's input for the browser tests: a 16-bit mono WAV of a
// 440 Hz sine at `amplitude` of full scale, written to a scoped temp file
// Chromium's fake capture device plays (`--use-file-for-fake-audio-capture`).

import { Effect, FileSystem, Path } from 'effect';

const RATE = 48000;

/** `seconds` of a 440 Hz sine at `amplitude`, as a 16-bit mono WAV at 48 kHz. */
export const tone = (seconds: number, amplitude: number): Uint8Array => {
  const n = RATE * seconds;
  const bytes = new Uint8Array(44 + n * 2);
  const v = new DataView(bytes.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++)
    v.setInt16(
      44 + i * 2,
      Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * 440 * i) / RATE)),
      true,
    );
  return bytes;
};

/** The tone written to a temp file for the scope's life: its path. */
export const toneFile = (seconds: number, amplitude: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'film-tone-' });
    const wav = (yield* Path.Path).join(dir, 'tone.wav');
    yield* fs.writeFile(wav, tone(seconds, amplitude));
    return wav;
  });
