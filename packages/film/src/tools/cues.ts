// The film's clock as text: each scene's placement, its marks and its resolved
// named cues, or each sound effect's film time. Pure; `film cues` prints it.

import { Option, Result } from 'effect';
import type { Placed } from '../core/layout.ts';
import type { Cue, Sound } from '../core/schema.ts';
import { cueTime } from '../core/sound.ts';
import type { SoundCueError } from '../core/errors.ts';

export interface CueReport {
  readonly lines: ReadonlyArray<string>;
  /** Named cues that end after their scene does. */
  readonly late: number;
}

const inScene = (only: Option.Option<string>, scene: string) =>
  Option.match(only, { onNone: () => true, onSome: (id) => id === scene });

interface CueLine {
  readonly line: string;
  /** Named cues on this line that end after the scene. */
  readonly late: number;
}

const lineOf = (p: Placed): CueLine => {
  const marks = [...p.voice.marks].map(([k, v]) => `${k}@${(p.speechStart + v).toFixed(2)}`);
  let late = 0;
  const cues = [...p.cues].map(([k, c]) => {
    const span = `${k}@${c.start.toFixed(2)}–${c.end.toFixed(2)}`;
    if (c.end <= p.dur + 1e-9) return span;
    late++;
    return `${span} (ENDS AFTER SCENE)`;
  });
  const speech = `${p.speechStart.toFixed(2)}–${(p.speechStart + p.voice.duration).toFixed(2)}`;
  const parts = [
    `${p.spec.id.padEnd(11)} start=${p.start.toFixed(2).padStart(7)} dur=${p.dur.toFixed(2).padStart(6)} speech=${speech} `,
  ];
  if (!p.voice.recorded) parts.push('(estimated) ');
  parts.push(marks.join(' '));
  if (cues.length > 0) parts.push(` | cues: ${cues.join(' ')}`);
  return { line: parts.join(''), late } satisfies CueLine;
};

/** Each scene's placement, marks and cues. */
export const sceneReport = (
  placed: ReadonlyArray<Placed>,
  only: Option.Option<string>,
): CueReport => {
  const rows = placed.filter((p) => inScene(only, p.spec.id)).map(lineOf);
  return { lines: rows.map((r) => r.line), late: rows.reduce((n, r) => n + r.late, 0) };
};

const anchorLabel = (cue: Cue): string => {
  const anchor = Option.orElse(Option.fromNullishOr(cue.cue), () =>
    Option.map(Option.fromNullishOr(cue.mark), (mark) => `{${mark}}`),
  );
  const edge = Option.map(Option.fromNullishOr(cue.edge), (e) => `.${e}`);
  return [anchor, edge].flatMap((part) => Option.toArray(part)).join('');
};

/** Each effect placement's film time. */
export const soundReport = (
  sound: Sound,
  placed: ReadonlyArray<Placed>,
  only: Option.Option<string>,
): Result.Result<ReadonlyArray<string>, SoundCueError> =>
  Result.gen(function* () {
    const lines: Array<string> = [];
    for (const [name, effect] of Object.entries(sound.effects))
      for (const cue of effect.at) {
        if (!inScene(only, cue.scene)) continue;
        const at = yield* cueTime(cue, placed);
        lines.push(
          `${name.padEnd(8)} ${cue.scene.padEnd(11)} ${at.toFixed(3).padStart(8)} ${anchorLabel(cue)}`,
        );
      }
    return lines;
  });
