// ElevenLabs through its CLI: speech and dialogue with timestamps,
// speech-to-text, music and sound effects. Every request body is encoded and
// every response decoded with Schema. Calls authenticate with an API key, from
// ELEVENLABS_API_KEY or the Keychain entry of that name, when there is one,
// and fall back to the CLI's OAuth login, which covers everything but sound
// effects.

import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Result,
  Schema,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import type { Line } from '../core/narration.ts';
import { type Cast, MusicModel, Plan, type Reader, type Word } from '../core/schema.ts';
import { ApiKeyMissing, ElevenLabsFailed, SttUntimed } from './errors.ts';
import { type Finished, collect, isNotFound } from './process.ts';

const OUTPUT_FORMAT = 'mp3_44100_192';

// Request bodies. Field order is what the CLI has always been sent.

const OutputParams = Schema.fromJsonString(Schema.Struct({ output_format: Schema.String }));

const TtsParams = Schema.fromJsonString(
  Schema.Struct({ voice_id: Schema.String, output_format: Schema.String }),
);

const TtsBody = Schema.fromJsonString(
  Schema.Struct({
    text: Schema.String,
    model_id: Schema.String,
    voice_settings: Schema.Record(Schema.String, Schema.Finite),
    previous_text: Schema.optionalKey(Schema.String),
    next_text: Schema.optionalKey(Schema.String),
  }),
);

const DialogueBody = Schema.fromJsonString(
  Schema.Struct({
    inputs: Schema.Array(Schema.Struct({ text: Schema.String, voice_id: Schema.String })),
    model_id: Schema.String,
    settings: Schema.Struct({ stability: Schema.Finite }),
  }),
);

const MusicBody = Schema.fromJsonString(
  Schema.Struct({ composition_plan: Plan, model_id: MusicModel }),
);

const SoundEffectBody = Schema.fromJsonString(
  Schema.Struct({
    text: Schema.String,
    duration_seconds: Schema.Finite,
    prompt_influence: Schema.Finite,
    model_id: Schema.String,
  }),
);

// Responses.

/** `auth status`: each credential scheme and whether it is logged in. */
const AuthStatus = Schema.fromJsonString(
  Schema.Struct({
    schemes: Schema.Array(Schema.Struct({ scheme: Schema.String, logged_in: Schema.Boolean })),
  }),
);

/** `text-to-speech convert_with_timestamps`: the audio, and when each character is spoken. */
export const TtsResponse = Schema.Struct({
  audio_base64: Schema.String,
  alignment: Schema.Struct({
    characters: Schema.Array(Schema.String),
    character_start_times_seconds: Schema.Array(Schema.Finite),
    character_end_times_seconds: Schema.Array(Schema.Finite),
  }),
});
export type TtsResponse = typeof TtsResponse.Type;

/**
 * `text-to-dialogue convert_with_timestamps`: as for speech, over the lines
 * joined with nothing between them, and where each voice's stretch starts.
 */
export const DialogueResponse = Schema.Struct({
  ...TtsResponse.fields,
  voice_segments: Schema.Array(
    Schema.Struct({ character_start_index: Schema.Int, voice_id: Schema.String }),
  ),
});
export type DialogueResponse = typeof DialogueResponse.Type;

/** One stretch of a transcript: a word, the spacing after it, or a sound (`(breath)`). */
const SttWord = Schema.Struct({
  text: Schema.String,
  start: Schema.Finite,
  end: Schema.Finite,
  type: Schema.String,
});

/**
 * `speech-to-text convert`: what a take actually says, and when each word of
 * it was heard (a person's take is timed by these).
 */
export const SttResponse = Schema.Struct({
  text: Schema.String,
  /** Absent when the reply carries no timestamps: `heardWords` refuses that for a take. */
  words: Schema.optionalKey(Schema.Array(SttWord)),
});
export type SttResponse = typeof SttResponse.Type;

/**
 * The words a transcript heard, in order, with their times: spacing and sound
 * events left out. A reply whose text has words but whose timestamps time
 * none of them fails `SttUntimed`: a take timed by nothing would place every
 * script word in one guessed gap. A reply that heard nothing has no words.
 */
export const heardWords = (
  reply: SttResponse,
  file: string,
): Result.Result<ReadonlyArray<Word>, SttUntimed> => {
  const timed = Option.getOrElse(
    Option.fromNullishOr(reply.words),
    (): (typeof SttWord.Type)[] => [],
  )
    .filter((w) => w.type === 'word')
    .map((w) => ({ text: w.text, start: w.start, end: Math.max(w.start, w.end) }));
  const heard = reply.text.split(/\s+/).filter((w) => w.length > 0).length;
  if (heard > 0 && timed.length === 0) return Result.fail(SttUntimed.make({ file, heard }));
  return Result.succeed(timed);
};

export interface TtsRequest {
  readonly text: string;
  readonly voice: Reader;
  /** The neighbouring lines, so a take continues the read (models before v3 only). */
  readonly previousText: string;
  readonly nextText: string;
}

export interface DialogueRequest {
  /** The take's lines in order, each with its voice. */
  readonly lines: ReadonlyArray<Line>;
  readonly cast: Cast;
}

export interface SoundEffectRequest {
  readonly prompt: string;
  readonly secs: number;
}

export interface ElevenLabsService {
  readonly tts: (request: TtsRequest) => Effect.Effect<TtsResponse, ElevenLabsFailed>;
  readonly dialogue: (
    request: DialogueRequest,
  ) => Effect.Effect<DialogueResponse, ElevenLabsFailed>;
  readonly stt: (file: string) => Effect.Effect<SttResponse, ElevenLabsFailed>;
  /** Compose the score from its plan into `out`. */
  readonly composeMusic: (
    plan: Plan,
    model: typeof MusicModel.Type,
    out: string,
  ) => Effect.Effect<void, ElevenLabsFailed>;
  /** Preflight: the CLI is installed and logged in (free: reads the local credential store). */
  readonly ready: Effect.Effect<void, ElevenLabsFailed>;
  /** The key sound effects need; resolved once. */
  readonly apiKey: Effect.Effect<Redacted.Redacted<string>, ApiKeyMissing>;
  readonly soundEffect: (
    request: SoundEffectRequest,
    out: string,
  ) => Effect.Effect<void, ElevenLabsFailed | ApiKeyMissing>;
}

/** v3 reads each line alone; earlier models take the neighbouring text as context. */
const ttsBody = (request: TtsRequest) => {
  const body = {
    text: request.text,
    model_id: request.voice.model,
    voice_settings: request.voice.settings,
  };
  if (request.voice.model === 'eleven_v3') return body;
  return { ...body, previous_text: request.previousText, next_text: request.nextText };
};

const failed = (op: string) => (error: Schema.SchemaError | PlatformError) =>
  ElevenLabsFailed.make({ op, exitCode: -1, reason: error.message });

export class ElevenLabs extends Context.Service<ElevenLabs, ElevenLabsService>()(
  '@bible/film/tools/ElevenLabs',
) {
  /** Through the `elevenlabs` CLI. */
  static readonly layer = Layer.effect(
    ElevenLabs,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const exec = (op: string, command: ChildProcess.Command) =>
        collect(spawner, command).pipe(
          Effect.mapError(failed(op)),
          Effect.flatMap((done: Finished) => {
            if (done.exitCode === 0) return Effect.succeed(done.stdout);
            const reason = [done.stderr.trim(), done.stdout.trim()].filter((s) => s !== '');
            return Effect.fail(
              ElevenLabsFailed.make({ op, exitCode: done.exitCode, reason: reason.join('\n') }),
            );
          }),
        );

      /** The environment first, then the Keychain; an empty value counts as none. */
      const lookupKey = Effect.gen(function* () {
        const env = yield* Config.option(Config.Redacted('ELEVENLABS_API_KEY')).pipe(
          Effect.orElseSucceed(() => Option.none<Redacted.Redacted<string>>()),
        );
        const fromEnv = Option.filter(env, (key) => Redacted.value(key).length > 0);
        if (Option.isSome(fromEnv)) return fromEnv.value;
        const keychain = yield* collect(
          spawner,
          ChildProcess.make('security', [
            'find-generic-password',
            '-s',
            'ELEVENLABS_API_KEY',
            '-w',
          ]),
        ).pipe(Effect.orElseSucceed((): Finished => ({ exitCode: 1, stdout: '', stderr: '' })));
        const key = keychain.stdout.trim();
        if (keychain.exitCode === 0 && key.length > 0) return Redacted.make(key);
        return yield* ApiKeyMissing.make({});
      });
      const apiKey = yield* Effect.cached(lookupKey);

      /**
       * `elevenlabs <args>`, authenticated by the API key when there is one. The
       * CLI's OAuth login refreshes its token on use, and concurrent calls race
       * that refresh: the losers present a spent refresh token and the login is
       * revoked mid-run. A key has no refresh, so calls with one run in
       * parallel; calls on the login run one at a time.
       */
      const oauth = yield* Semaphore.make(1);
      const elevenlabs = (op: string, args: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const key = yield* Effect.option(apiKey);
          return yield* Option.match(key, {
            onNone: () =>
              oauth.withPermits(1)(exec(op, ChildProcess.make('elevenlabs', [...args]))),
            onSome: (k) =>
              exec(
                op,
                ChildProcess.make('elevenlabs', [...args], {
                  env: { ELEVENLABS_API_KEY: Redacted.value(k) },
                  extendEnv: true,
                }),
              ),
          });
        });

      const encodeBody = <A>(op: string, schema: Schema.Codec<A, string>, value: A) =>
        Schema.encodeEffect(schema)(value).pipe(Effect.mapError(failed(op)));

      const decodeReply = <A>(op: string, schema: Schema.Codec<A, string>, raw: string) =>
        Schema.decodeEffect(schema)(raw).pipe(
          Effect.mapError((error) =>
            ElevenLabsFailed.make({
              op,
              exitCode: 0,
              reason: `${error.message}\n${raw.slice(0, 400)}`,
            }),
          ),
        );

      const tts = Effect.fn('ElevenLabs.tts')(function* (request: TtsRequest) {
        const params = yield* encodeBody('tts', TtsParams, {
          voice_id: request.voice.voiceId,
          output_format: OUTPUT_FORMAT,
        });
        const body = yield* encodeBody('tts', TtsBody, ttsBody(request));
        const raw = yield* elevenlabs('tts', [
          'text-to-speech',
          'convert_with_timestamps',
          '--params',
          params,
          '--json',
          body,
          '--format',
          'json',
        ]);
        return yield* decodeReply('tts', Schema.fromJsonString(TtsResponse), raw);
      });

      const dialogue = Effect.fn('ElevenLabs.dialogue')(function* (request: DialogueRequest) {
        const params = yield* encodeBody('dialogue', OutputParams, {
          output_format: OUTPUT_FORMAT,
        });
        const body = yield* encodeBody('dialogue', DialogueBody, {
          inputs: request.lines.map((line) => ({ text: line.text, voice_id: line.voiceId })),
          model_id: request.cast.model,
          settings: request.cast.settings,
        });
        const raw = yield* elevenlabs('dialogue', [
          'text-to-dialogue',
          'convert_with_timestamps',
          '--params',
          params,
          '--json',
          body,
          '--format',
          'json',
        ]);
        return yield* decodeReply('dialogue', Schema.fromJsonString(DialogueResponse), raw);
      });

      const stt = Effect.fn('ElevenLabs.stt')(function* (file: string) {
        const raw = yield* elevenlabs('stt', [
          'speech-to-text',
          'convert',
          '--model-id',
          'scribe_v1',
          '--file',
          file,
          '--format',
          'json',
        ]);
        return yield* decodeReply('stt', Schema.fromJsonString(SttResponse), raw);
      });

      const composeMusic = Effect.fn('ElevenLabs.composeMusic')(function* (
        plan: Plan,
        model: typeof MusicModel.Type,
        out: string,
      ) {
        const params = yield* encodeBody('music', OutputParams, { output_format: OUTPUT_FORMAT });
        const body = yield* encodeBody('music', MusicBody, {
          composition_plan: plan,
          model_id: model,
        });
        yield* elevenlabs('music', [
          'music',
          'compose',
          '--params',
          params,
          '--json',
          body,
          '--output',
          out,
        ]);
      });

      const checkReady = Effect.fn('ElevenLabs.ready')(function* () {
        if (Option.isSome(yield* Effect.option(apiKey))) return;
        const done = yield* collect(
          spawner,
          ChildProcess.make('elevenlabs', ['auth', 'status', '--format', 'json']),
        ).pipe(
          Effect.mapError((error) => {
            if (isNotFound(error))
              return ElevenLabsFailed.make({
                op: 'auth',
                exitCode: -1,
                reason:
                  'the elevenlabs CLI is not on PATH; install it, then run: elevenlabs auth login',
              });
            return failed('auth')(error);
          }),
        );
        if (done.exitCode !== 0)
          return yield* ElevenLabsFailed.make({
            op: 'auth',
            exitCode: done.exitCode,
            reason: done.stderr.trim(),
          });
        const status = yield* decodeReply('auth', AuthStatus, done.stdout);
        if (status.schemes.some((s) => s.logged_in)) return;
        return yield* ElevenLabsFailed.make({
          op: 'auth',
          exitCode: 0,
          reason: 'not logged in; run: elevenlabs auth login',
        });
      });
      const ready = checkReady();

      const soundEffect = Effect.fn('ElevenLabs.soundEffect')(function* (
        request: SoundEffectRequest,
        out: string,
      ) {
        yield* apiKey;
        const params = yield* encodeBody('sfx', OutputParams, { output_format: OUTPUT_FORMAT });
        const body = yield* encodeBody('sfx', SoundEffectBody, {
          text: request.prompt,
          duration_seconds: request.secs,
          prompt_influence: 0.5,
          model_id: 'eleven_text_to_sound_v2',
        });
        yield* elevenlabs('sfx', [
          'text-to-sound-effects',
          'convert',
          '--params',
          params,
          '--json',
          body,
          '--output',
          out,
        ]);
      });

      return ElevenLabs.of({ tts, dialogue, stt, composeMusic, ready, apiKey, soundEffect });
    }),
  );
}
