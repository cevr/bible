// A film's choice points (`core/choice.ts`) as its sources declare them: one
// adapter per kind, each a pure function of the loaded film. `film options
// list` runs them in a fresh process (`FreshFilm`, `fresh-film.ts`), so every point is
// the film as it stands on disk:
//
// - score: the score's options, `play` picked; heard in the film's mix;
// - take: each library sound the film's effects place, at the scenes it
//   plays in: a generated or recorded sound's kept takes (the picks: they
//   rotate through its placements) and its candidates; a code sound's seeds
//   (all picked: they all play), with the takes its lock still holds from
//   before marked "was"; and a code trial's seeds beside either, never
//   picked. Each is heard alone and in the mix. A seed is tuned by editing
//   its data, so no verb reaches it (`fixed` says why);
// - look: each of `palette.ts`'s `looks`, its levels, `play` picked;
// - voice: each beat's recorded attempts, the one the timings name picked;
//   heard alone; at the beat's scene.
//
// A sound layer's level is the agents' to set in `sound.ts`: no point offers it.
//
// Render sets are the catalogue's (`review.ts`, `project-cli.ts`).

import { Array as Arr, DateTime, Option, Result } from 'effect';
import { type Address, sceneAddress } from '../core/address.ts';
import { counted } from '../core/words.ts';
import type { Catalogue, VariantState } from '../core/catalogue.ts';
import {
  type ChoiceMark,
  type ChoiceVerb,
  type ChoicePoint,
  type PointDraft,
  type VariantDraft,
  withSay,
} from '../core/choice.ts';
import { type Placed, sceneAt } from '../core/layout.ts';
import { type MixPlan, type MixPlanError, mixPlan } from '../core/mix.ts';
import type { Sound } from '../core/schema.ts';
import {
  type DerivedSource,
  type LibraryEntry,
  type LockEntry,
  type MeasuredSounds,
  type SoundSource,
  type Variant,
  isDerived,
  pendingOf,
  requestKey,
  seedSources,
  soundEntry,
  sourceLabel,
  trialSources,
} from '../core/sfx.ts';
import { type ScoreOptionState, scoreOptionState, scoreOptions } from '../core/sound.ts';
import { type LoadedFilm, type MeasuredFilm, voicePiecesOf } from './film-repo.ts';
import type { Attempt } from './takes.ts';

/** How a score option's state in the store reads as a variant's. */
const SCORE_STATE: Record<ScoreOptionState['_tag'], VariantState> = {
  Current: 'current',
  Stale: 'stale',
  Missing: 'missing',
};

/** The scenes `ids` name, as one address: the film when none. */
const scenesAddress = (ids: ReadonlyArray<string>): Address =>
  Option.match(Arr.head(Arr.dedupe(ids)), {
    onNone: (): Address => ({ _tag: 'Film' }),
    onSome: (first): Address => ({
      _tag: 'Scenes',
      ids: [first, ...Arr.dedupe(ids).slice(1)],
    }),
  });

/** The scene playing at film second `at` (`sceneAt`, the film's one rule). */
const sceneOfTime = (placed: ReadonlyArray<Placed>, at: number) =>
  Option.match(sceneAt(placed, at), { onNone: () => '', onSome: (p) => p.spec.id });

// ---------------------------------------------------------------------------
// score

/** What a score option is now: the hash it was composed at (none when never composed). */
const scoreKey = (state: ScoreOptionState): string => {
  if (state._tag === 'Missing') return '';
  return state.asset.hash;
};

/** A state as a variant's: `current`, else `stale`. */
const currentOr = (current: boolean): VariantState => {
  if (current) return 'current';
  return 'stale';
};

/** The score's options, the one `play` names picked, each heard as the film's mix with it. */
export const scorePoint = (
  loaded: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): Option.Option<PointDraft> =>
  Option.map(
    Option.flatMap(loaded.sound, (s) => Option.fromUndefinedOr(s.score)),
    (score): PointDraft => ({
      ref: { _tag: 'Score' },
      address: Option.some({ _tag: 'Film' }),
      title: 'score',
      lines: [`plays ${score.play}`],
      variants: scoreOptions(score).map((option): VariantDraft => {
        const state = scoreOptionState(option, placed, loaded.manifest);
        const picked = option.name === score.play;
        return {
          id: option.name,
          label: option.name,
          lines: [
            option.music.styles.join(' · '),
            counted(option.music.movements.length, 'movement'),
          ],
          state: SCORE_STATE[state._tag],
          picked,
          verbs: Arr.filter(['pick'] as const, () => !picked),
          media: { _tag: 'Heard', alone: false, inPlace: state._tag !== 'Missing' },
          key: scoreKey(state),
        };
      }),
    }),
  );

// ---------------------------------------------------------------------------
// take

/** How a take is listed: its name in the list, whether it plays, and what can become of it, or why nothing can. */
interface TakeStanding {
  readonly name: string;
  readonly picked: boolean;
  readonly verbs: ReadonlyArray<ChoiceVerb>;
  readonly fixed: Option.Option<string>;
}

/** A kept take plays, and can wait again; a waiting one can be kept or rejected. */
const KEPT: TakeStanding = { name: 'kept', picked: true, verbs: ['unpick'], fixed: Option.none() };
const WAITING: TakeStanding = {
  name: 'candidate',
  picked: false,
  verbs: ['pick', 'reject'],
  fixed: Option.none(),
};

/** Why no verb reaches a code sound's seed. */
const SEED_FIXED = 'a code sound is tuned by editing its data';

/** Why no verb reaches a code trial's seed: the owner chooses a swap in an ask. */
const TRIAL_FIXED = 'a code trial is tuned by editing its data, and chosen in an ask';

/** A take the lock still holds for a sound now made by code: heard beside its seeds, never played. */
const WAS: TakeStanding = {
  name: 'was',
  picked: false,
  verbs: [],
  fixed: Option.some(`${SEED_FIXED}: its seeds play, not its takes`),
};

/** A lock variant as a take, as `standing` lists it, its 1-based index in that list. */
const takeOf = (
  entry: LibraryEntry,
  variant: Variant,
  standing: TakeStanding,
  index: number,
): VariantDraft => {
  const current = variant.request === requestKey(entry);
  return {
    id: variant.sha256,
    label: `${standing.name} ${index}`,
    lines: [
      `${variant.secs.toFixed(1)} s · ${variant.loudness.momentaryMax.toFixed(1)} LUFS · ${variant.made.slice(0, 10)}`,
      ...Arr.filter(['for an older declaration'], () => !current),
    ],
    state: currentOr(current),
    picked: standing.picked,
    verbs: standing.verbs,
    fixed: standing.fixed,
    media: { _tag: 'Heard', alone: true, inPlace: true },
    key: variant.sha256,
  };
};

/** A sound's kept takes as they play. */
const keptOf = (lock: Option.Option<LockEntry>): ReadonlyArray<Variant> =>
  Option.match(lock, { onNone: () => [], onSome: (l) => l.variants });

/** A generated or recorded sound's takes: the kept ones as they play, then those waiting for the current request. */
const takesOf = (entry: LibraryEntry, lock: Option.Option<LockEntry>) => [
  ...keptOf(lock).map((v, i) => takeOf(entry, v, KEPT, i + 1)),
  ...pendingOf(entry, lock).map((v, i) => takeOf(entry, v, WAITING, i + 1)),
];

/** A seed as a variant: its source's label its id, how loud it measured when it is measured. */
const seedOf = (
  sounds: MeasuredSounds,
  source: DerivedSource,
  label: string,
  picked: boolean,
  fixed: string,
): VariantDraft => {
  const id = sourceLabel(source);
  return {
    id,
    label,
    lines: Option.match(Option.fromUndefinedOr(sounds.measured.get(id)), {
      onNone: () => [],
      onSome: (m) => [`${m.loudness.momentaryMax.toFixed(1)} LUFS · hit ${m.hit.toFixed(2)} s`],
    }),
    state: 'current',
    picked,
    verbs: [],
    fixed: Option.some(fixed),
    media: { _tag: 'Heard', alone: true, inPlace: true },
    key: id,
  };
};

/** `name`'s code trial's seeds, never picked: heard beside what plays. */
const trialSeedsOf = (sounds: MeasuredSounds, name: string): ReadonlyArray<VariantDraft> =>
  trialSources(sounds, name).map((source, i) =>
    seedOf(sounds, source, `code trial ${i + 1}`, false, TRIAL_FIXED),
  );

/** A take point's variants, and the lines that count them. */
interface TakeVariants {
  readonly lines: ReadonlyArray<string>;
  readonly variants: ReadonlyArray<VariantDraft>;
}

/** A sound's seeds or its takes, then its code trial's seeds, each list counted in a line. */
const variantsOf = (sounds: MeasuredSounds, name: string, entry: LibraryEntry): TakeVariants => {
  const lock = Option.fromUndefinedOr(sounds.lock[name]);
  const trials = trialSeedsOf(sounds, name);
  const trialLines = Arr.filter(
    [`code trial: ${counted(trials.length, 'seed')}`],
    () => trials.length > 0,
  );
  if (isDerived(entry)) {
    const seeds = seedSources(sounds, name, entry).map((source, i) =>
      seedOf(sounds, source, `seed ${i + 1}`, true, SEED_FIXED),
    );
    const before = keptOf(lock).map((v, i) => takeOf(entry, v, WAS, i + 1));
    return {
      lines: [`${counted(seeds.length, 'seed')} · code`, ...trialLines],
      variants: [...seeds, ...trials, ...before],
    };
  }
  const takes = takesOf(entry, lock);
  return {
    lines: [
      `${takes.filter((t) => t.picked).length} kept · ${takes.filter((t) => !t.picked).length} waiting`,
      ...trialLines,
    ],
    variants: [...takes, ...trials],
  };
};

/**
 * The film's mix plan as its sources stand (none when the film has no
 * sound), or why it does not build: a bed or effect naming a cue a
 * re-timing removed.
 */
const planOf = (
  loaded: MeasuredFilm,
  placed: ReadonlyArray<Placed>,
): Result.Result<Option.Option<MixPlan<SoundSource>>, MixPlanError> =>
  Option.match(loaded.sound, {
    onNone: () => Result.succeed(Option.none()),
    onSome: () =>
      Result.map(
        mixPlan({
          film: loaded.paths.name,
          placed,
          sound: loaded.sound,
          manifest: loaded.manifest,
          sounds: loaded.sounds,
          narration: loaded.paths.narration,
          soundDir: loaded.paths.sound,
          play: Option.none(),
          inPlace: Option.none(),
          pieces: voicePiecesOf(loaded),
        }),
        Option.some,
      ),
  });

/** A point's line saying why its placements are not shown, when the plan does not build. */
const unplacedLines = (plan: Result.Result<unknown, MixPlanError>): ReadonlyArray<string> =>
  Result.match(plan, {
    onSuccess: () => [],
    onFailure: (error) => [`placed nowhere: the mix does not build (${error.message})`],
  });

/** One placement of an effect: its name in `sound.ts`, its library sound, its film second. */
interface Placement {
  readonly effect: string;
  readonly sound: string;
  readonly at: number;
}

/** Where each effect of the plan plays. */
const placementsOf = (
  sound: Sound,
  plan: Result.Result<Option.Option<MixPlan<SoundSource>>, MixPlanError>,
): ReadonlyArray<Placement> =>
  Option.match(Option.flatten(Result.getSuccess(plan)), {
    onNone: () => [],
    onSome: (p) => p.effects,
  }).flatMap((e) =>
    Option.toArray(
      Option.map(Option.fromUndefinedOr(sound.effects[e.name]), (effect) => ({
        effect: e.name,
        sound: effect.sound,
        at: e.at,
      })),
    ),
  );

/** A placement as a mark: its time, and which effect in which scene. */
const markOf = (placed: ReadonlyArray<Placed>, p: Placement): ChoiceMark => ({
  t: p.at,
  label: `${p.effect} in ${sceneOfTime(placed, p.at)}`,
});

/** The library sounds the film's effects place, with where, and their takes or seeds and a code trial's seeds. */
export const takePoints = (
  loaded: MeasuredFilm,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<PointDraft> =>
  Option.match(loaded.sound, {
    onNone: () => [],
    onSome: (sound) => {
      const plan = planOf(loaded, placed);
      const where = placementsOf(sound, plan);
      const declared = Arr.dedupe(Object.values(sound.effects).map((e) => e.sound));
      return declared.flatMap((name) =>
        Option.match(soundEntry(loaded.sounds.library, name), {
          onNone: () => [],
          onSome: (entry): ReadonlyArray<PointDraft> => {
            const here = where.filter((w) => w.sound === name);
            const { lines, variants } = variantsOf(loaded.sounds, name, entry);
            return [
              {
                ref: { _tag: 'Take', sound: name },
                address: Option.some(scenesAddress(here.map((w) => sceneOfTime(placed, w.at)))),
                title: name,
                lines: [...lines, ...unplacedLines(plan)],
                marks: here.map((w) => markOf(placed, w)),
                variants,
              },
            ];
          },
        }),
      );
    },
  });

// ---------------------------------------------------------------------------
// look

/** Each look the film chooses between (`looks` in `palette.ts`), its levels, `play` picked. */
export const lookPoints = (loaded: LoadedFilm): ReadonlyArray<PointDraft> =>
  Object.entries(loaded.looks).map(([name, look]): PointDraft => ({
    ref: { _tag: 'Look', name },
    address: Option.some({ _tag: 'Film' }),
    title: `look ${name}`,
    lines: [`drawn at ${look.play}`],
    variants: Object.entries(look.options).map(([level, value]): VariantDraft => {
      const picked = level === look.play;
      return {
        id: level,
        label: level,
        lines: [`${name} ${value}`],
        state: 'current',
        picked,
        verbs: Arr.filter(['pick'] as const, () => !picked),
        media: { _tag: 'Unseen' },
        key: `${level}=${value}`,
      };
    }),
  }));

// ---------------------------------------------------------------------------
// voice

/** A beat's recorded attempts, and whether each is for its line as it reads now. */
export interface BeatAttempts {
  readonly beat: string;
  /** The script's hash now: an attempt at another hash was made for an earlier line. */
  readonly hash: string;
  readonly attempts: ReadonlyArray<Attempt>;
}

/** Each beat with an attempt: its attempts (newest first), the one its timings name picked. */
export const voicePoints = (
  loaded: LoadedFilm,
  beats: ReadonlyArray<BeatAttempts>,
): ReadonlyArray<PointDraft> =>
  beats
    .filter((b) => b.attempts.length > 0)
    .map((b): PointDraft => {
      const kept = Option.map(Option.fromNullishOr(loaded.timings.scenes[b.beat]), (t) => t.file);
      return {
        ref: { _tag: 'Voice', beat: b.beat },
        address: Option.some(sceneAddress(b.beat)),
        title: `voice ${b.beat}`,
        lines: [counted(b.attempts.length, 'attempt')],
        variants: b.attempts
          .toSorted((x, y) => y.at - x.at)
          .map((a): VariantDraft => {
            const picked = Option.contains(kept, a.file);
            const current = a.take.hash === b.hash;
            return {
              id: a.file,
              label: DateTime.formatIso(DateTime.makeUnsafe(a.at)).slice(0, 16).replace('T', ' '),
              lines: [
                `heard: ${a.heard}`,
                `${(a.wer * 100).toFixed(1)}% word error · ${a.take.duration.toFixed(1)} s`,
                ...Arr.filter(['for an earlier line'], () => !current),
              ],
              state: currentOr(current),
              picked,
              verbs: Arr.filter(['pick'] as const, () => current && !picked),
              media: { _tag: 'Heard', alone: true, inPlace: false },
              key: a.file,
            };
          }),
      };
    });

// ---------------------------------------------------------------------------

/**
 * What a film's points are read from: the film with the derived sounds it
 * places measured (a seed's line, where each effect plays), and beside it its
 * beats' attempts.
 */
interface PointInputs {
  readonly loaded: MeasuredFilm;
  readonly placed: ReadonlyArray<Placed>;
  readonly beats: ReadonlyArray<BeatAttempts>;
  /** The film's catalogue: the owner's approvals and comments. */
  readonly catalogue: Option.Option<Catalogue>;
}

/** The film's choice points as its sources stand: score, looks, takes, voices. */
export const filmPoints = (inputs: PointInputs): ReadonlyArray<ChoicePoint> =>
  [
    ...Option.toArray(scorePoint(inputs.loaded, inputs.placed)),
    ...lookPoints(inputs.loaded),
    ...takePoints(inputs.loaded, inputs.placed),
    ...voicePoints(inputs.loaded, inputs.beats),
  ].map((draft) => withSay(inputs.catalogue, draft));
