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
import { Point } from './schema.ts';

/** What the player's `?export` handle reports about the film it loaded. */
export const ExportInfo = Schema.Struct({
  width: Schema.Int,
  height: Schema.Int,
  fps: Schema.Finite,
  duration: Schema.Finite,
  frames: Schema.Int,
  /** The mixed track's URL, present only when every take is recorded. */
  audio: Schema.optional(Schema.String),
});
export type ExportInfo = typeof ExportInfo.Type;

/**
 * One line of text as drawn, from the text probe, in canvas pixels after the
 * transform it was drawn under: its box as four corners (top-left, top-right,
 * bottom-right, bottom-left; rotated with the text), the axis-aligned box
 * around them (`x, y, w, h`), and its effective opacity. `scene` is the scene
 * that drew it; `order` is when, among everything the probe recorded in the
 * frame (text and ink share one count).
 */
export const TextBox = Schema.Struct({
  text: Schema.String,
  scene: Schema.String,
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite,
  h: Schema.Finite,
  corners: Schema.Tuple([Point, Point, Point, Point]),
  alpha: Schema.Finite,
  order: Schema.Int,
  /**
   * The seed of the hand that wrote it (`f.hand(key)`): which line this is,
   * when two say the same words. A stroke's `marks` names it.
   */
  hand: Schema.optionalKey(Schema.Finite),
  /**
   * The `order` of the plate this line sits on (`probePlate`): the plate
   * carries it, so the two never collide; any other text over the plate does.
   */
  on: Schema.optionalKey(Schema.Int),
  /**
   * How many canvas pixels one unit of the space it was drawn in spans
   * (`sqrt(|det|)` of the transform): what turns a drift on screen back into
   * the drawing's own units.
   */
  scale: Schema.Finite,
  /** Set on the caption line: the voice's words, drawn over the picture. */
  caption: Schema.optionalKey(Schema.Literal(true)),
});
export type TextBox = typeof TextBox.Type;

/**
 * What the ink probe records: a brush `stroke` (its centre line, as drawn,
 * and its width), a `fill` (a cutout's or flat fill's outline) or a declared
 * `plate` under a line of text (`probePlate`, the caption plate). In canvas
 * pixels after its transform, with the box around it, its effective opacity
 * and its place in the frame's drawing order. `marks` names the lines of text
 * a stroke marks on purpose (a strike through it, a ring round it), by the
 * seed of the hand that wrote each: it may cross those lines, and no other,
 * even one with the same words.
 */
export const InkMark = Schema.Struct({
  kind: Schema.Literals(['stroke', 'fill', 'plate']),
  scene: Schema.String,
  points: Schema.Array(Point),
  width: Schema.Finite,
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite,
  h: Schema.Finite,
  alpha: Schema.Finite,
  order: Schema.Int,
  marks: Schema.optionalKey(Schema.Array(Schema.Finite)),
  /** Canvas pixels per unit of the space it was drawn in, as `TextBox.scale`. */
  scale: Schema.Finite,
  /** Set on the caption line's plate. */
  caption: Schema.optionalKey(Schema.Literal(true)),
});
export type InkMark = typeof InkMark.Type;

/**
 * A face the probe saw (`probeFace`, called by a kit's person once the person
 * is drawn): its centre and its height on screen in canvas pixels, its
 * effective opacity, and its place in the frame's drawing order (the count
 * text and ink share), so what is drawn after it is known to lie over it.
 * What `FaceSmall` reads to tell whether a scene ever gives a face human
 * scale, and `InkOverFace` what crosses it.
 */
export const FaceMark = Schema.Struct({
  scene: Schema.String,
  x: Schema.Finite,
  y: Schema.Finite,
  /** The face's height on screen, in canvas pixels. */
  size: Schema.Finite,
  alpha: Schema.Finite,
  order: Schema.Int,
});
export type FaceMark = typeof FaceMark.Type;

/**
 * A grip as shares of each grip's shape, summing to 1: one grip is all of
 * one share; a hand changing grip (`was` into `grip` as `change` goes 0 to
 * 1) splits the two.
 */
export const GripShares = Schema.Struct({
  open: Schema.Finite,
  hold: Schema.Finite,
  point: Schema.Finite,
  palm: Schema.Finite,
});
export type GripShares = typeof GripShares.Type;

/**
 * A hand the probe saw (`probeHand`, called by a kit's person for each of its
 * hands every frame, at rest or at work): where the hand, its shoulder and
 * its target are on screen, how big it is drawn, how far it has travelled to
 * its work, the figure's reach, the grip it works with and how far that is
 * formed, whether the hand sits inside its own body's silhouette and whether
 * it is drawn over it. What `HandJump`, `HandFar` and `HandHidden` read.
 */
export const HandMark = Schema.Struct({
  scene: Schema.String,
  side: Schema.Literals(['far', 'near']),
  /** The hand on screen, in canvas pixels. */
  x: Schema.Finite,
  y: Schema.Finite,
  /** Its shoulder on screen: the same hand is found again a frame on by the shoulder it moves round. */
  sx: Schema.Finite,
  sy: Schema.Finite,
  /** Where it works (its rest when it has no work), on screen. */
  tx: Schema.Finite,
  ty: Schema.Finite,
  /** The hand's length drawn on screen, wrist to fingertips, in px. */
  size: Schema.Finite,
  /** The figure's reach on screen, in px: the farthest a hand works from its shoulder. */
  radius: Schema.Finite,
  /** How far it has travelled from its rest to its work, 0 to 1. */
  reach: Schema.Finite,
  /** The grip it works with: `grip`, or `was` changing into it. */
  grip: GripShares,
  /** How far that grip is formed from the open hand at rest, 0 to 1 (it forms as the hand arrives). */
  formed: Schema.Finite,
  /** The hand lies inside the silhouette of its own body (garment and head). */
  inside: Schema.Boolean,
  /** The hand is drawn over that body, not behind it. */
  over: Schema.Boolean,
  alpha: Schema.Finite,
});
export type HandMark = typeof HandMark.Type;

/** A probed frame: every line of text and every mark of ink it drew, and the faces and hands. */
export const Probed = Schema.Struct({
  texts: Schema.Array(TextBox),
  inks: Schema.Array(InkMark),
  /** Recorded only where the sink asks for faces (the look pass). */
  faces: Schema.optionalKey(Schema.Array(FaceMark)),
  /** Recorded only where the sink asks for hands (the look pass). */
  hands: Schema.optionalKey(Schema.Array(HandMark)),
});
export type Probed = typeof Probed.Type;

/** The formats a frame or a look-book comes back in: PNG (lossless) or JPEG. */
const FrameFormat = Schema.Literals(['image/png', 'image/jpeg']);
type FrameFormat = typeof FrameFormat.Type;

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
const LookedFrames = Schema.Struct({
  thumbs: Schema.Uint8ArrayFromBase64,
  faces: Schema.Array(Schema.Array(FaceMark)),
  hands: Schema.Array(Schema.Array(HandMark)),
});
type LookedFrames = typeof LookedFrames.Type;

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
const EncodedChunk = Schema.Struct({
  master: Schema.Uint8ArrayFromBase64,
  share: Schema.OptionFromOptionalKey(Schema.Uint8ArrayFromBase64),
  timing: ChunkTiming,
});
type EncodedChunk = typeof EncodedChunk.Type;

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
type AnswerSchemas = {
  readonly [K in ExportCall]: Schema.Codec<CallAnswers[K], WireAnswers[K]>;
};

/** Each call's answer schema, typed call by call, so one decode serves them all (`FramePage.call`). */
export const ExportAnswers: AnswerSchemas = Answers;

/** Every call of the handle, as the page answers it (bytes as base64). */
type HandleCalls = {
  readonly [K in ExportCall]: (...args: CallArgs[K]) => WireAnswers[K] | Promise<WireAnswers[K]>;
};

/** What the export page hands out on `window.__film`: the film's info, and every call. */
export interface ExportHandle extends HandleCalls {
  readonly info: typeof ExportInfo.Encoded;
}
