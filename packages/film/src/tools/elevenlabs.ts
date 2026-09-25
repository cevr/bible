// ElevenLabs through its CLI, whose OAuth login already sits in the Keychain:
// speech with timestamps, speech-to-text, music and sound effects. Every
// request body is encoded and every response decoded with Schema. Sound
// effects are the exception to the login: they need an API key, from
// ELEVENLABS_API_KEY or the Keychain entry of that name.

import { Config, Context, Effect, Layer, Option, Redacted, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { MusicModel, Plan, type Voice } from '../core/schema.ts';
import { ApiKeyMissing, ElevenLabsFailed } from './errors.ts';
import { type Finished, collect } from './process.ts';

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

/** `speech-to-text convert`: what a take actually says. */
export const SttResponse = Schema.Struct({ text: Schema.String });
export type SttResponse = typeof SttResponse.Type;

export interface TtsRequest {
  readonly text: string;
  readonly voice: Voice;
  /** The neighbouring lines, so a take continues the read (models before v3 only). */
  readonly previousText: string;
  readonly nextText: string;
}

export interface SoundEffectRequest {
  readonly prompt: string;
  readonly secs: number;
}

export interface ElevenLabsService {
  readonly tts: (request: TtsRequest) => Effect.Effect<TtsResponse, ElevenLabsFailed>;
  readonly stt: (file: string) => Effect.Effect<SttResponse, ElevenLabsFailed>;
  /** Compose the score from its plan into `out`. */
  readonly composeMusic: (
    plan: Plan,
    model: typeof MusicModel.Type,
    out: string,
  ) => Effect.Effect<void, ElevenLabsFailed>;
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
        const raw = yield* exec(
          'tts',
          ChildProcess.make('elevenlabs', [
            'text-to-speech',
            'convert_with_timestamps',
            '--params',
            params,
            '--json',
            body,
            '--format',
            'json',
          ]),
        );
        return yield* decodeReply('tts', Schema.fromJsonString(TtsResponse), raw);
      });

      const stt = Effect.fn('ElevenLabs.stt')(function* (file: string) {
        const raw = yield* exec(
          'stt',
          ChildProcess.make('elevenlabs', [
            'speech-to-text',
            'convert',
            '--model-id',
            'scribe_v1',
            '--file',
            file,
            '--format',
            'json',
          ]),
        );
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
        yield* exec(
          'music',
          ChildProcess.make('elevenlabs', [
            'music',
            'compose',
            '--params',
            params,
            '--json',
            body,
            '--output',
            out,
          ]),
        );
      });

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

      const soundEffect = Effect.fn('ElevenLabs.soundEffect')(function* (
        request: SoundEffectRequest,
        out: string,
      ) {
        const key = yield* apiKey;
        const params = yield* encodeBody('sfx', OutputParams, { output_format: OUTPUT_FORMAT });
        const body = yield* encodeBody('sfx', SoundEffectBody, {
          text: request.prompt,
          duration_seconds: request.secs,
          prompt_influence: 0.5,
          model_id: 'eleven_text_to_sound_v2',
        });
        yield* exec(
          'sfx',
          ChildProcess.make(
            'elevenlabs',
            [
              'text-to-sound-effects',
              'convert',
              '--params',
              params,
              '--json',
              body,
              '--output',
              out,
            ],
            { env: { ELEVENLABS_API_KEY: Redacted.value(key) }, extendEnv: true },
          ),
        );
      });

      return ElevenLabs.of({ tts, stt, composeMusic, apiKey, soundEffect });
    }),
  );
}
