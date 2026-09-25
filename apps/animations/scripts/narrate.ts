// Record a film's narration, one take per beat, then lay the takes on one
// track at the times the film places them.
//
//   bun scripts/narrate.ts <film>              record stale beats, verify, remix full.mp3
//   bun scripts/narrate.ts <film> --only a,b   re-record just these beats
//   bun scripts/narrate.ts <film> --dry-run    list what would be recorded
//
// A take is current while the hash of its spoken text matches, so editing a
// line re-records only that line. Every new take is transcribed back and
// compared with the script; a take that says something else fails loudly.
// The track itself is built by mix.ts, with the film's music and effects.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { SceneSpec } from '@bible/film/canvas';
import {
  type Timings,
  type VoiceTiming,
  hashText,
  parse,
  wordsFromAlignment,
} from '@bible/film/core';
import { exec, filmDir, mixFilm } from './mix.ts';

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    only: { type: 'string' },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});

const film = positionals[0];
if (film === undefined) {
  console.error('usage: bun scripts/narrate.ts <film> [--only id,id] [--force] [--dry-run]');
  process.exit(2);
}

const DIR = filmDir(film);
const OUT = join(DIR, 'narration');
const TIMINGS = join(OUT, 'timings.json');
await mkdir(OUT, { recursive: true });

const { scenes } = (await import(join(DIR, 'scenes', 'index.ts'))) as { scenes: SceneSpec[] };
const { voice } = (await import(join(DIR, 'voice.ts'))) as {
  voice: { voiceId: string; model: string; settings: Record<string, number> };
};
const voiceKey = `${voice.voiceId}/${voice.model}/${JSON.stringify(voice.settings)}`;

const existing: Timings = (await Bun.file(TIMINGS).exists())
  ? ((await Bun.file(TIMINGS).json()) as Timings)
  : { voice: voiceKey, scenes: {} };
const takes: Record<string, VoiceTiming> =
  existing.voice === voiceKey ? { ...existing.scenes } : {};

const only = values.only === undefined ? undefined : new Set(values.only.split(','));
const spoken = scenes.map((s) => ({ id: s.id, text: parse(s.say ?? '').spoken }));

const duration = async (file: string) =>
  Number(
    (
      await exec([
        'ffprobe',
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        file,
      ])
    ).trim(),
  );

/** Words only, lowercased — punctuation and casing never fail a take. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

/** Word-level edit distance, as a share of the script's words. */
const wordError = (want: string[], got: string[]) => {
  const d = Array.from({ length: want.length + 1 }, (_, i) => [
    i,
    ...Array<number>(got.length).fill(0),
  ]);
  for (let j = 1; j <= got.length; j++) (d[0] as number[])[j] = j;
  for (let i = 1; i <= want.length; i++)
    for (let j = 1; j <= got.length; j++) {
      const row = d[i] as number[];
      const up = d[i - 1] as number[];
      row[j] = Math.min(
        (up[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (up[j - 1] ?? 0) + (want[i - 1] === got[j - 1] ? 0 : 1),
      );
    }
  return ((d[want.length] as number[])[got.length] ?? 0) / Math.max(1, want.length);
};

const record = async (index: number) => {
  const beat = spoken[index];
  if (beat === undefined) return;
  const body = {
    text: beat.text,
    model_id: voice.model,
    voice_settings: voice.settings,
    ...(voice.model === 'eleven_v3'
      ? {}
      : { previous_text: spoken[index - 1]?.text ?? '', next_text: spoken[index + 1]?.text ?? '' }),
  };
  const raw = await exec([
    'elevenlabs',
    'text-to-speech',
    'convert_with_timestamps',
    '--params',
    JSON.stringify({ voice_id: voice.voiceId, output_format: 'mp3_44100_192' }),
    '--json',
    JSON.stringify(body),
    '--format',
    'json',
  ]);
  const res = JSON.parse(raw) as {
    error?: unknown;
    audio_base64?: string;
    alignment?: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  };
  if (res.audio_base64 === undefined || res.alignment === undefined)
    throw new Error(`tts ${beat.id}: ${JSON.stringify(res.error ?? res)}`);
  const file = `${beat.id}.mp3`;
  const path = join(OUT, file);
  await Bun.write(path, Buffer.from(res.audio_base64, 'base64'));
  const a = res.alignment;
  const words = wordsFromAlignment(
    beat.text,
    a.characters,
    a.character_start_times_seconds,
    a.character_end_times_seconds,
  );

  const heard = JSON.parse(
    await exec([
      'elevenlabs',
      'speech-to-text',
      'convert',
      '--model-id',
      'scribe_v1',
      '--file',
      path,
      '--format',
      'json',
    ]),
  ) as { text?: string };
  const err = wordError(norm(beat.text), norm(heard.text ?? ''));
  console.log(
    `[narrate] take id=${beat.id} words=${words.length} secs=${(await duration(path)).toFixed(2)} wer=${(err * 100).toFixed(1)}%`,
  );
  if (err > 0.08)
    console.warn(
      `[narrate] MISMATCH id=${beat.id}\n  script: ${beat.text}\n  heard:  ${heard.text}`,
    );
  takes[beat.id] = { hash: hashText(beat.text), file, duration: await duration(path), words };
  await Bun.write(TIMINGS, JSON.stringify({ voice: voiceKey, scenes: takes }, null, 1));
};

const stale = spoken
  .map((b, i) => ({ ...b, i }))
  .filter((b) => b.text.length > 0)
  .filter((b) =>
    only === undefined ? values.force || takes[b.id]?.hash !== hashText(b.text) : only.has(b.id),
  );

console.log(
  `[narrate] film=${film} beats=${spoken.length} to_record=${stale.map((b) => b.id).join(',') || 'none'}`,
);
if (values['dry-run']) process.exit(0);

// A few at a time: fast, without tripping the API's concurrency limit.
for (let k = 0; k < stale.length; k += 3)
  await Promise.all(stale.slice(k, k + 3).map((b) => record(b.i)));

// Drop takes for beats that no longer exist.
for (const id of Object.keys(takes)) if (!spoken.some((b) => b.id === id)) delete takes[id];
const timings: Timings = { voice: voiceKey, scenes: takes };
await Bun.write(TIMINGS, JSON.stringify(timings, null, 1));

await mixFilm(film);
