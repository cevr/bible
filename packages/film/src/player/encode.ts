// The film encoded in the page: a chunk of frames drawn one by one onto the
// canvas and handed to the browser's H.264 encoder through mediabunny, into
// an MP4 of its own. Bun joins the chunks without re-encoding them
// (tools/media.ts, `join`), so every chunk is encoded alike: the page picks
// its encoder once (`encoderChoice`), from the encoders the renderer allows,
// and the renderer hands that one to every chunk.

import {
  BufferTarget,
  CanvasSource,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  NullTarget,
  Output,
  Quality,
  type VideoEncodingConfig,
  canEncodeVideo,
} from 'mediabunny';
import type { Encoder, EncoderChoice } from '../core/encoder.ts';

/** How one encoder encodes the master, and the share copy when it makes one in the page. */
export interface Settings {
  readonly hardwareAcceleration: 'prefer-hardware' | 'prefer-software';
  readonly master: Quality;
  /** The share copy encoded beside the master, or `null`: that encoder's share is made after the join. */
  readonly share: Quality | null;
  /**
   * Copies of the chunk's first frame encoded ahead of it and dropped, so the
   * chunk opens on a key frame the rate control has settled on.
   */
  readonly preroll: number;
}

export const SETTINGS = {
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
    /** A fixed quantizer has no rate control to settle: the first frame is coded like every other. */
    preroll: 0,
  },
  Software: {
    hardwareAcceleration: 'prefer-software',
    /**
     * Chromium's software H.264 encoder (OpenH264) refuses quantizer rate
     * control ("Unsupported bitrate mode"), so it takes a bitrate: the
     * master asks for 37 Mbps, variable, about what the hardware master's
     * quantizer 16 comes to. What it comes to and the grain it keeps are
     * measured in packages/film/README.md ("Encoders").
     */
    master: new Quality({ bitrate: 37_000_000, bitrateMode: 'variable' }),
    /**
     * No share copy in the page: this encoder kept the grain only at 24 Mbps,
     * 1.16 GB for the film. The share is x264's, made from the joined master
     * (`Media.shareCopy`, tools/media.ts).
     */
    share: null,
    /**
     * OpenH264 codes a session's first frame at a coarse fixed quantizer,
     * whatever the bitrate, so a chunk would open on a soft frame, a blink
     * every chunk (measured in packages/film/README.md, "Software master: the
     * pre-roll"). A later frame is coded at the settled quantizer, so the
     * chunk's first frame goes in twice ahead of itself, stamped before 0, and
     * is dropped.
     */
    preroll: 2,
  },
} satisfies Readonly<Record<Encoder['_tag'], Settings>>;

/**
 * The first of `candidates` that `can` encode with, tried in order and no
 * further once one says yes; `Missing` with `reason` when none does.
 */
export const chooseEncoder = (
  candidates: ReadonlyArray<Encoder>,
  can: (encoder: Encoder) => Promise<boolean>,
  reason: string,
): Promise<EncoderChoice> =>
  candidates.reduce<Promise<EncoderChoice>>(
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

/** What `encoder` is configured with for `quality`, encoding a `width`×`height` canvas at `scale`. */
export const config = (
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

/** The qualities `encoder` encodes in the page: the master's, then the share copy's when `share` and it makes one there. */
export const qualities = (encoder: Encoder, share: boolean): ReadonlyArray<Quality> => {
  const settings = SETTINGS[encoder._tag];
  return [settings.master, ...(share && settings.share !== null ? [settings.share] : [])];
};

/**
 * The encoder this browser encodes the film with at `scale`: the first of
 * `candidates` that takes the master's settings, and the share copy's when
 * `share` and that encoder makes it in the page. The renderer asks once,
 * before drawing a frame.
 */
export const encoderChoice = (
  canvas: HTMLCanvasElement,
  fps: number,
  scale: number,
  share: boolean,
  candidates: ReadonlyArray<Encoder>,
): Promise<EncoderChoice> => {
  const size = encodedSize(canvas.width, canvas.height, scale);
  const can = (encoder: Encoder) =>
    Promise.all(
      qualities(encoder, share).map((quality) =>
        canEncodeVideo('avc', {
          ...size,
          quality,
          hardwareAcceleration: SETTINGS[encoder._tag].hardwareAcceleration,
          latencyMode: 'quality',
          frameRate: fps,
        }),
      ),
    ).then((each) => each.every(Boolean));
  const tried = candidates.map((c) => c._tag.toLowerCase()).join(' or ');
  return chooseEncoder(
    candidates,
    can,
    `no ${tried} H.264 encoder for ${size.width}×${size.height} at ${fps} fps`,
  );
};

/** A chunk encoded: the master, and the share copy when one was made in the page. */
export interface EncodedChunk {
  readonly master: Uint8Array;
  readonly share: Uint8Array | undefined;
}

/** One encoder taking the canvas into an MP4 of its own. */
interface Rendition {
  readonly start: () => Promise<unknown>;
  /** The chunk's first frame, already drawn, encoded ahead of it and dropped. */
  readonly warm: () => Promise<void>;
  /** The canvas as the frame at `t` seconds; `first` is the chunk's first frame. */
  readonly add: (t: number, first: boolean) => Promise<unknown>;
  readonly finalize: () => Promise<unknown>;
  readonly cancel: () => Promise<unknown>;
  readonly bytes: () => Uint8Array;
}

const written = (target: BufferTarget) => () => {
  if (target.buffer === null) throw new Error('the encoder wrote nothing');
  return new Uint8Array(target.buffer);
};

/** The canvas encoded straight into its MP4: every packet the encoder makes is kept. */
const direct = (canvas: HTMLCanvasElement, fps: number, video: VideoEncodingConfig): Rendition => {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const source = new CanvasSource(canvas, video);
  output.addVideoTrack(source, { frameRate: fps });
  return {
    start: () => output.start(),
    warm: () => Promise.resolve(),
    add: (t) => source.add(t, 1 / fps),
    finalize: () => output.finalize(),
    cancel: () => output.cancel(),
    bytes: written(target),
  };
};

/**
 * The canvas encoded in a session of its own (mediabunny still picks the
 * encoder's configuration and scales the frame), whose packets from time 0
 * on are copied into the chunk's MP4: the `preroll` frames stamped before 0
 * settle the rate control and are dropped. mediabunny writes every packet a
 * `CanvasSource` makes, so the session writes into a `NullTarget` and the
 * kept packets go through an `EncodedVideoPacketSource`, the first with the
 * encoder's decoder config. The chunk's first frame is forced to a key frame,
 * so the MP4 opens on one.
 */
const prerolled = (
  canvas: HTMLCanvasElement,
  fps: number,
  video: VideoEncodingConfig,
  preroll: number,
): Rendition => {
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });
  const kept = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(kept, { frameRate: fps });
  const session = new Output({ format: new Mp4OutputFormat(), target: new NullTarget() });
  let decoder: EncodedVideoChunkMetadata | undefined;
  let copied = 0;
  let copying: Promise<unknown> = Promise.resolve();
  const source = new CanvasSource(canvas, {
    ...video,
    onEncodedPacket: (packet, meta) => {
      if (meta?.decoderConfig !== undefined) decoder = meta;
      if (packet.timestamp < 0) return;
      const withConfig = copied === 0 ? decoder : undefined;
      copied += 1;
      copying = copying.then(() => kept.add(packet, withConfig));
    },
  });
  session.addVideoTrack(source, { frameRate: fps });
  return {
    start: () => Promise.all([session.start(), output.start()]),
    warm: () =>
      Array.from({ length: preroll }, (_, k) => (k - preroll) / fps).reduce(async (before, t) => {
        await before;
        await source.add(t, 1 / fps);
      }, Promise.resolve()),
    add: (t, first) => source.add(t, 1 / fps, first ? { keyFrame: true } : undefined),
    finalize: async () => {
      await session.finalize();
      await copying;
      await output.finalize();
    },
    cancel: () => Promise.all([session.cancel(), output.cancel()]),
    bytes: written(target),
  };
};

/** `encoder`'s rendition of the canvas at `quality`. */
const rendition = (
  canvas: HTMLCanvasElement,
  fps: number,
  scale: number,
  encoder: Encoder,
  quality: Quality,
): Rendition => {
  const video = config(canvas.width, canvas.height, scale, encoder, quality);
  const { preroll } = SETTINGS[encoder._tag];
  return preroll === 0 ? direct(canvas, fps, video) : prerolled(canvas, fps, video, preroll);
};

/**
 * Frames `[from, to)` drawn by `draw` onto `canvas` and encoded by `encoder`
 * as an MP4 whose first frame plays at 0, and with `share`, when `encoder`
 * makes one in the page, a small copy encoded in the same pass.
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
  const [master, ...copies] = qualities(encoder, share).map((quality) =>
    rendition(canvas, fps, scale, encoder, quality),
  );
  if (master === undefined) throw new Error('no master to encode');
  const all = [master, ...copies];
  // One frame at a time: the canvas is drawn again only once every encoder has taken it.
  const frames = async () => {
    await Promise.all(all.map((r) => r.start()));
    await Array.from({ length: to - from }, (_, k) => from + k).reduce(async (before, i) => {
      await before;
      draw(i);
      if (i === from) await Promise.all(all.map((r) => r.warm()));
      await Promise.all(all.map((r) => r.add((i - from) / fps, i === from)));
    }, Promise.resolve());
    await Promise.all(all.map((r) => r.finalize()));
  };
  await frames().catch(async (e: unknown) => {
    await Promise.all(all.map((r) => r.cancel()));
    throw e;
  });
  return { master: master.bytes(), share: copies[0]?.bytes() };
};
