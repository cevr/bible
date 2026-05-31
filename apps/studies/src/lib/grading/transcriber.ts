import { Context, Effect, Layer, Schema } from 'effect';

/*
 * The Transcriber port: turns captured audio into a transcript. This is the seam
 * the Grader depends on so it never knows which STT provider is behind it — the
 * concrete layer (OpenAI now, possibly a self-hosted model later) is swappable.
 * See apps/studies/CONTEXT.md ("Transcriber") and docs/adr/0001.
 */

/** Audio captured in the browser and uploaded to the grading endpoint. The bytes
 * are backed by a plain ArrayBuffer (from an upload), not a SharedArrayBuffer, so
 * they pass directly to a Blob without a narrowing cast. */
export interface Audio {
  /** Raw audio bytes. */
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** MIME type, e.g. "audio/webm" or "audio/mp4". */
  readonly mimeType: string;
  /** Filename hint for the provider (extension matters to some STT APIs). */
  readonly filename: string;
}

/** A failed transcription — network, auth, provider error, or empty result. */
export class TranscriptionError extends Schema.TaggedErrorClass<TranscriptionError>()(
  '@bible/studies/grading/TranscriptionError',
  {
    reason: Schema.Literals(['request', 'auth', 'provider', 'empty', 'decode']),
    message: Schema.String,
  },
) {}

export interface TranscriberService {
  readonly transcribe: (audio: Audio) => Effect.Effect<string, TranscriptionError>;
}

export class Transcriber extends Context.Service<Transcriber, TranscriberService>()(
  '@bible/studies/grading/Transcriber',
) {
  /** Test layer: returns a fixed transcript without any network call. */
  static layerTest = (transcript: string): Layer.Layer<Transcriber> =>
    Layer.succeed(Transcriber, {
      transcribe: () => Effect.succeed(transcript),
    });
}
