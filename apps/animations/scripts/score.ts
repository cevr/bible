// Generate a film's music and sound effects, then remix its track.
//
//   bun scripts/score.ts <film>              generate what is missing or stale, then mix
//   bun scripts/score.ts <film> --only music regenerate just the score (or an effect id)
//   bun scripts/score.ts <film> --dry-run    print the plan and what would be generated
//
// An asset is current while the hash of its request matches, like a voice
// take: the score's plan is timed from the film's layout, so re-timing a scene
// makes the score stale; changing a gain never does.
//
// Music works with the CLI's OAuth login. Sound effects need an API key: set
// ELEVENLABS_API_KEY, or keep it in the Keychain under that service name.
// Without one, effects are skipped and the track is mixed without them.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type SceneSpec, layout } from '../src/engine/film.ts';
import type { Timings } from '../src/engine/narration.ts';
import {
  type Asset,
  effectKey,
  filmEnd,
  musicKey,
  musicPlan,
  type SoundManifest,
} from '../src/engine/sound.ts';
import { exec, filmDir, loadSound, mixFilm } from './mix.ts';

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    only: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const film = positionals[0];
if (film === undefined) {
  console.error('usage: bun scripts/score.ts <film> [--only music|<effect>,...] [--dry-run]');
  process.exit(2);
}

const dir = filmDir(film);
const out = join(dir, 'sound');
await mkdir(out, { recursive: true });
const { scenes } = (await import(join(dir, 'scenes', 'index.ts'))) as { scenes: SceneSpec[] };
const timings = (await Bun.file(join(dir, 'narration', 'timings.json')).json()) as Timings;
const placed = layout(scenes, timings);
const { sound, manifest, manifestFile } = await loadSound(dir);
if (sound === undefined) {
  console.error(`[score] film=${film} has no sound.ts`);
  process.exit(2);
}

const only = values.only === undefined ? undefined : new Set(values.only.split(','));
const wanted = (id: string, current: Asset | undefined, hash: string) =>
  only === undefined ? current?.hash !== hash : only.has(id);

let music = manifest.music;
const effects: Record<string, Asset> = { ...manifest.effects };
const save = () =>
  Bun.write(manifestFile, JSON.stringify({ music, effects } satisfies SoundManifest, null, 1));

const jobs: Array<{ id: string; run: () => Promise<void> }> = [];

if (sound.music !== undefined) {
  const m = sound.music;
  const plan = musicPlan(m, placed);
  const hash = musicKey(m, plan);
  console.log(
    `[score] plan secs=${filmEnd(placed).toFixed(1)} acts=${plan.chunks
      .map((c) => `${c.text}:${(c.duration_ms / 1000).toFixed(1)}`)
      .join(' | ')}`,
  );
  if (wanted('music', music, hash))
    jobs.push({
      id: 'music',
      run: async () => {
        const file = `music-${hash}.mp3`;
        await exec([
          'elevenlabs',
          'music',
          'compose',
          '--params',
          JSON.stringify({ output_format: 'mp3_44100_192' }),
          '--json',
          JSON.stringify({ composition_plan: plan, model_id: m.model }),
          '--output',
          join(out, file),
        ]);
        music = { hash, file };
      },
    });
}

/** The OAuth login cannot reach sound generation; an API key can. */
const apiKey = async (): Promise<string | undefined> => {
  const env = process.env['ELEVENLABS_API_KEY'];
  if (env !== undefined && env.length > 0) return env;
  const p = Bun.spawn(['security', 'find-generic-password', '-s', 'ELEVENLABS_API_KEY', '-w'], {
    stdout: 'pipe',
    stderr: 'ignore',
  });
  const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
  return code === 0 && out.trim().length > 0 ? out.trim() : undefined;
};

const staleFx = Object.entries(sound.effects).filter(([id, fx]) =>
  wanted(id, effects[id], effectKey(fx)),
);
const key = staleFx.length > 0 ? await apiKey() : undefined;
if (staleFx.length > 0 && key === undefined)
  console.warn(
    `[score] skipping effects=${staleFx.map(([id]) => id).join(',')}: no ELEVENLABS_API_KEY in env or Keychain`,
  );

for (const [id, fx] of key === undefined ? [] : staleFx) {
  const hash = effectKey(fx);
  jobs.push({
    id,
    run: async () => {
      const file = `sfx-${id}-${hash}.mp3`;
      await exec(
        [
          'elevenlabs',
          'text-to-sound-effects',
          'convert',
          '--params',
          JSON.stringify({ output_format: 'mp3_44100_192' }),
          '--json',
          JSON.stringify({
            text: fx.prompt,
            duration_seconds: fx.secs,
            prompt_influence: 0.5,
            model_id: 'eleven_text_to_sound_v2',
          }),
          '--output',
          join(out, file),
        ],
        { ELEVENLABS_API_KEY: key ?? '' },
      );
      effects[id] = { hash, file };
    },
  });
}

console.log(`[score] film=${film} to_generate=${jobs.map((j) => j.id).join(',') || 'none'}`);
if (values['dry-run']) process.exit(0);

// A few at a time, saving after each so a failure keeps what already worked.
for (let k = 0; k < jobs.length; k += 3)
  await Promise.all(
    jobs.slice(k, k + 3).map(async (j) => {
      const started = performance.now();
      await j.run();
      await save();
      console.log(
        `[score] made id=${j.id} secs=${((performance.now() - started) / 1000).toFixed(1)}`,
      );
    }),
  );

// Drop assets the design no longer names; the files stay until pruned by hand.
for (const id of Object.keys(effects)) if (!(id in sound.effects)) delete effects[id];
if (sound.music === undefined) music = undefined;
await save();
await mixFilm(film);
