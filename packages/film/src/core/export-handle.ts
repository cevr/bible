// The export page's handle, declared once: what the player in export mode
// (`?export`) hands out on `window.__film`, and what crosses the page
// boundary for each call. The page implements `ExportHandle`
// (player/main.ts); the tools call it through one typed path that decodes
// every answer with its schema here (`FramePage.call`, tools/browser.ts), and
// the test fake answers the same calls in memory (tools/testing.ts). A new
// capability is a row in `CallArgs` and in `Answers`, and a type error in
// each of those three places until it is written there.

import { Schema } from 'effect';
import { type Encoder, EncoderChoice } from './encoder.ts';
import { type ExportInfo, FaceMark, HandMark, Probed } from './schema.ts';

/** The formats a frame or a look-book comes back in: PNG (lossless) or JPEG. */
export const FrameFormat = Schema.Literals(['image/png', 'image/jpeg']);
export type FrameFormat = typeof FrameFormat.Type;

/** A rectangle of a frame in canvas px, and the grid its luma is sampled down to. */
export const LumaArea = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite,
  h: Schema.Finite,
  cols: Schema.Int,
  rows: Schema.Int,
});
export type LumaArea = typeof LumaArea.Type;

/** The look pass's frames: thumbs end to end, and each frame's faces and hands. */
export const LookedFrames = Schema.Struct({
  thumbs: Schema.Uint8ArrayFromBase64,
  faces: Schema.Array(Schema.Array(FaceMark)),
  hands: Schema.Array(Schema.Array(HandMark)),
});
export type LookedFrames = typeof LookedFrames.Type;

/**
 * Where a chunk's time went in the page, in ms: drawing its frames (each
 * drawn and rastered, the encoders not yet handed it), and the whole call
 * (drawing, encoding and the base64 of its bytes). The tools add the
 * transfer: the call's wall time outside the page.
 */
export const ChunkTiming = Schema.Struct({
  draw: Schema.Finite,
  page: Schema.Finite,
});
export type ChunkTiming = typeof ChunkTiming.Type;

/** A chunk from the page (player/encode.ts): the master, the share copy if asked for, and its timing. */
export const EncodedChunk = Schema.Struct({
  master: Schema.Uint8ArrayFromBase64,
  share: Schema.OptionFromOptionalKey(Schema.Uint8ArrayFromBase64),
  timing: ChunkTiming,
});
export type EncodedChunk = typeof EncodedChunk.Type;

/**
 * Every call the export handle answers, and its arguments, as the tools pass
 * them and the page receives them (plain data: they cross as they are).
 */
export interface CallArgs {
  /** Draw frame `i` and return it encoded. */
  readonly frame: readonly [i: number, format: FrameFormat];
  /** Draw frame `i` with the probe on: every line of text and mark of ink it draws, in canvas pixels. */
  readonly probe: readonly [i: number];
  /** Compose the film's look-book (`composeLookbook`) and return it encoded. */
  readonly lookbook: readonly [format: FrameFormat];
  /**
   * The first of `candidates` the film can be encoded with here at `scale`
   * (with its share copy when `share`), or none (`encoderChoice`).
   */
  readonly encoder: readonly [scale: number, share: boolean, candidates: ReadonlyArray<Encoder>];
  /**
   * Frames `[from, to)` encoded by `encoder` as an H.264 MP4 at `scale`
   * (`encodeChunk`), with `share` a small copy beside it, and where the
   * page's time went.
   */
  readonly encode: readonly [
    from: number,
    to: number,
    scale: number,
    share: boolean,
    encoder: Encoder,
  ];
  /** `frames` tiled into the contact sheet (`composeContact`), as a JPEG. */
  readonly contact: readonly [frames: ReadonlyArray<number>];
  /**
   * `frames` drawn without captions, each shrunk to a `w` × `h` RGBA thumb
   * (end to end), and the faces and hands each declared (`lookFrames`).
   */
  readonly look: readonly [frames: ReadonlyArray<number>, w: number, h: number];
  /** Frame `i` drawn, and the luma (0–255) of `area`, sampled down to its grid, row by row. */
  readonly luma: readonly [i: number, area: LumaArea];
  /**
   * `frames` drawn one by one, each rastered before the clock stops, and the
   * ms each took: the draw alone, with no encoder or transfer in it.
   */
  readonly drawTimes: readonly [frames: ReadonlyArray<number>];
}

/** A call's name. */
export type ExportCall = keyof CallArgs;

/** Each call's answer as it crosses the page boundary (bytes as base64), and as the tools decode it. */
const Answers = {
  frame: Schema.Uint8ArrayFromBase64,
  probe: Probed,
  lookbook: Schema.Uint8ArrayFromBase64,
  encoder: EncoderChoice,
  encode: EncodedChunk,
  contact: Schema.Uint8ArrayFromBase64,
  look: LookedFrames,
  luma: Schema.Array(Schema.Finite),
  drawTimes: Schema.Array(Schema.Finite),
} satisfies { readonly [K in ExportCall]: Schema.Top };

/** Each call's answer as the page hands it back (bytes as base64). */
export type WireAnswers = { readonly [K in ExportCall]: (typeof Answers)[K]['Encoded'] };

/** Each call's answer as the tools hold it, decoded. */
export type CallAnswers = { readonly [K in ExportCall]: (typeof Answers)[K]['Type'] };

/** Each call's answer schema, typed call by call. */
export type AnswerSchemas = {
  readonly [K in ExportCall]: Schema.Codec<CallAnswers[K], WireAnswers[K]>;
};

/** Each call's answer schema, typed call by call, so one decode serves them all (`FramePage.call`). */
export const ExportAnswers: AnswerSchemas = Answers;

/** Every call of the handle, as the page answers it (bytes as base64). */
export type HandleCalls = {
  readonly [K in ExportCall]: (...args: CallArgs[K]) => WireAnswers[K] | Promise<WireAnswers[K]>;
};

/** What the export page hands out on `window.__film`: the film's info, and every call. */
export interface ExportHandle extends HandleCalls {
  readonly info: typeof ExportInfo.Encoded;
}
