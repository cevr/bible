// Staging takes, kept by what was asked for: a beat's line compiled with its
// delivery marks for its voice and model (`core/delivery.ts`) is one request,
// and what it made is kept in a cache outside every film's narration, twice:
// the reading, as ElevenLabs sent it, under the SHA-256 of what was sent, and
// the take, that reading with each hold set in it, under the SHA-256 of both.
// The same words, marks, voice and model never cost a second time, whoever
// asks (the lab's reader keeping a take ready, or `film narrate` making a
// film's take current), nor does a hold's seconds changed, and two asking at
// once make one reading. Audio is kept under the SHA-256 of its bytes, so a
// name never comes to hold other audio. A person's take is never touched:
// the cache holds staging takes only.
//
// Every request is charged before it is sent, against a cap on the day's
// characters (`FILM_STAGING_DAILY_CAP`, 100,000 by default): past it a take
// is refused (`StagingCapReached`) and nothing is sent. The day's spend is
// kept beside the takes (`spend.json`), one writer at a time across
// processes. Nothing here logs a credential: the requests carry none.

import {
  Array as Arr,
  Clock,
  Config,
  Context,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Result,
  Schedule,
  Schema,
} from 'effect';
import { type Compiled, compileDelivery, sentText } from '../core/delivery.ts';
import type { Line } from '../core/narration.ts';
import { StagingCapReached } from '../core/refusals.ts';
import { type Cast, type Reader, type Voice, Seconds, TakeWord, isCast } from '../core/schema.ts';
import { STAGING_VOICE_ID, STAGING_VOICE_PACE } from '../core/staging-voice.ts';
import type { ReadBeat } from '../core/studio.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { sha256Hex } from './digest.ts';
import { type DialogueRequest, type TtsRequest, sendsNeighbours } from './elevenlabs.ts';

/** A kept take's audio, as the cache names it: the SHA-256 of its bytes and its kind. */
const TAKE_AUDIO = /^[0-9a-f]{64}\.(?:mp3|flac)$/;

/**
 * The name a take's audio is kept under: the SHA-256 of its bytes, so a
 * name always holds the same audio (the lab serves it as immutable) and a
 * reading made afresh is a new name, never the old one overwritten.
 */
export const audioName = (audio: Uint8Array, ext: '.mp3' | '.flac'): string =>
  `${sha256Hex(audio)}${ext}`;

/** The characters a day may spend on staging takes when `FILM_STAGING_DAILY_CAP` names none. */
const STAGING_DAILY_CAP = 100_000;

/** A voice's own pace, in words a minute, where it is measured: what a model that takes a speed is aimed from. */
const VOICE_PACE: ReadonlyMap<string, number> = new Map([[STAGING_VOICE_ID, STAGING_VOICE_PACE]]);

/** A beat to stage: its line, who reads it, and the lines either side (sent only to models that take them). */
export interface StagingAsk {
  readonly beat: ReadBeat;
  readonly voice: Voice;
  readonly previous: string;
  readonly next: string;
}

/** What is sent for a beat: one voice's text-to-speech, or a cast's dialogue. */
type SpeechRequest =
  | { readonly _tag: 'Tts'; readonly request: TtsRequest }
  | { readonly _tag: 'Dialogue'; readonly request: DialogueRequest };

/** A beat's request, compiled: what is sent, what is done to the take after, its cost and its key. */
export interface StagingRequest {
  readonly speech: SpeechRequest;
  readonly compiled: Compiled;
  /** The characters ElevenLabs counts: every character of the text sent. */
  readonly characters: number;
  /** The SHA-256 of what is sent: the reading ElevenLabs makes, and what it costs, kept under it. */
  readonly sent: string;
  /** The SHA-256 of everything the take depends on (what is sent, and each hold set in it after): the take's key. */
  readonly key: string;
}

/** Each line's words, `[from, to)` in the beat's words. */
const wordRanges = (lines: ReadonlyArray<Line>) =>
  lines.reduce<ReadonlyArray<{ readonly line: Line; readonly from: number; readonly to: number }>>(
    (ranges, line) => {
      const from = Option.getOrElse(
        Option.map(Arr.last(ranges), (r) => r.to),
        () => 0,
      );
      const words = line.text.split(/\s+/).filter((w) => w.length > 0).length;
      return [...ranges, { line, from, to: from + words }];
    },
    [],
  );

/**
 * A beat's staging request: its words compiled with its marks for its
 * voice's model, a cast's lines each sent its own words, a reader sent the
 * speed that aims its measured pace at `PACE.aim` where the model takes one
 * (a speed `voice.ts` names wins), and the key of all of it. Pure.
 */
export const stagingRequest = (ask: StagingAsk): StagingRequest => {
  const words = ask.beat.text.split(/\s+/).filter((w) => w.length > 0);
  const { voice } = ask;
  if (isCast(voice)) return dialogueRequest(ask, voice, words);
  return speechRequest(ask, voice, words);
};

/** A cast's beat as one dialogue, each line sent its own words compiled. */
const dialogueRequest = (
  ask: StagingAsk,
  cast: Cast,
  words: ReadonlyArray<string>,
): StagingRequest => {
  const compiled = compileDelivery(words, ask.beat.delivery, cast.model);
  const lines = wordRanges(ask.beat.lines).map(({ line, from, to }): Line => ({
    ...line,
    text: sentText(compiled, from, to),
  }));
  return {
    speech: { _tag: 'Dialogue', request: { lines, cast } },
    compiled,
    characters: lines.reduce((sum, l) => sum + l.text.length, 0),
    ...keysOf(compiled, {
      op: 'dialogue',
      model: cast.model,
      settings: settingsKey(cast.settings),
      inputs: lines.map((l) => [l.voiceId, l.text] as const),
      previous: '',
      next: '',
    }),
  };
};

/**
 * One reader's beat through text-to-speech: its words compiled, the speed
 * that aims its measured pace at 155 where the model takes one (a `speed`
 * its settings name wins), and its neighbours where the model takes them.
 */
const speechRequest = (
  ask: StagingAsk,
  reader: Reader,
  words: ReadonlyArray<string>,
): StagingRequest => {
  const compiled = compileDelivery(
    words,
    ask.beat.delivery,
    reader.model,
    Option.fromNullishOr(VOICE_PACE.get(reader.voiceId)),
  );
  const settings = Option.match(compiled.speed, {
    onNone: () => reader.settings,
    onSome: (speed) => ({ speed, ...reader.settings }),
  });
  const text = sentText(compiled);
  const { previous, next } = neighboursOf(ask, reader.model);
  return {
    speech: {
      _tag: 'Tts',
      request: { text, voice: { ...reader, settings }, previousText: previous, nextText: next },
    },
    compiled,
    characters: text.length,
    ...keysOf(compiled, {
      op: 'tts',
      model: reader.model,
      settings: settingsKey(settings),
      inputs: [[reader.voiceId, text]],
      previous,
      next,
    }),
  };
};

/** The lines either side, as a model is sent them: none to v4 and v3 (`sendsNeighbours`). */
const neighboursOf = (ask: StagingAsk, model: string) => {
  if (sendsNeighbours(model)) return { previous: ask.previous, next: ask.next };
  return { previous: '', next: '' };
};

/** A request as its key is made: every field that changes the take, settings by name. */
const RequestKey = Schema.fromJsonString(
  Schema.Struct({
    op: Schema.Literals(['tts', 'dialogue']),
    model: Schema.String,
    settings: Schema.Array(Schema.Tuple([Schema.String, Schema.Finite])),
    /** Each line's voice and the text it is sent. */
    inputs: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
    previous: Schema.String,
    next: Schema.String,
  }),
);

/** Settings by name, so the same settings written in another order key the same. */
const settingsKey = (settings: Readonly<Record<string, number>>) =>
  Object.entries(settings).toSorted(([a], [b]) => a.localeCompare(b));

/** The holds set in a take, as its key has them: each gap's word and seconds, in order. */
const HoldsKey = Schema.fromJsonString(Schema.Array(Schema.Tuple([Schema.Int, Schema.Finite])));

/**
 * A request's two keys, under the cache's version: `sent`, the SHA-256 of
 * what is sent (the reading), and `key`, of the reading with each hold set
 * in it after (the take). Holds stand apart because v4 and v3 are sent one
 * `[pause]` for every pause: a hold's seconds changed is the same reading,
 * set again, at no cost.
 */
const keysOf = (compiled: Compiled, request: typeof RequestKey.Type) => {
  const sent = sha256Hex(`staging/2 sent ${Schema.encodeSync(RequestKey)(request)}`);
  const holds = compiled.holds
    .map((h) => [h.before, h.seconds] as const)
    .toSorted(([a], [b]) => a - b);
  return { sent, key: sha256Hex(`staging/2 take ${sent} ${Schema.encodeSync(HoldsKey)(holds)}`) };
};

/** A staging take as the cache keeps it: the take narrate would keep, ready to hear or make current. */
export const StagedTake = Schema.Struct({
  /** Its audio's name in the cache (`audioName`): an `.mp3` as sent, or a `.flac` once a hold or the tail was set in it. */
  file: Schema.String,
  duration: Seconds,
  words: Schema.Array(TakeWord),
  /** What speech-to-text heard it say. */
  heard: Schema.String,
  wer: Schema.Finite,
  /** The characters it cost. */
  characters: Schema.Int,
  /** When it was made, epoch milliseconds. */
  at: Schema.Finite,
});
export type StagedTake = typeof StagedTake.Type;

/** A request's record in the cache: absent (`null` on disk) until a take is kept for it. */
const StagedJson = Schema.fromJsonString(Schema.OptionFromNullOr(StagedTake));

/** The characters spent on staging takes, by local day (`YYYY-MM-DD`). */
const Spend = Schema.Struct({ days: Schema.Record(Schema.String, Schema.Int) });
type Spend = typeof Spend.Type;
const SpendJson = Schema.fromJsonString(Spend);

/** A day's staging spend against its cap. */
interface Spent {
  readonly day: string;
  readonly spent: number;
  readonly cap: number;
}

/** The local day of epoch milliseconds `ms`: `YYYY-MM-DD`. */
export const dayOf = (ms: number): string =>
  DateTime.formatIsoDate(DateTime.makeZonedUnsafe(ms, { timeZone: DateTime.zoneMakeLocal() }));

/** The spend with `characters` charged to `day`, or the cap that refuses them. Pure. */
const charged = (
  spend: Spend,
  day: string,
  characters: number,
  cap: number,
): Result.Result<Spend, StagingCapReached> => {
  const spent = spend.days[day] ?? 0;
  if (spent + characters > cap)
    return Result.fail(StagingCapReached.make({ day, spent, asked: characters, cap }));
  // Only today is kept with the last few days; older days are dropped.
  const kept = Object.entries(spend.days)
    .filter(([d]) => d !== day)
    .toSorted(([a], [b]) => b.localeCompare(a))
    .slice(0, 13);
  return Result.succeed({ days: { ...Object.fromEntries(kept), [day]: spent + characters } });
};

/** A take and its audio, as made. */
export interface Made {
  readonly take: StagedTake;
  readonly audio: Uint8Array;
}

/** A take and its audio, and whether the cache kept it already. */
type Reading = Made & { readonly cached: boolean };

/** How long a reading's second asker waits for the first's: a reading takes seconds, its lock's tries a few. */
const READING_WAIT = { times: 60, every: Duration.seconds(1) } as const;

interface StagingCacheService {
  /** The take a request made, when the cache holds it and its audio. */
  readonly get: (key: string) => Effect.Effect<Option.Option<StagedTake>, StoreError>;
  /** A take made for a request, kept: its audio first, then its record naming it. */
  readonly put: (
    key: string,
    take: StagedTake,
    audio: Uint8Array,
  ) => Effect.Effect<void, StoreError>;
  /**
   * The reading `sent` names (a take as ElevenLabs sent it): the cache's,
   * when it keeps one `reuse` accepts, else `make`'s, kept. One maker at a
   * time for a reading, across processes: whoever asks second waits its
   * turn, then finds the first's and makes nothing, spends nothing.
   */
  readonly reading: <E, R>(
    sent: string,
    reuse: (take: StagedTake) => boolean,
    make: Effect.Effect<Made, E, R>,
  ) => Effect.Effect<Reading, E | StoreError, R>;
  /** Where a kept take's audio is. */
  readonly audioOf: (take: StagedTake) => string;
  /** Where the audio a take names as `file` is, when the cache keeps it: none for any other name. */
  readonly audioNamed: (file: string) => Effect.Effect<Option.Option<string>, StoreError>;
  /** Charge the day `characters`, or refuse them past the cap: nothing is charged then. */
  readonly charge: (characters: number) => Effect.Effect<Spent, StagingCapReached | StoreError>;
  /** The day's spend so far. */
  readonly today: Effect.Effect<Spent, StoreError>;
}

export class StagingCache extends Context.Service<StagingCache, StagingCacheService>()(
  '@bible/film/tools/StagingCache',
) {
  /** The cache in `dir`, its days capped at `cap` characters. */
  static readonly layer = (dir: string, cap: number = STAGING_DAILY_CAP) =>
    Layer.effect(
      StagingCache,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* ContentStore;
        const takes = path.join(dir, 'takes');
        const record = (key: string): Manifest<Option.Option<StagedTake>> => ({
          file: path.join(takes, `${key}.json`),
          codec: StagedJson,
          empty: Option.none(),
        });
        const ledger: Manifest<Spend> = {
          file: path.join(dir, 'spend.json'),
          codec: SpendJson,
          empty: { days: {} },
        };
        const audioOf = (take: StagedTake) => path.join(takes, take.file);
        const day = Effect.map(Clock.currentTimeMillis, dayOf);

        const get = Effect.fn('StagingCache.get')(function* (key: string) {
          const kept = yield* store.read(record(key));
          if (Option.isNone(kept)) return kept;
          if (yield* fs.exists(audioOf(kept.value))) return kept;
          return Option.none();
        });

        const audioNamed = Effect.fn('StagingCache.audioNamed')(function* (file: string) {
          const named = Option.map(
            Option.liftPredicate(file, (f) => TAKE_AUDIO.test(f)),
            (f) => path.join(takes, f),
          );
          if (Option.isNone(named)) return named;
          const kept = yield* fs.exists(named.value);
          return Option.filter(named, () => kept);
        });

        const put = Effect.fn('StagingCache.put')(function* (
          key: string,
          take: StagedTake,
          audio: Uint8Array,
        ) {
          yield* fs.makeDirectory(takes, { recursive: true });
          yield* store.writeFile(audioOf(take), audio);
          yield* store.update(record(key), () => Option.some(take));
        });

        const reading = <E, R>(
          sent: string,
          reuse: (take: StagedTake) => boolean,
          make: Effect.Effect<Made, E, R>,
        ) =>
          store
            .transact(record(sent), (current) =>
              Effect.gen(function* () {
                // Read under the reading's lock: one made while this one waited is found.
                const kept = Option.filter(current, reuse);
                if (Option.isSome(kept) && (yield* fs.exists(audioOf(kept.value)))) {
                  const audio = yield* fs.readFile(audioOf(kept.value));
                  const found: Reading = { take: kept.value, audio, cached: true };
                  return [found, current] as const;
                }
                const made = yield* make;
                yield* fs.makeDirectory(takes, { recursive: true });
                yield* store.writeFile(audioOf(made.take), made.audio);
                const read: Reading = { ...made, cached: false };
                return [read, Option.some(made.take)] as const;
              }),
            )
            .pipe(
              Effect.retry({
                while: (error) => Predicate.isTagged(error, 'StoreLocked'),
                times: READING_WAIT.times,
                schedule: Schedule.spaced(READING_WAIT.every),
              }),
              Effect.withSpan('StagingCache.reading'),
            );

        const charge = Effect.fn('StagingCache.charge')(function* (characters: number) {
          const today = yield* day;
          yield* fs.makeDirectory(dir, { recursive: true });
          const spend = yield* store.modify(ledger, (spend) =>
            charged(spend, today, characters, cap),
          );
          const spent = spend.days[today] ?? 0;
          yield* Effect.log(
            `staging.spent chars=${characters} day=${today} total=${spent} cap=${cap}`,
          );
          return { day: today, spent, cap };
        });

        const today = Effect.gen(function* () {
          const d = yield* day;
          const spend = yield* store.read(ledger);
          return { day: d, spent: spend.days[d] ?? 0, cap };
        });

        return StagingCache.of({ get, put, reading, audioOf, audioNamed, charge, today });
      }),
    );

  /**
   * The cache `FILM_STAGING_DIR` names (`~/.cache/bible-film/staging` by
   * default), capped by `FILM_STAGING_DAILY_CAP` characters a day.
   */
  static readonly fromConfig = Layer.unwrap(
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const home = yield* Config.String('HOME').pipe(Config.withDefault('.'));
      const dir = yield* Config.String('FILM_STAGING_DIR').pipe(
        Config.withDefault(path.join(home, '.cache', 'bible-film', 'staging')),
      );
      const cap = yield* Config.Int('FILM_STAGING_DAILY_CAP').pipe(
        Config.withDefault(STAGING_DAILY_CAP),
      );
      return StagingCache.layer(dir, cap);
    }),
  );
}
