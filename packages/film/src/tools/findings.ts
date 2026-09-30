// What `film check` reports: every finding it can make, how bad each is
// (`levelOf`), where in the film it is (`addressOf`), and the one `Report`
// every leg's findings come back as. Each finding is a value the check
// collects, never the first failure only; the run fails with `CheckFailed`
// once every one is reported. The legs that find them are in `film-check.ts`.

import { Array as Arr, Match, Schema } from 'effect';
import type {
  CueCycle,
  DuplicateMark,
  DuplicateScene,
  PartOutOfOrder,
  ShortSpanEmpty,
  TurnInvalid,
  ScenesApart,
  UnknownAct,
  UnknownShort,
  UntilBeforeStart,
  MovementTooLong,
  MovementTooShort,
  CueInvalid,
  SoundUseMismatch,
  UnknownCue,
  UnknownMark,
  UnknownScene,
  UnknownSound,
  UnknownVoice,
  WordMissing,
} from '../core/errors.ts';
import { type Address, sceneAddress } from '../core/address.ts';
import { TakeStaleReason } from '../core/narration.ts';
import type { CheckLine, FindingAddress } from '../core/schema.ts';
import { SHORT_RULES } from '../core/shorts.ts';
import type { AudioMissing, AudioStale, LeadIn, SoundStale, SoundUnmade } from './errors.ts';

// ---------------------------------------------------------------------------
// The mix: what the check hears in the mix the film makes now.

/**
 * An effect whose loudest moment (`BALANCE.hotWindow`, as the mix plays it)
 * comes within `BALANCE.hot` dB under the voice around it, or over it: it
 * covers the words.
 */
export class EffectHot extends Schema.TaggedError<EffectHot>()('EffectHot', {
  effect: Schema.String,
  scene: Schema.String,
  at: Schema.Finite,
  /** Its loudest moment against the voice around it, in dB. */
  over: Schema.Finite,
}) {
  override get message() {
    return `effect "${this.effect}" at ${this.at.toFixed(2)}s (scene ${this.scene}) peaks ${this.over.toFixed(1)} dB against the voice around it; lower its level, or re-roll a take whose hit is the problem`;
  }
}

/** The master's integrated loudness off the film's target. */
export class MasterLoudness extends Schema.TaggedError<MasterLoudness>()('MasterLoudness', {
  loudness: Schema.Finite,
  target: Schema.Finite,
  tolerance: Schema.Finite,
}) {
  override get message() {
    return `the master measures ${this.loudness.toFixed(1)} LUFS, outside ${this.target} ± ${this.tolerance}: the mix masters to ${this.target}, so a peak held the lift back (see mix.master gain); find the hot peak on its bus (an effect or a take) and lower it`;
  }
}

/**
 * The audio master falls quiet (below `floor` dBFS) for longer than `max`
 * seconds where no cue declares a designed silence (`silence: true`). `from`
 * and `to` are film seconds.
 */
export class DeadAir extends Schema.TaggedError<DeadAir>()('DeadAir', {
  from: Schema.Finite,
  to: Schema.Finite,
  floor: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    return `${this.from.toFixed(2)}–${this.to.toFixed(2)}s: ${(this.to - this.from).toFixed(2)}s of the master under ${this.floor} dBFS, over ${this.max.toFixed(1)}s, and no cue declares the silence (score it in sound.ts, or mark the cue silence: true where the script means one)`;
  }
}

// ---------------------------------------------------------------------------
// The script, the frames, the look and the shorts.

/**
 * A word pin that lands more than one sentence past its mark: the line says
 * the word near the mark no longer (a re-take dropped or moved it), and the
 * cue has moved to a later saying without an error.
 */
export class WordPinFar extends Schema.TaggedError<WordPinFar>()('WordPinFar', {
  scene: Schema.String,
  cue: Schema.String,
  mark: Schema.String,
  word: Schema.String,
  sentences: Schema.Int,
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cue}" is pinned to "${this.word}", ${this.sentences} sentences past {${this.mark}}: a re-take that dropped the word near the mark moves the cue there`;
  }
}

/** How a finding says a word's heard edge. */
const EDGE_HEARD = { start: 'starts to be heard', end: 'stops being heard' } as const;

/**
 * A cue whose length is written by hand (`dur`, over a second) and whose
 * hand-sized edge (its end; with `ends`, its start) lands on a phrase edge of
 * its take: within `DUR_ON_WORD` of where a word is heard to start after a
 * pause or stop before one. The length was sized to this take, so a re-take
 * leaves the cue behind its word. `at` is scene-local seconds.
 */
export class DurOnWord extends Schema.TaggedError<DurOnWord>()('DurOnWord', {
  scene: Schema.String,
  cue: Schema.String,
  dur: Schema.Finite,
  word: Schema.String,
  edge: Schema.Literals(['start', 'end']),
  at: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cue}" (dur ${this.dur}) meets "${this.word}" where it ${EDGE_HEARD[this.edge]}, at ${this.at.toFixed(2)}s: the length is sized to this take, so a re-take leaves it behind; end it \`until\` a mark or pin it to the word`;
  }
}

/** A beat with no drawing yet: it plays as its storyboard card. */
export class Storyboard extends Schema.TaggedError<Storyboard>()('Storyboard', {
  scene: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}" has no drawing: it plays as its storyboard card (a drawing keyed by the beat's id in scenesOf)`;
  }
}

/**
 * A point knob one scene writes with the value another scene's knob holds: a
 * callback that copied the framing it calls back, so a lab drag of the one
 * leaves the other behind. Read it there with `f.knobsOf(drawing)`.
 */
export class KnobRepeated extends Schema.TaggedError<KnobRepeated>()('KnobRepeated', {
  scene: Schema.String,
  knob: Schema.String,
  /** The earlier scene that holds the same point, and its knob. */
  of: Schema.String,
  ofKnob: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}": knob "${this.knob}" repeats "${this.of}"'s "${this.ofKnob}"; if it calls that framing back, read it there with f.knobsOf(${this.of}) so a drag moves both`;
  }
}

/**
 * A cue declared twice for the same moment: another cue of its scene has the
 * same edges on the same anchors (a `with` it at its length is the same) and
 * the same ease, so the two differ only by name, and a lab drag of one leaves
 * the other behind. Read the first one where both are read.
 */
export class CueTwin extends Schema.TaggedError<CueTwin>()('CueTwin', {
  scene: Schema.String,
  cue: Schema.String,
  /** The earlier cue it repeats. */
  twin: Schema.String,
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cue}" is declared as "${this.twin}" is (same anchor, offset, length and ease); read f.at('${this.twin}') where "${this.cue}" is read and drop it`;
  }
}

/** A named cue that ends after its scene does. */
export class CueLate extends Schema.TaggedError<CueLate>()('CueLate', {
  scene: Schema.String,
  cue: Schema.String,
  end: Schema.Finite,
  dur: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}": cue "${this.cue}" ends at ${this.end.toFixed(2)}s, after the scene (${this.dur.toFixed(2)}s)`;
  }
}

/**
 * The pause between one scene's last word and the next scene's first is over
 * the default seam, and neither scene declares it (no `tail` or `min` on the
 * first, no `lead` on the second): a default stretched it, not the script.
 */
export class SeamLong extends Schema.TaggedError<SeamLong>()('SeamLong', {
  from: Schema.String,
  to: Schema.String,
  seam: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    return `scenes "${this.from}" → "${this.to}": ${this.seam.toFixed(2)}s between their words, over ${this.max.toFixed(1)}s, and neither declares the pause (set "${this.to}".lead or "${this.from}".tail)`;
  }
}

/**
 * A stretch of a drawn scene, longer than `max`, where the voice speaks and
 * nothing moves: no cue of the scene starts, ends or runs, and the probed
 * frames across it hold still. `from` and `to` are film seconds.
 */
export class StaticHold extends Schema.TaggedError<StaticHold>()('StaticHold', {
  scene: Schema.String,
  from: Schema.Finite,
  to: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}" ${this.from.toFixed(2)}–${this.to.toFixed(2)}s: ${(this.to - this.from).toFixed(2)}s of speech with nothing moving (no cue runs and the frame holds still), over ${this.max.toFixed(1)}s`;
  }
}

/**
 * A line of text on a short that crosses its safe zone (`SAFE_ZONES`), first
 * at short second `at`, by `by` px (1080 × 1920) past its worst `side`. `own`
 * when it is the short's own text (its hook or captions), which the page
 * places; otherwise it is the film's, in the band.
 */
export class ShortUnsafeText extends Schema.TaggedError<ShortUnsafeText>()('ShortUnsafeText', {
  short: Schema.String,
  zone: Schema.String,
  text: Schema.String,
  at: Schema.Finite,
  side: Schema.Literals(['top', 'bottom', 'left', 'right']),
  by: Schema.Finite,
  own: Schema.Boolean,
  /** How many other lines cross the same side with it (the short's own lines are one finding). */
  others: Schema.Int,
}) {
  override get message() {
    let whose = "the film's";
    if (this.own) whose = "the short's";
    let more = '';
    if (this.others > 0) more = ` (and ${this.others} more of its lines)`;
    return `short "${this.short}" ${this.at.toFixed(2)}s: ${whose} "${this.text}"${more} runs up to ${Math.ceil(this.by)} px past the ${this.side} of the ${this.zone} safe zone, under the platform's buttons`;
  }
}

/**
 * A drawn scene holds still for more than `max` of its seconds: its picture,
 * seen small (64×36 grey at 2 fps), barely changes. `from` and `to` are its
 * longest held run, in film seconds.
 */
export class HeldShare extends Schema.TaggedError<HeldShare>()('HeldShare', {
  scene: Schema.String,
  share: Schema.Finite,
  max: Schema.Finite,
  from: Schema.Finite,
  to: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}": ${Math.round(this.share * 100)}% of its seconds held still, over ${Math.round(this.max * 100)}%; longest held run ${(this.to - this.from).toFixed(1)}s at ${this.from.toFixed(1)}–${this.to.toFixed(1)}s (slide a plane, push on the turn, pin a motion to a mark, or cut; drift is texture and never clears it)`;
  }
}

/** How each colour-script measure is written: luma 0–255, the dark share in %, saturation 0–1. */
const shownMeasure = {
  luma: (v: number) => v.toFixed(0),
  dark: (v: number) => `${Math.round(v * 100)}%`,
  saturation: (v: number) => v.toFixed(2),
};

/** An act of the declared colour script (`look.acts`) measures outside its target. */
export class ColourScript extends Schema.TaggedError<ColourScript>()('ColourScript', {
  act: Schema.String,
  measure: Schema.Literals(['luma', 'saturation', 'dark']),
  value: Schema.Finite,
  low: Schema.Finite,
  high: Schema.Finite,
}) {
  override get message() {
    const shown = shownMeasure[this.measure];
    return `act "${this.act}": ${this.measure} ${shown(this.value)}, outside ${shown(this.low)}–${shown(this.high)}`;
  }
}

/**
 * No face in a drawn scene reaches `min` px on screen: the scene never gives a
 * face human scale (a third of the frame's height).
 */
export class FaceSmall extends Schema.TaggedError<FaceSmall>()('FaceSmall', {
  scene: Schema.String,
  /** The largest face the scene showed, in px; 0 when it showed none. */
  largest: Schema.Finite,
  min: Schema.Finite,
}) {
  override get message() {
    return `scene "${this.scene}": its largest face is ${this.largest.toFixed(0)} px (0: none drawn), where a face should fill ${this.min.toFixed(0)} px (a third of the frame) at least once`;
  }
}

/** How a `HandJump` reads, by what jumped. */
const JUMPED = {
  place: (by: number) => `jumps ${by.toFixed(2)} of its length`,
  size: (by: number) => `changes size by ${(100 * by).toFixed(0)}%`,
} as const;

/**
 * A hand jumps: between two adjacent frames of a scene it moves farther than
 * `max` of its own length about its shoulder (`what: 'place'`), or its size
 * changes by more than `max` of itself (`what: 'size'`), so it pops from one
 * place or size to another instead of travelling there.
 */
export class HandJump extends Schema.TaggedError<HandJump>()('HandJump', {
  scene: Schema.String,
  side: Schema.Literals(['far', 'near']),
  /** Film seconds of the second of the two frames. */
  T: Schema.Finite,
  what: Schema.Literals(['place', 'size']),
  /** How far it jumped: hand lengths moved, or the share its size changed. */
  by: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    const jump = JUMPED[this.what](this.by);
    return `scene "${this.scene}": the ${this.side} hand ${jump} in one frame at ${this.T.toFixed(2)}s, over ${this.max} (move it on a named cue with a duration, f.at('<cue>'), never on a threshold, a switch of target or a cue too short for the way it travels)`;
  }
}

/**
 * A hand works out of its figure's reach: its target lies farther from its
 * shoulder than the figure's reach, so it would float off, away from its body.
 */
export class HandFar extends Schema.TaggedError<HandFar>()('HandFar', {
  scene: Schema.String,
  side: Schema.Literals(['far', 'near']),
  from: Schema.Finite,
  to: Schema.Finite,
  /** The farthest target, as a multiple of the reach. */
  worst: Schema.Finite,
  /** How many drawn frames showed it out of reach. */
  frames: Schema.Int,
}) {
  override get message() {
    return `scene "${this.scene}": the ${this.side} hand works ${this.worst.toFixed(2)}× its figure's reach from its shoulder, in ${this.frames} drawn frames at ${this.from.toFixed(2)}–${this.to.toFixed(2)}s (stage what it works at, or the figure, nearer)`;
  }
}

/**
 * An acting hand is lost in its own body: at work, seen, inside the
 * silhouette of the body it belongs to and drawn behind it, so the viewer
 * sees the hand go into the garment and not come out.
 */
export class HandHidden extends Schema.TaggedError<HandHidden>()('HandHidden', {
  scene: Schema.String,
  side: Schema.Literals(['far', 'near']),
  from: Schema.Finite,
  to: Schema.Finite,
  /** How many drawn frames showed it hidden. */
  frames: Schema.Int,
}) {
  override get message() {
    return `scene "${this.scene}": the ${this.side} hand acts inside its own body and is drawn behind it, in ${this.frames} drawn frames at ${this.from.toFixed(2)}–${this.to.toFixed(2)}s (move its target clear of the body, or into the garment's middle, where the kit draws it over)`;
  }
}

/**
 * The film's ending leaves YouTube no room: the stretch after the last word is
 * under `min` seconds (credits and music alone), or the end card is.
 */
export class EndShort extends Schema.TaggedError<EndShort>()('EndShort', {
  part: Schema.Literals(['after the last word', 'end card']),
  secs: Schema.Finite,
  min: Schema.Finite,
}) {
  override get message() {
    return `${this.part}: ${this.secs.toFixed(1)}s, under ${this.min}s (credits and sources roll 20–30 s; end screens need the last 5–20 s)`;
  }
}

/**
 * A short that does not hook in its first moments: its first word comes
 * late, nothing moves, or it opens on the film's title card.
 */
export class ShortHook extends Schema.TaggedError<ShortHook>()('ShortHook', {
  short: Schema.String,
  reason: Schema.Literals(['late word', 'still open', 'title card']),
  /** Seconds: the first word's start (`late word`), or how long the open holds still. */
  at: Schema.Finite,
  max: Schema.Finite,
  /** The title's words, for `title card`. */
  text: Schema.optionalKey(Schema.String),
}) {
  override get message() {
    if (this.reason === 'late word')
      return `short "${this.short}": the first word starts at ${this.at.toFixed(2)}s, after ${this.max.toFixed(1)}s; open on the voice`;
    if (this.reason === 'still open')
      return `short "${this.short}": nothing moves in the first ${this.at.toFixed(2)}s (by ${this.max.toFixed(1)}s something must)`;
    return `short "${this.short}": it opens on the title card "${this.text ?? ''}"; open on the hook, not a title`;
  }
}

/**
 * A short that will not loop cleanly: its last frame's picture is far from
 * its first (`picture`, the mean absolute per-cell luma difference on
 * `SHORT_RULES.loopGrid`, 0–1), or the silence from its
 * last word round to its first is long (`gap`, seconds).
 */
export class ShortLoop extends Schema.TaggedError<ShortLoop>()('ShortLoop', {
  short: Schema.String,
  reason: Schema.Literals(['picture', 'gap']),
  value: Schema.Finite,
  max: Schema.Finite,
}) {
  override get message() {
    if (this.reason === 'picture')
      return `short "${this.short}": its last frame differs from its first by ${this.value.toFixed(3)} (mean absolute per-cell luma difference on a ${SHORT_RULES.loopGrid.cols}×${SHORT_RULES.loopGrid.rows} grid), over ${this.max.toFixed(3)}; the loop shows a cut`;
    return `short "${this.short}": ${this.value.toFixed(2)}s of silence from the last word round to the first, over ${this.max.toFixed(1)}s; the loop stalls`;
  }
}

/** A short past `max` s (an error), or outside `from`–`to` s (a warning). */
export class ShortLength extends Schema.TaggedError<ShortLength>()('ShortLength', {
  short: Schema.String,
  length: Schema.Finite,
  max: Schema.Finite,
  from: Schema.Finite,
  to: Schema.Finite,
}) {
  override get message() {
    if (this.length > this.max)
      return `short "${this.short}" is ${this.length.toFixed(1)}s, over the ${this.max}s a short may run`;
    return `short "${this.short}" is ${this.length.toFixed(1)}s, outside the ${this.from}–${this.to}s that hold best`;
  }
}

/** A beat whose take is missing, or was recorded for other text or another voice. */
export class TakeStale extends Schema.TaggedError<TakeStale>()('TakeStale', {
  scene: Schema.String,
  reason: TakeStaleReason,
  /** The stale take was read by a person: staging does not replace it unasked. */
  recorded: Schema.Boolean,
}) {
  override get message() {
    if (this.recorded)
      return `scene "${this.scene}": recorded take is stale (${this.reason}); record it again and run takes import, or stage it with narrate --only ${this.scene} --replace-recorded`;
    return `scene "${this.scene}": take is stale (${this.reason}); run narrate`;
  }
}

/** A generated sound asset whose stored hash no longer matches its request. */
export class AssetStale extends Schema.TaggedError<AssetStale>()('AssetStale', {
  asset: Schema.String,
  stored: Schema.String,
  wanted: Schema.String,
}) {
  override get message() {
    return `sound "${this.asset}" is stale (made for ${this.stored}, the film now asks for ${this.wanted}); run score`;
  }
}

/** A sound the film declares that has never been generated, so the mix leaves it out. */
export class AssetMissing extends Schema.TaggedError<AssetMissing>()('AssetMissing', {
  asset: Schema.String,
}) {
  override get message() {
    return `sound "${this.asset}" has not been generated; the mix plays without it`;
  }
}

/** Where a layout sample was taken: a scene, a film time, and what the time is. */
const sampled = {
  scene: Schema.String,
  time: Schema.Finite,
  at: Schema.String,
};

const where = (f: { readonly scene: string; readonly time: number; readonly at: string }) =>
  `scene "${f.scene}" at ${f.time.toFixed(2)}s (${f.at})`;

/** Two different lines of text on screen over each other. */
export class TextOverlap extends Schema.TaggedError<TextOverlap>()('TextOverlap', {
  ...sampled,
  a: Schema.String,
  b: Schema.String,
  /** Overlap in square canvas pixels. */
  area: Schema.Finite,
  /** How many sampled frames show this pair overlapping. */
  frames: Schema.Int,
}) {
  override get message() {
    return `${where(this)}: "${this.a}" overlaps "${this.b}" by ${Math.round(this.area)} px² (${this.frames} sampled frame(s))`;
  }
}

/** A line of text reaching past the edge of the frame. */
export class TextOffFrame extends Schema.TaggedError<TextOffFrame>()('TextOffFrame', {
  ...sampled,
  text: Schema.String,
  /** How far past the frame's edges it reaches, in canvas pixels. */
  left: Schema.Finite,
  top: Schema.Finite,
  right: Schema.Finite,
  bottom: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const edges: ReadonlyArray<readonly [string, number]> = [
      ['left', this.left],
      ['top', this.top],
      ['right', this.right],
      ['bottom', this.bottom],
    ];
    const past = edges
      .filter(([, px]) => px > 0)
      .map(([edge, px]) => `${Math.round(px)} px past the ${edge}`);
    return `${where(this)}: "${this.text}" leaves the frame, ${past.join(', ')} (${this.frames} sampled frame(s))`;
  }
}

/** Brush strokes drawn across a line of text, where the check can see them. */
export class InkOverText extends Schema.TaggedError<InkOverText>()('InkOverText', {
  ...sampled,
  text: Schema.String,
  /** How many strokes cross it. */
  strokes: Schema.Int,
  /** How much of their length runs visibly through the text's box, in canvas pixels. */
  length: Schema.Finite,
  /** The box around the crossing strokes, in canvas pixels. */
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite,
  h: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const box = `${Math.round(this.x)},${Math.round(this.y)} ${Math.round(this.w)}×${Math.round(this.h)}`;
    return `${where(this)}: ${this.strokes} stroke(s) at ${box} cross "${this.text}" for ${Math.round(this.length)} px (${this.frames} sampled frame(s))`;
  }
}

/**
 * A scene that throws when it draws, at a moment the draw leg samples: a
 * mark, a cue or a knob it reads that its film no longer has (4f46add3), or
 * an argument a real canvas refuses.
 */
export class DrawThrew extends Schema.TaggedError<DrawThrew>()('DrawThrew', {
  ...sampled,
  why: Schema.String,
}) {
  override get message() {
    return `${where(this)}: the frame throws when drawn: ${this.why}`;
  }
}

/**
 * A frame that is not a function of its time: drawn after the frame after
 * it, then after the frame before it, it leaves a different picture
 * (ab75a2a1, 5da347fd). `why` names the first call that differs.
 */
export class FrameImpure extends Schema.TaggedError<FrameImpure>()('FrameImpure', {
  ...sampled,
  why: Schema.String,
}) {
  override get message() {
    return `${where(this)}: the frame depends on the frame drawn before it: ${this.why}`;
  }
}

/**
 * Ink or text drawn over a face: visible strokes or lines of text drawn after
 * a visible face (its person done), running through its core. A rope across
 * a man's face, a stamp over a mouth: caught here, not by eye.
 */
export class InkOverFace extends Schema.TaggedError<InkOverFace>()('InkOverFace', {
  ...sampled,
  /** The face's centre and height on screen, in canvas pixels. */
  x: Schema.Finite,
  y: Schema.Finite,
  size: Schema.Finite,
  /** How many strokes cross it. */
  strokes: Schema.Int,
  /** The lines of text over it. */
  texts: Schema.Array(Schema.String),
  frames: Schema.Int,
}) {
  override get message() {
    const texts = this.texts.map((t) => `"${t}"`).join(', ');
    const over = [
      ...Arr.filter([`${this.strokes} stroke(s)`], () => this.strokes > 0),
      ...Arr.filter([`text ${texts}`], () => this.texts.length > 0),
    ].join(' and ');
    return `${where(this)}: ${over} drawn over the face at ${Math.round(this.x)},${Math.round(this.y)} (${Math.round(this.size)} px tall) (${this.frames} sampled frame(s))`;
  }
}

/** A line of text running off the plate under it (a card, a tag), past the plate's edge. */
export class TextOffPlate extends Schema.TaggedError<TextOffPlate>()('TextOffPlate', {
  ...sampled,
  text: Schema.String,
  /** How far the line's box reaches past each side of the plate's box, in canvas pixels. */
  left: Schema.Finite,
  top: Schema.Finite,
  right: Schema.Finite,
  bottom: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const edges: ReadonlyArray<readonly [string, number]> = [
      ['left', this.left],
      ['top', this.top],
      ['right', this.right],
      ['bottom', this.bottom],
    ];
    const past = edges
      .filter(([, px]) => px > 0)
      .map(([edge, px]) => `${Math.round(px)} px past the ${edge}`);
    return `${where(this)}: "${this.text}" runs off the plate under it, ${past.join(', ')} (${this.frames} sampled frame(s))`;
  }
}

/** A plate (a cutout smaller than the frame) carrying text, cut off by the frame's edge. */
export class PlateOffFrame extends Schema.TaggedError<PlateOffFrame>()('PlateOffFrame', {
  ...sampled,
  /** A line of text the plate carries. */
  text: Schema.String,
  left: Schema.Finite,
  top: Schema.Finite,
  right: Schema.Finite,
  bottom: Schema.Finite,
  frames: Schema.Int,
}) {
  override get message() {
    const edges: ReadonlyArray<readonly [string, number]> = [
      ['left', this.left],
      ['top', this.top],
      ['right', this.right],
      ['bottom', this.bottom],
    ];
    const past = edges
      .filter(([, px]) => px > 0)
      .map(([edge, px]) => `${Math.round(px)} px past the ${edge}`);
    return `${where(this)}: the plate under "${this.text}" leaves the frame, ${past.join(', ')} (${this.frames} sampled frame(s))`;
  }
}

// ---------------------------------------------------------------------------
// The report

/**
 * Why the film does not lay out, or the part a check names does not resolve
 * on it: the one finding a check reports when it cannot place the film.
 */
export type PlaceFinding =
  | DuplicateScene
  | DuplicateMark
  | TurnInvalid
  | CueCycle
  | UntilBeforeStart
  | ScenesApart
  | UnknownAct
  | UnknownShort
  | ShortSpanEmpty;

/** What the static leg finds from the film's files alone: no mix, no browser. */
export type StaticFinding =
  | PlaceFinding
  | CueLate
  | SeamLong
  | TakeStale
  | AssetStale
  | AssetMissing
  | AudioMissing
  | AudioStale
  | UnknownScene
  | UnknownCue
  | UnknownMark
  | CueInvalid
  | PartOutOfOrder
  | MovementTooShort
  | MovementTooLong
  | WordMissing
  | UnknownVoice
  | UnknownSound
  | SoundUseMismatch
  | SoundUnmade
  | SoundStale
  | LeadIn
  | WordPinFar
  | DurOnWord
  | CueTwin
  | Storyboard
  | KnobRepeated
  | EndShort;
/** What the sound leg hears in the mix the film makes now. */
export type MixFinding = DeadAir | MasterLoudness | EffectHot;
/** What one probed frame shows wrong. */
export type FrameFinding = TextOverlap | TextOffFrame | InkOverText | PlateOffFrame | TextOffPlate;
export type LayoutFinding = FrameFinding | StaticHold;
/** What the look pass measures across the film (`look.ts`). */
export type LookFinding = HeldShare | ColourScript | FaceSmall | HandJump | HandFar | HandHidden;
/** What the draw leg (`check --draw`) finds, drawing each scene in-process at its moments. */
export type DrawFinding = DrawThrew | FrameImpure | InkOverFace;
/** What `check --short` finds on a short. */
export type ShortFinding = ShortUnsafeText | ShortHook | ShortLoop | ShortLength;
export type Finding =
  | StaticFinding
  | MixFinding
  | LayoutFinding
  | DrawFinding
  | LookFinding
  | ShortFinding;

export type Level = 'error' | 'warning';

export interface CheckOptions {
  /** Report a stale take, asset or audio master as a warning: work in progress, not a broken film. */
  readonly allowStale: boolean;
}

const matchFinding = Match.type<Finding>();

/**
 * How bad a finding is. An error fails the check. A stale take, asset or
 * master is an error unless `allowStale`. A static hold and everything the
 * look pass measures ask for a look (the owner, 2026-09-27). On a short, a
 * loop is a warning, a length is an error only past the most a short may run,
 * and text past the zone is an error when the short placed it (its hook, its
 * captions) and a warning when the film did, since only a different span
 * moves the film's band.
 */
export const levelOf = (finding: Finding, options: CheckOptions): Level => {
  const error = (): Level => 'error';
  const warning = (): Level => 'warning';
  const stale = (): Level => {
    if (options.allowStale) return 'warning';
    return 'error';
  };
  return matchFinding.pipe(
    Match.tagsExhaustive({
      CueLate: error,
      SeamLong: warning,
      TakeStale: stale,
      AssetStale: stale,
      AssetMissing: warning,
      AudioMissing: stale,
      AudioStale: stale,
      UnknownScene: error,
      UnknownCue: error,
      UnknownMark: error,
      CueInvalid: error,
      PartOutOfOrder: error,
      DuplicateScene: error,
      DuplicateMark: error,
      TurnInvalid: error,
      CueCycle: error,
      UntilBeforeStart: error,
      ScenesApart: error,
      UnknownAct: error,
      UnknownShort: error,
      ShortSpanEmpty: error,
      MovementTooShort: error,
      MovementTooLong: error,
      WordMissing: error,
      UnknownVoice: error,
      UnknownSound: error,
      SoundUseMismatch: error,
      SoundUnmade: error,
      SoundStale: warning,
      LeadIn: warning,
      WordPinFar: warning,
      DurOnWord: warning,
      CueTwin: warning,
      Storyboard: warning,
      KnobRepeated: warning,
      EndShort: warning,
      DeadAir: error,
      MasterLoudness: warning,
      EffectHot: warning,
      TextOverlap: error,
      TextOffFrame: error,
      InkOverText: error,
      PlateOffFrame: error,
      TextOffPlate: error,
      DrawThrew: error,
      FrameImpure: error,
      InkOverFace: warning,
      StaticHold: warning,
      HeldShare: warning,
      ColourScript: warning,
      FaceSmall: warning,
      HandJump: warning,
      HandFar: warning,
      HandHidden: warning,
      ShortUnsafeText: (f): Level => {
        if (f.own) return 'error';
        return 'warning';
      },
      ShortHook: error,
      ShortLoop: warning,
      ShortLength: (f): Level => {
        if (f.length > f.max) return 'error';
        return 'warning';
      },
    }),
  )(finding);
};

/**
 * Where in the film a finding is (`FindingAddress`): its part (a scene, an
 * act, a short, else the whole film), and the film second it starts at. A
 * seam is addressed at the scene it runs into; a colour script at its act; a
 * short's findings at the short, with no film second (its seconds are its
 * own). A finding about the whole film or a sound file is the film's.
 */
export const addressOf = (finding: Finding): FindingAddress => {
  const film: Address = { _tag: 'Film' };
  const none = (): FindingAddress => ({ part: film });
  const scene = (f: { readonly scene: string }): FindingAddress => ({
    part: sceneAddress(f.scene),
  });
  const at = (scene: string, time: number): FindingAddress => ({
    part: sceneAddress(scene),
    time,
  });
  const span = (f: { readonly scene: string; readonly from: number }) => at(f.scene, f.from);
  const sampledAt = (f: { readonly scene: string; readonly time: number }) => at(f.scene, f.time);
  const short = (f: { readonly short: string }): FindingAddress => ({
    part: { _tag: 'Short', id: f.short },
  });
  return matchFinding.pipe(
    Match.tagsExhaustive({
      CueLate: scene,
      SeamLong: (f) => scene({ scene: f.to }),
      TakeStale: scene,
      AssetStale: none,
      AssetMissing: none,
      AudioMissing: none,
      AudioStale: none,
      // The scene it names is one the film does not have.
      UnknownScene: none,
      UnknownCue: scene,
      UnknownMark: scene,
      CueInvalid: scene,
      // A movement or an act declared out of film order: the declaration is the film's.
      PartOutOfOrder: none,
      DuplicateScene: scene,
      DuplicateMark: scene,
      TurnInvalid: scene,
      CueCycle: scene,
      UntilBeforeStart: scene,
      // The scenes it names are no one stretch: no one scene is the place.
      ScenesApart: none,
      // The act or short it names is one the film does not have.
      UnknownAct: none,
      UnknownShort: none,
      ShortSpanEmpty: short,
      MovementTooShort: none,
      MovementTooLong: none,
      WordMissing: scene,
      UnknownVoice: scene,
      UnknownSound: none,
      SoundUseMismatch: none,
      SoundUnmade: none,
      SoundStale: none,
      LeadIn: none,
      WordPinFar: scene,
      DurOnWord: scene,
      CueTwin: scene,
      Storyboard: scene,
      KnobRepeated: scene,
      EndShort: none,
      DeadAir: (f): FindingAddress => ({ part: film, time: f.from }),
      MasterLoudness: none,
      EffectHot: (f) => at(f.scene, f.at),
      TextOverlap: sampledAt,
      TextOffFrame: sampledAt,
      InkOverText: sampledAt,
      PlateOffFrame: sampledAt,
      TextOffPlate: sampledAt,
      DrawThrew: sampledAt,
      FrameImpure: sampledAt,
      InkOverFace: sampledAt,
      StaticHold: span,
      HeldShare: span,
      ColourScript: (f): FindingAddress => ({ part: { _tag: 'Act', act: f.act } }),
      FaceSmall: scene,
      HandJump: (f) => at(f.scene, f.T),
      HandFar: span,
      HandHidden: span,
      ShortUnsafeText: short,
      ShortHook: short,
      ShortLoop: short,
      ShortLength: short,
    }),
  )(finding);
};

/** One finding, how bad it is and where it is. */
export interface Reported {
  readonly level: Level;
  readonly finding: Finding;
  readonly address: FindingAddress;
}

/** Everything one check found, in the order its legs found it, with the count of each level. */
export interface Report {
  readonly findings: ReadonlyArray<Reported>;
  readonly errors: number;
  readonly warnings: number;
}

/** The report of `found`, each finding levelled and addressed. */
export const report = (found: ReadonlyArray<Finding>, options: CheckOptions): Report => {
  const findings = found.map((finding): Reported => ({
    level: levelOf(finding, options),
    finding,
    address: addressOf(finding),
  }));
  const errors = findings.filter((r) => r.level === 'error').length;
  return { findings, errors, warnings: findings.length - errors };
};

/** One finding as `check --json` prints it and the lab reads it, with its address. */
export const lineOf = ({ level, finding, address }: Reported): CheckLine => ({
  level,
  tag: finding._tag,
  message: finding.message,
  address,
});
