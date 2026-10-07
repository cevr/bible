// Record a film's narration, one take per beat. A take is current while the
// hash of its script (its words, and who says which) and the voice that read
// it match, so editing a line re-records only that line. A film read by one
// voice records through text-to-speech; a cast records each beat as one
// dialogue, so a question and its answer share a take. Every new take is
// transcribed back and compared with the script; a take that says something
// else fails the run unless it is accepted, and is never recorded as current.
//
// A crash at any point leaves the takes and their timings in agreement. A new
// take is made in a temporary folder of its run's own, where no other run
// sees it, and named for its beat and a hash of its audio, never the name of
// a file the timings name. It enters `narration/` only under the timings'
// lock, placed there and named by `timings.json`, rewritten whole, in one
// step: so another run's sweep, which holds that lock too, never finds a
// take that is still being made. What a crashed or failed run leaves behind
// (a take placed but never named, a take replaced, a partial write) the
// timings name nowhere, and the next run clears it from `narration/`: a
// partial write whose writer is known to be gone is removed, a take is put away into
// `narration/attempts/<beat>/`, never deleted.

import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Path,
  Record as Rec,
  Result,
  String as Str,
} from 'effect';
import { Base64 } from 'effect/encoding';
import { type AlignmentMismatch, type LineError, type UnknownVoice } from '../core/errors.ts';
import {
  hashText,
  heldInside,
  linesOf,
  parse,
  type TakeState,
  takeScript,
  takeState,
  voiceKey,
  wordsFromAlignment,
} from '../core/narration.ts';
import { trimTail } from '../core/recording.ts';
import {
  type HeardAs,
  TAKE_TOLERANCE,
  type Timings,
  type Voice,
  type VoiceTiming,
  isCast,
} from '../core/schema.ts';
import { lineError } from '../core/spoken.ts';
import type { ReadBeat } from '../core/studio.ts';
import { voicedWords } from '../core/voiced.ts';
import { ContentStore, type StoreError, partialAbandoned } from './content-store.ts';
import { sha256Hex } from './digest.ts';
import { ElevenLabs } from './elevenlabs.ts';
import { ElevenLabsFailed, type MediaFailed, TakeMismatch } from '../core/refusals.ts';
import type { FilmPaths, LoadedFilm } from './film-repo.ts';
import { Media } from './media.ts';
import { settleAll } from './settle.ts';

/** A take whose transcript is further than this from its script is a mismatch. */
export const MAX_WORD_ERROR = 0.08;

export interface NarrateOptions {
  /** Record just these beats, current or not (a current recorded take is never replaced). */
  readonly only: Option.Option<ReadonlySet<string>>;
  /** Record every beat (but those a person read). */
  readonly force: boolean;
  /** The beats that may keep a take whose transcript does not match, with a warning (`--accept-mismatch`). */
  readonly acceptMismatch: ReadonlySet<string>;
  /** Let staging replace a person's take whose line has changed. */
  readonly replaceRecorded: boolean;
}

/** A beat's take as the plan found it. */
interface BeatTake {
  readonly id: string;
  readonly state: TakeState;
}

/** A beat staging was asked for and left alone, because a person read it. */
interface Kept {
  readonly id: string;
  /** `recorded`: current; `recorded, stale`: its line changed, and it waits to be read again. */
  readonly why: 'recorded' | 'recorded, stale';
}

/** A person's take for a beat the film no longer has. */
interface Orphan {
  readonly id: string;
  readonly file: string;
}

/** A person's takes whose beat is gone from the film, in the timings' order. */
const orphansOf = (timings: Timings, beats: ReadonlyArray<{ readonly id: string }>) => {
  const ids = new Set(beats.map((b) => b.id));
  return Object.entries(timings.scenes)
    .filter(([id, take]) => take.source === 'recorded' && !ids.has(id))
    .map(([id, take]): Orphan => ({ id, file: take.file }));
};

export interface NarrationPlan {
  readonly beats: ReadonlyArray<ReadBeat>;
  /** Every beat with words and where its take stands, in film order. */
  readonly states: ReadonlyArray<BeatTake>;
  /** The beats to record, in film order. */
  readonly stale: ReadonlyArray<ReadBeat>;
  /** The beats staging would have recorded but a person's take holds. */
  readonly kept: ReadonlyArray<Kept>;
  /**
   * A person's takes whose beat the film no longer has (renamed or cut):
   * kept in the timings and on disk, never swept, and reported, so a rename
   * never throws a reading away. Move its key in `timings.json` to the new id.
   */
  readonly orphaned: ReadonlyArray<Orphan>;
  /** `voiceKey(voice)`: the key every take is recorded under. */
  readonly voice: string;
}

type NarrateError = TakeMismatch | AlignmentMismatch | ElevenLabsFailed | MediaFailed | StoreError;

/**
 * Takes recorded under the current voice; a different voice leaves only the
 * takes a person read, which no staging voice made.
 */
const currentTakes = (timings: Timings, voice: string): Timings['scenes'] => {
  if (timings.voice === voice) return timings.scenes;
  return Rec.filter(timings.scenes, (take) => take.source === 'recorded');
};

/** One beat's lines, or the voice a turn names that the film does not have. */
const beatOf = (film: LoadedFilm, scene: LoadedFilm['scenes'][number]) =>
  Result.flatMap(
    parse(
      scene.id,
      Option.getOrElse(Option.fromNullishOr(scene.say), () => ''),
    ),
    (parsed) =>
      Result.map(linesOf(scene.id, parsed, film.voice), (lines): ReadBeat => ({
        id: scene.id,
        text: parsed.spoken,
        script: takeScript(parsed),
        lines,
      })),
  );

/** Every beat's lines, in film order, or the voice a turn names that the film does not have. */
export const beatsOf = (
  film: LoadedFilm,
): Result.Result<ReadonlyArray<ReadBeat>, UnknownVoice | LineError> =>
  Result.all(film.scenes.map((scene) => beatOf(film, scene)));

/**
 * A film as a take is kept against it: where its narration lives, its voice,
 * how speech-to-text writes its names, and its beats as the script says them.
 * `voicedOf` reads it from a loaded film; the lab's studio has it from a fresh
 * process (`film read voice`), since its own imports of the script stay as
 * they were at its start.
 */
export interface VoicedFilm {
  readonly paths: FilmPaths;
  readonly voice: Voice;
  readonly heardAs: HeardAs;
  readonly beats: ReadonlyArray<ReadBeat>;
}

/** The film as a take is kept against it, or the voice a turn names that the film does not have. */
export const voicedOf = (film: LoadedFilm): Result.Result<VoicedFilm, UnknownVoice | LineError> =>
  Result.map(beatsOf(film), (beats) => ({
    paths: film.paths,
    voice: film.voice,
    heardAs: film.heardAs,
    beats,
  }));

/** Whether the options ask staging for this beat, before a person's take has its say. */
const asked = (options: NarrateOptions, take: BeatTake): boolean =>
  Option.match(options.only, {
    onSome: (only) => only.has(take.id),
    onNone: () => options.force || take.state._tag === 'Stale',
  });

/** Why staging leaves an asked beat alone, if it does: a person read it. */
const keptBy = (options: NarrateOptions, state: TakeState): Option.Option<Kept['why']> => {
  if (state._tag === 'Recorded') return Option.some('recorded');
  if (state._tag === 'Stale' && state.recorded && !options.replaceRecorded)
    return Option.some('recorded, stale');
  return Option.none();
};

/** What to record, from the film and its timings. Pure. */
export const planNarration = (
  film: LoadedFilm,
  options: NarrateOptions,
): Result.Result<NarrationPlan, UnknownVoice | LineError> => {
  const voice = voiceKey(film.voice);
  return Result.map(beatsOf(film), (beats): NarrationPlan => {
    const spoken = beats.filter((b) => b.text.length > 0);
    const states = spoken.map((b) => ({
      id: b.id,
      state: takeState(b.id, b.script, film.timings, voice),
    }));
    const wanted = Arr.zip(spoken, states).filter(([, take]) => asked(options, take));
    const verdicts = wanted.map(([beat, take]) => ({ beat, kept: keptBy(options, take.state) }));
    return {
      beats,
      states,
      stale: verdicts.filter((v) => Option.isNone(v.kept)).map((v) => v.beat),
      kept: verdicts.flatMap((v) =>
        Option.toArray(Option.map(v.kept, (why): Kept => ({ id: v.beat.id, why }))),
      ),
      orphaned: orphansOf(film.timings, beats),
      voice,
    };
  });
};

/**
 * One line of `narrate --dry-run`: the beat's take `recorded` (a person read
 * it), `staging` (ElevenLabs), or `stale`, with why, and whose take went stale.
 */
export const stateLine = (take: BeatTake): string =>
  Match.type<TakeState>().pipe(
    Match.tagsExhaustive({
      Recorded: () => `recorded  ${take.id}`,
      Staging: () => `staging   ${take.id}`,
      Stale: ({ reason, recorded }) => {
        if (recorded) return `stale     ${take.id} (${reason}, recorded take)`;
        return `stale     ${take.id} (${reason})`;
      },
    }),
  )(take.state);

/** A take's audio: a staging take is ElevenLabs' MP3, a person's a FLAC master. */
const TAKE_EXTENSIONS = ['.mp3', '.flac'] as const;
type TakeExtension = (typeof TAKE_EXTENSIONS)[number];

/** Twelve hex digits of the SHA-256 of `bytes`: a file named by what it holds. */
export const contentHash = (bytes: Uint8Array): string => sha256Hex(bytes).slice(0, 12);

/** A new take's file name: `<beat>.<hash of its audio><ext>`, never the name of another take. */
export const takeFile = (id: string, audio: Uint8Array, ext: TakeExtension = '.mp3'): string =>
  `${id}.${contentHash(audio)}${ext}`;

/** The beat a take file was made for, read from its name: `<beat>.<hash><ext>`, else what comes before its first dot. */
const beatOfTake = (name: string): string =>
  Option.getOrElse(
    Option.flatMap(Option.fromNullishOr(/^(.+)\.[0-9a-f]{12}\.[^.]+$/.exec(name)), (made) =>
      Arr.get(made, 1),
    ),
    () => Arr.headNonEmpty(Str.split(name, '.')),
  );

/** Whether two files hold the same bytes. */
export const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

/** `file`'s extension, its dot with it (`.flac`); empty when it has none. */
const extensionOf = (file: string): string =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(/\.[^.]+$/.exec(file)), (found) => found[0]),
    () => '',
  );

/** The hash of its audio a take's name carries (`takeFile`); none for a name from before takes were named by it. */
export const hashOfTake = (file: string): Option.Option<string> =>
  Option.flatMap(Option.fromNullishOr(/\.([0-9a-f]{12})\.[^.]+$/.exec(file)), (named) =>
    Arr.get(named, 1),
  );

/** How many names a take may be kept aside under (`keptAside`) before it is not put away at all. */
const KEPT_ASIDE_NAMES = 8;

/**
 * The `n`th name a take `file` is put away under beside an attempt of the
 * same name that holds other bytes: `<file>.<hash of its audio><ext>`
 * (`a.mp3.<sha12>.mp3`), then `<file>.<hash>.<n><ext>` while that name too
 * holds other bytes. It names no other take or attempt (`isKeptAside`).
 */
const keptAside = (file: string, bytes: Uint8Array, n: number): string => {
  const named = `${file}.${contentHash(bytes)}`;
  if (n === 0) return `${named}${extensionOf(file)}`;
  return `${named}.${n}${extensionOf(file)}`;
};

/** Whether `name` is take `file` kept aside (`keptAside`). */
export const isKeptAside = (file: string, name: string): boolean =>
  name.startsWith(`${file}.`) &&
  name.endsWith(extensionOf(file)) &&
  /^\.[0-9a-f]{12}(\.[1-9][0-9]*)?$/.test(
    name.slice(file.length, name.length - extensionOf(file).length),
  );

/**
 * A take the timings no longer name, put away: moved out of `narration/`
 * into `narration/attempts/<beat>/` (git-ignored), where every recorded
 * attempt already is. A take's bytes are never lost: it leaves `narration/`
 * only once a file in its attempts holds them, read back and compared byte
 * for byte. That is the attempt of its name (the person's attempt it was
 * kept from, or a copy made now); when that holds other bytes (a name from
 * before takes were named by their audio), the first name kept aside
 * (`keptAside`) that is free or holds the same bytes. A take with no such
 * name stays where it is, and the refusal is logged. The caller holds the
 * timings' lock and has read that they do not name it (`putAwayUnnamed`).
 */
export const putAwayTake = Effect.fn('putAwayTake')(function* (
  paths: FilmPaths,
  beat: string,
  file: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = yield* ContentStore;
  const take = path.join(paths.narration, file);
  if (!(yield* fs.exists(take))) return;
  const bytes = yield* fs.readFile(take);
  const attempts = path.join(paths.narration, 'attempts', beat);
  const names = [file, ...Arr.makeBy(KEPT_ASIDE_NAMES, (n) => keptAside(file, bytes, n))];
  // A name holds the take once its file reads back as the take: written first when free.
  const holds = (name: string) =>
    Effect.gen(function* () {
      const home = path.join(attempts, name);
      if (!(yield* fs.exists(home))) yield* store.writeFile(home, bytes);
      return sameBytes(yield* fs.readFile(home), bytes);
    });
  const home = yield* Effect.findFirst(names, holds);
  if (Option.isNone(home))
    return yield* Effect.logError(
      `takes.put-away.refused id=${beat} file=${file} reason="attempts/${beat}/ has no name for it that holds its bytes; it stays in narration/"`,
    );
  if (home.value !== file)
    yield* Effect.logWarning(
      `takes.put-away.kept-aside id=${beat} file=${file} as=${home.value} reason="attempts/${beat}/${file} holds other bytes"`,
    );
  yield* fs.remove(take);
  yield* Effect.log(`takes.put-away id=${beat} file=${file}`);
});

/**
 * Take `file` of `beat` put away (`putAwayTake`) unless the timings name it:
 * read under their lock, the one every change of them takes in any process,
 * so a take another process has just made current (a lab's Undo) is never
 * put away on a reading from before.
 */
export const putAwayUnnamed = Effect.fn('putAwayUnnamed')(function* (
  paths: FilmPaths,
  beat: string,
  file: string,
) {
  const store = yield* ContentStore;
  yield* store.holding(paths.timings, (timings) => {
    if (Object.values(timings.scenes).some((t) => t.file === file))
      return Effect.log(`takes.put-away.skipped id=${beat} file=${file} reason=named`);
    return putAwayTake(paths, beat, file);
  });
});

/**
 * Clear `narration/` of what the timings do not name: every partial write
 * whose writer is known to be gone, a pid on this host that no longer runs,
 * is removed (every other is kept: one whose writer runs here or on another
 * host, a mix's track say, which no timings lock covers, or whose writer
 * cannot be told: `partialAbandoned`), and
 * every take file (what a crashed or failed run left, or a take since
 * replaced) is put away into `attempts/<beat>/` (`putAwayTake`), never
 * deleted, so a person's take whose attempt is not on this machine is still
 * kept. All of it holds the timings' lock, which a lab's Undo holds while it
 * brings a take back and names it, and a keep or a staging take while it
 * places one, so what is swept is decided from the timings as they are, in
 * any process.
 */
export const sweepNarration = Effect.fn('Narrator.sweep')(function* (paths: FilmPaths) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = yield* ContentStore;
  const dir = paths.narration;
  if (!(yield* fs.exists(dir))) return;
  const sweep = Effect.fn('Narrator.sweep.held')(function* (timings: Timings) {
    const named = new Set(Object.values(timings.scenes).map((t) => t.file));
    const names = yield* fs.readDirectory(dir);
    const partials = yield* Effect.filter(
      names.filter((name) => name.endsWith('.partial')),
      partialAbandoned,
    );
    const stray = names.filter(
      (name) => TAKE_EXTENSIONS.some((ext) => name.endsWith(ext)) && !named.has(name),
    );
    yield* Effect.forEach(partials, (name) => fs.remove(path.join(dir, name)), {
      discard: true,
    });
    yield* Effect.forEach(stray, (name) => putAwayTake(paths, beatOfTake(name), name), {
      discard: true,
    });
    if (partials.length + stray.length > 0)
      yield* Effect.log(`narrate.sweep removed=${partials.join(',')} put-away=${stray.join(',')}`);
  });
  yield* store.holding(paths.timings, sweep);
});

/** Put one take into the timings, dropping any recorded under another voice. */
const withTake =
  (voice: string, id: string, take: VoiceTiming) =>
  (timings: Timings): Timings => ({
    voice,
    scenes: { ...currentTakes(timings, voice), [id]: take },
  });

/**
 * Keep only the takes of beats that still exist, and every take a person
 * read: a beat renamed or cut leaves its reading in place (`orphaned`), not
 * swept with the staging takes.
 */
const withoutRemoved =
  (voice: string, beats: ReadonlyArray<ReadBeat>) =>
  (timings: Timings): Timings => {
    const ids = new Set(beats.map((b) => b.id));
    const scenes = Object.entries(currentTakes(timings, voice)).filter(
      ([id, take]) => ids.has(id) || take.source === 'recorded',
    );
    return { voice, scenes: Object.fromEntries(scenes) };
  };

interface NarratorService {
  /** Record every stale beat of the plan, then drop the takes of removed beats. */
  readonly record: (
    film: LoadedFilm,
    plan: NarrationPlan,
    options: NarrateOptions,
  ) => Effect.Effect<void, NarrateError>;
}

export class Narrator extends Context.Service<Narrator, NarratorService>()(
  '@bible/film/tools/Narrator',
) {
  static readonly layer = Layer.effect(
    Narrator,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const elevenLabs = yield* ElevenLabs;
      const media = yield* Media;
      /** What sweeping the narration needs (`sweepNarration`). */
      const io = yield* Effect.context<FileSystem.FileSystem | Path.Path | ContentStore>();

      /**
       * The beat read aloud: one voice through text-to-speech, a cast as one
       * dialogue. `breaks` is where each line starts in the alignment.
       */
      const read = (film: LoadedFilm, plan: NarrationPlan, beat: ReadBeat) => {
        const { voice } = film;
        if (isCast(voice))
          return Effect.map(elevenLabs.dialogue({ lines: beat.lines, cast: voice }), (reply) => ({
            ...reply,
            breaks: reply.voice_segments.map((s) => s.character_start_index),
          }));
        const index = plan.beats.findIndex((b) => b.id === beat.id);
        const neighbour = (at: number) =>
          Option.getOrElse(
            Option.map(Arr.get(plan.beats, at), (b) => b.text),
            () => '',
          );
        return Effect.map(
          elevenLabs.tts({
            text: beat.text,
            voice,
            previousText: neighbour(index - 1),
            nextText: neighbour(index + 1),
          }),
          (reply) => ({ ...reply, breaks: [] }),
        );
      };

      const recordBeat = Effect.fn('Narrator.recordBeat')(function* (
        film: LoadedFilm,
        plan: NarrationPlan,
        options: NarrateOptions,
        beat: ReadBeat,
      ) {
        const reply = yield* read(film, plan, beat);
        const { alignment } = reply;
        const words = yield* Effect.fromResult(
          wordsFromAlignment(
            beat.text,
            alignment.characters,
            alignment.character_start_times_seconds,
            alignment.character_end_times_seconds,
            reply.breaks,
          ),
        );
        const audio = yield* Effect.fromResult(Base64.decode(reply.audio_base64)).pipe(
          Effect.mapError((error) =>
            ElevenLabsFailed.make({ op: 'tts', exitCode: 0, reason: error.message }),
          ),
        );

        // The take is made in this beat's own folder, out of every other
        // run's sight, and gone with it however the beat ends.
        const file = takeFile(beat.id, audio);
        const take = path.join(yield* fs.makeTempDirectoryScoped({ prefix: 'narrate-' }), file);
        yield* fs.writeFile(take, audio);
        const heard = yield* elevenLabs.stt(take);
        const wer = lineError(beat.text, heard.text, film.heardAs);
        const duration = yield* media.duration(take);
        const overrun = Math.max(0, ...words.map((w) => w.end)) - duration;
        if (overrun > TAKE_TOLERANCE)
          yield* Effect.logWarning(
            `narrate.overrun id=${beat.id} secs=${overrun.toFixed(2)} (the alignment runs past the take; its words are held inside it)`,
          );
        yield* Effect.log(
          `narrate.take id=${beat.id} words=${words.length} lines=${beat.lines.length} secs=${duration.toFixed(2)} wer=${(wer * 100).toFixed(1)}%`,
        );
        if (wer > MAX_WORD_ERROR) {
          const mismatch = TakeMismatch.make({
            id: beat.id,
            script: beat.text,
            heard: heard.text,
            wer,
          });
          // Never made current, the take never reaches `narration/`.
          if (!options.acceptMismatch.has(beat.id)) return yield* mismatch;
          yield* Effect.logWarning(`narrate.mismatch accepted=true ${mismatch.message}`);
        }
        // Seconds of silence after the last word are trimmed, as an import's
        // are: the trimmed take is a FLAC of what ElevenLabs sent (never
        // re-encoded lossy), kept in place of the MP3.
        const sent = yield* media.decode(take);
        const kept = yield* Option.match(trimTail(sent), {
          onNone: () => Effect.succeed({ file, bytes: audio, duration, pcm: sent }),
          onSome: (trimmed) =>
            Effect.gen(function* () {
              const flac = yield* media.encodeFlac(trimmed);
              const trimmedFile = takeFile(beat.id, flac, '.flac');
              const secs = trimmed.frames / trimmed.rate;
              yield* Effect.log(
                `narrate.trimmed id=${beat.id} tail=${(duration - secs).toFixed(2)} file=${trimmedFile}`,
              );
              return { file: trimmedFile, bytes: flac, duration: secs, pcm: trimmed };
            }),
        });
        // Where each word is heard, read from the take as it will be mixed.
        const voiced = voicedWords(heldInside(words, kept.duration), kept.pcm);
        // The commit, under the timings' lock: the take placed beside the
        // current one, then timings.json replaced whole, naming it.
        yield* store.transact(film.paths.timings, (timings) =>
          Effect.gen(function* () {
            yield* store.writeFile(path.join(film.paths.narration, kept.file), kept.bytes);
            const named = withTake(plan.voice, beat.id, {
              hash: hashText(beat.script),
              file: kept.file,
              duration: kept.duration,
              words: voiced,
              source: 'elevenlabs',
            })(timings);
            return [named, named] as const;
          }),
        );
      });

      const sweep = (film: LoadedFilm) =>
        sweepNarration(film.paths).pipe(Effect.provideContext(io));

      const record = Effect.fn('Narrator.record')(function* (
        film: LoadedFilm,
        plan: NarrationPlan,
        options: NarrateOptions,
      ) {
        yield* Effect.forEach(plan.kept, (kept) => {
          if (kept.why === 'recorded')
            return Effect.log(`narrate.skip id=${kept.id} take=recorded`);
          return Effect.logWarning(
            `narrate.refused id=${kept.id} take=recorded-stale: its line changed; record it again (takes import, or the lab's studio), or stage it with --replace-recorded`,
          );
        });
        yield* sweep(film);
        yield* settleAll(
          plan.stale,
          (beat) =>
            recordBeat(film, plan, options, beat).pipe(
              Effect.scoped,
              Effect.tapError((error) =>
                Effect.logError(`narrate.failed id=${beat.id} error=${error._tag}`),
              ),
            ),
          3,
        ).pipe(
          Effect.andThen(store.update(film.paths.timings, withoutRemoved(plan.voice, plan.beats))),
          // Also after a failed take: a take never made current does not stay.
          Effect.ensuring(
            sweep(film).pipe(
              Effect.catch((error) => Effect.logWarning(`narrate.sweep failed=${error._tag}`)),
            ),
          ),
        );
      });

      return Narrator.of({ record });
    }),
  );
}
