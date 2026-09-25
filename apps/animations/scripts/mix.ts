// Lay a film's sound on one track: the voice takes where the film places them,
// the score ducked under the voice, and each effect on its cue.
//
//   bun scripts/mix.ts <film>           rebuild narration/full.mp3
//   bun scripts/mix.ts <film> --stems   also write voice/music/effects stems to out/<film>/stems
//
// narrate.ts and score.ts both finish here, so the track is always rebuilt
// from the same inputs; remixing never calls the API.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  layout,
  type Timings,
  type Sound,
  type SoundManifest,
  cueTime,
  effectKey,
  filmEnd,
  musicKey,
  musicPlan,
} from '@bible/film/core';
import type { SceneSpec } from '@bible/film/canvas';

export const filmDir = (film: string) => join(import.meta.dir, '..', 'src', 'films', film);

export const exec = async (cmd: string[], env?: Record<string, string>) => {
  const p = Bun.spawn(cmd, {
    stdout: 'pipe',
    stderr: 'pipe',
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')} failed (${code}): ${err || out}`);
  return out;
};

/** A film's optional sound design and what has been generated for it. */
export const loadSound = async (dir: string) => {
  const soundFile = join(dir, 'sound.ts');
  const sound = (await Bun.file(soundFile).exists())
    ? ((await import(soundFile)) as { sound: Sound }).sound
    : undefined;
  const manifestFile = join(dir, 'sound', 'manifest.json');
  const manifest: SoundManifest = (await Bun.file(manifestFile).exists())
    ? ((await Bun.file(manifestFile).json()) as SoundManifest)
    : { effects: {} };
  return { sound, manifest, manifestFile };
};

/** How far the bed sits under the voice: gentle ratio, slow release so it breathes back. */
const DUCK = 'sidechaincompress=threshold=0.02:ratio=3:attack=80:release=1000:knee=4';
const FMT = 'aformat=sample_rates=44100:channel_layouts=stereo';

export const mixFilm = async (film: string, opts: { stems?: boolean } = {}) => {
  const dir = filmDir(film);
  const narration = join(dir, 'narration');
  const { scenes } = (await import(join(dir, 'scenes', 'index.ts'))) as { scenes: SceneSpec[] };
  const timings = (await Bun.file(join(narration, 'timings.json')).json()) as Timings;
  const placed = layout(scenes, timings);
  const total = filmEnd(placed);
  const { sound, manifest } = await loadSound(dir);

  const inputs: string[] = [];
  const graph: string[] = [];
  const bus = new Map<'voice' | 'music' | 'effects', string>();
  const input = (file: string) => {
    inputs.push('-i', file);
    return inputs.length / 2 - 1;
  };
  const delay = (secs: number) => {
    const ms = Math.max(0, Math.round(secs * 1000));
    return `adelay=${ms}|${ms}`;
  };

  // Voice, padded so the ducking key outlasts the last word and the score plays out.
  const takes = placed.filter((p) => p.voice.recorded && p.voice.file !== undefined);
  takes.forEach((p, k) => {
    const i = input(join(narration, p.voice.file ?? ''));
    graph.push(`[${i}:a]${FMT},${delay(p.start + p.speechStart)}[v${k}]`);
  });
  graph.push(
    `${takes.map((_, k) => `[v${k}]`).join('')}amix=inputs=${takes.length}:normalize=0,apad,asplit=2[voice][key]`,
  );
  bus.set('voice', '[voice]');

  // Music, ducked under the voice. A stale score still plays, with a warning.
  let music = 'none';
  if (sound?.music !== undefined && manifest.music !== undefined) {
    if (manifest.music.hash !== musicKey(sound.music, musicPlan(sound.music, placed)))
      console.warn('[mix] score is stale (acts or timing changed) — run score.ts to regenerate');
    const i = input(join(dir, 'sound', manifest.music.file));
    const fadeOut = Math.max(0, total - 6).toFixed(3);
    graph.push(
      `[${i}:a]${FMT},volume=${sound.music.gain},afade=t=in:d=2,afade=t=out:st=${fadeOut}:d=6[bed]`,
      `[bed][key]${DUCK}[music]`,
    );
    bus.set('music', '[music]');
    music = manifest.music.file;
  } else graph.push('[key]anullsink');

  // Effects.
  let placedFx = 0;
  const fxTags: string[] = [];
  for (const [id, fx] of Object.entries(sound?.effects ?? {})) {
    const asset = manifest.effects[id];
    if (asset === undefined) {
      console.warn(`[mix] effect id=${id} not generated — run score.ts`);
      continue;
    }
    if (asset.hash !== effectKey(fx)) console.warn(`[mix] effect id=${id} is stale`);
    for (const cue of fx.at) {
      const i = input(join(dir, 'sound', asset.file));
      const tag = `[fx${placedFx++}]`;
      graph.push(`[${i}:a]${FMT},volume=${fx.gain ?? 1},${delay(cueTime(cue, placed))}${tag}`);
      fxTags.push(tag);
    }
  }

  if (fxTags.length > 0) {
    graph.push(`${fxTags.join('')}amix=inputs=${fxTags.length}:normalize=0[effects]`);
    bus.set('effects', '[effects]');
  }

  // Each stem can also be written alone, to balance by measurement rather than by ear.
  const names = [...bus.keys()];
  const stemDir = join(import.meta.dir, '..', 'out', film, 'stems');
  const stemMaps: string[] = [];
  if (opts.stems === true) {
    await mkdir(stemDir, { recursive: true });
    for (const name of names) {
      graph.push(`${bus.get(name)}asplit=2[${name}_mix][${name}_stem]`);
      graph.push(`[${name}_stem]atrim=0:${total.toFixed(3)}[${name}_out]`);
      bus.set(name, `[${name}_mix]`);
      stemMaps.push('-map', `[${name}_out]`, join(stemDir, `${name}.wav`));
    }
  }

  graph.push(
    `${[...bus.values()].join('')}amix=inputs=${bus.size}:normalize=0,alimiter=limit=0.95:level=false,apad,atrim=0:${total.toFixed(3)}[out]`,
  );
  const out = join(narration, 'full.mp3');
  await exec([
    'ffmpeg',
    '-y',
    '-loglevel',
    'error',
    ...inputs,
    '-filter_complex',
    graph.join(';'),
    '-map',
    '[out]',
    '-ac',
    '2',
    '-ar',
    '44100',
    '-b:a',
    '192k',
    out,
    ...stemMaps,
  ]);
  if (opts.stems === true) console.log(`[mix] stems=${names.join(',')} dir=${stemDir}`);
  console.log(
    `[mix] track takes=${takes.length} music=${music} effects=${placedFx} secs=${total.toFixed(1)} file=${out}`,
  );
};

if (import.meta.main) {
  const film = Bun.argv[2];
  if (film === undefined) {
    console.error('usage: bun scripts/mix.ts <film> [--stems]');
    process.exit(2);
  }
  await mixFilm(film, { stems: Bun.argv.includes('--stems') });
}
