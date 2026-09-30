// A film's choice points (`core/choice.ts`) as its sources declare them: one
// adapter per kind, each a pure function of the loaded film. `film options
// list` runs them in a fresh process (`FreshFilm`, `fresh-film.ts`), so every point is
// the film as it stands on disk:
//
// - score: the score's options, `play` picked; heard in the film's mix;
// - take: each library sound the film's effects place, its kept takes (the
//   picks: they rotate through its placements) and its candidates; heard
//   alone and in the mix; at the scenes it plays in;
// - look: each of `palette.ts`'s `looks`, its levels, `play` picked;
// - voice: each beat's recorded attempts, the one the timings name picked;
//   heard alone; at the beat's scene;
// - level: each sound layer's level (a bed's, an effect's, the score's under
//   and alone) as `sound.ts` writes it, a knob; a constant several layers
//   name (`PAPER`) is one knob for all of them.
//
// Render sets are the catalogue's (`review.ts`, `project-cli.ts`).

import { Array as Arr, DateTime, Match, Option, Result } from 'effect';
import { type Address, sceneAddress } from '../core/address.ts';
import type { Catalogue, VariantState } from '../core/catalogue.ts';
import {
  type ChoiceMark,
  type ChoiceVerb,
  type ChoicePoint,
  type PointDraft,
  type VariantDraft,
  pointId,
  withSay,
} from '../core/choice.ts';
import { type Placed, sceneAt } from '../core/layout.ts';
import { type MixPlan, mixPlan } from '../core/mix.ts';
import type { Cue, Sound } from '../core/schema.ts';
import {
  type LibraryEntry,
  type LockEntry,
  type SoundSource,
  type Variant,
  levelOf,
  pendingOf,
  requestKey,
} from '../core/sfx.ts';
import { type ScoreOptionState, cueTime, scoreOptionState, scoreOptions } from '../core/sound.ts';
import type { LoadedFilm } from './film-repo.ts';
import type { Attempt } from './takes.ts';
import { type LevelWritten, type SoundLayer, levelPointId, readLevel } from './choice-source.ts';

/** How a score option's state in the store reads as a variant's. */
const SCORE_STATE: Record<ScoreOptionState['_tag'], VariantState> = {
  Current: 'current',
  Stale: 'stale',
  Missing: 'missing',
};

/** `n` and `noun`, plural but for one. */
const counted = (n: number, noun: string) =>
  `${n} ${noun}${Arr.filter(['s'], () => n !== 1).join('')}`;

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
      id: pointId('score', ''),
      kind: 'score',
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

/** A take as it is listed, kept or waiting, and what can become of it (a kept one waits again). */
interface TakeStanding {
  readonly name: string;
  readonly verbs: ReadonlyArray<ChoiceVerb>;
}

const takeState = (kept: boolean): TakeStanding => {
  if (kept) return { name: 'kept', verbs: ['unpick'] };
  return { name: 'candidate', verbs: ['pick', 'reject'] };
};

/** A lock variant as a take: kept or waiting, its 1-based index in that list. */
const takeOf = (
  entry: LibraryEntry,
  variant: Variant,
  kept: boolean,
  index: number,
): VariantDraft => {
  const current = variant.request === requestKey(entry);
  return {
    id: variant.sha256,
    label: `${takeState(kept).name} ${index}`,
    lines: [
      `${variant.secs.toFixed(1)} s · ${variant.loudness.momentaryMax.toFixed(1)} LUFS · ${variant.made.slice(0, 10)}`,
      ...Arr.filter(['for an older declaration'], () => !current),
    ],
    state: currentOr(current),
    picked: kept,
    verbs: takeState(kept).verbs,
    media: { _tag: 'Heard', alone: true, inPlace: true },
    key: variant.sha256,
  };
};

/** A sound's takes: the kept ones as they play, then those waiting for the current request. */
const takesOf = (entry: LibraryEntry, lock: Option.Option<LockEntry>) => [
  ...Option.match(lock, { onNone: () => [], onSome: (l) => l.variants }).map((v, i) =>
    takeOf(entry, v, true, i + 1),
  ),
  ...pendingOf(entry, lock).map((v, i) => takeOf(entry, v, false, i + 1)),
];

/** The film's mix plan as its sources stand, when it builds. */
const planOf = (
  loaded: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): Option.Option<MixPlan<SoundSource>> =>
  Option.flatMap(loaded.sound, () =>
    Result.getSuccess(
      mixPlan({
        film: loaded.paths.name,
        placed,
        sound: loaded.sound,
        manifest: loaded.manifest,
        sounds: loaded.sounds,
        narration: loaded.paths.narration,
        soundDir: loaded.paths.sound,
        play: Option.none(),
      }),
    ),
  );

/** One placement of an effect: its name in `sound.ts`, its library sound, its film second. */
interface Placement {
  readonly effect: string;
  readonly sound: string;
  readonly at: number;
}

/** Where each effect of the plan plays. */
const placementsOf = (
  sound: Sound,
  plan: Option.Option<MixPlan<SoundSource>>,
): ReadonlyArray<Placement> =>
  Option.match(plan, { onNone: () => [], onSome: (p) => p.effects }).flatMap((e) =>
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

/** The library sounds the film's effects place, with where and their takes; recipes have none. */
export const takePoints = (
  loaded: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<PointDraft> =>
  Option.match(loaded.sound, {
    onNone: () => [],
    onSome: (sound) => {
      const where = placementsOf(sound, planOf(loaded, placed));
      const declared = Arr.dedupe(Object.values(sound.effects).map((e) => e.sound));
      return declared.flatMap((name) =>
        Option.match(Option.fromUndefinedOr(loaded.sounds.library[name]), {
          onNone: () => [],
          onSome: (entry): ReadonlyArray<PointDraft> => {
            if (entry.kind === 'procedural') return [];
            const here = where.filter((w) => w.sound === name);
            const takes = takesOf(entry, Option.fromUndefinedOr(loaded.sounds.lock[name]));
            return [
              {
                id: pointId('take', name),
                kind: 'take',
                address: Option.some(scenesAddress(here.map((w) => sceneOfTime(placed, w.at)))),
                title: name,
                lines: [
                  `${takes.filter((t) => t.picked).length} kept · ${takes.filter((t) => !t.picked).length} waiting`,
                ],
                marks: here.map((w) => markOf(placed, w)),
                variants: takes,
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
    id: pointId('look', name),
    kind: 'look',
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
        id: pointId('voice', b.beat),
        kind: 'voice',
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
// level

/** A layer of the film's sound, as the level adapter lists it. */
interface LayerLevel {
  readonly layer: SoundLayer;
  readonly title: string;
  /** What plays when `sound.ts` names no level (the library's, else the default). */
  readonly fallback: Option.Option<number>;
  readonly scenes: ReadonlyArray<string>;
  readonly marks: ReadonlyArray<ChoiceMark>;
}

/** The ids of the scenes from `from`'s to `to`'s, in film order. */
const scenesBetween = (placed: ReadonlyArray<Placed>, from: Cue, to: Cue) => {
  const ids = placed.map((p) => p.spec.id);
  const a = ids.indexOf(from.scene);
  const b = ids.indexOf(to.scene);
  if (a < 0 || b < a) return [from.scene];
  return ids.slice(a, b + 1);
};

/** Each layer whose level `sound.ts` sets: the score's two, then each bed, then each effect. */
const layersOf = (
  loaded: LoadedFilm,
  sound: Sound,
  placed: ReadonlyArray<Placed>,
): ReadonlyArray<LayerLevel> => {
  const where = placementsOf(sound, planOf(loaded, placed));
  const entry = (name: string) => Option.fromUndefinedOr(loaded.sounds.library[name]);
  const score = Option.match(Option.fromUndefinedOr(sound.score), {
    onNone: () => [],
    onSome: (s): ReadonlyArray<LayerLevel> =>
      (['under', 'alone'] as const).map((which) => ({
        layer: { _tag: 'Score', which },
        title: `score ${which}`,
        fallback: Option.some(s[which]),
        scenes: [],
        marks: [],
      })),
  });
  const beds = Option.getOrElse(Option.fromUndefinedOr(sound.beds), () => []).map(
    (bed, index): LayerLevel => ({
      layer: { _tag: 'Bed', index, sound: bed.sound },
      title: `bed ${bed.sound}`,
      fallback: Option.map(entry(bed.sound), (e) => levelOf(e, Option.none())),
      scenes: scenesBetween(placed, bed.from, bed.to),
      marks: Option.toArray(
        Option.map(Result.getSuccess(cueTime(bed.from, placed)), (t) => ({
          t,
          label: `${bed.sound} from ${bed.from.scene}`,
        })),
      ),
    }),
  );
  const effects = Object.entries(sound.effects).map(([name, effect]): LayerLevel => {
    const here = where.filter((w) => w.effect === name);
    return {
      layer: { _tag: 'Effect', name },
      title: `effect ${name}`,
      fallback: Option.map(entry(effect.sound), (e) => levelOf(e, Option.none())),
      scenes: here.map((w) => sceneOfTime(placed, w.at)),
      marks: here.map((w) => markOf(placed, w)),
    };
  });
  return [...score, ...beds, ...effects];
};

const LEVEL_KNOB = { min: -40, max: 0, step: 0.5, unit: 'dB' } as const;

/** A layer's level knob: its point id, its value and whether a write can reach it. */
const knobOf = (layer: LayerLevel, written: Result.Result<LevelWritten, unknown>) => {
  const own = levelPointId({ _tag: 'Layer', layer: layer.layer });
  const fixed = (why: string) => ({
    id: own,
    value: Option.getOrElse(layer.fallback, () => 0),
    fixed: Option.some(why),
  });
  if (Result.isFailure(written)) return fixed(`sound.ts does not read: ${String(written.failure)}`);
  const w = written.success;
  if (w._tag === 'Own') return { id: own, value: w.value, fixed: Option.none<string>() };
  if (w._tag === 'Shared')
    return {
      id: levelPointId({ _tag: 'Const', name: w.name }),
      value: w.value,
      fixed: Option.none<string>(),
    };
  if (w._tag === 'Computed') return fixed(`its level is \`${w.text}\`, not a literal`);
  return Option.match(layer.fallback, {
    onNone: () => fixed('its sound is not in the library'),
    onSome: (value) => ({ id: own, value, fixed: Option.none<string>() }),
  });
};

/**
 * Each sound layer's level as `sound.ts` (`source`, the file's text) writes
 * it, a knob per literal: a layer's own number, or a constant shared by the
 * layers that name it. A level left out shows what plays, and a write adds it.
 */
export const levelPoints = (
  loaded: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  file: string,
  source: string,
): ReadonlyArray<PointDraft> =>
  Option.match(loaded.sound, {
    onNone: () => [],
    onSome: (sound) => {
      const knobs = layersOf(loaded, sound, placed).map((layer) => ({
        layer,
        knob: knobOf(layer, readLevel(file, source, layer.layer)),
      }));
      const byId = Arr.groupBy(knobs, (k) => k.knob.id);
      return Object.entries(byId).map(([id, all]): PointDraft => {
        const first = all[0];
        const scenes = all.flatMap((k) => k.layer.scenes);
        const shared = all.length > 1 || id.startsWith('level:const:');
        return {
          id,
          kind: 'level',
          address: Option.some(scenesAddress(scenes)),
          title: Match.value(shared).pipe(
            Match.when(
              true,
              () => `${id.slice('level:'.length)} · ${counted(all.length, 'layer')}`,
            ),
            Match.orElse(() => first.layer.title),
          ),
          lines: Arr.filter(
            all.map((k) => k.layer.title),
            () => shared,
          ),
          marks: all.flatMap((k) => k.layer.marks),
          knob: Option.some({ ...LEVEL_KNOB, value: first.knob.value, fixed: first.knob.fixed }),
          variants: [],
        };
      });
    },
  });

// ---------------------------------------------------------------------------

/** What a film's points are read from beside the film: its sound source, its beats' attempts. */
export interface PointInputs {
  readonly loaded: LoadedFilm;
  readonly placed: ReadonlyArray<Placed>;
  /** `sound.ts`: its path and text, when the film has one. */
  readonly soundSource: Option.Option<{ readonly file: string; readonly text: string }>;
  readonly beats: ReadonlyArray<BeatAttempts>;
  /** The film's catalogue: the owner's approvals and comments. */
  readonly catalogue: Option.Option<Catalogue>;
}

/** The film's choice points as its sources stand: score, looks, takes, voices, levels. */
export const filmPoints = (inputs: PointInputs): ReadonlyArray<ChoicePoint> =>
  [
    ...Option.toArray(scorePoint(inputs.loaded, inputs.placed)),
    ...lookPoints(inputs.loaded),
    ...takePoints(inputs.loaded, inputs.placed),
    ...voicePoints(inputs.loaded, inputs.beats),
    ...Option.match(inputs.soundSource, {
      onNone: () => [],
      onSome: (s) => levelPoints(inputs.loaded, inputs.placed, s.file, s.text),
    }),
  ].map((draft) => withSay(inputs.catalogue, draft));
