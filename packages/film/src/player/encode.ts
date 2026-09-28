// The film encoded in the page: a chunk of frames drawn one by one onto the
// canvas and handed to the browser's H.264 encoder through mediabunny, into
// an MP4 of its own. Bun joins the chunks without re-encoding them
// (tools/media.ts, `join`), so every chunk is encoded alike: the page picks
// its encoder once (`encoderChoice`), and the renderer hands that one to
// every chunk.

import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  type VideoEncodingConfig,
  canEncodeVideo,
} from 'mediabunny';
import type { Encoder, EncoderChoice } from '../core/encoder.ts';

/** How one encoder encodes the master and the share copy. */
interface Settings {
  readonly hardwareAcceleration: 'prefer-hardware' | 'prefer-software';
  readonly master: Quality;
  readonly share: Quality;
}

const SETTINGS = {
  Hardware: {
    hardwareAcceleration: 'prefer-hardware',
    /**
     * The master: quantizer 16, about 37 Mbps at 1080p30 on this film, beside
     * x264's CRF 15 at `slow` in the ffmpeg master it replaces.
     */
    master: new Quality({ quantizer: 16 }),
    /**
     * The share copy: quantizer 26, the smallest that keeps the paper's
     * grain. A 4 Mbps target smoothed the grain away entirely.
     */
    share: new Quality({ quantizer: 26 }),
  },
  Software: {
    hardwareAcceleration: 'prefer-software',
    /**
     * Chromium's software H.264 encoder refuses quantizer rate control
     * ("Unsupported bitrate mode"), so it takes a bitrate. The master asks
     * for the rate the hardware master's quantizer 16 comes to: 31 Mbps over
     * righteousness-by-faith, keeping 82–87% of the paper's fine grain
     * (packages/film/README.md, "Encoders").
     */
    master: new Quality({ bitrate: 37_000_000, bitrateMode: 'variable' }),
    /**
     * The share copy: 24 Mbps, the lowest measured that keeps the grain
     * beside the master's (68–80%). This encoder spends bits far less well
     * than the hardware one: at 8 Mbps it kept 36–50% and the cutouts'
     * grain went flat, at 16 Mbps 60–75% and visibly softer.
     */
    share: new Quality({ bitrate: 24_000_000, bitrateMode: 'variable' }),
  },
} satisfies Readonly<Record<Encoder['_tag'], Settings>>;

/** The encoders in the order they are tried: hardware first, so a machine that has it never renders in software. */
const PREFERENCE: ReadonlyArray<Encoder> = [{ _tag: 'Hardware' }, { _tag: 'Software' }];

/**
 * The first encoder `can` encode with, tried in `PREFERENCE` order and no
 * further once one says yes; `Missing` with `reason` when none does.
 */
export const chooseEncoder = (
  can: (encoder: Encoder) => Promise<boolean>,
  reason: string,
): Promise<EncoderChoice> =>
  PREFERENCE.reduce<Promise<EncoderChoice>>(
    (before, encoder) =>
      before.then((found) =>
        found._tag === 'Missing' ? can(encoder).then((yes) => (yes ? encoder : found)) : found,
      ),
    Promise.resolve({ _tag: 'Missing', reason }),
  );

/** A key frame every this many seconds, and at the start of every chunk. */
const KEY_FRAME_EVERY = 2;

/** H.264 wants even dimensions. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** The size a frame is encoded at: the canvas, scaled by `scale`. */
export const encodedSize = (width: number, height: number, scale: number) => ({
  width: even(width * scale),
  height: even(height * scale),
});

const config = (
  width: number,
  height: number,
  scale: number,
  encoder: Encoder,
  quality: Quality,
): VideoEncodingConfig => {
  const base: VideoEncodingConfig = {
    codec: 'avc',
    quality,
    hardwareAcceleration: SETTINGS[encoder._tag].hardwareAcceleration,
    keyFrameInterval: KEY_FRAME_EVERY,
    latencyMode: 'quality',
  };
  if (scale === 1) return base;
  return { ...base, transform: { ...encodedSize(width, height, scale), fit: 'fill' } };
};

/**
 * The encoder this browser encodes the film with at `scale`: the first that
 * takes both the master's and the share copy's settings. The renderer asks
 * once, before drawing a frame.
 */
export const encoderChoice = (
  canvas: HTMLCanvasElement,
  fps: number,
  scale: number,
): Promise<EncoderChoice> => {
  const size = encodedSize(canvas.width, canvas.height, scale);
  const can = (encoder: Encoder) => {
    const settings = SETTINGS[encoder._tag];
    return Promise.all(
      [settings.master, settings.share].map((quality) =>
        canEncodeVideo('avc', {
          ...size,
          quality,
          hardwareAcceleration: settings.hardwareAcceleration,
          latencyMode: 'quality',
          frameRate: fps,
        }),
      ),
    ).then((each) => each.every(Boolean));
  };
  return chooseEncoder(can, `no H.264 encoder for ${size.width}×${size.height} at ${fps} fps`);
};

/** A chunk encoded: the master, and the share copy when one was asked for. */
export interface EncodedChunk {
  readonly master: Uint8Array;
  readonly share: Uint8Array | undefined;
}

/** One encoder taking the canvas into an MP4 of its own. */
const rendition = (canvas: HTMLCanvasElement, fps: number, video: VideoEncodingConfig) => {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new CanvasSource(canvas, video);
  output.addVideoTrack(source, { frameRate: fps });
  const bytes = () => {
    if (target.buffer === null) throw new Error('the encoder wrote nothing');
    return new Uint8Array(target.buffer);
  };
  return { output, source, bytes };
};

/**
 * Frames `[from, to)` drawn by `draw` onto `canvas` and encoded by `encoder`
 * as an MP4 whose first frame plays at 0, and with `share`, a small copy
 * encoded in the same pass.
 */
export const encodeChunk = async (
  draw: (i: number) => void,
  canvas: HTMLCanvasElement,
  fps: number,
  from: number,
  to: number,
  scale: number,
  share: boolean,
  encoder: Encoder,
): Promise<EncodedChunk> => {
  const { width, height } = canvas;
  const settings = SETTINGS[encoder._tag];
  const master = rendition(canvas, fps, config(width, height, scale, encoder, settings.master));
  const copies = share
    ? [rendition(canvas, fps, config(width, height, scale, encoder, settings.share))]
    : [];
  const all = [master, ...copies];
  // One frame at a time: the canvas is drawn again only once every encoder has taken it.
  const frames = async () => {
    await Promise.all(all.map((r) => r.output.start()));
    await Array.from({ length: to - from }, (_, k) => from + k).reduce(async (before, i) => {
      await before;
      draw(i);
      await Promise.all(all.map((r) => r.source.add((i - from) / fps, 1 / fps)));
    }, Promise.resolve());
    await Promise.all(all.map((r) => r.output.finalize()));
  };
  await frames().catch(async (e: unknown) => {
    await Promise.all(all.map((r) => r.output.cancel()));
    throw e;
  });
  return { master: master.bytes(), share: copies[0]?.bytes() };
};
