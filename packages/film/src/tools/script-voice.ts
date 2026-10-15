// A staging take kept ready for every spoken beat of every film the lab
// lists, so the Script reader plays a beat without asking for it. Each beat's
// take is the staging cache's (`staging.ts`), asked for by what the beat says
// now: its words, its marks, the film's voice and model (`stagingRequest`);
// a beat whose words, marks or voice changed has a new key, and is voiced
// again. Nothing here writes a film: its timings and its recorded takes are
// never touched (`film narrate` makes a cached take a film's own, at no
// cost). A series draft (`series-drafts.ts`) is voiced the same way, in the
// staging voice, its takes kept by the same keys.
//
// With the fill on (`FILM_STAGING_FILL=true`, which only the owner's lab
// sets: a fill spends), a beat the cache keeps no take for is queued: the
// films a reader has open first, every other film's and every draft's in the
// background as the sweep finds them, a few at a time. Each is charged
// against the day's cap before it is sent; past the cap it is refused, said
// in the reader, and asked again the next day. A beat is asked for once a
// session: a refusal stands until the day turns. A take that misread its
// line is kept but never ready, and read again only once the local day it
// was made (its record's `at`) has passed: at most once a day, by any lab.

import {
  Array as Arr,
  Clock,
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Queue,
  Ref,
  Schedule,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { ScriptVoice, StagingTake } from '../core/api.ts';
import type { DraftUnknown, DraftUnread } from '../core/refusals.ts';
import type { HeardAs, Voice } from '../core/schema.ts';
import type { ReadBeat } from '../core/studio.ts';
import type { StoreError } from './content-store.ts';
import { FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import type { FreshError } from './fresh-film.ts';
import { MAX_WORD_ERROR, Narrator } from './narrator.ts';
import { draftKey, SeriesDrafts } from './series-drafts.ts';
import {
  dayOf,
  type StagedTake,
  type StagingAsk,
  StagingCache,
  stagingRequest,
} from './staging.ts';
import { StudioReadings } from './studio.ts';

/** How many takes are voiced at once. */
const VOICING_AT_ONCE = 2;

/** How often the fill looks for beats no take is kept for, in every film. */
const SWEEP_EVERY = Duration.minutes(1);

/** Whether what speech-to-text heard of a take is near enough its line (`MAX_WORD_ERROR`), as narrate judges it. */
const saysLine = (take: StagedTake): boolean => take.wer <= MAX_WORD_ERROR;

/**
 * A kept take as the reader has it: ready to hear, or refused, saying what
 * was heard, when it misread its line. A misread is read again once the day
 * it was made has passed (`rereadDue`), never sooner: a misread costs a
 * reading a day at most, and a fluke heals by itself the next day.
 */
const readyOrMisread = (take: StagedTake): StagingTake => {
  if (!saysLine(take))
    return {
      _tag: 'Refused',
      reason: `misread ${Math.round(take.wer * 100)}% of its words, heard "${take.heard}"`,
    };
  return { _tag: 'Ready', file: take.file, duration: take.duration, words: take.words };
};

/** A beat to voice: its request's key, what to ask, and how speech-to-text spells the film's names. */
interface Job {
  readonly key: string;
  readonly ask: StagingAsk;
  readonly heardAs: HeardAs;
  /** Whether the cache keeps a take for it that misread its line on an earlier day than today (`rereadDue`). */
  readonly reread: boolean;
}

/**
 * Whether a kept take is read again `today`: it misread its line, and the
 * local day it was made (its record's `at`) is before today. Read from the
 * take's own record, so a restart or a second lab asks no more than one.
 */
const rereadDue = (take: StagedTake, today: string): boolean =>
  !saysLine(take) && dayOf(take.at) < today;

/** What the fill has asked for this session: queued (the readers' first), and refused, with why, by key. */
interface Fill {
  /** Whether the fill runs: nothing is queued while it does not. */
  readonly running: boolean;
  readonly urgent: ReadonlyArray<Job>;
  readonly background: ReadonlyArray<Job>;
  /** Being voiced now. */
  readonly voicing: ReadonlySet<string>;
  readonly refused: ReadonlyMap<string, string>;
  /** The local day the refusals are of: a new day asks again. */
  readonly day: string;
}

const NO_FILL: Fill = {
  running: false,
  urgent: [],
  background: [],
  voicing: new Set(),
  refused: new Map(),
  day: '',
};

/** Whether `fill` has `key` queued or being voiced. */
const asked = (fill: Fill, key: string) =>
  fill.voicing.has(key) || [...fill.urgent, ...fill.background].some((j) => j.key === key);

/** Each spoken beat of a film as it is asked for: the lines either side its neighbours. */
const asksOf = (voice: Voice, beats: ReadonlyArray<ReadBeat>): ReadonlyArray<StagingAsk> => {
  const text = (at: number) =>
    Option.getOrElse(
      Option.map(Arr.get(beats, at), (b) => b.text),
      () => '',
    );
  return beats.flatMap((beat, i) =>
    Arr.filter([{ beat, voice, previous: text(i - 1), next: text(i + 1) }], () => beat.text !== ''),
  );
};

/** Whether a beat is to be voiced: no take is kept for it, or the one kept misread its line before today. */
const wanted = (beat: { readonly job: Job; readonly kept: Option.Option<StagedTake> }): boolean =>
  Option.isNone(beat.kept) || beat.job.reread;

/** `jobs` queued in `fill`: none twice, none refused. */
const queued = (fill: Fill, jobs: ReadonlyArray<Job>, urgent: boolean): Fill => {
  if (!fill.running) return fill;
  const fresh = jobs.filter((j) => !fill.refused.has(j.key) && !fill.voicing.has(j.key));
  return queuedIn(fill, fresh, urgent);
};

/** `fresh` jobs placed in `fill`'s queues: urgent ones first, moved up when already queued behind. */
const queuedIn = (fill: Fill, fresh: ReadonlyArray<Job>, urgent: boolean): Fill => {
  if (urgent) {
    const keys = new Set(fresh.map((j) => j.key));
    return {
      ...fill,
      urgent: [...fill.urgent, ...fresh.filter((j) => !fill.urgent.some((u) => u.key === j.key))],
      background: fill.background.filter((j) => !keys.has(j.key)),
    };
  }
  return { ...fill, background: [...fill.background, ...fresh.filter((j) => !asked(fill, j.key))] };
};

/** The next job of `fill`, the readers' first, taken out and marked voicing. */
const next = (fill: Fill): readonly [Option.Option<Job>, Fill] => {
  const job = Option.orElse(Arr.head(fill.urgent), () => Arr.head(fill.background));
  return Option.match(job, {
    onNone: () => [job, fill] as const,
    onSome: (j) =>
      [
        job,
        {
          ...fill,
          urgent: fill.urgent.filter((u) => u.key !== j.key),
          background: fill.background.filter((b) => b.key !== j.key),
          voicing: new Set([...fill.voicing, j.key]),
        },
      ] as const,
  });
};

/** `fill` with `key` voiced: refused for `why`, or done. */
const settled = (fill: Fill, key: string, why: Option.Option<string>): Fill => ({
  ...fill,
  voicing: new Set([...fill.voicing].filter((k) => k !== key)),
  refused: Option.match(why, {
    onNone: () => fill.refused,
    onSome: (reason) => new Map([...fill.refused, [key, reason]]),
  }),
});

interface ScriptVoicesService {
  /**
   * Each spoken beat of `film` as its staging take stands, and the day's
   * spend; with the fill on, every beat the cache keeps no take for is queued
   * ahead of the background.
   */
  readonly voice: (
    film: FilmName,
  ) => Effect.Effect<ScriptVoice, FreshError | PlatformError | StoreError>;
  /** Each spoken beat of series draft `draft` as its staging take stands, as `voice` has a film's. */
  readonly draft: (
    series: string,
    draft: string,
  ) => Effect.Effect<ScriptVoice, DraftUnknown | DraftUnread | PlatformError | StoreError>;
  /**
   * Keep every film's takes ready until interrupted: the sweep and the
   * voicing. Until it runs, nothing is queued, and a beat with no take kept
   * is unvoiced.
   */
  readonly fill: Effect.Effect<never>;
}

export class ScriptVoices extends Context.Service<ScriptVoices, ScriptVoicesService>()(
  '@bible/film/tools/ScriptVoices',
) {
  /** Over the staging cache and the narrator. */
  static readonly layer = Layer.effect(
    ScriptVoices,
    Effect.gen(function* () {
      const readings = yield* StudioReadings;
      const cache = yield* StagingCache;
      const narrator = yield* Narrator;
      const folder = yield* FilmFolder;
      const drafts = yield* SeriesDrafts;
      const state = yield* Ref.make(NO_FILL);
      // One signal per job queued: a voicer waits on it, then takes the readers' first.
      const signals = yield* Queue.unbounded<void>();

      /** Each spoken beat of `reading`, its job, and its take as the cache keeps it. */
      const beatsIn = (reading: {
        readonly voice: Voice;
        readonly heardAs: HeardAs;
        readonly beats: ReadonlyArray<ReadBeat>;
      }) =>
        Effect.gen(function* () {
          const today = dayOf(yield* Clock.currentTimeMillis);
          return yield* Effect.forEach(asksOf(reading.voice, reading.beats), (ask) => {
            const key = stagingRequest(ask).key;
            return Effect.map(cache.get(key), (kept) => ({
              job: {
                key,
                ask,
                heardAs: reading.heardAs,
                reread: Option.exists(kept, (t) => rereadDue(t, today)),
              } satisfies Job,
              kept,
            }));
          });
        });

      /** Each spoken beat of `film`, its job, and its take as the cache keeps it. */
      const beatsOf = Effect.fn('ScriptVoices.beatsOf')(function* (film: FilmName) {
        return yield* beatsIn(yield* readings.reading(film));
      });

      /** Each spoken beat of a series draft, in the staging voice. */
      const draftBeatsOf = Effect.fn('ScriptVoices.draftBeatsOf')(function* (
        series: string,
        draft: string,
      ) {
        return yield* beatsIn(yield* drafts.reading(series, draft));
      });

      /** `jobs` queued, a signal for each one new. */
      const enqueue = (jobs: ReadonlyArray<Job>, urgent: boolean) =>
        Effect.gen(function* () {
          const added = yield* Ref.modify(state, (fill) => {
            const after = queued(fill, jobs, urgent);
            const size = (f: Fill) => f.urgent.length + f.background.length;
            return [size(after) - size(fill), after] as const;
          });
          yield* Queue.offerAll(
            signals,
            Arr.makeBy(added, () => {}),
          );
        });

      /** A beat's take as the reader shows it: ready, else voicing, else refused (past the cap, or misread), else unvoiced. */
      const takeOf = (fill: Fill, key: string, kept: Option.Option<StagedTake>): StagingTake => {
        const ready = Option.filter(kept, saysLine);
        if (Option.isSome(ready))
          return {
            _tag: 'Ready',
            file: ready.value.file,
            duration: ready.value.duration,
            words: ready.value.words,
          };
        if (asked(fill, key)) return { _tag: 'Voicing' };
        const refused = Option.fromNullishOr(fill.refused.get(key));
        if (Option.isSome(refused)) return { _tag: 'Refused', reason: refused.value };
        return Option.match(kept, {
          onSome: readyOrMisread,
          onNone: (): StagingTake => ({ _tag: 'Unvoiced' }),
        });
      };

      /** `beats` queued ahead of the background, and each one's take as it stands. */
      const voiced = (
        name: string,
        beats: ReadonlyArray<{ readonly job: Job; readonly kept: Option.Option<StagedTake> }>,
      ) =>
        Effect.gen(function* () {
          yield* enqueue(
            beats.filter(wanted).map((b) => b.job),
            true,
          );
          const fill = yield* Ref.get(state);
          const spent = yield* cache.today;
          return {
            film: name,
            spent: spent.spent,
            cap: spent.cap,
            beats: beats.map((b) => ({
              id: b.job.ask.beat.id,
              take: takeOf(fill, b.job.key, b.kept),
            })),
          } satisfies ScriptVoice;
        });

      const voice = Effect.fn('ScriptVoices.voice')(function* (film: FilmName) {
        return yield* voiced(film, yield* beatsOf(film));
      });

      const draft = Effect.fn('ScriptVoices.draft')(function* (series: string, name: string) {
        return yield* voiced(draftKey(series, name), yield* draftBeatsOf(series, name));
      });

      /** A new day asks again what the last refused. */
      const newDay = Effect.gen(function* () {
        const today = dayOf(yield* Clock.currentTimeMillis);
        yield* Ref.update(state, (fill) => {
          if (fill.day === today) return fill;
          return { ...fill, day: today, refused: new Map<string, string>() };
        });
      });

      /** Every film's beats with no take kept, queued behind the readers'. */
      const sweep = Effect.gen(function* () {
        yield* newDay;
        yield* Effect.forEach(
          yield* folder.names,
          (film) =>
            Effect.flatMap(
              Effect.provideService(filmNamed(film), FilmFolder, folder),
              beatsOf,
            ).pipe(
              Effect.flatMap((beats) =>
                enqueue(
                  beats.filter(wanted).map((b) => b.job),
                  false,
                ),
              ),
              // A film with no script or voice (a talk) has nothing to voice.
              Effect.catch((error) =>
                Effect.logDebug(`staging.fill.skip film=${film} reason=${error._tag}`),
              ),
            ),
          { discard: true },
        );
        // A series folder the box cannot read is said in the log; the films are voiced all the same.
        const keys = yield* drafts.keys.pipe(
          Effect.catch((error) =>
            Effect.as(Effect.logWarning(`staging.fill.series.unread reason=${error.message}`), []),
          ),
        );
        yield* Effect.forEach(
          keys,
          ([series, name]) =>
            draftBeatsOf(series, name).pipe(
              Effect.flatMap((beats) =>
                enqueue(
                  beats.filter(wanted).map((b) => b.job),
                  false,
                ),
              ),
              // A draft the reader cannot read is said where it is opened, not voiced.
              Effect.catch((error) =>
                Effect.logDebug(
                  `staging.fill.skip draft=${draftKey(series, name)} reason=${error._tag}`,
                ),
              ),
            ),
          { discard: true },
        );
      });

      /** Voice the next job: its take kept, or its refusal said in the reader. */
      const voiceNext = Effect.gen(function* () {
        yield* Queue.take(signals);
        const job = yield* Ref.modify(state, next);
        if (Option.isNone(job)) return;
        const { key, ask, heardAs } = job.value;
        const why = yield* narrator.stage(ask, heardAs, saysLine).pipe(
          Effect.as(Option.none<string>()),
          Effect.catch((error) =>
            Effect.as(
              Effect.logWarning(
                `staging.fill.refused id=${ask.beat.id} take=${key.slice(0, 12)} reason=${error._tag}`,
              ),
              Option.some(error.message),
            ),
          ),
        );
        yield* Ref.update(state, (fill) => settled(fill, key, why));
      });

      const fill = Effect.gen(function* () {
        yield* Ref.update(state, (f) => ({ ...f, running: true }));
        yield* Effect.log(`staging.fill on at_once=${VOICING_AT_ONCE}`);
        const voicers = Effect.forEach(
          Arr.range(1, VOICING_AT_ONCE),
          () => Effect.forever(voiceNext),
          { concurrency: VOICING_AT_ONCE },
        );
        // The sweep and the voicers end together: a sweep that dies ends the
        // fill (`fillBeside` logs it), never leaving voicers on a queue nothing feeds.
        return yield* Effect.all([Effect.repeat(sweep, Schedule.spaced(SWEEP_EVERY)), voicers], {
          concurrency: 'unbounded',
          discard: true,
        }).pipe(Effect.andThen(Effect.never));
      }).pipe(
        Effect.ensuring(Ref.update(state, (f) => ({ ...NO_FILL, refused: f.refused, day: f.day }))),
        Effect.scoped,
      );

      return ScriptVoices.of({ voice, draft, fill });
    }),
  );
}

/**
 * `fill` run beside the lab, in the caller's scope: a defect in it (a
 * voicer's die) ends the fill, logged as `staging.fill.died`, never the
 * lab. Interrupted with the scope.
 */
export const fillBeside = (fill: Effect.Effect<never>) =>
  Effect.forkScoped(
    Effect.catchDefect(fill, (defect) =>
      Effect.logError(`staging.fill.died cause="${String(defect)}"`),
    ),
  );

/**
 * Whether `film lab` keeps every beat's staging take ready
 * (`FILM_STAGING_FILL`): off unless it is `true`, since the fill spends
 * ElevenLabs characters, and only the owner's lab start says so.
 */
export const stagingFill = Config.Boolean('FILM_STAGING_FILL').pipe(Config.withDefault(false));
