// Print each scene's placement and its marks, from the recorded narration.
//   bun scripts/cues.ts <film> [scene-id]

import { join } from 'node:path';
import { layout, type Timings } from '@bible/film/core';
import type { SceneSpec } from '@bible/film/canvas';

const [film, only] = Bun.argv.slice(2);
if (film === undefined) throw new Error('usage: bun scripts/cues.ts <film> [scene]');
const dir = join(import.meta.dir, '..', 'src', 'films', film);
const { scenes } = (await import(join(dir, 'scenes', 'index.ts'))) as { scenes: SceneSpec[] };
const file = Bun.file(join(dir, 'narration', 'timings.json'));
const timings = (await file.exists()) ? ((await file.json()) as Timings) : undefined;
for (const p of layout(scenes, timings)) {
  if (only !== undefined && p.spec.id !== only) continue;
  const marks = [...p.voice.marks]
    .map(([k, v]) => `${k}@${(p.speechStart + v).toFixed(2)}`)
    .join(' ');
  console.log(
    `${p.spec.id.padEnd(11)} start=${p.start.toFixed(2).padStart(7)} dur=${p.dur.toFixed(2).padStart(6)} speech=${p.speechStart.toFixed(2)}–${(p.speechStart + p.voice.duration).toFixed(2)} ${p.voice.recorded ? '' : '(estimated) '}${marks}`,
  );
}
