// The tools' own typed failures. The core errors and refusals the tools raise
// are imported from the core where they are declared (`core/errors.ts`,
// `core/refusals.ts`).

import { Schema } from 'effect';
import { EncoderName } from '../core/encoder.ts';

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
 * An effect placed from its takes' first sample (`sync: 'start'`) whose kept
 * take starts late in its file: it is heard `onset` late on its cue. The
 * latest such take is named.
 */
export class LeadIn extends Schema.TaggedError<LeadIn>()('LeadIn', {
  effect: Schema.String,
  name: Schema.String,
  variant: Schema.Int,
  onset: Schema.Finite,
  hit: Schema.Finite,
}) {
  override get message() {
    return `effect "${this.effect}" (${this.name} variant ${this.variant}): its sound starts ${Math.round(this.onset * 1000)} ms in, so it is heard late on its cue; place it with sync: 'onset' for a sustained sound (its hit, ${this.hit.toFixed(2)} s in, would start it that early), sync: 'hit' for an impact, or keep a tighter take`;
  }
}

/** A kept take whose onset and hit the lock does not record: a `sync: 'hit'` placement cannot land it. */
export class TimingUnrecorded extends Schema.TaggedError<TimingUnrecorded>()('TimingUnrecorded', {
  name: Schema.String,
  variant: Schema.Int,
}) {
  override get message() {
    return `sound "${this.name}" variant ${this.variant}: no onset or hit in the lock; run sfx describe (free)`;
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

/**
 * The private store could not do `op` on `key`: a file it could not read or
 * write, an answer from R2 other than the one asked for (its status and S3
 * error code), or bytes that are not the hash they were stored under.
 */
export class StoreFailed extends Schema.TaggedError<StoreFailed>()('StoreFailed', {
  store: Schema.String,
  op: Schema.String,
  key: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the store at ${this.store} could not ${this.op} ${this.key}: ${this.reason}`;
  }
}

/** A push to a key the store already holds with other bytes: refused, so nothing kept is replaced unasked. */
export class StoreKeyTaken extends Schema.TaggedError<StoreKeyTaken>()('StoreKeyTaken', {
  key: Schema.String,
  file: Schema.String,
  store: Schema.String,
}) {
  override get message() {
    return `the store at ${this.store} holds other bytes as ${this.key}; ${this.file} was not sent (--replace sends it over them, or --under keeps it in its own folder)`;
  }
}

/** The store is an R2 bucket and the environment lacks what reaches it (names only; values are never read into a message). */
export class StoreCredentialsMissing extends Schema.TaggedError<StoreCredentialsMissing>()(
  'StoreCredentialsMissing',
  { bucket: Schema.String, missing: Schema.Array(Schema.String) },
) {
  override get message() {
    let verb = 'are';
    if (this.missing.length === 1) verb = 'is';
    return `the store is the R2 bucket ${this.bucket}, and ${this.missing.join(', ')} ${verb} not set: after the stack is deployed, \`bun run store:keys\` in apps/animations writes them to its .env`;
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

export class SoundMissing extends Schema.TaggedError<SoundMissing>()('SoundMissing', {
  film: Schema.String,
}) {
  override get message() {
    return `film "${this.film}" has no sound.ts`;
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

/** Sound effects need an API key; the CLI's OAuth login covers speech and music only. */
export class ApiKeyMissing extends Schema.TaggedError<ApiKeyMissing>()('ApiKeyMissing', {}) {
  override get message() {
    return 'no ELEVENLABS_API_KEY in env or Keychain';
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

/** No Chrome to render with: none where `BUN_CHROME_PATH` points, or none found (`chrome.ts`). */
export class BrowserMissing extends Schema.TaggedError<BrowserMissing>()('BrowserMissing', {
  executable: Schema.String,
}) {
  override get message() {
    return `no Chrome at ${this.executable}: install Google Chrome or Chromium, or set BUN_CHROME_PATH to its executable`;
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

/**
 * The audio master is not this film's: not as long as the film (`length`: a
 * mix was cut short, or made for another cut), or as long but mixed for
 * another plan than the film's now (another score option, a new take, a
 * moved effect), or never stamped with one.
 */
export class AudioStale extends Schema.TaggedError<AudioStale>()('AudioStale', {
  file: Schema.String,
  reason: Schema.Literals(['length', 'mixed for another plan']),
  /** The master's measured length, in seconds. */
  length: Schema.Finite,
  /** The film's length, in seconds. */
  film: Schema.Finite,
}) {
  override get message() {
    if (this.reason === 'mixed for another plan')
      return `the audio master ${this.file} was mixed for another plan than the film's now (its takes, score option, sounds or levels have changed); run mix to rebuild it (no API calls)`;
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

/** The check found errors; each was printed above. */
export class CheckFailed extends Schema.TaggedError<CheckFailed>()('CheckFailed', {
  errors: Schema.Int,
  warnings: Schema.Int,
}) {
  override get message() {
    return `film check failed: ${this.errors} error(s), ${this.warnings} warning(s)`;
  }
}

/** Another writer held a manifest's lock (`ContentStore`) past every try: a slow or stuck writer. */
export class StoreLocked extends Schema.TaggedError<StoreLocked>()('StoreLocked', {
  lock: Schema.String,
}) {
  override get message() {
    return `${this.lock} is held by a running writer; try again once it is done (the lab log names it: store.lock.held), and it is broken only once that writer has exited`;
  }
}

// ---------------------------------------------------------------------------
// Lab write-back: the scene source the lab edits.

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

/** A file a recorded text names (a take the timings name) that cannot be brought back beside it. */
export class NamedFileMissing extends Schema.TaggedError<NamedFileMissing>()('NamedFileMissing', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file} ${this.reason}`;
  }
}

/**
 * A take a recorded text names whose put-away copies differ, when its name
 * carries no hash of its audio to say which is it: nothing is brought back
 * rather than a guess.
 */
export class TakeAmbiguous extends Schema.TaggedError<TakeAmbiguous>()('TakeAmbiguous', {
  file: Schema.String,
  copies: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.file}, whose put-away copies hold different audio (${this.copies.join(', ')}) and whose name carries no hash to say which it is; restore the one you mean to narration/${this.file} by hand`;
  }
}

// ---------------------------------------------------------------------------
// Review: the box's renders, served where they lie.

/** `film project approve` or `withdraw` with neither the scenes, an act nor `--all`. */
export class ApprovalUnnamed extends Schema.TaggedError<ApprovalUnnamed>()('ApprovalUnnamed', {
  film: Schema.String,
  verb: Schema.Literals(['approve', 'withdraw']),
}) {
  override get message() {
    return `name the scenes of ${this.film} to ${this.verb} (--scene id,id), an act (--act name), or every scene (--all)`;
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

/** The film's declared acts do not make YouTube chapters. */
export class ChaptersInvalid extends Schema.TaggedError<ChaptersInvalid>()('ChaptersInvalid', {
  film: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.film}: no chapters (${this.reason})`;
  }
}
