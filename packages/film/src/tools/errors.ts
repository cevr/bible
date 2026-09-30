// The tools' typed failures. The core's authoring errors (unknown scene, cue,
// mark or voice, a short act, a misaligned take) are re-exported so one import
// names every way a run can fail.

import { Schema } from 'effect';
import { EncoderName } from '../core/encoder.ts';
import { SHORT_RULES } from '../core/shorts.ts';

export {
  type ActLength,
  ActTooLong,
  ActTooShort,
  AlignmentMismatch,
  CueInvalid,
  ScoreUnknown,
  ShortSpanEmpty,
  ShortUnknownCue,
  ShortUnknownMark,
  ShortUnknownScene,
  UnknownCue,
  UnknownMark,
  SoundUseMismatch,
  UnknownScene,
  UnknownSound,
  UnknownVoice,
  WordMissing,
} from '../core/errors.ts';

// ---------------------------------------------------------------------------
// The sound library (`sounds/`): what `sfx check` and `film check` report.

/** The app has no `sounds/library.ts` where the tools look for one. */
export class LibraryMissing extends Schema.TaggedError<LibraryMissing>()('LibraryMissing', {
  file: Schema.String,
}) {
  override get message() {
    return `no sound library at ${this.file}; declare one with defineLibrary`;
  }
}

/** A declared sound with no kept variant: nothing plays where it is named. */
export class SoundUnmade extends Schema.TaggedError<SoundUnmade>()('SoundUnmade', {
  name: Schema.String,
  /** Candidates made and waiting for `sfx keep`. */
  candidates: Schema.Int,
}) {
  override get message() {
    if (this.candidates > 0)
      return `sound "${this.name}" has ${this.candidates} candidates and none kept; run sfx audition ${this.name}, then sfx keep`;
    return `sound "${this.name}" has no kept variant; run sfx make ${this.name}`;
  }
}

/** A kept variant whose file is not on disk. */
export class SoundFileMissing extends Schema.TaggedError<SoundFileMissing>()('SoundFileMissing', {
  name: Schema.String,
  file: Schema.String,
}) {
  override get message() {
    return `sound "${this.name}": ${this.file} is not on disk; run sfx pull`;
  }
}

/** A variant's file whose bytes are not the ones the lock kept. */
export class SoundCorrupt extends Schema.TaggedError<SoundCorrupt>()('SoundCorrupt', {
  name: Schema.String,
  file: Schema.String,
  sha256: Schema.String,
  found: Schema.String,
}) {
  override get message() {
    return `sound "${this.name}": ${this.file} hashes ${this.found.slice(0, 12)}, the lock kept ${this.sha256.slice(0, 12)}; run sfx pull`;
  }
}

/** Kept variants made for another request than the declaration's: they play until new ones are kept. */
export class SoundStale extends Schema.TaggedError<SoundStale>()('SoundStale', {
  name: Schema.String,
}) {
  override get message() {
    return `sound "${this.name}" changed since its variants were made; they still play; run sfx make ${this.name}, then keep new ones`;
  }
}

/** A sound file in the repo whose licence does not let it be public. */
export class SoundLicence extends Schema.TaggedError<SoundLicence>()('SoundLicence', {
  file: Schema.String,
  licence: Schema.String,
}) {
  override get message() {
    return `${this.file} is ${this.licence}, which may not sit in a public repo; keep it under sounds/files (the private store)`;
  }
}

/** `sfx guard` refused staged audio the public repo may not take. */
export class SoundsRefused extends Schema.TaggedError<SoundsRefused>()('SoundsRefused', {
  files: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.files.length} staged audio file(s) may not be committed: unstage them (generated sounds live in sounds/files and sync with sfx push)`;
  }
}

/** `sfx check` found errors in the library. */
export class LibraryCheckFailed extends Schema.TaggedError<LibraryCheckFailed>()(
  'LibraryCheckFailed',
  { errors: Schema.Int, warnings: Schema.Int },
) {
  override get message() {
    return `sfx check failed: ${this.errors} error(s), ${this.warnings} warning(s)`;
  }
}

/** A bed whose loop point is heard: a level jump or a click where it wraps. */
export class LoopSeam extends Schema.TaggedError<LoopSeam>()('LoopSeam', {
  name: Schema.String,
  variant: Schema.Int,
  db: Schema.Finite,
  click: Schema.Finite,
}) {
  override get message() {
    return `bed "${this.name}" variant ${this.variant}: its loop point jumps ${this.db.toFixed(1)} dB with a ${this.click.toFixed(1)}x step; pick another take or trim it`;
  }
}

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

/** The voice bus's level (its 70th percentile) off the film's target. */
export class VoiceLevel extends Schema.TaggedError<VoiceLevel>()('VoiceLevel', {
  level: Schema.Finite,
  target: Schema.Finite,
  tolerance: Schema.Finite,
}) {
  override get message() {
    return `the voice sits at ${this.level.toFixed(1)} dBFS (70th percentile), outside ${this.target} ± ${this.tolerance} dB: level the takes (a staging take is levelled in the mix; a person's on import)`;
  }
}

/** The master's integrated loudness off the film's target. */
export class MasterLoudness extends Schema.TaggedError<MasterLoudness>()('MasterLoudness', {
  loudness: Schema.Finite,
  target: Schema.Finite,
  tolerance: Schema.Finite,
}) {
  override get message() {
    return `the master measures ${this.loudness.toFixed(1)} LUFS, outside ${this.target} ± ${this.tolerance}: balance the voice first, then the beds, music and effects against it`;
  }
}

/** A generated sound's candidates would cost more than the run allows. */
export class CreditsOverCap extends Schema.TaggedError<CreditsOverCap>()('CreditsOverCap', {
  credits: Schema.Int,
  cap: Schema.Int,
}) {
  override get message() {
    return `this run would spend ${this.credits} credits, over the cap of ${this.cap}; make less or raise --cap`;
  }
}

/** A paid make run without `--yes`. */
export class PaidUnconfirmed extends Schema.TaggedError<PaidUnconfirmed>()('PaidUnconfirmed', {
  credits: Schema.Int,
}) {
  override get message() {
    return `this make would spend ${this.credits} credits; run it again with --yes`;
  }
}

/** `sfx keep` or `reject` naming a candidate the sound does not have. */
export class CandidateMissing extends Schema.TaggedError<CandidateMissing>()('CandidateMissing', {
  name: Schema.String,
  index: Schema.Int,
  candidates: Schema.Int,
}) {
  override get message() {
    return `sound "${this.name}" has ${this.candidates} candidates; there is no candidate ${this.index}`;
  }
}

/** `sfx unkeep` (or `keep --replace`'s undo) naming a kept variant the sound does not have. */
export class VariantMissing extends Schema.TaggedError<VariantMissing>()('VariantMissing', {
  name: Schema.String,
  index: Schema.Int,
  variants: Schema.Int,
}) {
  override get message() {
    return `sound "${this.name}" keeps ${this.variants} variants; there is no variant ${this.index}`;
  }
}

/** `sfx try` settings no declaration could take (a length outside 0.5–30 s, an influence outside 0–1, an empty prompt). */
export class TrialInvalid extends Schema.TaggedError<TrialInvalid>()('TrialInvalid', {
  name: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `sound "${this.name}": the trial's settings are not a declaration: ${this.reason}`;
  }
}

/** `sfx push` copied a file into the store, and the store then did not hold its bytes. */
export class StoreCopyFailed extends Schema.TaggedError<StoreCopyFailed>()('StoreCopyFailed', {
  file: Schema.String,
  store: Schema.String,
}) {
  override get message() {
    return `${this.file} was copied to the store at ${this.store}, which then did not hold its bytes`;
  }
}

/** A command that takes one kind of sound given another (`sfx render` a generated one, `import` a procedural one). */
export class SoundKindMismatch extends Schema.TaggedError<SoundKindMismatch>()(
  'SoundKindMismatch',
  { name: Schema.String, kind: Schema.String, wanted: Schema.String },
) {
  override get message() {
    return `sound "${this.name}" is ${this.kind}; this needs a ${this.wanted} one`;
  }
}

export class FilmNotFound extends Schema.TaggedError<FilmNotFound>()('FilmNotFound', {
  film: Schema.String,
  dir: Schema.String,
}) {
  override get message() {
    return `no film "${this.film}" at ${this.dir}`;
  }
}

/** A film module (scenes, voice, sound) that fails to import or has the wrong shape. */
export class FilmModuleInvalid extends Schema.TaggedError<FilmModuleInvalid>()(
  'FilmModuleInvalid',
  { film: Schema.String, module: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `film "${this.film}": ${this.module} is invalid: ${this.reason}`;
  }
}

/** A data file (timings.json, manifest.json) that does not decode. */
export class FileInvalid extends Schema.TaggedError<FileInvalid>()('FileInvalid', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file} is invalid: ${this.reason}`;
  }
}

/** `layout()` refused the film: a duplicate scene, an unknown mark or cue in a timeline, a cycle. */
export class LayoutInvalid extends Schema.TaggedError<LayoutInvalid>()('LayoutInvalid', {
  film: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `film "${this.film}" does not lay out: ${this.reason}`;
  }
}

export class SoundMissing extends Schema.TaggedError<SoundMissing>()('SoundMissing', {
  film: Schema.String,
}) {
  override get message() {
    return `film "${this.film}" has no sound.ts`;
  }
}

/**
 * A take that does not say its script: the transcript is too far from the
 * text. Its message says what was heard, not how to accept it: the command
 * line and the studio's panel each add their own way.
 */
export class TakeMismatch extends Schema.TaggedError<TakeMismatch>()('TakeMismatch', {
  id: Schema.String,
  script: Schema.String,
  heard: Schema.String,
  wer: Schema.Finite,
}) {
  override get message() {
    return `take ${this.id} says something else (wer ${(this.wer * 100).toFixed(1)}%)\n  script: ${this.script}\n  heard:  ${this.heard}`;
  }
}

/**
 * A person's recording that cannot become a take: named for no beat, with
 * nothing in it louder than the room, or one file with no beat to be.
 */
export class RecordingInvalid extends Schema.TaggedError<RecordingInvalid>()('RecordingInvalid', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.reason}`;
  }
}

/** A recording the studio was sent that is not one: not base64, or of a type no recorder makes. */
export class AudioInvalid extends Schema.TaggedError<AudioInvalid>()('AudioInvalid', {
  reason: Schema.String,
}) {
  override get message() {
    return `the recording sent is not audio the studio reads: ${this.reason}`;
  }
}

/**
 * A recording sent to the studio in a lossy codec (Opus, AAC, MP3). A
 * person's take is the film's final voice and its master is lossless, so the
 * studio takes PCM (WAV) or FLAC only: a lossy upload would bake its codec's
 * loss into the master.
 */
export class RecordingLossy extends Schema.TaggedError<RecordingLossy>()('RecordingLossy', {
  type: Schema.String,
}) {
  override get message() {
    return `a recording of type "${this.type}" is lossy; send the take as audio/wav (PCM) or audio/flac`;
  }
}

/** `--accept-mismatch` bare with no `--only`: it would accept every beat's mismatch unseen. */
export class AcceptMismatchUnnamed extends Schema.TaggedError<AcceptMismatchUnnamed>()(
  'AcceptMismatchUnnamed',
  {},
) {
  override get message() {
    return '--accept-mismatch names the beats it accepts (--accept-mismatch a,b); bare, it needs --only';
  }
}

/** A request body over what the studio reads, refused before it is read whole. */
export class BodyTooLarge extends Schema.TaggedError<BodyTooLarge>()('BodyTooLarge', {
  /** The most the route reads, in bytes. */
  limit: Schema.Int,
}) {
  override get message() {
    return `the request body is over ${this.limit} bytes`;
  }
}

export class ElevenLabsFailed extends Schema.TaggedError<ElevenLabsFailed>()('ElevenLabsFailed', {
  op: Schema.String,
  exitCode: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `elevenlabs ${this.op} failed (${this.exitCode}): ${this.reason}`;
  }
}

/** Speech-to-text heard words in a take but timed none of them: nothing to time the script by. */
export class SttUntimed extends Schema.TaggedError<SttUntimed>()('SttUntimed', {
  file: Schema.String,
  /** How many words its text holds. */
  heard: Schema.Int,
}) {
  override get message() {
    return `speech-to-text heard ${this.heard} words in ${this.file} but timed none of them; import it again`;
  }
}

/** Sound effects need an API key; the CLI's OAuth login covers speech and music only. */
export class ApiKeyMissing extends Schema.TaggedError<ApiKeyMissing>()('ApiKeyMissing', {}) {
  override get message() {
    return 'no ELEVENLABS_API_KEY in env or Keychain';
  }
}

/** A media file that could not be read, decoded, written or joined into a film. */
export class MediaFailed extends Schema.TaggedError<MediaFailed>()('MediaFailed', {
  op: Schema.Literals(['read', 'decode', 'encode', 'write', 'join']),
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `could not ${this.op} ${this.file}: ${this.reason}`;
  }
}

/** A sound the mix plays that is not at the mix's rate: the mix never resamples. */
export class SampleRateMismatch extends Schema.TaggedError<SampleRateMismatch>()(
  'SampleRateMismatch',
  { file: Schema.String, rate: Schema.Finite, expected: Schema.Finite },
) {
  override get message() {
    return `${this.file} is at ${this.rate} Hz; the mix runs at ${this.expected} Hz`;
  }
}

/** Some named cue ends after its scene does. */
export class CuesLate extends Schema.TaggedError<CuesLate>()('CuesLate', {
  count: Schema.Int,
}) {
  override get message() {
    return `${this.count} cue(s) end after their scene`;
  }
}

/** No headless Chromium to render with: Playwright ships without one. */
export class BrowserMissing extends Schema.TaggedError<BrowserMissing>()('BrowserMissing', {
  executable: Schema.String,
  install: Schema.String,
}) {
  override get message() {
    return `no headless Chromium at ${this.executable}; install it with:\n  ${this.install}`;
  }
}

export class BrowserFailed extends Schema.TaggedError<BrowserFailed>()('BrowserFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the browser failed: ${this.reason}`;
  }
}

/** The app's player server did not start (`film doctor` reports it on the encoder line alone). */
export class PreviewServerFailed extends Schema.TaggedError<PreviewServerFailed>()(
  'PreviewServerFailed',
  { reason: Schema.String },
) {
  override get message() {
    return `the player server did not start: ${this.reason}`;
  }
}

/** The player page did not load, or loaded without an export handle. */
export class PageLoadFailed extends Schema.TaggedError<PageLoadFailed>()('PageLoadFailed', {
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the player did not load at ${this.url}: ${this.reason}`;
  }
}

/** The film threw in the page: a render must not keep going on a broken frame. */
export class PageError extends Schema.TaggedError<PageError>()('PageError', {
  reason: Schema.String,
}) {
  override get message() {
    return `the film threw in the page: ${this.reason}`;
  }
}

/** The page's renderer process died. A chunk is retried once on a fresh page. */
export class PageCrashed extends Schema.TaggedError<PageCrashed>()('PageCrashed', {
  reason: Schema.String,
}) {
  override get message() {
    return `a render page crashed: ${this.reason}`;
  }
}

/** Frame `frame` did not come back from the page. */
export class FrameFailed extends Schema.TaggedError<FrameFailed>()('FrameFailed', {
  frame: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `frame ${this.frame} failed: ${this.reason}`;
  }
}

/** The page could not compose the film's look-book. */
export class LookbookFailed extends Schema.TaggedError<LookbookFailed>()('LookbookFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the look-book failed: ${this.reason}`;
  }
}

/** The page could not compose the contact sheet. */
export class ContactFailed extends Schema.TaggedError<ContactFailed>()('ContactFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the contact sheet failed: ${this.reason}`;
  }
}

/** The browser has no H.264 encoder for the film: checked before a frame is drawn. */
export class EncoderMissing extends Schema.TaggedError<EncoderMissing>()('EncoderMissing', {
  reason: Schema.String,
}) {
  override get message() {
    return `the browser cannot encode the film: ${this.reason}`;
  }
}

/** The page could not encode frames `[from, to)`. */
export class EncodeFailed extends Schema.TaggedError<EncodeFailed>()('EncodeFailed', {
  from: Schema.Int,
  to: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `frames ${this.from}–${this.to} failed to encode: ${this.reason}`;
  }
}

/** The film declares its mixed track but the lossless master is not there. */
export class AudioMissing extends Schema.TaggedError<AudioMissing>()('AudioMissing', {
  file: Schema.String,
}) {
  override get message() {
    return `no audio master at ${this.file}; run mix to build it (no API calls)`;
  }
}

/** The audio master is not as long as the film: a mix was cut short, or made for another cut. */
export class AudioStale extends Schema.TaggedError<AudioStale>()('AudioStale', {
  file: Schema.String,
  /** The master's measured length, in seconds. */
  length: Schema.Finite,
  /** The film's length, in seconds. */
  film: Schema.Finite,
}) {
  override get message() {
    return `the audio master ${this.file} runs ${this.length.toFixed(3)}s, the film ${this.film.toFixed(3)}s; run mix to rebuild it (no API calls)`;
  }
}

const FLAG_RULE = { excludes: 'does not go with', needs: 'needs' } as const;

/**
 * A flag that would be ignored: given with one it `excludes`, or without the
 * one it `needs`.
 */
export class FlagsConflict extends Schema.TaggedError<FlagsConflict>()('FlagsConflict', {
  flag: Schema.String,
  rule: Schema.Literals(['excludes', 'needs']),
  other: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `--${this.flag} ${FLAG_RULE[this.rule]} --${this.other}: ${this.reason}`;
  }
}

/** `--short` names a short the film's `shorts.ts` does not declare. */
export class UnknownShort extends Schema.TaggedError<UnknownShort>()('UnknownShort', {
  film: Schema.String,
  id: Schema.String,
  /** The shorts the film declares, in order; empty when it has no `shorts.ts`. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.known.length === 0)
      return `film "${this.film}" has no short "${this.id}": it declares none (a shorts.ts beside its script)`;
    return `film "${this.film}" has no short "${this.id}"; its shorts are ${this.known.join(', ')}`;
  }
}

/**
 * A video render that would open more encoders than its encoder allows at
 * once (tools/render-plan.ts, `encoderLimits`): past 14 the hardware encoder
 * hangs rather than failing; a software encoder past one a core only fights
 * for the cores.
 */
export class TooManyEncoders extends Schema.TaggedError<TooManyEncoders>()('TooManyEncoders', {
  workers: Schema.Int,
  /** Each page also encodes the share copy (the hardware encoder's, made in the page). */
  share: Schema.Boolean,
  max: Schema.Int,
  encoder: EncoderName,
}) {
  override get message() {
    const perPage = 1 + Number(this.share);
    const copy = ' with a share copy'.repeat(Number(this.share));
    const orNoShare = ', or --no-share'.repeat(Number(this.share));
    return `${this.workers} pages${copy} need ${this.workers * perPage} encoders at once, over the ${this.max} ${this.encoder} encoders a render may run; use --workers ${Math.floor(this.max / perPage)} or fewer${orNoShare}`;
  }
}

/** A render range with no frames in it. */
export class RangeEmpty extends Schema.TaggedError<RangeEmpty>()('RangeEmpty', {
  from: Schema.Finite,
  to: Schema.Finite,
}) {
  override get message() {
    return `nothing to render between ${this.from}s and ${this.to}s`;
  }
}

// ---------------------------------------------------------------------------
// `film check` findings. Each is a value the check collects, never the first
// failure only; the run fails with `CheckFailed` once every one is reported.

/** A named cue that ends after its scene does. */
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

/** The film's declared acts do not make YouTube chapters. */
export class ChaptersInvalid extends Schema.TaggedError<ChaptersInvalid>()('ChaptersInvalid', {
  film: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.film}: no chapters (${this.reason})`;
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
  reason: Schema.Literals(['missing', 'text changed', 'voice changed']),
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

/** The check found errors; each was printed above. */
export class CheckFailed extends Schema.TaggedError<CheckFailed>()('CheckFailed', {
  errors: Schema.Int,
  warnings: Schema.Int,
}) {
  override get message() {
    return `film check failed: ${this.errors} error(s), ${this.warnings} warning(s)`;
  }
}

/** `film notes reply|resolve` named a note the film's lab does not have. */
export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()('NoteNotFound', {
  film: Schema.String,
  id: Schema.String,
  /** The ids the film's notes do have. */
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.known.length === 0) return `film "${this.film}" has no note "${this.id}"; it has none`;
    return `film "${this.film}" has no note "${this.id}"; its notes are ${this.known.join(', ')}`;
  }
}

/** Another process held the notes lock for too long: a crashed writer left it behind. */
export class NotesLocked extends Schema.TaggedError<NotesLocked>()('NotesLocked', {
  lock: Schema.String,
}) {
  override get message() {
    return `${this.lock} is held by a running writer; it is broken once that writer exits or the lock is 30 s old`;
  }
}

// ---------------------------------------------------------------------------
// Lab write-back: the scene source the lab edits.

/** A scene whose drawing the lab cannot find in the film's source files. */
export class SceneNotLocated extends Schema.TaggedError<SceneNotLocated>()('SceneNotLocated', {
  film: Schema.String,
  scene: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `film "${this.film}": scene "${this.scene}" has no editable drawing in source: ${this.reason}`;
  }
}

/**
 * A literal more than one scene reads (each spreads one drawing): a write for
 * one scene would move the others too, so the lab does not make it.
 */
export class SourceShared extends Schema.TaggedError<SourceShared>()('SourceShared', {
  film: Schema.String,
  field: Schema.Literals(['timeline', 'knobs']),
  file: Schema.String,
  scenes: Schema.Array(Schema.String),
}) {
  override get message() {
    return `film "${this.film}": the ${this.field} in ${this.file} is read by scenes ${this.scenes.join(', ')}; the lab will not write a literal they share (give each scene its own drawing)`;
  }
}

/**
 * An edit the lab will not make: the target is not a literal it can prove it
 * rewrites (a computed value, a spread, a shorthand), or it does not exist.
 */
export class SourceRefused extends Schema.TaggedError<SourceRefused>()('SourceRefused', {
  file: Schema.String,
  target: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: will not edit ${this.target}: ${this.reason}`;
  }
}

/**
 * A cue timing the lab will not write: with it, the scene's timeline does not
 * resolve (e.g. a span that would end before it starts). The file is untouched.
 */
export class TimelineUnresolved extends Schema.TaggedError<TimelineUnresolved>()(
  'TimelineUnresolved',
  {
    file: Schema.String,
    target: Schema.String,
    reason: Schema.String,
  },
) {
  override get message() {
    return `${this.file}: will not write ${this.target}: the timeline would not resolve: ${this.reason}`;
  }
}

/** oxfmt failed on a file the lab wrote; the file was put back as it was. */
export class FormatFailed extends Schema.TaggedError<FormatFailed>()('FormatFailed', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: oxfmt failed, the file was left as it was: ${this.reason}`;
  }
}

/** A written value did not read back from the formatted file; the file was put back as it was. */
export class WriteUnverified extends Schema.TaggedError<WriteUnverified>()('WriteUnverified', {
  file: Schema.String,
  target: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.target} did not read back once formatted (${this.reason}); the file was left as it was`;
  }
}

/**
 * The scene file changed on disk (an editor saved it) between the lab reading
 * it and writing it back: the lab writes nothing over it, and the change stays.
 */
export class SourceChanged extends Schema.TaggedError<SourceChanged>()('SourceChanged', {
  file: Schema.String,
  target: Schema.String,
}) {
  override get message() {
    return `${this.file} changed on disk while the lab was writing ${this.target}; it was left as it is now: reload and write again`;
  }
}

// ---------------------------------------------------------------------------
// Review: the box's renders, served where they lie.

/** A ref that names no file under the review's roots (an unknown root, a path out of it, or nothing there). */
export class ReviewFileUnknown extends Schema.TaggedError<ReviewFileUnknown>()(
  'ReviewFileUnknown',
  { ref: Schema.String },
) {
  override get message() {
    return `no file ${this.ref} under the review's roots`;
  }
}

/** A pick naming a score option, or a library sound, the film does not offer. */
export class ChoiceUnknown extends Schema.TaggedError<ChoiceUnknown>()('ChoiceUnknown', {
  film: Schema.String,
  kind: Schema.Literals(['score option', 'sound']),
  name: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    const known = this.known.join(', ') || 'none';
    return `film "${this.film}" has no ${this.kind} "${this.name}" to choose (it has: ${known})`;
  }
}

/** A take act its take's state does not allow: only a waiting take is kept or rejected, only a kept one unkept. */
export class TakeActRefused extends Schema.TaggedError<TakeActRefused>()('TakeActRefused', {
  sound: Schema.String,
  take: Schema.String,
  /** What was asked, as it would read done: `kept`, `unkept`, `rejected`. */
  act: Schema.String,
  state: Schema.String,
}) {
  override get message() {
    return `take ${this.take.slice(0, 12)} of "${this.sound}" is ${this.state}: it cannot be ${this.act}`;
  }
}

/** A take named by its sha256 that a sound has neither kept nor waiting. */
export class TakeUnknown extends Schema.TaggedError<TakeUnknown>()('TakeUnknown', {
  sound: Schema.String,
  take: Schema.String,
}) {
  override get message() {
    return `sound "${this.sound}" has no kept or waiting take ${this.take.slice(0, 12)}`;
  }
}

/**
 * A derived file the review makes (a frame, a length, a phone copy, a mix)
 * that ffmpeg or ffprobe did not make, or its cache could not keep.
 */
export class ReviewToolFailed extends Schema.TaggedError<ReviewToolFailed>()('ReviewToolFailed', {
  tool: Schema.Literals(['ffmpeg', 'ffprobe', 'cache']),
  ref: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.tool} failed on ${this.ref}: ${this.reason}`;
  }
}

/** A child process that ran past its time limit, and was stopped. */
export class ProcessTimedOut extends Schema.TaggedError<ProcessTimedOut>()('ProcessTimedOut', {
  command: Schema.String,
  seconds: Schema.Finite,
}) {
  override get message() {
    return `${this.command} did not finish within ${this.seconds} s and was stopped`;
  }
}

/** An undo with no write to undo, or one whose file has changed since the write. */
export class UndoUnavailable extends Schema.TaggedError<UndoUnavailable>()('UndoUnavailable', {
  reason: Schema.String,
}) {
  override get message() {
    return `nothing to undo: ${this.reason}`;
  }
}

/** The lab's Redo has no undone write to write again, or its file changed since the undo. */
export class RedoUnavailable extends Schema.TaggedError<RedoUnavailable>()('RedoUnavailable', {
  reason: Schema.String,
}) {
  override get message() {
    return `nothing to redo: ${this.reason}`;
  }
}

/** `film check --static`, run for the lab after a write, did not run to a report. */
export class StaticCheckFailed extends Schema.TaggedError<StaticCheckFailed>()(
  'StaticCheckFailed',
  { reason: Schema.String },
) {
  override get message() {
    return `the static check did not run: ${this.reason}`;
  }
}

/** A scene file with no version at HEAD the lab can compare with: new, or not in a git repository. */
export class HeadUnavailable extends Schema.TaggedError<HeadUnavailable>()('HeadUnavailable', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: no HEAD version to compare with: ${this.reason}`;
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
