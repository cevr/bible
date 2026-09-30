// The sound library: every sound a film may name, shared by all of an app's
// films (`sounds/library.ts`), and what was made for each (`library.lock.json`,
// written by the tools). A film names sounds (`paper.slide`, `amb.court`), never
// prompts. A sound is generated (ElevenLabs, made once as candidates, curated,
// then frozen: the model has no seed), procedural (a synth recipe, rendered
// from its seed whenever it is needed, so nothing is stored), or recorded (a
// CC0 file kept in the repo). Pure: names, schemas, the request hash
// that says whether a sound is current, which variant each placement plays and
// its jitter, and the level arithmetic the mix gains a sound by.

import { Array as Arr, Option, Result, Schema } from 'effect';
import { SoundUseMismatch, UnknownSound } from './errors.ts';
import { hashText } from './narration.ts';
import { repoJson } from './schema.ts';
import { fnv1a, rng } from './random.ts';
import { TAKE_LEVEL } from './recording.ts';
import { describeSound } from './synth/analyse.ts';
import { loudness } from './synth/loudness.ts';
import { Recipe, synthesize } from './synth/recipes.ts';

// ---------------------------------------------------------------------------
// Names and declarations

/** `family.thing`, lower case: `paper.slide`, `amb.court`, `tone.chime`. */
export const SoundName = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/),
);
export type SoundName = typeof SoundName.Type;

/** A sound's family: what `sfx list <family>` searches by. */
export const familyOf = (name: string): string => name.slice(0, Math.max(0, name.indexOf('.')));

/** How a sound is placed: once at a cue, or looped as a bed from one cue to another. */
export const SoundUse = Schema.Literals(['one-shot', 'bed']);
export type SoundUse = typeof SoundUse.Type;

/** A placement's seeded spread: up to ± `pitch` semitones and ± `gain` dB. */
export const Jitter = Schema.Struct({
  pitch: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  gain: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1.5 })),
});
export type Jitter = typeof Jitter.Type;

/**
 * A licence that lets a recording sit in a public repo and a monetised film:
 * CC0 only (the owner's rule), so no credit line is ever owed.
 */
export const PublicLicence = Schema.Literals(['CC0-1.0']);
export type PublicLicence = typeof PublicLicence.Type;

/** A recording's licence, its author and where it came from. */
export const Licence = Schema.Struct({
  id: PublicLicence,
  author: Schema.String,
  source: Schema.String,
});
export type Licence = typeof Licence.Type;

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
export const GENERATED_SECS = { min: 0.5, max: 30 } as const;

export const Generated = Schema.Struct({
  kind: Schema.Literal('generated'),
  prompt: Schema.NonEmptyString,
  secs: Schema.Finite.check(
    Schema.isBetween({ minimum: GENERATED_SECS.min, maximum: GENERATED_SECS.max }),
  ),
  /** `prompt_influence`, 0–1: higher follows the prompt more closely and varies less. */
  influence: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  /** Made to loop seamlessly (the model's own loop): a bed. */
  loop: Schema.optionalKey(Schema.Boolean),
  /** How many candidates `sfx make` asks for; `DEFAULT_CANDIDATES` by use. */
  candidates: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }))),
  ...placing,
});
export type Generated = typeof Generated.Type;

export const Procedural = Schema.Struct({
  kind: Schema.Literal('procedural'),
  recipe: Recipe,
  /** Seeds 1…n: each a variant. */
  variants: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 12 })),
  ...placing,
});
export type Procedural = typeof Procedural.Type;

/**
 * A recording under a licence that may be public: `sfx import` trims and
 * measures each one into the lock as a variant, its file under `public/`
 * (committed).
 */
export const Recorded = Schema.Struct({
  kind: Schema.Literal('recorded'),
  licence: Licence,
  ...placing,
});
export type Recorded = typeof Recorded.Type;

export const LibraryEntry = Schema.Union([Generated, Procedural, Recorded]);
export type LibraryEntry = typeof LibraryEntry.Type;

/** An app's sounds by name (`sounds/library.ts`). */
export const Library = Schema.Record(SoundName, LibraryEntry);
export type Library = typeof Library.Type;

/** Declare a library: the identity, typed, so a film's app gets its checks at the declaration. */
export const defineLibrary = <const L extends Library>(library: L): L => library;

// ---------------------------------------------------------------------------
// What was made (`library.lock.json`)

/** How loud a variant measured when it was made: LUFS and dBFS, silence floored at `SILENT`. */
export const VariantLoudness = Schema.Struct({
  integrated: Schema.Finite,
  momentaryMax: Schema.Finite,
  peak: Schema.Finite,
});
export type VariantLoudness = typeof VariantLoudness.Type;

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
export const CREDITS_PER_SECOND = 40;

/** Where a variant's licence lets it live: a paid generation stays private. */
export const VariantLicence = Schema.Literals(['elevenlabs-paid-sfx', 'CC0-1.0']);
export type VariantLicence = typeof VariantLicence.Type;

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
  onset: Math.round(described.onset * 1000) / 1000,
  hit: Math.round(described.hit * 1000) / 1000,
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

/** `library.lock.json` on disk: two-space JSON and a final newline, as the formatter leaves it. */
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
    Schema.Struct({ kind: Schema.Literal('procedural'), recipe: Recipe }),
    Schema.Struct({ kind: Schema.Literal('recorded'), source: Schema.String }),
  ]),
);

/**
 * `prompt_influence` when a sound names none, by use. Measured (p4-sfx2, one
 * axis at a time): a one-shot keeps to its prompt, at full level and dry, only
 * from 0.7 up (a gavel at 0.5 came out 20–30 dB quieter, with its energy under
 * 30 Hz); a bed keeps the model's own air at the API's 0.3, and a crowd bed
 * loops cleaner at 0.6 (its declaration names that).
 */
export const DEFAULT_INFLUENCE = { 'one-shot': 0.7, bed: 0.3 } satisfies Record<SoundUse, number>;

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
    case 'procedural':
      return hashText(Schema.encodeSync(RequestKey)({ kind: 'procedural', recipe: entry.recipe }));
    case 'recorded':
      return hashText(
        Schema.encodeSync(RequestKey)({ kind: 'recorded', source: entry.licence.source }),
      );
  }
};

/** Where a sound stands against the lock. */
export type SoundState =
  /** Procedural: rendered from its recipe, nothing to make. */
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
  if (entry.kind === 'procedural') return { _tag: 'Derived', variants: entry.variants };
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

/** How many variants of `entry` play: its seeds, or its kept files. */
export const variantCount = (entry: LibraryEntry, lock: Option.Option<LockEntry>): number => {
  const state = soundState(entry, lock);
  if (state._tag === 'Missing') return 0;
  return state.variants;
};

/** How many candidates a generated sound is made as, when it names no number. */
// About a third of the sweet-spot takes were usable (p4-sfx2): six one-shots,
// or three beds, give one usable take nearly always.
export const DEFAULT_CANDIDATES = { 'one-shot': 6, bed: 3 } satisfies Record<SoundUse, number>;

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
 * candidates again even for a current sound. Procedural and recorded sounds
 * are never generated.
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
      Option.match(Option.filter(Option.fromUndefinedOr(library[name]), isGenerated), {
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
  Result.fromOption(Option.fromUndefinedOr(library[name]), () => {
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
export const DEFAULT_LEVEL = { 'one-shot': -10, bed: -28 } satisfies Record<SoundUse, number>;

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

/** An app's sounds as a film's mix reads them: the declarations, what was made, and where. */
export interface Sounds {
  readonly library: Library;
  readonly lock: Lock;
  /** The library's folder: a variant's `file` is relative to it. */
  readonly dir: string;
}

/** No library: a film that names no sound. */
export const NO_SOUNDS: Sounds = { library: {}, lock: {}, dir: '' };

/** Where a sound's audio comes from: a file, or a recipe played with a seed. */
export type SoundSource =
  | { readonly _tag: 'File'; readonly file: string }
  | { readonly _tag: 'Synth'; readonly recipe: Recipe; readonly seed: number };

export const fileSource = (file: string): SoundSource => ({ _tag: 'File', file });

/** A source by one line of text: its file, or `synth:<request>/<seed>`. */
export const sourceLabel = (source: SoundSource): string => {
  if (source._tag === 'File') return source.file;
  return `synth:${hashText(Schema.encodeSync(Schema.fromJsonString(Recipe))(source.recipe))}/${source.seed}`;
};

/** One variant a placement may play: its audio, how loud it measured, and where its sound begins and hits (none unrecorded). */
export interface Playable {
  readonly source: SoundSource;
  readonly loudness: VariantLoudness;
  readonly onset: Option.Option<number>;
  readonly hit: Option.Option<number>;
}

/** A procedural variant as measured: its loudness, its onset and its hit. */
interface SynthMeasure {
  readonly loudness: VariantLoudness;
  readonly onset: number;
  readonly hit: number;
}

/** Each procedural variant measured once per process: the recipe and seed decide it. */
const synthMeasured = new Map<string, SynthMeasure>();

const measureSynth = (recipe: Recipe, seed: number): SynthMeasure => {
  const key = sourceLabel({ _tag: 'Synth', recipe, seed });
  return Option.getOrElse(Option.fromUndefinedOr(synthMeasured.get(key)), () => {
    const pcm = synthesize(recipe, seed);
    const measured = { loudness: lockLoudness(loudness(pcm)), ...lockTiming(describeSound(pcm)) };
    synthMeasured.set(key, measured);
    return measured;
  });
};

/**
 * The variants of `name` that play, in order: a procedural sound's seeds 1…n,
 * else the kept variants in the lock (stale ones included), none when nothing
 * is kept.
 */
export const playablesOf = (
  sounds: Sounds,
  name: string,
  entry: LibraryEntry,
): ReadonlyArray<Playable> => {
  if (entry.kind === 'procedural')
    return Array.from({ length: entry.variants }, (_, i) => {
      const measured = measureSynth(entry.recipe, i + 1);
      return {
        source: { _tag: 'Synth', recipe: entry.recipe, seed: i + 1 },
        loudness: measured.loudness,
        onset: Option.some(measured.onset),
        hit: Option.some(measured.hit),
      };
    });
  const kept = Option.match(Option.fromUndefinedOr(sounds.lock[name]), {
    onNone: (): ReadonlyArray<Variant> => [],
    onSome: (l) => l.variants,
  });
  return kept.map((v) => ({
    source: fileSource(`${sounds.dir}/${v.file}`),
    loudness: v.loudness,
    onset: Option.fromUndefinedOr(v.onset),
    hit: Option.fromUndefinedOr(v.hit),
  }));
};

// ---------------------------------------------------------------------------
// Variants and jitter

/** A generated or recorded one-shot's spread when it declares none; tonal and bed sounds have none. */
export const DEFAULT_JITTER: Jitter = { pitch: 0.5, gain: 1 };
/** The most a one-shot's start is nudged late, in seconds. */
export const JITTER_DELAY = 0.015;

/** A sound's spread: declared, else the default for a non-tonal one-shot, else none. */
export const jitterOf = (entry: LibraryEntry): Option.Option<Jitter> => {
  if (entry.use === 'bed') return Option.none();
  return Option.orElse(Option.fromUndefinedOr(entry.jitter), () =>
    Option.liftPredicate(DEFAULT_JITTER, () => entry.kind !== 'procedural'),
  );
};

/** One placement of a sound, in film time. */
export interface Placing {
  readonly effect: string;
  readonly sound: string;
  readonly at: number;
}

/** What a placement plays: which variant, and its seeded nudge. */
export interface Played {
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

// ---------------------------------------------------------------------------
// What may be committed

/** A file an audio tool reads or writes, by its extension. */
export const AUDIO_FILE = /\.(flac|wav|mp3|ogg|opus|m4a|aac|aiff?)$/i;

/** An audio file staged for a commit. */
export interface StagedAudio {
  /** As staged (repo-relative). */
  readonly file: string;
  /** Its path under the library's folder (`files/…`, `public/…`), when it is under it. */
  readonly inLibrary: Option.Option<string>;
  /** Whether it sits under a film's `sound/` folder, where the generated score lives. */
  readonly inScore: boolean;
  readonly sha256: string;
}

/** A staged audio file the repo may not take, and why: its licence, or what it is. */
export interface Refused {
  readonly file: string;
  readonly licence: string;
}

/**
 * The staged audio files a public repo may not take: anything under the
 * library's private `files/`; a copy (by its bytes' hash) of any variant or
 * candidate that is not CC0, wherever it is staged; and anything under
 * `public/` that the lock does not hold as a CC0 variant. A film's generated
 * score is private too: anything under a film's `sound/`, and a copy of any
 * score its manifest records (`scores`, the sha256 of each), wherever staged.
 * A film's takes are not the library's to judge.
 */
export const refusedAudio = (
  lock: Lock,
  staged: ReadonlyArray<StagedAudio>,
  scores: ReadonlySet<string>,
): ReadonlyArray<Refused> => {
  const made = new Map(
    Object.entries(lock).flatMap(([name, entry]) =>
      [...entry.variants, ...entry.candidates].map(
        (v) => [v.sha256, { name, variant: v }] as const,
      ),
    ),
  );
  return staged.flatMap((audio): ReadonlyArray<Refused> => {
    const under = Option.getOrElse(audio.inLibrary, () => '');
    if (under.startsWith('files/'))
      return [{ file: audio.file, licence: 'a generated sound (sounds/files is private)' }];
    if (audio.inScore)
      return [{ file: audio.file, licence: "a generated score (a film's sound/ is private)" }];
    if (scores.has(audio.sha256))
      return [{ file: audio.file, licence: 'elevenlabs-music (a copy of a generated score)' }];
    const copy = Option.fromUndefinedOr(made.get(audio.sha256));
    if (Option.isSome(copy) && copy.value.variant.licence !== 'CC0-1.0')
      return [
        {
          file: audio.file,
          licence: `${copy.value.variant.licence} (a copy of ${copy.value.name})`,
        },
      ];
    const cc0 = Option.exists(copy, (c) => c.variant.file === under);
    if (under.startsWith('public/') && !cc0)
      return [{ file: audio.file, licence: 'not a CC0 variant in the lock' }];
    return [];
  });
};
