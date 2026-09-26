// The film encoded in the page: a chunk of frames drawn one by one onto the
// canvas and handed to the browser's H.264 encoder through mediabunny, into
// an MP4 of its own. Bun joins the chunks without re-encoding them
// (tools/media.ts, `join`), so every chunk is encoded alike.

import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  type VideoEncodingConfig,
  canEncodeVideo,
} from 'mediabunny';

/**
 * H.264 at quantizer 16 on the hardware encoder: on this film, about 33 Mbps
 * at 1080p30, beside x264's CRF 15 at `slow` in the ffmpeg master it replaces.
 */
const QUALITY = new Quality({ quantizer: 16 });

/** A key frame every this many seconds, and at the start of every chunk. */
const KEY_FRAME_EVERY = 2;

/** H.264 wants even dimensions. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** The size a frame is encoded at: the canvas, scaled by `scale`. */
export const encodedSize = (width: number, height: number, scale: number) => ({
  width: even(width * scale),
  height: even(height * scale),
});

const config = (width: number, height: number, scale: number): VideoEncodingConfig => {
  const base: VideoEncodingConfig = {
    codec: 'avc',
    quality: QUALITY,
    hardwareAcceleration: 'prefer-hardware',
    keyFrameInterval: KEY_FRAME_EVERY,
    latencyMode: 'quality',
  };
  if (scale === 1) return base;
  return { ...base, transform: { ...encodedSize(width, height, scale), fit: 'fill' } };
};

/** Whether this browser can encode the film, and if not, why. */
export type EncoderCheck =
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Missing'; readonly reason: string };

/** Can this browser encode the film at `scale`? The renderer asks before drawing a frame. */
export const encoderCheck = async (
  canvas: HTMLCanvasElement,
  fps: number,
  scale: number,
): Promise<EncoderCheck> => {
  const size = encodedSize(canvas.width, canvas.height, scale);
  const { codec, quality, hardwareAcceleration, latencyMode } = config(
    canvas.width,
    canvas.height,
    scale,
  );
  const can = await canEncodeVideo(codec, {
    ...size,
    quality,
    hardwareAcceleration,
    latencyMode,
    frameRate: fps,
  });
  return can
    ? { _tag: 'Ready' }
    : {
        _tag: 'Missing',
        reason: `no H.264 encoder for ${size.width}×${size.height} at ${fps} fps`,
      };
};

/**
 * Frames `[from, to)` drawn by `draw` onto `canvas` and encoded as an MP4 whose
 * first frame plays at 0.
 */
export const encodeChunk = async (
  draw: (i: number) => void,
  canvas: HTMLCanvasElement,
  fps: number,
  from: number,
  to: number,
  scale: number,
): Promise<Uint8Array> => {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new CanvasSource(canvas, config(canvas.width, canvas.height, scale));
  output.addVideoTrack(source, { frameRate: fps });
  // One frame at a time: the canvas is drawn again only once the encoder has taken it.
  const frames = async () => {
    await output.start();
    await Array.from({ length: to - from }, (_, k) => from + k).reduce(async (before, i) => {
      await before;
      draw(i);
      await source.add((i - from) / fps, 1 / fps);
    }, Promise.resolve());
    await output.finalize();
  };
  await frames().catch(async (e: unknown) => {
    await output.cancel();
    throw e;
  });
  if (target.buffer === null) throw new Error('the encoder wrote nothing');
  return new Uint8Array(target.buffer);
};
