// Test doubles for the tools: an in-memory file system, and ElevenLabs and
// ffmpeg that answer from memory and count their calls. No network, no ffmpeg,
// no credits.

import { Effect, Encoding, FileSystem, Layer, Option, Path, Redacted } from 'effect';
import * as PlatformError from 'effect/PlatformError';
import {
  SoundManifestJson,
  type Timed,
  type Timings,
  TimingsJson,
  type Voice,
} from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { ElevenLabs, type TtsRequest } from './elevenlabs.ts';
import { ApiKeyMissing } from './errors.ts';
import { Ffmpeg } from './ffmpeg.ts';
import type { LoadedFilm } from './film-repo.ts';

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: 'NotFound',
    module: 'FileSystem',
    method,
    pathOrDescriptor: path,
  });

/** A file system over a map of path → bytes. */
export const memoryFileSystem = (files: Map<string, Uint8Array>) =>
  FileSystem.layerNoop({
    exists: (path) =>
      Effect.succeed(files.has(path) || [...files.keys()].some((f) => f.startsWith(`${path}/`))),
    readFile: (path) =>
      Option.match(Option.fromNullishOr(files.get(path)), {
        onNone: () => Effect.fail(notFound('readFile', path)),
        onSome: Effect.succeed,
      }),
    readFileString: (path) =>
      Option.match(Option.fromNullishOr(files.get(path)), {
        onNone: () => Effect.fail(notFound('readFileString', path)),
        onSome: (bytes) => Effect.succeed(new TextDecoder().decode(bytes)),
      }),
    writeFile: (path, data) => Effect.sync(() => void files.set(path, data)),
    makeDirectory: () => Effect.void,
    rename: (from, to) =>
      Option.match(Option.fromNullishOr(files.get(from)), {
        onNone: () => Effect.fail(notFound('rename', from)),
        onSome: (bytes) =>
          Effect.sync(() => {
            files.delete(from);
            files.set(to, bytes);
          }),
      }),
    remove: (path) => Effect.sync(() => void files.delete(path)),
  });

export const text = (s: string) => new TextEncoder().encode(s);

/** What the fake ElevenLabs was asked to do. */
export interface ElevenLabsCalls {
  readonly tts: Array<TtsRequest>;
  readonly stt: Array<string>;
  readonly music: Array<string>;
  readonly effects: Array<string>;
}

/**
 * Speech comes back aligned one character per 0.05 s, and its "audio" is the
 * text itself, so the transcript of a take file is what was spoken into it,
 * unless `heard` maps that text to something else.
 */
export const fakeElevenLabs = (
  files: Map<string, Uint8Array>,
  calls: ElevenLabsCalls,
  options: { readonly heard?: ReadonlyMap<string, string>; readonly apiKey?: string } = {},
) =>
  Layer.succeed(
    ElevenLabs,
    ElevenLabs.of({
      tts: (request) =>
        Effect.sync(() => {
          calls.tts.push(request);
          const characters = [...request.text];
          return {
            audio_base64: Encoding.encodeBase64(request.text),
            alignment: {
              characters,
              character_start_times_seconds: characters.map((_, i) => i * 0.05),
              character_end_times_seconds: characters.map((_, i) => i * 0.05 + 0.05),
            },
          };
        }),
      stt: (file) =>
        Effect.sync(() => {
          calls.stt.push(file);
          const said = new TextDecoder().decode(files.get(file));
          const heard = Option.fromNullishOr(options.heard?.get(said));
          return { text: Option.getOrElse(heard, () => said) };
        }),
      composeMusic: (_plan, _model, out) => Effect.sync(() => void calls.music.push(out)),
      apiKey: Option.match(Option.fromNullishOr(options.apiKey), {
        onNone: () => Effect.fail(ApiKeyMissing.make({})),
        onSome: (key) => Effect.succeed(Redacted.make(key)),
      }),
      soundEffect: (_request, out) => Effect.sync(() => void calls.effects.push(out)),
    }),
  );

export const emptyCalls = (): ElevenLabsCalls => ({ tts: [], stt: [], music: [], effects: [] });

export const fakeFfmpeg = (runs: Array<ReadonlyArray<string>>) =>
  Layer.succeed(
    Ffmpeg,
    Ffmpeg.of({
      run: (args) => Effect.sync(() => void runs.push(args)),
      probeDuration: () => Effect.succeed(2.5),
    }),
  );

export const testVoice: Voice = {
  voiceId: 'voice-1',
  model: 'eleven_v3',
  settings: { stability: 0.5 },
};

/** A small film at `/films/test`, laid out in memory. */
export const testFilm = (
  scenes: ReadonlyArray<Timed>,
  timings: Timings,
  voice: Voice = testVoice,
): LoadedFilm => ({
  paths: {
    name: 'test',
    dir: '/films/test',
    narration: '/films/test/narration',
    sound: '/films/test/sound',
    out: '/out/test',
    timings: {
      file: '/films/test/narration/timings.json',
      codec: TimingsJson,
      empty: { voice: '', scenes: {} },
    },
    manifest: {
      file: '/films/test/sound/manifest.json',
      codec: SoundManifestJson,
      empty: { effects: {} },
    },
  },
  scenes,
  voice,
  sound: Option.none(),
  timings,
  manifest: { effects: {} },
});

export const storeLayer = (files: Map<string, Uint8Array>) =>
  ContentStore.layer.pipe(Layer.provide([memoryFileSystem(files), Path.layer]));
