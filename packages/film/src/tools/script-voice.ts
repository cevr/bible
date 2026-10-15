// A staging take kept ready for every spoken beat of every film the lab
// lists, so the Script reader plays a beat without asking for it. Each beat's
// take is the staging cache's (`staging.ts`), asked for by what the beat says
// now: its words, its marks, the film's voice and model (`stagingRequest`);
// a beat whose words, marks or voice changed has a new key, and is voiced
// again. Nothing here writes a film: its timings and its recorded takes are
// never touched (`film narrate` makes a cached take a film's own, at no
// cost).
//
// With the fill on (`FILM_STAGING_FILL`, on in `film lab`), a beat the
// cache keeps no take for is queued: the films a reader has open first, every
// other film's in the background as the sweep finds them, a few at a time.
// Each is charged against the day's cap before it is sent; past the cap it is
// refused, said in the reader, and asked again the next day. A beat is asked
// for once a session: a refusal stands until the day turns.

import {
  Array as Arr,
  Clock,
  Config,
  Context,
  DateTime,
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
import type { HeardAs, Voice } from '../core/schema.ts';
import type { ReadBeat } from '../core/studio.ts';
import type { StoreError } from './content-store.ts';
import { FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import type { FreshError } from './fresh-film.ts';
import { Narrator } from './narrator.ts';
import { type StagingAsk, StagingCache, stagingRequest } from './staging.ts';
import { StudioReadings } from './studio.ts';

/** How many takes are voiced at once. */
const VOICING_AT_ONCE = 2;

/** How often the fill looks for beats no take is kept for, in every film. */
const SWEEP_EVERY = Duration.minutes(1);

/** A beat to voice: its request's key, what to ask, and how speech-to-text spells the film's names. */
interface Job {
  readonly key: string;
  readonly ask: StagingAsk;
  readonly heardAs: HeardAs;
}

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

/** `jobs` queued in `fill`: urgent ones first (moved up when already queued behind), none twice, none refused. */
const queued = (fill: Fill, jobs: ReadonlyArray<Job>, urgent: boolean): Fill => {
  if (!fill.running) return fill;
  const fresh = jobs.filter((j) => !fill.refused.has(j.key) && !fill.voicing.has(j.key));
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
      const state = yield* Ref.make(NO_FILL);
      // One signal per job queued: a voicer waits on it, then takes the readers' first.
      const signals = yield* Queue.unbounded<void>();

      /** Each spoken beat of `film`, its job, and its take as the cache keeps it. */
      const beatsOf = Effect.fn('ScriptVoices.beatsOf')(function* (film: FilmName) {
        const reading = yield* readings.reading(film);
        return yield* Effect.forEach(asksOf(reading.voice, reading.beats), (ask) => {
          const key = stagingRequest(ask).key;
          return Effect.map(cache.get(key), (kept) => ({
            job: { key, ask, heardAs: reading.heardAs } satisfies Job,
            kept,
          }));
        });
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

      const takeOf = (fill: Fill, key: string, kept: Option.Option<StagingTake>): StagingTake =>
        Option.getOrElse(kept, () =>
          Option.match(Option.fromNullishOr(fill.refused.get(key)), {
            onSome: (reason): StagingTake => ({ _tag: 'Refused', reason }),
            onNone: (): StagingTake => {
              if (asked(fill, key)) return { _tag: 'Voicing' };
              return { _tag: 'Unvoiced' };
            },
          }),
        );

      const voice = Effect.fn('ScriptVoices.voice')(function* (film: FilmName) {
        const beats = yield* beatsOf(film);
        yield* enqueue(
          beats.filter((b) => Option.isNone(b.kept)).map((b) => b.job),
          true,
        );
        const fill = yield* Ref.get(state);
        const spent = yield* cache.today;
        return {
          film,
          spent: spent.spent,
          cap: spent.cap,
          beats: beats.map((b) => ({
            id: b.job.ask.beat.id,
            take: takeOf(
              fill,
              b.job.key,
              Option.map(b.kept, (t): StagingTake => ({
                _tag: 'Ready',
                file: t.file,
                duration: t.duration,
                words: t.words,
              })),
            ),
          })),
        } satisfies ScriptVoice;
      });

      /** A new day asks again what the last refused. */
      const newDay = Effect.gen(function* () {
        const today = DateTime.formatIsoDate(
          DateTime.makeZonedUnsafe(yield* Clock.currentTimeMillis, {
            timeZone: DateTime.zoneMakeLocal(),
          }),
        );
        yield* Ref.update(state, (fill) => {
          if (fill.day === today) return fill;
          return { ...fill, day: today, refused: new Map() };
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
                  beats.filter((b) => Option.isNone(b.kept)).map((b) => b.job),
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
      });

      /** Voice the next job: its take kept, or its refusal said in the reader. */
      const voiceNext = Effect.gen(function* () {
        yield* Queue.take(signals);
        const job = yield* Ref.modify(state, next);
        if (Option.isNone(job)) return;
        const { key, ask, heardAs } = job.value;
        const why = yield* narrator.stage(ask, heardAs).pipe(
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
        yield* Effect.forkScoped(Effect.repeat(sweep, Schedule.spaced(SWEEP_EVERY)));
        return yield* Effect.forEach(
          Arr.range(1, VOICING_AT_ONCE),
          () => Effect.forever(voiceNext),
          { concurrency: VOICING_AT_ONCE },
        ).pipe(Effect.andThen(Effect.never));
      }).pipe(
        Effect.ensuring(Ref.update(state, (f) => ({ ...NO_FILL, refused: f.refused, day: f.day }))),
        Effect.scoped,
      );

      return ScriptVoices.of({ voice, fill });
    }),
  );
}

/** Whether `film lab` keeps every beat's staging take ready (`FILM_STAGING_FILL`): on unless it is `false`. */
export const stagingFill = Config.Boolean('FILM_STAGING_FILL').pipe(Config.withDefault(true));
