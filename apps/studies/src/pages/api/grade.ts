import type { APIRoute } from 'astro';
import { Cause, Exit } from 'effect';

import { ChapterSourceNotFoundError, readChapterSource } from '../../lib/study-source.ts';
import { runGrade } from '../../lib/grading/grade-reflection.ts';
import type { Audio } from '../../lib/grading/transcriber.ts';
import { makeRateLimiter } from '../../lib/grading/rate-limit.ts';

/*
 * POST /api/grade — the only on-demand route. Accepts a multipart form with the
 * recorded audio plus the series + chapter slugs, transcribes + grades the
 * reflection server-side, and returns the Grade as JSON. See docs/adr/0001-0002.
 *
 * Protection (no accounts; bounded cost): per-IP token-bucket rate limit, a max
 * audio size, and a hard request-size cap — all enforced before any paid API call.
 */
export const prerender = false;

// --- limits -----------------------------------------------------------------
const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB of audio
const MAX_REQUEST_BYTES = 24 * 1024 * 1024; // a little headroom for form overhead
// Browsers' MediaRecorder labels webm/mp4 audio-only blobs with a "video/" MIME
// (the container is video-typed), so we accept both prefixes; the STT provider
// handles the actual audio content.
const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'video/webm',
  'video/mp4',
];

// Sustained ~1 grade/30s per IP, bursts up to 5. Module-scoped so it persists
// across requests within the single server process.
const limiter = makeRateLimiter({ capacity: 5, refillPerSecond: 1 / 30 });

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // 1. Rate limit by client IP.
  const ip = clientAddress || 'unknown';
  if (!limiter.take(ip, Date.now())) {
    return json({ error: 'Too many requests. Please wait a moment and try again.' }, 429);
  }

  // 2. Cheap content-length guard before reading the body.
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_REQUEST_BYTES) {
    return json({ error: 'Recording is too large.' }, 413);
  }

  // 3. Parse the multipart form.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Expected a multipart form upload.' }, 400);
  }

  const series = form.get('series');
  const chapter = form.get('chapter');
  const file = form.get('audio');

  if (typeof series !== 'string' || typeof chapter !== 'string') {
    return json({ error: 'Missing "series" or "chapter".' }, 400);
  }
  if (!(file instanceof File)) {
    return json({ error: 'Missing "audio" file.' }, 400);
  }
  if (file.size === 0) {
    return json({ error: 'Audio file is empty.' }, 400);
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return json({ error: 'Recording is too long.' }, 413);
  }
  const mimeType = file.type || 'audio/webm';
  if (!ALLOWED_AUDIO_TYPES.some((t) => mimeType.startsWith(t))) {
    return json({ error: `Unsupported audio type: ${mimeType}` }, 415);
  }

  // 4. Load the PRIVATE-tier source (404 if the chapter has no source).
  let source;
  try {
    source = await readChapterSource(series, chapter);
  } catch (e) {
    if (e instanceof ChapterSourceNotFoundError) {
      return json({ error: `No study guide source for ${series}/${chapter}.` }, 404);
    }
    return json({ error: 'Failed to load the chapter source.' }, 500);
  }

  // 5. Transcribe + grade.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const audio: Audio = {
    bytes,
    mimeType,
    filename: file.name || `reflection.${mimeType.split('/')[1] ?? 'webm'}`,
  };

  const exit = await runGrade({ audio, source });
  if (Exit.isSuccess(exit)) {
    return json(exit.value, 200);
  }

  // 6. Map typed failures to HTTP. The cause carries TranscriptionError /
  // GradingError / ConfigError; surface a safe message, log the detail.
  const error = Cause.squash(exit.cause);
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[grade] ${series}/${chapter} failed:`, message);
  return json({ error: 'Grading failed. Please try again.' }, 502);
};
