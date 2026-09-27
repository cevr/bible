// What `film check` looks for, as pure functions over a laid-out film and its
// Rive project: sound cues naming nothing, acts out of order, stale takes and
// sounds, an audio master missing or not as long as the film, a line handed
// to a voice the cast lacks; and in the project, a beat with no scene, a
// scene the Film cannot nest or that is still its storyboard, a mark with no
// Event to land on, a Film out of date, and what the Rive compiler reports.
// Every finding is collected; none stops the others.

import { Array as Arr, Option, Record as Rec, Result } from 'effect';
import type { Placed } from '../core/layout.ts';
import { everyTakeRecorded, sceneOf } from '../core/layout.ts';
import { hashText, linesOf, parse, takeScript, voiceKey } from '../core/narration.ts';
import type { RiveProblem, SceneBoard } from '../core/rive.ts';
import { filmScenes } from '../core/scenes.ts';
import type { ScenePins } from '../core/warp.ts';
import type { Beat, Music, Sound, SoundManifest } from '../core/schema.ts';
import {
  type EventTimes,
  MIN_CHUNK_MS,
  cueTime,
  effectKey,
  filmEnd,
  musicKey,
  musicPlan,
} from '../core/sound.ts';
import {
  ActTooShort,
  AssetMissing,
  AssetStale,
  type AudioMissing,
  type AudioStale,
  type CueInvalid,
  FilmStale,
  MarkOrder,
  MarkUnpinned,
  ProjectMissing,
  ProjectProblem,
  SceneMissing,
  SceneNotComponent,
  SceneUndrawn,
  TakeStale,
  TimelineMissing,
  type UnknownEvent,
  type UnknownMark,
  type UnknownScene,
  type UnknownVoice,
} from './errors.ts';
import type { LoadedFilm } from './film-repo.ts';
import { MASTER_TOLERANCE, masterFile, masterFinding } from './master.ts';
import { type ProjectState, projectPaths } from './project.ts';

export type StaticFinding =
  | TakeStale
  | AssetStale
  | AssetMissing
  | AudioMissing
  | AudioStale
  | UnknownScene
  | UnknownEvent
  | UnknownMark
  | CueInvalid
  | ActTooShort
  | UnknownVoice;
export type ProjectFinding =
  | ProjectMissing
  | ProjectProblem
  | FilmStale
  | SceneMissing
  | SceneUndrawn
  | SceneNotComponent
  | TimelineMissing
  | MarkUnpinned
  | MarkOrder;
export type Finding = StaticFinding | ProjectFinding;

export type Level = 'error' | 'warning';

export interface Reported {
  readonly level: Level;
  readonly finding: Finding;
}

export interface CheckOptions {
  /** Report stale takes, sounds, master and Film as warnings: work in progress, not a broken film. */
  readonly allowStale: boolean;
}

// ---------------------------------------------------------------------------
// Static

const said = (scene: Beat) => parse(Option.getOrElse(Option.fromNullishOr(scene.say), () => ''));

/**
 * Beats with words whose take is missing or was recorded for other text,
 * other turns or another voice.
 */
export const staleTakes = (film: LoadedFilm): ReadonlyArray<TakeStale> => {
  const voiceChanged = film.timings.voice !== voiceKey(film.voice);
  return film.scenes.flatMap((scene) => {
    const parsed = said(scene);
    if (parsed.spoken.length === 0) return [];
    const take = Rec.get(film.timings.scenes, scene.id);
    if (Option.isNone(take)) return [TakeStale.make({ scene: scene.id, reason: 'missing' })];
    if (voiceChanged) return [TakeStale.make({ scene: scene.id, reason: 'voice changed' })];
    if (take.value.hash !== hashText(takeScript(parsed)))
      return [TakeStale.make({ scene: scene.id, reason: 'text changed' })];
    return [];
  });
};

/** Lines handed to a voice the film's cast does not have: `narrate` would refuse them. */
export const unknownVoices = (film: LoadedFilm): ReadonlyArray<UnknownVoice> =>
  film.scenes.flatMap((scene) =>
    Result.match(linesOf(scene.id, said(scene), film.voice), {
      onFailure: (error) => [error],
      onSuccess: () => [],
    }),
  );

/** A generated asset against the hash its request has now. */
const assetFinding = (
  asset: string,
  stored: Option.Option<string>,
  wanted: string,
): ReadonlyArray<AssetStale | AssetMissing> =>
  Option.match(stored, {
    onNone: () => [AssetMissing.make({ asset })],
    onSome: (hash) => {
      if (hash === wanted) return [];
      return [AssetStale.make({ asset, stored: hash, wanted })];
    },
  });

/**
 * The score's acts: each names a scene, and each runs in film order for at
 * least the API's shortest chunk. Only a plan that holds is checked for a
 * stale score.
 */
export const musicFindings = (
  music: Music,
  placed: ReadonlyArray<Placed>,
  manifest: SoundManifest,
): ReadonlyArray<UnknownScene | ActTooShort | AssetStale | AssetMissing> => {
  const unknown = music.acts.flatMap((act) =>
    Result.match(sceneOf(placed, act.from), { onFailure: (e) => [e], onSuccess: () => [] }),
  );
  if (unknown.length > 0) return unknown;
  const starts = music.acts.map((act, i) => {
    if (i === 0) return 0;
    return Option.match(
      Arr.findFirst(placed, (p) => p.spec.id === act.from),
      { onNone: () => 0, onSome: (p) => p.start },
    );
  });
  const bounds = [...starts, filmEnd(placed)].map((s) => Math.round(s * 1000));
  const short = music.acts.flatMap((act, i) => {
    const ms = Arr.getUnsafe(bounds, i + 1) - Arr.getUnsafe(bounds, i);
    if (ms >= MIN_CHUNK_MS) return [];
    return [ActTooShort.make({ act: act.name, ms })];
  });
  if (short.length > 0) return short;
  return Result.match(musicPlan(music, placed), {
    onFailure: (error) => [error],
    onSuccess: (plan) =>
      assetFinding(
        'music',
        Option.map(Option.fromNullishOr(manifest.music), (a) => a.hash),
        musicKey(music, plan),
      ),
  });
};

/** Every effect placement names a real scene, Event or mark; every effect's asset is current. */
export const effectFindings = (
  sound: Sound,
  placed: ReadonlyArray<Placed>,
  manifest: SoundManifest,
  events: EventTimes,
): ReadonlyArray<StaticFinding> =>
  Object.entries(sound.effects).flatMap(([id, effect]) => [
    ...effect.at.flatMap((cue) =>
      Result.match(cueTime(cue, placed, events), { onFailure: (e) => [e], onSuccess: () => [] }),
    ),
    ...assetFinding(
      id,
      Option.map(Rec.get(manifest.effects, id), (a) => a.hash),
      effectKey(effect),
    ),
  ]);

const levelOf = (finding: StaticFinding, options: CheckOptions): Level => {
  switch (finding._tag) {
    case 'TakeStale':
    case 'AssetStale':
    case 'AudioStale':
    case 'AudioMissing':
      return staleLevel(options);
    case 'AssetMissing':
      return 'warning';
    default:
      return 'error';
  }
};

/** Once every take is recorded the film has a mixed track, and its master must cover the film. */
export const masterFindings = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  length: Option.Option<number>,
): ReadonlyArray<AudioMissing | AudioStale> => {
  if (!everyTakeRecorded(placed)) return [];
  return Option.toArray(
    masterFinding(masterFile(film.paths), length, filmEnd(placed), MASTER_TOLERANCE),
  );
};

/**
 * Everything the check finds in the script, the takes and the sound. `master`
 * is the audio master's measured length, or none when there is no master;
 * `events` are where each scene's Events play.
 */
export const staticFindings = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  options: CheckOptions,
  master: Option.Option<number>,
  events: EventTimes,
): ReadonlyArray<Reported> => {
  const sound = Option.toArray(film.sound).flatMap((s) => [
    ...Option.toArray(Option.fromNullishOr(s.music)).flatMap((m) =>
      musicFindings(m, placed, film.manifest),
    ),
    ...effectFindings(s, placed, film.manifest, events),
  ]);
  const audio = masterFindings(film, placed, master);
  const takes = [...unknownVoices(film), ...staleTakes(film)];
  return [...takes, ...sound, ...audio].map((finding) => ({
    level: levelOf(finding, options),
    finding,
  }));
};

// ---------------------------------------------------------------------------
// Project

const error = (finding: Finding): Reported => ({ level: 'error', finding });

const staleLevel = (options: CheckOptions): Level => {
  if (options.allowStale) return 'warning';
  return 'error';
};

const problemLevel = (problem: RiveProblem): Level => {
  if (problem.severity === 'error') return 'error';
  return 'warning';
};

/** Where the compiler found a problem: `file:line`, or the project. */
const problemAt = (problem: RiveProblem): string => {
  const parts = [
    ...Option.toArray(Option.fromNullishOr(problem.file)),
    ...Option.toArray(Option.map(Option.fromNullishOr(problem.line), String)),
  ];
  if (parts.length === 0) return 'project';
  return parts.join(':');
};

/** One beat against its artboard: there, nestable, drawn, and every mark on an Event. */
const sceneFindings = (
  p: Placed,
  project: ProjectState,
  pins: ReadonlyMap<string, ScenePins>,
): ReadonlyArray<Reported> => {
  const scene = p.spec.id;
  return Option.match(Option.fromNullishOr(project.doc.boards.get(scene)), {
    onNone: () => [error(SceneMissing.make({ scene }))],
    onSome: (board) => boardFindings(p, board, Option.fromNullishOr(pins.get(scene))),
  });
};

const boardFindings = (
  p: Placed,
  board: SceneBoard,
  pinned: Option.Option<ScenePins>,
): ReadonlyArray<Reported> => {
  const scene = p.spec.id;
  const found: Array<Reported> = [];
  if (!board.component) found.push(error(SceneNotComponent.make({ scene })));
  if (board.storyboard) found.push({ level: 'warning', finding: SceneUndrawn.make({ scene }) });
  if (Option.isNone(board.main)) {
    if (p.voice.marks.size > 0)
      found.push(error(TimelineMissing.make({ scene, marks: p.voice.marks.size })));
    return found;
  }
  return [
    ...found,
    ...Option.toArray(pinned).flatMap((pins) => [
      ...pins.unpinned.map((mark) => error(MarkUnpinned.make({ scene, mark }))),
      ...pins.disordered.map((mark) => error(MarkOrder.make({ scene, mark }))),
    ]),
  ];
};

/**
 * The film's Rive project against its script: what the compiler reports, each
 * beat's scene (only the beats `only` names, when it names any), and whether
 * the Film is what `sync` would write now. None is a film never synced.
 */
export const projectFindings = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  project: Option.Option<ProjectState>,
  only: Option.Option<ReadonlySet<string>>,
  options: CheckOptions,
): ReadonlyArray<Reported> => {
  const at = projectPaths(film.paths);
  if (Option.isNone(project)) return [error(ProjectMissing.make({ dir: at.dir }))];
  const state = project.value;
  const problems = state.doc.problems.map((p): Reported => ({
    level: problemLevel(p),
    finding: ProjectProblem.make({ kind: p.kind, at: problemAt(p), reason: p.message }),
  }));
  const pins = new Map(filmScenes(placed, state.doc).pins.map((p) => [p.scene, p]));
  const picked = placed.filter((p) =>
    Option.match(only, { onNone: () => true, onSome: (ids) => ids.has(p.spec.id) }),
  );
  const scenes = picked.flatMap((p) => sceneFindings(p, state, pins));
  const stale = Arr.filter([FilmStale.make({ file: at.film })], () => !state.current).map(
    (finding): Reported => ({ level: staleLevel(options), finding }),
  );
  return [...problems, ...scenes, ...stale];
};
