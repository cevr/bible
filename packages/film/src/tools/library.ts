// The sound library as the tools see it: an app's `sounds/` folder, shared by
// all its films. `library.ts` declares every sound by name (committed);
// `library.lock.json` records what was made for each, written only here
// (committed); `files/` holds the generated audio (git-ignored, synced with a
// private store by `pull`/`push`); `public/` holds recordings under a licence
// that may be public (committed). Procedural sounds are played from their
// recipe whenever they are needed, so nothing of theirs is stored.
//
// `make` is the only paid call: generated sounds are made as candidates, each
// measured and hashed into the lock, and curated by `keep` and `reject`. A
// sound whose request is current is never generated again; a missing file is
// a `pull`, not a remake.

import {
  Array as Arr,
  Config,
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Record as Rec,
  Result,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { type Pcm, concat, silence, slice } from '../core/audio.ts';
import {
  AUDIO_FILE,
  type Generated,
  type Library,
  type LibraryEntry,
  type Lock,
  type LockEntry,
  type MakeJob,
  type Playable,
  SFX_FORMAT,
  SFX_MODEL,
  type SoundSource,
  type Sounds,
  type Trial,
  type Variant,
  type VariantTiming,
  creditsOf,
  trialEntry,
  influenceOf,
  gainFor,
  levelOf,
  lockLoudness,
  lockTiming,
  makePlan,
  pendingOf,
  playablesOf,
  requestKey,
  resolveSound,
  soundState,
} from '../core/sfx.ts';
import { describeSound } from '../core/synth/analyse.ts';
import { loudness } from '../core/synth/loudness.ts';
import { synthesize } from '../core/synth/recipes.ts';
import { loopSeam, seamHeard } from '../core/synth/seam.ts';
import { toMs } from '../core/time.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { sha256Hex, sha256OfFile } from './digest.ts';
import { ElevenLabs } from './elevenlabs.ts';
import { type UnknownSound } from '../core/errors.ts';
import { ElevenLabsFailed, type MediaFailed, TakeUnknown } from '../core/refusals.ts';
import {
  type ApiKeyMissing,
  CandidateMissing,
  CreditsOverCap,
  type FilmModuleInvalid,
  LibraryMissing,
  LoopSeam,
  PaidUnconfirmed,
  SoundCorrupt,
  SoundFileMissing,
  TimingUnrecorded,
  SoundKindMismatch,
  SoundLicence,
  SoundStale,
  SoundUnmade,
  StoreCopyFailed,
  type StoreFailed,
  TrialInvalid,
  VariantMissing,
} from './errors.ts';
import { filmsOut, libraryModule, lockManifest } from './film-repo.ts';
import { Media } from './media.ts';
import { settleAll } from './settle.ts';
import {
  type MediaStoreService,
  type PrivateFile,
  type Scores,
  expandHome,
} from './media-store.ts';
import { PrivateStore, type StoreUnavailable } from './private-store.ts';

/** Every path the library touches. */
interface SoundsPaths {
  readonly dir: string;
  /** `library.ts`: the declarations and the store. */
  readonly module: string;
  readonly lock: Manifest<Lock>;
  /** Generated audio: private, git-ignored. */
  readonly files: string;
  /** Recordings that may be public: committed. */
  readonly public: string;
  /** Auditions and renders: `<FILMS_OUT>/sounds`. */
  readonly out: string;
}

/** The library as declared, and what was made. */
export interface LoadedLibrary {
  readonly paths: SoundsPaths;
  readonly library: Library;
  readonly lock: Lock;
}

/** What a mix reads of a loaded library. */
const soundsOf = (loaded: LoadedLibrary): Sounds => ({
  library: loaded.library,
  lock: loaded.lock,
  dir: loaded.paths.dir,
});

/**
 * How many interleaved channels `samples` 16-bit samples hold for a sound of
 * `secs` at `rate`: raw PCM carries no header, so the length says it. The
 * sound model answers `pcm_44100` in stereo, so a request for 22 s sends
 * 44 s worth of mono samples. None when neither mono nor stereo fits within
 * a tenth.
 */
export const channelsFor = (samples: number, rate: number, secs: number): Option.Option<number> => {
  const ratio = samples / (rate * secs);
  return Option.fromUndefinedOr([1, 2].find((n) => Math.abs(ratio / n - 1) <= 0.1));
};

/** `pcm_44100` as the API sends it: raw 16-bit little-endian, `channels` interleaved. */
export const pcmFromS16 = (bytes: Uint8Array, rate: number, channels: number): Pcm => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = Math.floor(bytes.byteLength / 2 / channels);
  const planes = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++)
    for (const [c, plane] of planes.entries())
      plane[i] = view.getInt16((i * channels + c) * 2, true) / 32768;
  return { rate, frames, channels: planes };
};

/** A recording's quiet ends cut away: from `pad` seconds before the first sample over `floor` dBFS to `pad` after the last. */
const trimQuiet = (pcm: Pcm, floor: number, pad: number): Pcm => {
  const threshold = 10 ** (floor / 20);
  const loud = (i: number) => pcm.channels.some((plane) => Math.abs(plane[i] ?? 0) > threshold);
  let first = 0;
  while (first < pcm.frames && !loud(first)) first++;
  let last = pcm.frames - 1;
  while (last > first && !loud(last)) last--;
  if (first >= pcm.frames) return pcm;
  const from = Math.max(0, first - Math.round(pad * pcm.rate));
  const to = Math.min(pcm.frames, last + 1 + Math.round(pad * pcm.rate));
  return slice(pcm, from, to - from);
};

/** A recording is trimmed at this level, in dBFS, keeping this much air, in seconds. */
const TRIM_FLOOR = -60;
const TRIM_PAD = 0.01;

/** Between two variants in an audition, in seconds. */
const AUDITION_GAP = 0.5;

/** The audio rate every library sound is made, kept and played at. */
const LIBRARY_RATE = 44100;

/** The credits a tally file (name, variant, seconds, credits; a header first) records as spent. */
export const talliedCredits = (text: string): number =>
  text
    .split('\n')
    .slice(1)
    .map((line) => Number(line.split('\t')[3]))
    .filter(Number.isFinite)
    .reduce((sum, credits) => sum + credits, 0);

export const TALLY_HEADER = 'name\tvariant\tseconds\tcredits\n';

interface MakeOptions extends SpendOptions {
  /** Just these sounds; every declared one otherwise. */
  readonly names: Option.Option<ReadonlySet<string>>;
  /** A full set of candidates again, even for a current sound. */
  readonly force: boolean;
}

/** How a paid run may spend: confirmed, under a cap, tallied. */
interface SpendOptions {
  /** Spend: without it, `make` prints the plan and refuses a paid run. */
  readonly yes: boolean;
  /** The most credits spent in all, counting what the tally already records. */
  readonly cap: Option.Option<number>;
  /** A TSV each paid generation is appended to: name, variant, seconds, credits. */
  readonly tally: Option.Option<string>;
}

/** Where a library finding stands. */
type LibraryFinding =
  | SoundUnmade
  | SoundStale
  | SoundFileMissing
  | SoundCorrupt
  | SoundLicence
  | LoopSeam
  | TimingUnrecorded;

export const libraryLevel = (finding: LibraryFinding): 'error' | 'warning' => {
  switch (finding._tag) {
    case 'SoundFileMissing':
    case 'SoundCorrupt':
    case 'SoundLicence':
      return 'error';
    default:
      return 'warning';
  }
};

type LibraryError = LibraryMissing | FilmModuleInvalid | StoreError;

type MakeError =
  | LibraryError
  | CreditsOverCap
  | PaidUnconfirmed
  | ElevenLabsFailed
  | ApiKeyMissing
  | MediaFailed
  | PlatformError;

/** What `push` did: the files it copied, those the store already held, those it had nowhere, and the lock's total. */
interface PushReport {
  readonly sent: ReadonlyArray<string>;
  readonly had: number;
  /** Lock files neither here with their bytes nor in the store: lost unless a copy exists elsewhere. */
  readonly missing: ReadonlyArray<string>;
  readonly total: number;
}

/** What `pull` did: how many files it fetched, how many were here, and those the store lacks. */
interface PullReport {
  readonly fetched: number;
  readonly had: number;
  /** Lock files the store does not hold with their bytes, and not here either. */
  readonly missing: ReadonlyArray<string>;
}

interface SoundLibraryService {
  readonly paths: SoundsPaths;
  readonly load: Effect.Effect<LoadedLibrary, LibraryError>;
  /** What `make` would generate now, and its cost. Free. */
  readonly plan: (
    names: Option.Option<ReadonlySet<string>>,
    force: boolean,
  ) => Effect.Effect<ReadonlyArray<MakeJob>, LibraryError>;
  /** Generate the planned candidates (paid), each measured, hashed and recorded as it lands. */
  readonly make: (options: MakeOptions) => Effect.Effect<ReadonlyArray<Variant>, MakeError>;
  /**
   * `count` candidates of a generated sound made with a trial's settings over
   * its declaration's (paid, as `make`). They wait under their own request:
   * keepable once the declaration says the same.
   */
  readonly trial: (
    name: string,
    trial: Trial,
    count: number,
    options: SpendOptions,
  ) => Effect.Effect<
    ReadonlyArray<Variant>,
    MakeError | UnknownSound | SoundKindMismatch | TrialInvalid
  >;
  /**
   * The takes (sha256s) the 1-based `picks` name among the sound's candidates
   * for its current request, or among its kept variants in the order they
   * play: how the command line's numbers become takes, before any verb runs.
   */
  readonly takesAt: (
    name: string,
    picks: ReadonlyArray<number>,
    among: 'candidates' | 'kept',
  ) => Effect.Effect<
    ReadonlyArray<string>,
    LibraryError | UnknownSound | CandidateMissing | VariantMissing
  >;
  /**
   * Move candidates (by sha256, among those for the current request) into the
   * variants that play: beside the kept ones, or with `replace` in their place
   * (the variants they replace wait again as candidates). Each take is found
   * in the lock under its write lock, so a curation landing first cannot move
   * another take into its place.
   */
  readonly keep: (
    name: string,
    takes: ReadonlyArray<string>,
    replace?: boolean,
  ) => Effect.Effect<LockEntry, LibraryError | UnknownSound | TakeUnknown>;
  /** Move kept variants (by sha256) back to the candidates waiting. */
  readonly unkeep: (
    name: string,
    takes: ReadonlyArray<string>,
  ) => Effect.Effect<LockEntry, LibraryError | UnknownSound | TakeUnknown>;
  /** Drop candidates (by sha256), never to be offered again. */
  readonly reject: (
    name: string,
    takes: ReadonlyArray<string>,
  ) => Effect.Effect<LockEntry, LibraryError | UnknownSound | TakeUnknown>;
  /** A recording into a declared `recorded` sound: trimmed, resampled, kept as a variant under `public/`. */
  readonly importFile: (
    file: string,
    name: string,
  ) => Effect.Effect<
    Variant,
    LibraryError | UnknownSound | SoundKindMismatch | MediaFailed | PlatformError
  >;
  /** A source's audio: its file decoded, or its recipe played. */
  readonly heard: (source: SoundSource) => Effect.Effect<Pcm, MediaFailed>;
  /** Every variant (or candidate) of a sound, levelled as it would play, `AUDITION_GAP` apart, as one WAV. */
  readonly audition: (
    name: string,
    candidates: boolean,
  ) => Effect.Effect<string, LibraryError | UnknownSound | MediaFailed | PlatformError>;
  /** A procedural sound's seeds (or one) as WAVs. */
  readonly render: (
    name: string,
    seed: Option.Option<number>,
  ) => Effect.Effect<
    ReadonlyArray<string>,
    LibraryError | UnknownSound | SoundKindMismatch | MediaFailed | PlatformError
  >;
  /**
   * Each variant's onset and hit, measured from its file where the lock lacks
   * them and written in (free: no generation). How many it wrote.
   */
  readonly describe: Effect.Effect<number, LibraryError | MediaFailed | PlatformError>;
  /** Every library finding: unmade, stale, missing or corrupt files, licences, loop seams, lead-ins. */
  readonly check: Effect.Effect<
    ReadonlyArray<LibraryFinding>,
    LibraryError | MediaFailed | PlatformError
  >;
  /**
   * Bring every private file missing here (or not its hash) back from the
   * store: the lock's under `files/`, and the films' `scores`; name those it lacks.
   */
  readonly pull: (
    scores: Scores,
  ) => Effect.Effect<PullReport, LibraryError | PlatformError | StoreFailed | StoreUnavailable>;
  /**
   * Copy every private file the store lacks (or holds with other bytes) into
   * it, each read back by hash: the lock's under `files/`, and the films'
   * `scores`. A file is sent from here, or else from the folder `from` (an
   * older folder store, at the same key), when either holds its bytes; it is
   * never deleted from either. `sent` names the files copied, `had` counts
   * those the store already held, `missing` names those found nowhere,
   * `total` all of them.
   */
  readonly push: (
    scores: Scores,
    from: Option.Option<string>,
  ) => Effect.Effect<
    PushReport,
    LibraryError | PlatformError | StoreCopyFailed | StoreFailed | StoreUnavailable
  >;
}

/** Every variant and candidate of every sound, with its name. */
/** A variant's onset and hit, when the lock records both. */
const timingOf = (v: Variant) =>
  Option.all({ onset: Option.fromUndefinedOr(v.onset), hit: Option.fromUndefinedOr(v.hit) });

const everyVariant = (lock: Lock) =>
  Object.entries(lock).flatMap(([name, entry]) =>
    [...entry.variants, ...entry.candidates].map((variant) => ({ name, variant })),
  );

/** The `picks` (1-based) of `offered`, or the first pick out of range, as `missing` names it. */
const picked = <E>(
  offered: ReadonlyArray<Variant>,
  picks: ReadonlyArray<number>,
  missing: (index: number, count: number) => E,
): Effect.Effect<ReadonlyArray<Variant>, E> =>
  Effect.forEach(picks, (n) =>
    Option.match(
      Option.liftPredicate(n, (k) => k >= 1 && k <= offered.length),
      {
        onNone: () => Effect.fail(missing(n, offered.length)),
        onSome: (k) => Effect.succeed(Arr.getUnsafe(offered, k - 1)),
      },
    ),
  );

/** The variants of `offered` whose sha256 each of `takes` names, or `TakeUnknown` for the first it lacks. */
const byHash = (
  name: string,
  offered: ReadonlyArray<Variant>,
  takes: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<Variant>, TakeUnknown> =>
  Result.all(
    takes.map((take) =>
      Result.fromOption(
        Arr.findFirst(offered, (v) => v.sha256 === take),
        () => TakeUnknown.make({ sound: name, take }),
      ),
    ),
  );

const emptyEntry: LockEntry = { variants: [], candidates: [], rejected: [] };

export class SoundLibrary extends Context.Service<SoundLibrary, SoundLibraryService>()(
  '@bible/film/tools/SoundLibrary',
) {
  /** The library in `dir` (an app's `sounds/`). */
  static readonly layer = (dir: string) =>
    Layer.effect(
      SoundLibrary,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* ContentStore;
        const media = yield* Media;
        const elevenLabs = yield* ElevenLabs;
        const privateStore = yield* PrivateStore;
        const outputs = yield* filmsOut;
        const home = yield* Config.String('HOME').pipe(Config.withDefault('~'));

        const paths: SoundsPaths = {
          dir,
          module: path.join(dir, 'library.ts'),
          lock: lockManifest(dir),
          files: path.join(dir, 'files'),
          public: path.join(dir, 'public'),
          out: path.join(outputs, 'sounds'),
        };

        const loadLibrary = Effect.fn('SoundLibrary.load')(function* () {
          if (!(yield* fs.exists(paths.module)))
            return yield* LibraryMissing.make({ file: paths.module });
          const declared = yield* libraryModule(paths.module);
          const lock = yield* store.read(paths.lock);
          const loaded: LoadedLibrary = {
            paths,
            library: declared.library,
            lock,
          };
          return loaded;
        });
        const load = loadLibrary();

        const entryOf = (loaded: LoadedLibrary, name: string) =>
          Effect.fromResult(resolveSound(loaded.library, name));

        const plan = Effect.fn('SoundLibrary.plan')(function* (
          names: Option.Option<ReadonlySet<string>>,
          force: boolean,
        ) {
          const loaded = yield* load;
          return makePlan(loaded.library, loaded.lock, names, force);
        });

        const now = Effect.map(DateTime.now, DateTime.formatIso);

        /** One candidate of `entry`: generated, kept as FLAC under `files/<name>/`, measured, recorded. */
        const generate = (
          name: string,
          entry: Generated,
          credits: number,
          tally: Option.Option<string>,
        ) =>
          Effect.gen(function* () {
            const folder = path.join(paths.files, name);
            yield* fs.makeDirectory(folder, { recursive: true });
            // Scoped: the temporary file and the folder made for it go, even when interrupted.
            const raw = yield* fs.makeTempFileScoped({ directory: folder, prefix: '.candidate-' });
            yield* elevenLabs.soundEffect(
              {
                prompt: entry.prompt,
                secs: entry.secs,
                influence: influenceOf(entry),
                loop: entry.loop === true,
                model: SFX_MODEL,
                format: SFX_FORMAT,
              },
              raw,
            );
            const bytes = yield* fs.readFile(raw);
            const channels = yield* Effect.fromOption(
              channelsFor(bytes.byteLength / 2, LIBRARY_RATE, entry.secs),
              () =>
                ElevenLabsFailed.make({
                  op: 'sfx',
                  exitCode: 0,
                  reason: `${bytes.byteLength} bytes of ${SFX_FORMAT} for ${entry.secs} s: neither mono nor stereo`,
                }),
            );
            const pcm = pcmFromS16(bytes, LIBRARY_RATE, channels);
            const variant = yield* keepFile(name, pcm, 'files', {
              request: requestKey(entry),
              model: SFX_MODEL,
              format: SFX_FORMAT,
              licence: 'elevenlabs-paid-sfx',
              credits,
            });
            yield* store.update(paths.lock, (lock) => {
              const had = Option.getOrElse(Option.fromUndefinedOr(lock[name]), () => emptyEntry);
              return { ...lock, [name]: { ...had, candidates: [...had.candidates, variant] } };
            });
            yield* Option.match(tally, {
              onNone: () => Effect.void,
              onSome: (file) =>
                fs.writeFileString(
                  file,
                  `${name}\t${variant.sha256.slice(0, 12)}\t${variant.secs.toFixed(3)}\t${credits}\n`,
                  { flag: 'a' },
                ),
            });
            yield* Effect.log(
              `sfx.made name=${name} file=${variant.file} secs=${variant.secs.toFixed(2)} influence=${influenceOf(entry)} channels=${channels} credits=${credits} momentary=${variant.loudness.momentaryMax}`,
            );
            return variant;
          }).pipe(Effect.scoped);

        /** `pcm` kept as a 24-bit FLAC named by its hash under `<under>/<name>/`, and its lock record. */
        const keepFile = (
          name: string,
          pcm: Pcm,
          under: 'files' | 'public',
          made: Pick<Variant, 'request' | 'model' | 'format' | 'licence' | 'credits'>,
        ) =>
          Effect.gen(function* () {
            const bytes = yield* media.encodeFlac(pcm);
            const hash = sha256Hex(bytes);
            const file = `${under}/${name}/${hash.slice(0, 12)}.flac`;
            yield* store.writeFile(path.join(dir, file), bytes);
            const variant: Variant = {
              ...made,
              file,
              sha256: hash,
              made: yield* now,
              secs: toMs(pcm.frames / pcm.rate),
              loudness: lockLoudness(loudness(pcm)),
              ...lockTiming(describeSound(pcm)),
            };
            return variant;
          });

        const make = Effect.fn('SoundLibrary.make')(function* (options: MakeOptions) {
          const loaded = yield* load;
          return yield* spend(
            makePlan(loaded.library, loaded.lock, options.names, options.force),
            options,
          );
        });

        const trial = Effect.fn('SoundLibrary.trial')(function* (
          name: string,
          settings: Trial,
          count: number,
          options: SpendOptions,
        ) {
          const loaded = yield* load;
          const declared = yield* entryOf(loaded, name);
          if (declared.kind !== 'generated')
            return yield* SoundKindMismatch.make({
              name,
              kind: declared.kind,
              wanted: 'generated',
            });
          const entry = yield* Effect.mapError(
            Effect.fromResult(trialEntry(declared, settings)),
            (issue) => TrialInvalid.make({ name, reason: String(issue) }),
          );
          yield* Effect.log(
            `sfx.trial name=${name} secs=${entry.secs} influence=${influenceOf(entry)} count=${count} prompt="${entry.prompt}"`,
          );
          return yield* spend([{ name, entry, count, credits: count * creditsOf(entry) }], options);
        });

        /** Generate `jobs` (paid): refused without `yes` or over the cap the tally counts, each tallied as it lands. */
        const spend = Effect.fn('SoundLibrary.spend')(function* (
          jobs: ReadonlyArray<MakeJob>,
          options: SpendOptions,
        ) {
          const credits = jobs.reduce((sum, job) => sum + job.credits, 0);
          for (const job of jobs)
            yield* Effect.log(
              `sfx.plan name=${job.name} candidates=${job.count} credits=${job.credits}`,
            );
          yield* Effect.log(`sfx.plan sounds=${jobs.length} credits=${credits}`);
          if (jobs.length === 0) return [];
          const spent = yield* Option.match(options.tally, {
            onNone: () => Effect.succeed(0),
            onSome: (file) =>
              Effect.gen(function* () {
                if (!(yield* fs.exists(file))) yield* fs.writeFileString(file, TALLY_HEADER);
                return talliedCredits(yield* fs.readFileString(file));
              }),
          });
          yield* Option.match(options.cap, {
            onNone: () => Effect.void,
            onSome: (cap) =>
              Effect.when(
                Effect.fail(CreditsOverCap.make({ credits: spent + credits, cap })),
                Effect.succeed(spent + credits > cap),
              ),
          });
          if (!options.yes) return yield* PaidUnconfirmed.make({ credits });
          yield* elevenLabs.apiKey;
          const each = jobs.flatMap((job) =>
            Array.from({ length: job.count }, () => ({ job, credits: job.credits / job.count })),
          );
          return yield* settleAll(
            each,
            ({ job, credits: cost }) => generate(job.name, job.entry, cost, options.tally),
            2,
          );
        });

        /** `name`'s candidates for its current request, or its kept variants, as `lock` holds them. */
        const offeredIn = (
          entry: LibraryEntry,
          record: Option.Option<LockEntry>,
          among: 'candidates' | 'kept',
        ): ReadonlyArray<Variant> => {
          if (among === 'candidates') return pendingOf(entry, record);
          return Option.match(record, { onNone: () => [], onSome: (r) => r.variants });
        };

        const takesAt = Effect.fn('SoundLibrary.takesAt')(function* (
          name: string,
          picks: ReadonlyArray<number>,
          among: 'candidates' | 'kept',
        ) {
          const loaded = yield* load;
          const entry = yield* entryOf(loaded, name);
          const offered = offeredIn(entry, Option.fromUndefinedOr(loaded.lock[name]), among);
          const chosen = yield* picked<CandidateMissing | VariantMissing>(
            offered,
            picks,
            (index, count) => {
              if (among === 'candidates')
                return CandidateMissing.make({ name, index, candidates: count });
              return VariantMissing.make({ name, index, variants: count });
            },
          );
          return chosen.map((v) => v.sha256);
        });

        /**
         * Rewrite `name`'s lock record: the takes named by `takes` found among
         * its candidates or kept variants and handed to `change`, all under
         * the lock's write lock.
         */
        const curate = (
          name: string,
          takes: ReadonlyArray<string>,
          among: 'candidates' | 'kept',
          change: (had: LockEntry, chosen: ReadonlyArray<Variant>, request: string) => LockEntry,
        ) =>
          Effect.gen(function* () {
            const loaded = yield* load;
            const entry = yield* entryOf(loaded, name);
            const next = yield* store.modify(paths.lock, (lock) => {
              const record = Option.fromUndefinedOr(lock[name]);
              const had = Option.getOrElse(record, () => emptyEntry);
              return Result.map(
                byHash(name, offeredIn(entry, record, among), takes),
                (chosen): Lock => ({ ...lock, [name]: change(had, chosen, requestKey(entry)) }),
              );
            });
            return Option.getOrElse(Option.fromUndefinedOr(next[name]), () => emptyEntry);
          });

        const without = (list: ReadonlyArray<Variant>, drop: ReadonlyArray<Variant>) =>
          list.filter((v) => !drop.some((d) => d.sha256 === v.sha256));

        const keep = Effect.fn('SoundLibrary.keep')(function* (
          name: string,
          takes: ReadonlyArray<string>,
          replace = false,
        ) {
          return yield* curate(name, takes, 'candidates', (had, chosen, request) => {
            // Variants for an older request play only until new ones are kept.
            const current = had.variants.filter((v) => v.request === request);
            if (!replace)
              return {
                variants: [...current, ...chosen],
                candidates: without(had.candidates, chosen),
                rejected: had.rejected,
              };
            return {
              variants: chosen,
              candidates: [...without(had.candidates, chosen), ...current],
              rejected: had.rejected,
            };
          });
        });

        const unkeep = Effect.fn('SoundLibrary.unkeep')(function* (
          name: string,
          takes: ReadonlyArray<string>,
        ) {
          return yield* curate(name, takes, 'kept', (had, chosen) => ({
            variants: without(had.variants, chosen),
            candidates: [...had.candidates, ...chosen],
            rejected: had.rejected,
          }));
        });

        const reject = Effect.fn('SoundLibrary.reject')(function* (
          name: string,
          takes: ReadonlyArray<string>,
        ) {
          return yield* curate(name, takes, 'candidates', (had, chosen) => ({
            variants: had.variants,
            candidates: without(had.candidates, chosen),
            rejected: [...had.rejected, ...chosen.map((v) => v.sha256)],
          }));
        });

        const importFile = Effect.fn('SoundLibrary.importFile')(function* (
          file: string,
          name: string,
        ) {
          const loaded = yield* load;
          const entry = yield* entryOf(loaded, name);
          if (entry.kind !== 'recorded')
            return yield* SoundKindMismatch.make({ name, kind: entry.kind, wanted: 'recorded' });
          const pcm = trimQuiet(yield* media.load(file, LIBRARY_RATE), TRIM_FLOOR, TRIM_PAD);
          const variant = yield* keepFile(name, pcm, 'public', {
            request: requestKey(entry),
            model: 'recorded',
            format: 'flac',
            licence: entry.licence.id,
            credits: 0,
          });
          yield* store.update(paths.lock, (lock) => {
            const had = Option.getOrElse(Option.fromUndefinedOr(lock[name]), () => emptyEntry);
            const variants = had.variants.filter(
              (v) => v.request === variant.request && v.sha256 !== variant.sha256,
            );
            return { ...lock, [name]: { ...had, variants: [...variants, variant] } };
          });
          yield* Effect.log(
            `sfx.imported name=${name} file=${variant.file} licence=${variant.licence}`,
          );
          return variant;
        });

        const heard = (source: SoundSource): Effect.Effect<Pcm, MediaFailed> => {
          if (source._tag === 'File') return media.decode(source.file);
          return Effect.sync(() => synthesize(source.recipe, source.seed));
        };

        /** `playables` decoded, each levelled as `entry` plays it, one after another with gaps, mono. */
        const lineUp = (entry: LibraryEntry, playables: ReadonlyArray<Playable>) =>
          Effect.gen(function* () {
            const level = levelOf(entry, Option.none());
            const blocks = yield* Effect.forEach(playables, (p) =>
              Effect.map(heard(p.source), (pcm): Pcm => {
                const gain = gainFor(level, p.loudness, entry.use);
                const plane = new Float32Array(pcm.frames);
                for (const channel of pcm.channels)
                  for (let i = 0; i < pcm.frames; i++)
                    plane[i] = (plane[i] ?? 0) + ((channel[i] ?? 0) * gain) / pcm.channels.length;
                return { rate: pcm.rate, frames: pcm.frames, channels: [plane] };
              }),
            );
            const gap = silence(LIBRARY_RATE, Math.round(AUDITION_GAP * LIBRARY_RATE), 1);
            return concat(
              LIBRARY_RATE,
              1,
              blocks.flatMap((block) => [block, gap]),
            );
          });

        const audition = Effect.fn('SoundLibrary.audition')(function* (
          name: string,
          candidates: boolean,
        ) {
          const loaded = yield* load;
          const entry = yield* entryOf(loaded, name);
          const record = Option.fromUndefinedOr(loaded.lock[name]);
          const sounds = soundsOf(loaded);
          let playables = playablesOf(sounds, name, entry);
          if (candidates)
            playables = pendingOf(entry, record).map((v) => ({
              source: { _tag: 'File', file: path.join(dir, v.file) },
              loudness: v.loudness,
              onset: Option.fromUndefinedOr(v.onset),
              hit: Option.fromUndefinedOr(v.hit),
            }));
          yield* fs.makeDirectory(paths.out, { recursive: true });
          let suffix = '';
          if (candidates) suffix = '-candidates';
          const out = path.join(paths.out, `audition-${name}${suffix}.wav`);
          yield* media.writeWav(out, yield* lineUp(entry, playables));
          yield* Effect.log(`sfx.audition name=${name} sounds=${playables.length} file=${out}`);
          return out;
        });

        const render = Effect.fn('SoundLibrary.render')(function* (
          name: string,
          seed: Option.Option<number>,
        ) {
          const loaded = yield* load;
          const entry = yield* entryOf(loaded, name);
          if (entry.kind !== 'procedural')
            return yield* SoundKindMismatch.make({ name, kind: entry.kind, wanted: 'procedural' });
          const seeds = Option.match(seed, {
            onNone: () => Array.from({ length: entry.variants }, (_, i) => i + 1),
            onSome: (s) => [s],
          });
          yield* fs.makeDirectory(paths.out, { recursive: true });
          return yield* Effect.forEach(seeds, (s) =>
            Effect.gen(function* () {
              const out = path.join(paths.out, `${name}-${s}.wav`);
              yield* media.writeWav(out, synthesize(entry.recipe, s));
              return out;
            }),
          );
        });

        /** Whether the file at `file` holds the bytes the lock kept. */
        const fileFinding = (name: string, variant: Variant) =>
          Effect.gen(function* () {
            const at = path.join(dir, variant.file);
            if (!(yield* fs.exists(at)))
              return Option.some<LibraryFinding>(
                SoundFileMissing.make({ name, file: variant.file }),
              );
            const found = yield* sha256OfFile(fs, at);
            if (found === variant.sha256) return Option.none<LibraryFinding>();
            return Option.some<LibraryFinding>(
              SoundCorrupt.make({ name, file: variant.file, sha256: variant.sha256, found }),
            );
          });

        /** Files under `public/` the lock does not name as public, and public variants whose licence is private. */
        const licenceFindings = (lock: Lock) =>
          Effect.gen(function* () {
            const publicly = new Map(
              everyVariant(lock)
                .filter(({ variant }) => variant.file.startsWith('public/'))
                .map(({ variant }) => [variant.file, variant.licence]),
            );
            let listed: ReadonlyArray<string> = [];
            if (yield* fs.exists(paths.public))
              listed = (yield* fs.readDirectory(paths.public, { recursive: true })).map(
                (f) => `public/${f}`,
              );
            const audio = listed.filter((f) => AUDIO_FILE.test(f));
            return audio.flatMap((file) => {
              const licence = Option.fromUndefinedOr(publicly.get(file));
              if (Option.isNone(licence))
                return [SoundLicence.make({ file, licence: 'not in the lock' })];
              if (licence.value === 'elevenlabs-paid-sfx')
                return [SoundLicence.make({ file, licence: licence.value })];
              return [];
            });
          });

        /**
         * A one-shot's kept takes whose timing is unrecorded. (A take that
         * starts late is heard late only where a film places its first
         * sample on a cue: the film's check says so, `LeadIn`.)
         */
        const timingFindings = (
          name: string,
          entry: LibraryEntry,
          kept: ReadonlyArray<Variant>,
        ): ReadonlyArray<LibraryFinding> => {
          if (entry.use !== 'one-shot') return [];
          return kept.flatMap((v, i): ReadonlyArray<LibraryFinding> =>
            Option.match(timingOf(v), {
              onNone: () => [TimingUnrecorded.make({ name, variant: i + 1 })],
              onSome: () => [],
            }),
          );
        };

        /** A bed's loop seams that are heard, past the files already reported missing or corrupt. */
        const seamFindings = (
          name: string,
          entry: LibraryEntry,
          sounds: Sounds,
          broken: ReadonlySet<string>,
        ) =>
          Effect.gen(function* () {
            const findings: Array<LibraryFinding> = [];
            if (entry.use !== 'bed') return findings;
            for (const [i, p] of playablesOf(sounds, name, entry).entries()) {
              // A missing or corrupt file is reported above; its seam cannot be heard.
              if (p.source._tag === 'File' && broken.has(p.source.file)) continue;
              const seam = loopSeam(yield* heard(p.source));
              if (seamHeard(seam))
                findings.push(
                  LoopSeam.make({ name, variant: i + 1, db: seam.db, click: seam.click }),
                );
            }
            return findings;
          });

        /**
         * Each variant and candidate whose onset and hit the lock lacks,
         * measured from its file (`describeSound`) and written in: free. A
         * file not here is left for `sfx pull`. The written variants.
         */
        const describeLibrary = Effect.fn('SoundLibrary.describe')(function* () {
          const loaded = yield* load;
          const measured = new Map<string, VariantTiming>();
          for (const { variant } of everyVariant(loaded.lock)) {
            if (Option.isSome(timingOf(variant))) continue;
            const at = path.join(dir, variant.file);
            if (!(yield* fs.exists(at))) continue;
            measured.set(variant.sha256, lockTiming(describeSound(yield* media.decode(at))));
          }
          const timed = (v: Variant): Variant =>
            Option.match(Option.fromUndefinedOr(measured.get(v.sha256)), {
              onNone: () => v,
              onSome: (timing) => ({ ...v, ...timing }),
            });
          yield* store.update(paths.lock, (lock) =>
            Rec.map(lock, (entry) => ({
              ...entry,
              variants: entry.variants.map(timed),
              candidates: entry.candidates.map(timed),
            })),
          );
          return measured.size;
        });
        const describe = describeLibrary();

        const checkLibrary = Effect.fn('SoundLibrary.check')(function* () {
          const loaded = yield* load;
          const sounds = soundsOf(loaded);
          const findings: Array<LibraryFinding> = [];
          const entries = Object.entries(loaded.library).sort(([a], [b]) => a.localeCompare(b));
          for (const [name, entry] of entries) {
            const record = Option.fromUndefinedOr(loaded.lock[name]);
            const state = soundState(entry, record);
            if (state._tag === 'Missing')
              findings.push(SoundUnmade.make({ name, candidates: state.candidates }));
            if (state._tag === 'Stale') findings.push(SoundStale.make({ name }));
            const kept = Option.match(record, {
              onNone: (): ReadonlyArray<Variant> => [],
              onSome: (r) => r.variants,
            });
            const broken = new Set<string>();
            for (const variant of kept)
              for (const finding of Option.toArray(yield* fileFinding(name, variant))) {
                findings.push(finding);
                broken.add(path.join(dir, variant.file));
              }
            findings.push(...timingFindings(name, entry, kept));
            findings.push(...(yield* seamFindings(name, entry, sounds, broken)));
          }
          findings.push(...(yield* licenceFindings(loaded.lock)));
          return findings;
        });
        const check = checkLibrary();

        /**
         * Every private file the store keeps: each lock file under `files/`
         * (its key is that path), then each film's score.
         */
        const privateFiles = (lock: Lock, scores: Scores): ReadonlyArray<PrivateFile> => [
          ...everyVariant(lock)
            .filter(({ variant }) => variant.file.startsWith('files/'))
            .map(({ variant }) => ({
              key: variant.file,
              file: path.join(dir, variant.file),
              sha256: variant.sha256,
            })),
          ...scores.files,
        ];

        const pullFiles = Effect.fn('SoundLibrary.pull')(function* (scores: Scores) {
          const loaded = yield* load;
          const remote = yield* privateStore.store;
          let fetched = 0;
          let had = 0;
          const missing: Array<string> = [];
          for (const file of privateFiles(loaded.lock, scores)) {
            if (yield* holdsHere(file)) {
              had++;
              continue;
            }
            if (!(yield* holdsIn(remote, file))) {
              missing.push(file.key);
              yield* Effect.logWarning(`sfx.pull.missing file=${file.key}`);
              continue;
            }
            yield* remote.get(file.key, file.file);
            fetched++;
          }
          yield* Effect.log(
            `sfx.pull store=${remote.where} fetched=${fetched} had=${had} missing=${missing.length}`,
          );
          const report: PullReport = { fetched, had, missing };
          return report;
        });

        /** Whether the file at `at` is there with the bytes hashed `sha`. */
        const holdsAt = (at: string, sha: string) =>
          Effect.gen(function* () {
            if (!(yield* fs.exists(at))) return false;
            return (yield* sha256OfFile(fs, at)) === sha;
          });

        /** Whether the file is here with its bytes. */
        const holdsHere = (file: PrivateFile) => holdsAt(file.file, file.sha256);

        /** Whether the store holds the file's bytes. */
        const holdsIn = (remote: MediaStoreService, file: PrivateFile) =>
          Effect.map(remote.hashOf(file.key), (h) => Option.contains(h, file.sha256));

        /** Where the file's bytes can be sent from: here, else the folder `from` at its key. */
        const sourceOf = (file: PrivateFile, from: Option.Option<string>) =>
          Effect.gen(function* () {
            if (yield* holdsHere(file)) return Option.some(file.file);
            if (Option.isNone(from)) return Option.none<string>();
            const at = path.join(expandHome(from.value, home), file.key);
            if (yield* holdsAt(at, file.sha256)) return Option.some(at);
            return Option.none<string>();
          });

        const pushFiles = Effect.fn('SoundLibrary.push')(function* (
          scores: Scores,
          from: Option.Option<string>,
        ) {
          const loaded = yield* load;
          const remote = yield* privateStore.store;
          const files = privateFiles(loaded.lock, scores);
          const sent: Array<string> = [];
          const missing: Array<string> = [];
          let had = 0;
          for (const file of files) {
            if (yield* holdsIn(remote, file)) {
              had++;
              continue;
            }
            const source = yield* sourceOf(file, from);
            if (Option.isNone(source)) {
              missing.push(file.key);
              yield* Effect.logWarning(`sfx.push.missing file=${file.key}`);
              continue;
            }
            yield* remote.put(file.key, source.value);
            if (!(yield* holdsIn(remote, file)))
              return yield* StoreCopyFailed.make({ file: file.key, store: remote.where });
            sent.push(file.key);
            yield* Effect.log(`sfx.push.sent file=${file.key}`);
          }
          yield* Effect.log(
            `sfx.push store=${remote.where} sent=${sent.length} had=${had} missing=${missing.length} total=${files.length}`,
          );
          const report: PushReport = { sent, had, missing, total: files.length };
          return report;
        });

        return SoundLibrary.of({
          paths,
          load,
          plan,
          make,
          trial,
          takesAt,
          keep,
          unkeep,
          reject,
          importFile,
          heard,
          audition,
          render,
          check,
          describe,
          pull: pullFiles,
          push: pushFiles,
        });
      }),
    );
}
