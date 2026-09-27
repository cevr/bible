// Record a film's narration, one take per beat. A take is current while the
// hash of its script (its words, and who says which) and the voice that read
// it match, so editing a line re-records only that line. A film read by one
// voice records through text-to-speech; a cast records each beat as one
// dialogue, so a question and its answer share a take. Every new take is
// transcribed back and compared with the script; a take that says something
// else fails the run unless it is accepted, and is never recorded as current.
//
// A crash at any point leaves the takes and their timings in agreement. A new
// take is written under a name of its own (its beat and a hash of its audio),
// never over a file the timings name; rewriting `timings.json` whole is the
// one step that makes it current. What a crashed or failed run leaves behind
// (a take never made current, a take replaced, a partial write) the timings
// name nowhere, and the next run removes it.

import { createHash } from 'node:crypto';
import {
  Array as Arr,
  Context,
  Effect,
  Encoding,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
} from 'effect';
import type { UnknownVoice } from '../core/errors.ts';
import {
  type Line,
  hashText,
  linesOf,
  parse,
  takeScript,
  voiceKey,
  wordsFromAlignment,
} from '../core/narration.ts';
import { type Timings, type VoiceTiming, isCast } from '../core/schema.ts';
import { ContentStore, isStale, type StoreError } from './content-store.ts';
import { ElevenLabs } from './elevenlabs.ts';
import {
  type AlignmentMismatch,
  ElevenLabsFailed,
  type MediaFailed,
  TakeMismatch,
} from './errors.ts';
import type { LoadedFilm } from './film-repo.ts';
import { Media } from './media.ts';
import { settleAll } from './settle.ts';

/** A take whose transcript is further than this from its script is a mismatch. */
export const MAX_WORD_ERROR = 0.08;

/** One beat's spoken line, in film order. */
export interface Beat {
  readonly id: string;
  /** What is said. */
  readonly text: string;
  /** What is said and who says it: a take is kept under this text's hash. */
  readonly script: string;
  /** Who reads what: the whole beat for a film with one voice, a line per turn for a cast. */
  readonly lines: ReadonlyArray<Line>;
}

export interface NarrateOptions {
  /** Record just these beats, current or not. */
  readonly only: Option.Option<ReadonlySet<string>>;
  /** Record every beat. */
  readonly force: boolean;
  /** Keep a take whose transcript does not match, with a warning. */
  readonly acceptMismatch: boolean;
}

export interface NarrationPlan {
  readonly beats: ReadonlyArray<Beat>;
  /** The beats to record, in film order. */
  readonly stale: ReadonlyArray<Beat>;
  /** `voiceKey(voice)`: the key every take is recorded under. */
  readonly voice: string;
}

export type NarrateError =
  | TakeMismatch
  | AlignmentMismatch
  | ElevenLabsFailed
  | MediaFailed
  | StoreError;

/** Takes recorded under the current voice; a different voice leaves none current. */
const currentTakes = (timings: Timings, voice: string): Timings['scenes'] => {
  if (timings.voice === voice) return timings.scenes;
  return {};
};

/** One beat's lines, or the voice a turn names that the film does not have. */
const beatOf = (film: LoadedFilm, scene: LoadedFilm['scenes'][number]) => {
  const parsed = parse(Option.getOrElse(Option.fromNullishOr(scene.say), () => ''));
  return Result.map(linesOf(scene.id, parsed, film.voice), (lines): Beat => ({
    id: scene.id,
    text: parsed.spoken,
    script: takeScript(parsed),
    lines,
  }));
};

/** What to record, from the film and its timings. Pure. */
export const planNarration = (
  film: LoadedFilm,
  options: NarrateOptions,
): Result.Result<NarrationPlan, UnknownVoice> => {
  const voice = voiceKey(film.voice);
  const takes = currentTakes(film.timings, voice);
  return Result.map(
    Result.all(film.scenes.map((scene) => beatOf(film, scene))),
    (beats): NarrationPlan => {
      const stale = beats
        .filter((b) => b.text.length > 0)
        .filter((b) =>
          Option.match(options.only, {
            onSome: (only) => only.has(b.id),
            onNone: () =>
              isStale(
                Option.map(Option.fromNullishOr(takes[b.id]), (t) => t.hash),
                hashText(b.script),
                options.force,
              ),
          }),
        );
      return { beats, stale, voice };
    },
  );
};

/** Words only, lowercased: punctuation and casing never fail a take. */
export const normalizeWords = (s: string): ReadonlyArray<string> =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

/** Word-level edit distance, as a share of the script's words. */
export const wordError = (want: ReadonlyArray<string>, got: ReadonlyArray<string>): number => {
  let previous: ReadonlyArray<number> = Arr.makeBy(got.length + 1, (j) => j);
  for (const [i, w] of want.entries()) {
    const row: Array<number> = [i + 1];
    for (const [j, g] of got.entries()) {
      const substitute = Arr.getUnsafe(previous, j) + Number(w !== g);
      row.push(Math.min(Arr.getUnsafe(previous, j + 1) + 1, Arr.getUnsafe(row, j) + 1, substitute));
    }
    previous = row;
  }
  return Arr.getUnsafe(previous, got.length) / Math.max(1, want.length);
};

/** A new take's file name: `<beat>.<hash of its audio>.mp3`, never the name of another take. */
export const takeFile = (id: string, audio: Uint8Array): string =>
  `${id}.${createHash('sha256').update(audio).digest('hex').slice(0, 12)}.mp3`;

/** Put one take into the timings, dropping any recorded under another voice. */
const withTake =
  (voice: string, id: string, take: VoiceTiming) =>
  (timings: Timings): Timings => ({
    voice,
    scenes: { ...currentTakes(timings, voice), [id]: take },
  });

/** Keep only the takes of beats that still exist. */
const withoutRemoved =
  (voice: string, beats: ReadonlyArray<Beat>) =>
  (timings: Timings): Timings => {
    const ids = new Set(beats.map((b) => b.id));
    const scenes = Object.entries(currentTakes(timings, voice)).filter(([id]) => ids.has(id));
    return { voice, scenes: Object.fromEntries(scenes) };
  };

export interface NarratorService {
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

      /**
       * The beat read aloud: one voice through text-to-speech, a cast as one
       * dialogue. `breaks` is where each line starts in the alignment.
       */
      const read = (film: LoadedFilm, plan: NarrationPlan, beat: Beat) => {
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
        beat: Beat,
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
        const audio = yield* Effect.fromResult(Encoding.decodeBase64(reply.audio_base64)).pipe(
          Effect.mapError((error) =>
            ElevenLabsFailed.make({ op: 'tts', exitCode: 0, reason: error.message }),
          ),
        );

        // The take lands beside the current one; only the timings make it current.
        const file = takeFile(beat.id, audio);
        const take = path.join(film.paths.narration, file);
        yield* store.writeFile(take, audio);
        const heard = yield* elevenLabs.stt(take);
        const wer = wordError(normalizeWords(beat.text), normalizeWords(heard.text));
        const duration = yield* media.duration(take);
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
          // Never made current, the take is removed with the run's leftovers.
          if (!options.acceptMismatch) return yield* mismatch;
          yield* Effect.logWarning(`narrate.mismatch accepted=true ${mismatch.message}`);
        }
        // The commit: timings.json is replaced whole, naming the new take.
        yield* store.update(
          film.paths.timings,
          withTake(plan.voice, beat.id, { hash: hashText(beat.script), file, duration, words }),
        );
      });

      /**
       * Remove every take file the timings do not name, and every partial
       * write: what a crashed or failed run left, or a take since replaced.
       */
      const sweep = Effect.fn('Narrator.sweep')(function* (film: LoadedFilm) {
        const dir = film.paths.narration;
        if (!(yield* fs.exists(dir))) return;
        const timings = yield* store.read(film.paths.timings);
        const named = new Set(Object.values(timings.scenes).map((t) => t.file));
        const stray = (yield* fs.readDirectory(dir)).filter(
          (name) => name.endsWith('.partial') || (name.endsWith('.mp3') && !named.has(name)),
        );
        yield* Effect.forEach(stray, (name) => fs.remove(path.join(dir, name)), { discard: true });
        if (stray.length > 0) yield* Effect.log(`narrate.sweep removed=${stray.join(',')}`);
      });

      const record = Effect.fn('Narrator.record')(function* (
        film: LoadedFilm,
        plan: NarrationPlan,
        options: NarrateOptions,
      ) {
        yield* sweep(film);
        yield* settleAll(
          plan.stale,
          (beat) =>
            recordBeat(film, plan, options, beat).pipe(
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
