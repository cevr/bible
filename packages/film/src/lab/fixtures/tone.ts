// A fake microphone's input for the browser tests: a 16-bit WAV of a 440 Hz
// sine at `amplitude` of full scale, the file Chromium's fake capture device
// plays (`--use-file-for-fake-audio-capture`, written by `browsers.ts`). Mono by
// default; `left-only` is a two-input interface with the voice on input 1 and
// silence on input 2.

/** How the tone is laid out: its rate, and its channels. */
interface ToneLayout {
  readonly rate: number;
  readonly channels: 'mono' | 'left-only';
}

const MONO_48K: ToneLayout = { rate: 48000, channels: 'mono' };

const CHANNELS = { mono: 1, 'left-only': 2 } as const;

/** `seconds` of a 440 Hz sine at `amplitude`, as a 16-bit WAV of `layout`. */
export const tone = (
  seconds: number,
  amplitude: number,
  layout: ToneLayout = MONO_48K,
): Uint8Array => {
  const { rate } = layout;
  const channels = CHANNELS[layout.channels];
  const n = rate * seconds;
  const frame = channels * 2;
  const bytes = new Uint8Array(44 + n * frame);
  const v = new DataView(bytes.buffer);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + n * frame, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * frame, true);
  v.setUint16(32, frame, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, n * frame, true);
  for (let i = 0; i < n; i++)
    // Input 1 carries the tone; input 2 (when there is one) stays silent.
    v.setInt16(
      44 + i * frame,
      Math.round(amplitude * 32767 * Math.sin((2 * Math.PI * 440 * i) / rate)),
      true,
    );
  return bytes;
};
