// Print each scene's placement, its marks and its resolved named cues, from the
// recorded narration. Exits non-zero when a cue ends after its scene does.
//   bun scripts/cues.ts <film> [scene-id]
//   bun scripts/cues.ts <film> [scene-id] --sound   → each effect placement's film time

import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { cueTime, layout, type Sound, type Timings } from '@bible/film/core';
import type { SceneSpec } from '@bible/film/canvas';

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: { sound: { type: 'boolean' } },
});
const [film, only] = positionals;
if (film === undefined) throw new Error('usage: bun scripts/cues.ts <film> [scene] [--sound]');
const dir = join(import.meta.dir, '..', 'src', 'films', film);
const { scenes } = (await import(join(dir, 'scenes', 'index.ts'))) as { scenes: SceneSpec[] };
const file = Bun.file(join(dir, 'narration', 'timings.json'));
const timings = (await file.exists()) ? ((await file.json()) as Timings) : undefined;
const placed = layout(scenes, timings);

if (values.sound === true) {
  const { sound } = (await import(join(dir, 'sound.ts'))) as { sound: Sound };
  for (const [name, effect] of Object.entries(sound.effects))
    for (const cue of effect.at) {
      if (only !== undefined && cue.scene !== only) continue;
      const at = cue.cue ?? (cue.mark === undefined ? '' : `{${cue.mark}}`);
      const edge = cue.edge === undefined ? '' : `.${cue.edge}`;
      console.log(
        `${name.padEnd(8)} ${cue.scene.padEnd(11)} ${cueTime(cue, placed).toFixed(3).padStart(8)} ${at}${edge}`,
      );
    }
  process.exit(0);
}

let over = 0;
for (const p of placed) {
  if (only !== undefined && p.spec.id !== only) continue;
  const marks = [...p.voice.marks]
    .map(([k, v]) => `${k}@${(p.speechStart + v).toFixed(2)}`)
    .join(' ');
  const cues = [...p.cues]
    .map(([k, c]) => {
      const late = c.end > p.dur + 1e-9;
      if (late) over++;
      return `${k}@${c.start.toFixed(2)}–${c.end.toFixed(2)}${late ? ' (ENDS AFTER SCENE)' : ''}`;
    })
    .join(' ');
  console.log(
    `${p.spec.id.padEnd(11)} start=${p.start.toFixed(2).padStart(7)} dur=${p.dur.toFixed(2).padStart(6)} speech=${p.speechStart.toFixed(2)}–${(p.speechStart + p.voice.duration).toFixed(2)} ${p.voice.recorded ? '' : '(estimated) '}${marks}${cues === '' ? '' : ` | cues: ${cues}`}`,
  );
}
if (over > 0) {
  console.error(`[cues] ${over} cue(s) end after their scene`);
  process.exit(1);
}
