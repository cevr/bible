// The sound library: every sound a film may name, shared by all of an app's
// films (`sounds/library.ts`), and what was made for each (`library.lock.json`,
// written by the tools). A film names sounds (`paper.slide`, `amb.court`), never
// prompts. A sound is generated (ElevenLabs, made once as candidates, curated,
// then frozen: the model has no seed), code (a graph of nodes, rendered from
// each seed whenever it is needed, so nothing is stored or paid for), or
// recorded (a CC0 or CC BY file kept in the repo). Pure: names, schemas, the
// request hash that says whether a sound is current, which variant each
// placement plays and its jitter, the level arithmetic the mix gains a sound
// by, and the credit lines a film owes for the CC BY recordings it places.

import { Array as Arr, Match, Option, Result, Schema } from 'effect';
import type { Pcm } from './audio.ts';
import { SoundUseMismatch, UnknownSound } from './errors.ts';
import { hashText } from './narration.ts';
import { type Sound, repoJson } from './schema.ts';
import { Segment } from './segment.ts';
import { fnv1a, rng } from './random.ts';
import { TAKE_LEVEL } from './recording.ts';
import { describeSound } from './synth/analyse.ts';
import { ABSOLUTE_GATE, loudness } from './synth/loudness.ts';
import { CodeSound } from './synth/graph/nodes.ts';
import type { ResolvedSound } from './synth/graph/plan.ts';
import type { ResolvedTrial } from './synth/resolve.ts';
import { RENDER_VERSION, renderCode } from './synth/graph/render.ts';
import { toMs } from './time.ts';

// ---------------------------------------------------------------------------
// Names and declarations

/** `family.thing`, lower case: `paper.slide`, `amb.court`, `tone.chime`. */
const SoundName = Segment.check(Schema.isPattern(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/));
type SoundName = typeof SoundName.Type;

/** A sound's family: what `sfx list <family>` searches by. */
export const familyOf = (name: string): string => name.slice(0, Math.max(0, name.indexOf('.')));

/** How a sound is placed: once at a cue, or looped as a bed from one cue to another. */
export const SoundUse = Schema.Literals(['one-shot', 'bed']);
export type SoundUse = typeof SoundUse.Type;

/** A placement's seeded spread: up to ± `pitch` semitones and ± `gain` dB. */
const Jitter = Schema.Struct({
  pitch: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  gain: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1.5 })),
});
type Jitter = typeof Jitter.Type;

/**
 * A licence that lets a recording sit in a public repo and a monetised film:
 * CC0 and CC BY (the owner's rule, 2026-10-16), a CC BY recording with its
 * line in the credits of every film that places it (`soundCredits`). CC0
 * owes nothing. Only the CC BY versions a recording has needed are listed:
 * add one when a recording needs it.
 */
const CreditedLicence = Schema.Literals(['CC-BY-3.0', 'CC-BY-4.0']);
type CreditedLicence = typeof CreditedLicence.Type;
const PublicLicence = Schema.Literals(['CC0-1.0', ...CreditedLicence.literals]);
type PublicLicence = typeof PublicLicence.Type;

/** A page a credit links to: an https URL, never empty. */
const PageUrl = Schema.NonEmptyString.check(Schema.isPattern(/^https:\/\/\S+$/));

/** Who made a recording and where it came from, whatever its licence. */
const provenance = {
  author: Schema.NonEmptyString,
  /** Its landing page (Freesound's, as Openverse's `foreign_landing_url` gives it): what a credit links to. */
  source: PageUrl,
  /** Its Openverse id, so its record can be looked up again. */
  openverse: Schema.optionalKey(Schema.String),
};

/** A CC0 recording: no credit owed, so its title, its author's page and whether it was changed are its own business. */
const FreeLicence = Schema.Struct({
  id: Schema.Literal('CC0-1.0'),
  ...provenance,
  title: Schema.optionalKey(Schema.NonEmptyString),
  authorUrl: Schema.optionalKey(PageUrl),
  changed: Schema.optionalKey(Schema.Boolean),
});

/**
 * A CC BY recording: everything its credit line says. `title` as its page
 * gives it, `authorUrl` its author's page, `changed` whether the file the
 * library keeps was changed from it (cut, trimmed, levelled: CC BY asks that
 * a change be said).
 */
const CreditLicence = Schema.Struct({
  id: CreditedLicence,
  ...provenance,
  title: Schema.NonEmptyString,
  authorUrl: PageUrl,
  changed: Schema.Boolean,
});

/** A recording's licence, its author and where it came from. */
const Licence = Schema.Union([FreeLicence, CreditLicence]);
type Licence = typeof Licence.Type;

/**
 * The licence of the recording a code sound was fitted from (a kept fit), as
 * the recording's entry named it. A fit is a change of the recording, so a
 * CC BY one says `changed`, and its credit line stays the recording's.
 */
const FittedLicence = Schema.Union([
  FreeLicence,
  Schema.Struct({ ...CreditLicence.fields, changed: Schema.Literal(true) }),
]);

/** What every kind of sound declares besides how it is made. */
const placing = {
  use: SoundUse,
  /** Its level in dB relative to the voice when a film names none (`DEFAULT_LEVEL` by use). */
  level: Schema.optionalKey(Schema.Finite),
  /** A one-shot's spread per placement; generated and recorded one-shots default to `DEFAULT_JITTER`. */
  jitter: Schema.optionalKey(Jitter),
  /** A bed ducks under the voice unless `false` (room tone sits under everything). */
  duck: Schema.optionalKey(Schema.Boolean),
};

/** The shortest and longest sound ElevenLabs makes, in seconds. */
const GENERATED_SECS = { min: 0.5, max: 30 } as const;

/** Seeds 1…n: each a variant. */
const Seeds = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 }));

/**
 * A code version of a sound, heard beside what plays until the owner
 * chooses: never placed, so no film plays a code sound the owner did not
 * choose.
 */
const CodeTrial = Schema.Struct({ sound: CodeSound, variants: Seeds });
export type CodeTrial = typeof CodeTrial.Type;

/**
 * A recording's code trial, fitted from it (`sfx fit`), kept as
 * `sounds/fits/<name>.json`: the trial, the recording it was fitted from (the
 * kept variant's file and hash), the earshot commit that fitted it, the size
 * it was written to, and what of the fit the code leaves out. Its entry keeps
 * its licence and credit, and the trial plays only beside the recording
 * until the owner keeps it as the entry's code.
 */
const SoundFit = Schema.Struct({
  ...CodeTrial.fields,
  from: Schema.Struct({ file: Schema.String, sha256: Schema.String }),
  earshot: Schema.String,
  size: Schema.Literals(['small', 'full']),
  left: Schema.Array(Schema.String),
});
export type SoundFit = typeof SoundFit.Type;

/** A fit as its file holds it: two-space JSON and a final newline (`repoJson`). */
export const SoundFitJson = repoJson(SoundFit);

export const Generated = Schema.Struct({
  kind: Schema.Literal('generated'),
  prompt: Schema.NonEmptyString,
  /**
   * Why ElevenLabs makes it: the realism its credits pay for, which code
   * cannot make. Code makes every simpler sound (the owner's rule), so a
   * generated sound says what it needs.
   */
  why: Schema.NonEmptyString,
  secs: Schema.Finite.check(
    Schema.isBetween({ minimum: GENERATED_SECS.min, maximum: GENERATED_SECS.max }),
  ),
  /** `prompt_influence`, 0–1: higher follows the prompt more closely and varies less. */
  influence: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  /** Made to loop seamlessly (the model's own loop): a bed. */
  loop: Schema.optionalKey(Schema.Boolean),
  /** How many candidates `sfx make` asks for; `DEFAULT_CANDIDATES` by use. */
  candidates: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }))),
  /** Its code trial: the sound made by code, heard beside its takes (`sfx render --trial`). */
  code: Schema.optionalKey(CodeTrial),
  ...placing,
});
export type Generated = typeof Generated.Type;

/**
 * A sound made by code: a graph of nodes (core/synth/graph), rendered with
 * each seed whenever it is needed, the same samples on every host, so
 * nothing is stored and nothing is paid for.
 */
const Code = Schema.Struct({
  kind: Schema.Literal('code'),
  sound: CodeSound,
  variants: Seeds,
  /**
   * A code sound kept from a recording's fit (`keptFit`): that recording's
   * licence, so a CC BY one owes its credit wherever the code is placed, as
   * the recording did (`soundCredits`).
   */
  licence: Schema.optionalKey(FittedLicence),
  ...placing,
});
type Code = typeof Code.Type;

/**
 * A recording under a licence that may be public: `sfx import` cuts, trims
 * and measures each one into the lock as a variant, its file under `public/`
 * (committed).
 */
const Recorded = Schema.Struct({
  kind: Schema.Literal('recorded'),
  licence: Licence,
  /**
   * How long `sfx import` cuts a longer recording when it is given no cut: a
   * one-shot's window round its loudest moment, a bed's stretch whose loop
   * seam is smallest (`autoCut` in tools/library.ts). Absent, the recording is
   * taken whole. A cut given to `sfx import` wins over it, and the variant's
   * `cut` says what was taken. It is not part of the request (`requestKey`):
   * a changed `secs` cuts nothing again until the next import.
   */
  secs: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  ...placing,
});
type Recorded = typeof Recorded.Type;

export const LibraryEntry = Schema.Union([Generated, Recorded, Code]);
export type LibraryEntry = typeof LibraryEntry.Type;

/** Whether `entry` is code kept from a recording's fit: it names the recording's licence, and its fit file is its sound. */
export const isKeptFit = (entry: LibraryEntry): boolean =>
  entry.kind === 'code' && Option.isSome(Option.fromUndefinedOr(entry.licence));

/** Whether `entry` is rendered from its data (a code sound), so nothing of it is made, kept or paid for. */
export const isDerived = (entry: LibraryEntry): entry is Code => entry.kind === 'code';

/**
 * A sound's code trial: a generated sound's `code`, a recording's `fit` (its
 * `sounds/fits/<name>.json`); none for a code sound.
 */
export const codeTrialOf = (
  entry: LibraryEntry,
  fit: Option.Option<CodeTrial>,
): Option.Option<CodeTrial> => {
  if (entry.kind === 'generated') return Option.fromUndefinedOr(entry.code);
  if (entry.kind === 'recorded') return fit;
  return Option.none();
};

/** An app's sounds by name (`sounds/library.ts`). */
export const Library = Schema.Record(SoundName, LibraryEntry);
export type Library = typeof Library.Type;

const soundNamed = Schema.decodeOption(SoundName);

/**
 * The entry `library` declares under `name`, as a cue or a choice names it:
 * the name is decoded first, so a name no library can hold (`constructor`)
 * reads no entry off the prototype.
 */
export const soundEntry = (library: Library, name: string): Option.Option<LibraryEntry> =>
  Option.flatMap(soundNamed(name), (sound) => Option.fromUndefinedOr(library[sound]));

/** Declare a library: the identity, typed, so a film's app gets its checks at the declaration. */
export const defineLibrary = <const L extends Library>(library: L): L => library;

// ---------------------------------------------------------------------------
// What was made (`library.lock.json`)

/** How loud a variant measured when it was made: LUFS and dBFS, silence floored at `SILENT`. */
const VariantLoudness = Schema.Struct({
  integrated: Schema.Finite,
  momentaryMax: Schema.Finite,
  peak: Schema.Finite,
});
type VariantLoudness = typeof VariantLoudness.Type;

/** A measure of silence as the lock writes it: JSON has no -Infinity. */
export const SILENT = -120;

/** A loudness made writable: anything under `SILENT` (silence included) is `SILENT`, one decimal kept. */
export const lockLoudness = (measured: {
  readonly integrated: number;
  readonly momentaryMax: number;
  readonly peak: number;
}): VariantLoudness => {
  const floor = (db: number) => Math.round(Math.max(SILENT, db) * 10) / 10;
  return {
    integrated: floor(measured.integrated),
    momentaryMax: floor(measured.momentaryMax),
    peak: floor(measured.peak),
  };
};

/** The model and format every generated sound is made with. */
export const SFX_MODEL = 'eleven_text_to_sound_v2';
export const SFX_FORMAT = 'pcm_44100';
/** "40 credits per second when duration is specified", whatever the prompt. */
const CREDITS_PER_SECOND = 40;

/** Where a variant's licence lets it live: a paid generation stays private. */
const VariantLicence = Schema.Literals(['elevenlabs-paid-sfx', ...PublicLicence.literals]);
type VariantLicence = typeof VariantLicence.Type;

/** One made variant: a file named by its bytes' hash, as measured and paid for when it was made. */
export const Variant = Schema.Struct({
  /** The request it was made for (`requestKey`). */
  request: Schema.String,
  /** Relative to the library's folder: `files/<name>/…` (generated, private) or `public/<name>/…` (recorded). */
  file: Schema.String,
  sha256: Schema.String,
  made: Schema.String,
  model: Schema.String,
  format: Schema.String,
  secs: Schema.Finite,
  loudness: VariantLoudness,
  /**
   * Seconds into the file where its sound starts (within 30 dB of its loudest
   * 10 ms) and where it hits (its loudest 10 ms begins), as `describeSound`
   * measured them: a take is not trimmed, so a placement that lands its hit
   * on a cue (`sync: 'hit'`) starts it this much early. Written when the
   * variant is made, or by `sfx describe` from the file (free).
   */
  onset: Schema.optionalKey(Schema.Finite),
  hit: Schema.optionalKey(Schema.Finite),
  /** A recording's cut: the seconds of its source `sfx import` took, before the quiet ends were trimmed. */
  cut: Schema.optionalKey(Schema.Struct({ from: Schema.Finite, to: Schema.Finite })),
  licence: VariantLicence,
  credits: Schema.Int,
});
export type Variant = typeof Variant.Type;

/** Where a take's sound starts and where it hits, in seconds into its file. */
export interface VariantTiming {
  readonly onset: number;
  readonly hit: number;
}

/** A variant's onset and hit as the lock writes them, to the millisecond. */
export const lockTiming = (described: VariantTiming): VariantTiming => ({
  onset: toMs(described.onset),
  hit: toMs(described.hit),
});

/** A one-shot's lead-in (its onset) over this many seconds is heard late on a cue that places its first sample: `check` says so (`LeadIn`). */
export const LEAD_IN = 0.05;

/**
 * One sound's record: its kept variants (what plays), the candidates made and
 * awaiting audition, and what was rejected. A changed declaration makes new
 * candidates under its new request while the old variants keep playing, until
 * a new one is kept.
 */
export const LockEntry = Schema.Struct({
  variants: Schema.Array(Variant),
  candidates: Schema.Array(Variant),
  /** The sha256 of each candidate auditioned and dropped: never offered again. */
  rejected: Schema.Array(Schema.String),
});
export type LockEntry = typeof LockEntry.Type;

export const Lock = Schema.Record(Schema.String, LockEntry);
export type Lock = typeof Lock.Type;

/**
 * `library.lock.json` on disk: two-space JSON and a final newline (`repoJson`).
 * The formatter sets a short array of strings on one line where this writes
 * one per line, so `bun run fmt` follows every `sfx` command that writes it.
 */
export const LockJson = repoJson(Lock);

/** The fields that change what a sound's audio is, in a fixed order: never reorder. */
const RequestKey = Schema.fromJsonString(
  Schema.Union([
    Schema.Struct({
      kind: Schema.Literal('generated'),
      prompt: Schema.String,
      secs: Schema.Finite,
      influence: Schema.Finite,
      loop: Schema.Boolean,
      model: Schema.String,
      format: Schema.String,
    }),
    Schema.Struct({ kind: Schema.Literal('recorded'), source: Schema.String }),
    Schema.Struct({ kind: Schema.Literal('code'), sound: CodeSound }),
  ]),
);

/**
 * `prompt_influence` when a sound names none, by use. Measured in the
 * sweet-spot trials (one axis at a time, `apps/animations/sounds/PROMPTING.md`):
 * a one-shot keeps to its prompt, at full level and dry, only from 0.7 up (a gavel at 0.5 came out 20–30 dB quieter, with its energy under
 * 30 Hz); a bed keeps the model's own air at the API's 0.3, and a crowd bed
 * loops cleaner at 0.6 (its declaration names that).
 */
const DEFAULT_INFLUENCE = { 'one-shot': 0.7, bed: 0.3 } satisfies Record<SoundUse, number>;

/** The `prompt_influence` a generated sound is made with: its own, or its use's default. */
export const influenceOf = (entry: Generated): number =>
  Option.getOrElse(Option.fromUndefinedOr(entry.influence), () => DEFAULT_INFLUENCE[entry.use]);

/** The hash of what a declaration asks for: the lock's `request` against it says whether a sound is current. */
export const requestKey = (entry: LibraryEntry): string => {
  switch (entry.kind) {
    case 'generated':
      return hashText(
        Schema.encodeSync(RequestKey)({
          kind: 'generated',
          prompt: entry.prompt,
          secs: entry.secs,
          influence: influenceOf(entry),
          loop: entry.loop === true,
          model: SFX_MODEL,
          format: SFX_FORMAT,
        }),
      );
    case 'recorded':
      return hashText(
        Schema.encodeSync(RequestKey)({ kind: 'recorded', source: entry.licence.source }),
      );
    // A code sound is never made for a request: this key only tells a take its lock kept from it.
    case 'code':
      return hashText(Schema.encodeSync(RequestKey)({ kind: 'code', sound: entry.sound }));
  }
};

/** Where a sound stands against the lock. */
type SoundState =
  /** Code: rendered from its graph, nothing to make. */
  | { readonly _tag: 'Derived'; readonly variants: number }
  /** No variant kept for any request: nothing plays. */
  | { readonly _tag: 'Missing'; readonly candidates: number }
  /** Kept variants made for another request: they play, and a remake is due. */
  | { readonly _tag: 'Stale'; readonly variants: number; readonly candidates: number }
  | { readonly _tag: 'Current'; readonly variants: number; readonly candidates: number };

/** The candidates made for the current request and not yet kept or rejected. */
export const pendingOf = (entry: LibraryEntry, lock: Option.Option<LockEntry>) =>
  Option.match(lock, {
    onNone: (): ReadonlyArray<Variant> => [],
    onSome: (l) => l.candidates.filter((c) => c.request === requestKey(entry)),
  });

/** Where `entry` stands against its lock record. */
export const soundState = (entry: LibraryEntry, lock: Option.Option<LockEntry>): SoundState => {
  if (isDerived(entry)) return { _tag: 'Derived', variants: entry.variants };
  const candidates = pendingOf(entry, lock).length;
  const kept = Option.match(lock, {
    onNone: (): ReadonlyArray<Variant> => [],
    onSome: (l) => l.variants,
  });
  if (kept.length === 0) return { _tag: 'Missing', candidates };
  const current = kept.every((v) => v.request === requestKey(entry));
  if (!current) return { _tag: 'Stale', variants: kept.length, candidates };
  return { _tag: 'Current', variants: kept.length, candidates };
};

/**
 * The kept variants' mean loudness as the mix levels them: momentary max for
 * a one-shot, integrated for a bed. None when nothing is kept, and none for a
 * code sound: its seeds play, and its lock holds only the takes it was.
 */
export const keptLoudness = (
  entry: LibraryEntry,
  lock: Option.Option<LockEntry>,
): Option.Option<number> => {
  if (isDerived(entry)) return Option.none();
  const kept = Option.match(lock, {
    onNone: (): ReadonlyArray<Variant> => [],
    onSome: (l) => l.variants,
  });
  if (kept.length === 0) return Option.none();
  const measure = kept.map((v) => {
    if (entry.use === 'bed') return v.loudness.integrated;
    return v.loudness.momentaryMax;
  });
  return Option.some(measure.reduce((a, b) => a + b, 0) / measure.length);
};

/** How many candidates a generated sound is made as, when it names no number. */
// About a third of the sweet-spot takes were usable: six one-shots,
// or three beds, give one usable take nearly always.
const DEFAULT_CANDIDATES = { 'one-shot': 6, bed: 3 } satisfies Record<SoundUse, number>;

export const candidatesOf = (entry: Generated): number =>
  Option.getOrElse(Option.fromUndefinedOr(entry.candidates), () => DEFAULT_CANDIDATES[entry.use]);

/** What one generation of `entry` costs, in credits. */
export const creditsOf = (entry: Generated): number => Math.round(entry.secs * CREDITS_PER_SECOND);

/** One generated sound `sfx make` would ask for: how many candidates, and what they cost. */
export interface MakeJob {
  readonly name: string;
  readonly entry: Generated;
  readonly count: number;
  readonly credits: number;
}

/**
 * What `sfx make` would generate, by name: every generated sound (of `names`,
 * when given) that has no variant kept for its current request, short of its
 * candidates by what already waits for audition. `force` makes a full set of
 * candidates again even for a current sound. Code and recorded sounds are
 * never generated.
 */
export const makePlan = (
  library: Library,
  lock: Lock,
  names: Option.Option<ReadonlySet<string>>,
  force: boolean,
): ReadonlyArray<MakeJob> =>
  Object.keys(library)
    .sort()
    .filter((name) => Option.match(names, { onNone: () => true, onSome: (set) => set.has(name) }))
    .flatMap((name) =>
      Option.match(Option.filter(soundEntry(library, name), isGenerated), {
        onNone: (): ReadonlyArray<MakeJob> => [],
        onSome: (entry) => makeJob(name, entry, Option.fromUndefinedOr(lock[name]), force),
      }),
    );

const isGenerated = (entry: LibraryEntry): entry is Generated => entry.kind === 'generated';

const makeJob = (
  name: string,
  entry: Generated,
  record: Option.Option<LockEntry>,
  force: boolean,
): ReadonlyArray<MakeJob> => {
  const want = candidatesOf(entry);
  if (force) return [{ name, entry, count: want, credits: want * creditsOf(entry) }];
  if (soundState(entry, record)._tag === 'Current') return [];
  const count = Math.max(0, want - pendingOf(entry, record).length);
  if (count === 0) return [];
  return [{ name, entry, count, credits: count * creditsOf(entry) }];
};

/** Settings a trial (`sfx try`) makes a generated sound with in place of its declaration's. */
export interface Trial {
  readonly prompt: Option.Option<string>;
  readonly secs: Option.Option<number>;
  readonly influence: Option.Option<number>;
}

/**
 * `entry` with a trial's settings over its own, checked as a declaration is
 * (`Generated`): its candidates are made and wait under this request, and
 * become keepable when the declaration is changed to say the same.
 */
export const trialEntry = (entry: Generated, trial: Trial) =>
  Schema.decodeResult(Generated)({
    ...entry,
    ...Option.match(trial.prompt, { onNone: () => ({}), onSome: (prompt) => ({ prompt }) }),
    ...Option.match(trial.secs, { onNone: () => ({}), onSome: (secs) => ({ secs }) }),
    ...Option.match(trial.influence, {
      onNone: () => ({}),
      onSome: (influence) => ({ influence }),
    }),
  });

// ---------------------------------------------------------------------------
// Lookup

/** The sound a film names, or `UnknownSound` listing its family's names (or every name). */
export const resolveSound = (
  library: Library,
  name: string,
): Result.Result<LibraryEntry, UnknownSound> =>
  Result.fromOption(soundEntry(library, name), () => {
    const names = Object.keys(library).sort();
    const family = names.filter((n) => familyOf(n) === familyOf(name));
    return UnknownSound.make({
      name,
      known: Option.getOrElse(Option.liftPredicate(family, Arr.isArrayNonEmpty), () => names),
    });
  });

/** The sound a film places as `use`, refused when it is declared for the other use. */
export const resolveUse = (
  library: Library,
  name: string,
  use: SoundUse,
): Result.Result<LibraryEntry, UnknownSound | SoundUseMismatch> =>
  Result.flatMap(resolveSound(library, name), (entry) => {
    if (entry.use === use) return Result.succeed(entry);
    return Result.fail(SoundUseMismatch.make({ name, declared: entry.use, placed: use }));
  });

// ---------------------------------------------------------------------------
// Levels: in dB relative to the voice

/** The voice's speech level (dBFS) every take is levelled to: a sound's `level` counts from it. */
export const VOICE_LEVEL = TAKE_LEVEL.speech;

/** A sound's level relative to the voice when neither the film nor the library names one. */
const DEFAULT_LEVEL = { 'one-shot': -10, bed: -28 } satisfies Record<SoundUse, number>;

/** The level a placement plays at: the film's, else the library's, else the use's default. */
export const levelOf = (entry: LibraryEntry, placed: Option.Option<number>): number =>
  Option.getOrElse(
    Option.orElse(placed, () => Option.fromUndefinedOr(entry.level)),
    () => DEFAULT_LEVEL[entry.use],
  );

/**
 * The linear gain that puts a variant at `level` dB relative to the voice: a
 * one-shot by its momentary max, a bed by its integrated loudness.
 */
export const gainFor = (level: number, loudness: VariantLoudness, use: SoundUse): number => {
  let measured = loudness.momentaryMax;
  if (use === 'bed') measured = loudness.integrated;
  // A silent variant stays silent rather than being lifted without bound.
  if (measured <= SILENT) return 0;
  return 10 ** ((VOICE_LEVEL + level - measured) / 20);
};

// ---------------------------------------------------------------------------
// What plays

/** A derived variant as measured: its loudness, its onset and its hit. */
export interface Measure {
  readonly loudness: VariantLoudness;
  readonly onset: number;
  readonly hit: number;
}

/** A sound's audio measured as the lock measures a made variant. */
export const measurePcm = (pcm: Pcm): Measure => ({
  loudness: lockLoudness(loudness(pcm)),
  ...lockTiming(describeSound(pcm)),
});

/**
 * A variant measured as silence: no 400 ms block of it over BS.1770's
 * absolute gate (-70 LUFS), so it has no integrated loudness to level by.
 */
export const heardNothing = (measure: Measure): boolean =>
  measure.loudness.integrated <= ABSOLUTE_GATE;

/** An app's sounds as a film loads them: the declarations, what was made, and where. */
export interface Sounds {
  readonly library: Library;
  readonly lock: Lock;
  /** The library's folder: a variant's `file` is relative to it. */
  readonly dir: string;
  /** Each code sound, resolved: its graph and the sounds it samples (core/synth/resolve.ts). */
  readonly code: ReadonlyMap<string, ResolvedSound>;
  /**
   * Each code trial, resolved, by its sound's name: heard beside what plays
   * (Choices, `sfx compare`), never placed. A mix plays a trial's seed only
   * where it is asked to play it in its sound's place (`film options mix`).
   */
  readonly trials: ReadonlyMap<string, ResolvedTrial>;
}

/**
 * An app's sounds as what plays them reads them (a mix, the check's lead-in,
 * a seed's line): each derived variant of the sounds being played measured,
 * by its source's label (`SoundRender.measured`).
 */
export interface MeasuredSounds extends Sounds {
  readonly measured: ReadonlyMap<string, Measure>;
}

/** No library: a film that names no sound, so there is nothing to measure. */
export const NO_SOUNDS: MeasuredSounds = {
  library: {},
  lock: {},
  dir: '',
  code: new Map(),
  trials: new Map(),
  measured: new Map(),
};

/** Where a sound's audio comes from: a file, or a code sound rendered with a seed. */
export type SoundSource =
  | { readonly _tag: 'File'; readonly file: string }
  | { readonly _tag: 'Code'; readonly sound: ResolvedSound; readonly seed: number };

/** A source rendered from data: the same audio for the same label, whenever it is made. */
export type DerivedSource = Exclude<SoundSource, { readonly _tag: 'File' }>;

export const fileSource = (file: string): SoundSource => ({ _tag: 'File', file });

/**
 * A source by one line of text: its file, or `code:<renderer>:<graph>/<seed>`,
 * which names the renderer's version, so an edit to the data or to the DSP
 * gives a new label, and with it a new mix key.
 */
export const sourceLabel = (source: SoundSource): string =>
  Match.valueTags(source, {
    File: (file) => file.file,
    Code: (code) => `code:${RENDER_VERSION}:${code.sound.hash}/${code.seed}`,
  });

/** A derived source's audio: its graph rendered with its seed. */
export const renderSource = (source: DerivedSource): Pcm => renderCode(source.sound, source.seed);

/** One variant a placement may play: its audio, how loud it measured, and where its sound begins and hits (none unrecorded). */
export interface Playable {
  readonly source: SoundSource;
  readonly loudness: VariantLoudness;
  readonly onset: Option.Option<number>;
  readonly hit: Option.Option<number>;
}

/** A code sound's audio with `seed`; none for one the walk has not resolved. */
export const seedSource = (
  sounds: Sounds,
  name: string,
  seed: number,
): Option.Option<DerivedSource> =>
  Option.map(Option.fromUndefinedOr(sounds.code.get(name)), (sound): DerivedSource => ({
    _tag: 'Code',
    sound,
    seed,
  }));

/** A code sound's seeds 1…n as sources; none for one the walk has not resolved. */
export const seedSources = (
  sounds: Sounds,
  name: string,
  entry: Code,
): ReadonlyArray<DerivedSource> =>
  Array.from({ length: entry.variants }, (_, i) => i + 1).flatMap((seed) =>
    Option.toArray(seedSource(sounds, name, seed)),
  );

/** A sound's code trial's seeds 1…n as sources; none when it has no trial. */
export const trialSources = (sounds: Sounds, name: string): ReadonlyArray<DerivedSource> =>
  Option.match(Option.fromUndefinedOr(sounds.trials.get(name)), {
    onNone: () => [],
    onSome: (trial) =>
      Arr.range(1, trial.variants).map((seed): DerivedSource => ({
        _tag: 'Code',
        sound: trial.sound,
        seed,
      })),
  });

/**
 * What of `name` is heard from its data, each by its source's label: a
 * derived sound's seeds, then its code trial's.
 */
const heardSources = (sounds: Sounds, name: string): ReadonlyArray<DerivedSource> => [
  ...Option.match(Option.filter(soundEntry(sounds.library, name), isDerived), {
    onNone: () => [],
    onSome: (entry) => seedSources(sounds, name, entry),
  }),
  ...trialSources(sounds, name),
];

/** The seed of `name` (its own, or its code trial's) whose source's label is `label`. */
export const heardSource = (
  sounds: Sounds,
  name: string,
  label: string,
): Option.Option<DerivedSource> =>
  Arr.findFirst(heardSources(sounds, name), (source) => sourceLabel(source) === label);

/** A kept or waiting variant as it plays: its file in the library's folder, as the lock measured it. */
export const variantPlayable = (sounds: Sounds, variant: Variant): Playable => ({
  source: fileSource(`${sounds.dir}/${variant.file}`),
  loudness: variant.loudness,
  onset: Option.fromUndefinedOr(variant.onset),
  hit: Option.fromUndefinedOr(variant.hit),
});

/** A derived source as it plays, measured as `measured` says. */
export const derivedPlayable = (source: DerivedSource, measured: Measure): Playable => ({
  source,
  loudness: measured.loudness,
  onset: Option.some(measured.onset),
  hit: Option.some(measured.hit),
});

/** A derived source as it plays, as `sounds` measured it; none until it is measured. */
const measuredPlayable = (sounds: MeasuredSounds, source: DerivedSource): Option.Option<Playable> =>
  Option.map(Option.fromUndefinedOr(sounds.measured.get(sourceLabel(source))), (measured) =>
    derivedPlayable(source, measured),
  );

/** The library's names a film's sound plays: each bed's and each effect's, once each. */
export const placedSounds = (sound: Sound): ReadonlyArray<string> =>
  Arr.dedupe([
    ...(sound.beds ?? []).map((bed) => bed.sound),
    ...Object.values(sound.effects).map((effect) => effect.sound),
  ]);

// ---------------------------------------------------------------------------
// Credits

/** A CC BY recording a film places, as its credit line names it (`creditLine`, `creditLink`). */
export interface SoundCredit {
  readonly title: string;
  readonly author: string;
  readonly authorUrl: string;
  /** Its landing page. */
  readonly source: string;
  readonly licence: CreditedLicence;
  readonly changed: boolean;
}

/** How a credit names a licence, and where its deed is. */
const LICENCE_NAME = {
  'CC-BY-3.0': 'CC BY 3.0',
  'CC-BY-4.0': 'CC BY 4.0',
} satisfies Record<CreditedLicence, string>;
const LICENCE_DEED = {
  'CC-BY-3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
} satisfies Record<CreditedLicence, string>;

/** The credit a recording's licence owes: none for CC0. */
const creditOf = (licence: Licence): Option.Option<SoundCredit> => {
  if (licence.id === 'CC0-1.0') return Option.none();
  return Option.some({
    title: licence.title,
    author: licence.author,
    authorUrl: licence.authorUrl,
    source: licence.source,
    licence: licence.id,
    changed: licence.changed,
  });
};

/**
 * The credits a film's sound owes: one for each CC BY recording it places
 * (`placedSounds`: its beds and effects), or code kept from a fit of one,
 * in the order it names them, each recording once. A CC0 recording, a
 * generated sound, a code sound made from no recording, and a sound the film
 * does not place owe none. The film's credit roll and its video's
 * description both read this list, and `film check` holds the roll to it.
 */
export const soundCredits = (library: Library, sound: Sound): ReadonlyArray<SoundCredit> =>
  Arr.dedupeWith(
    placedSounds(sound).flatMap((name) =>
      Option.toArray(
        Option.flatMap(soundEntry(library, name), (entry) => {
          if (entry.kind === 'generated') return Option.none();
          return Option.flatMap(Option.fromUndefinedOr(entry.licence), creditOf);
        }),
      ),
    ),
    (a, b) => a.source === b.source,
  );

/** A credit as the roll sets it: `"title" by author, CC BY 4.0, changed`. */
export const creditLine = (credit: SoundCredit): string =>
  `"${credit.title}" by ${credit.author}, ${LICENCE_NAME[credit.licence]}${changedNote(credit)}`;

/** A credit as a video's description gives it: the roll's line with each page it names linked. */
export const creditLink = (credit: SoundCredit): string =>
  `"${credit.title}" (${credit.source}) by ${credit.author} (${credit.authorUrl}), ${LICENCE_NAME[credit.licence]} (${LICENCE_DEED[credit.licence]})${changedNote(credit)}`;

const changedNote = (credit: SoundCredit): string => {
  if (credit.changed) return ', changed';
  return '';
};

/** How many of a derived sound's seeds `sounds` holds no measure of (all, when it is not resolved); 0 for a kept sound. */
export const unmeasuredOf = (sounds: MeasuredSounds, name: string, entry: LibraryEntry): number => {
  if (!isDerived(entry)) return 0;
  const sources = seedSources(sounds, name, entry);
  if (sources.length === 0) return entry.variants;
  return sources.filter((source) => !sounds.measured.has(sourceLabel(source))).length;
};

/**
 * The variants of `name` that play, in order: a derived sound's seeds 1…n,
 * each as measured (one not measured does not play), else the kept variants
 * in the lock (stale ones included), none when nothing is kept.
 */
export const playablesOf = (
  sounds: MeasuredSounds,
  name: string,
  entry: LibraryEntry,
): ReadonlyArray<Playable> => {
  if (isDerived(entry))
    return seedSources(sounds, name, entry).flatMap((source) =>
      Option.toArray(measuredPlayable(sounds, source)),
    );
  const kept = Option.match(Option.fromUndefinedOr(sounds.lock[name]), {
    onNone: (): ReadonlyArray<Variant> => [],
    onSome: (l) => l.variants,
  });
  return kept.map((v) => variantPlayable(sounds, v));
};

// ---------------------------------------------------------------------------
// Variants and jitter

/** A generated or recorded one-shot's spread when it declares none; derived and bed sounds have none (a derived sound's seeds are its spread). */
export const DEFAULT_JITTER: Jitter = { pitch: 0.5, gain: 1 };
/** The most a one-shot's start is nudged late, in seconds. */
const JITTER_DELAY = 0.015;

/** A sound's spread: declared, else the default for a non-tonal one-shot, else none. */
export const jitterOf = (entry: LibraryEntry): Option.Option<Jitter> => {
  if (entry.use === 'bed') return Option.none();
  return Option.orElse(Option.fromUndefinedOr(entry.jitter), () =>
    Option.liftPredicate(DEFAULT_JITTER, () => !isDerived(entry)),
  );
};

/** One placement of a sound, in film time. */
export interface Placing {
  readonly effect: string;
  readonly sound: string;
  readonly at: number;
}

/** What a placement plays: which variant, and its seeded nudge. */
interface Played {
  readonly variant: number;
  /** Semitones (the variant is resampled, so its length changes with it). */
  readonly pitch: number;
  /** dB. */
  readonly gain: number;
  /** Seconds late. */
  readonly delay: number;
}

/**
 * Which variant each placement plays, and its jitter, in the order given.
 * Placement k of an effect (in film time) plays variant `(k + hash(effect))
 * mod n`, moved on by one when that is the variant the same sound played
 * last, so a sound never repeats itself back to back while it has another.
 * Each nudge is seeded by the film, the effect and k: the same film always
 * mixes the same way.
 */
export const playPlacings = (
  film: string,
  placings: ReadonlyArray<Placing>,
  variantsOf: (sound: string) => number,
  spreadOf: (sound: string) => Option.Option<Jitter>,
): ReadonlyArray<Played> => {
  const order = placings.map((p, i) => ({ p, i })).sort((a, b) => a.p.at - b.p.at || a.i - b.i);
  const seen = new Map<string, number>();
  const last = new Map<string, number>();
  const played: Array<Played> = placings.map(() => ({ variant: 0, pitch: 0, gain: 0, delay: 0 }));
  for (const { p, i } of order) {
    const n = Math.max(1, variantsOf(p.sound));
    const k = Option.getOrElse(Option.fromUndefinedOr(seen.get(p.effect)), () => 0);
    seen.set(p.effect, k + 1);
    let variant = (k + fnv1a(p.effect)) % n;
    if (n > 1 && last.get(p.sound) === variant) variant = (variant + 1) % n;
    last.set(p.sound, variant);
    const r = rng(fnv1a(`${film}/${p.effect}/${k}`));
    played[i] = Option.match(spreadOf(p.sound), {
      onNone: () => ({ variant, pitch: 0, gain: 0, delay: 0 }),
      onSome: (spread) => ({
        variant,
        pitch: (r() * 2 - 1) * spread.pitch,
        gain: (r() * 2 - 1) * spread.gain,
        delay: r() * JITTER_DELAY,
      }),
    });
  }
  return played;
};

/** A file an audio tool reads or writes, by its extension. */
export const AUDIO_FILE = /\.(flac|wav|mp3|ogg|opus|m4a|aac|aiff?)$/i;
