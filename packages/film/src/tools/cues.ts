// The film's clock as text: each scene's placement, its marks, its resolved
// named cues and the seam to the next voice, each sound effect's film time, or
// a short's spans. Pure; `film cues` prints it.

import { Array as Arr, Option, Result } from 'effect';
import type { ShortError, SoundCueError, UnknownScene } from '../core/errors.ts';
import { type Placed, sceneOf } from '../core/layout.ts';
import type { Cue, Short, Sound } from '../core/schema.ts';
import { resolveShort } from '../core/shorts.ts';
import { cueTime } from '../core/sound.ts';
import { longSeams, seamAfter } from './check.ts';
import type { FlagRule } from './render-plan.ts';

export interface CueReport {
  readonly lines: ReadonlyArray<string>;
  /** Named cues that end after their scene does. */
  readonly late: number;
}

/** Which scenes to report: all, or the one `only` names, which must exist. */
const sceneFilter = (
  placed: ReadonlyArray<Placed>,
  only: Option.Option<string>,
): Result.Result<(scene: string) => boolean, UnknownScene> =>
  Option.match(only, {
    onNone: () => Result.succeed(() => true),
    onSome: (id) => Result.map(sceneOf(placed, id), (p) => (scene: string) => scene === p.spec.id),
  });

interface CueLine {
  readonly line: string;
  /** Named cues on this line that end after the scene. */
  readonly late: number;
}

/**
 * `seam=0.60`: the pause from this scene's last word to the next scene's
 * first, when both speak; `(LONG)` when `check` warns of it (`SeamLong`).
 */
const seamOf = (p: Placed, next: Option.Option<Placed>, long: ReadonlySet<string>) =>
  Option.match(
    Option.flatMap(next, (q) => seamAfter(p, q)),
    {
      onNone: () => '',
      onSome: (seam) => {
        if (long.has(p.spec.id)) return `seam=${seam.toFixed(2)} (LONG) `;
        return `seam=${seam.toFixed(2)} `;
      },
    },
  );

const lineOf = (p: Placed, seam: string): CueLine => {
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
    seam,
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
): Result.Result<CueReport, UnknownScene> =>
  Result.map(sceneFilter(placed, only), (inScene) => {
    const long = new Set(longSeams(placed).map((f) => f.from));
    const rows = placed.flatMap((p, i) => {
      if (!inScene(p.spec.id)) return [];
      return [lineOf(p, seamOf(p, Arr.get(placed, i + 1), long))];
    });
    return { lines: rows.map((r) => r.line), late: rows.reduce((n, r) => n + r.late, 0) };
  });

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
    const inScene = yield* sceneFilter(placed, only);
    const lines: Array<string> = [];
    for (const [name, effect] of Object.entries(sound.effects))
      for (const cue of effect.at) {
        if (!inScene(cue.scene)) continue;
        const at = yield* cueTime(cue, placed);
        lines.push(
          `${name.padEnd(8)} ${cue.scene.padEnd(11)} ${at.toFixed(3).padStart(8)} ${anchorLabel(cue)}`,
        );
      }
    return lines;
  });

/** `film cues` flags that would each print a different report. */
export const CUES_RULES: ReadonlyArray<FlagRule> = [
  ['short', 'excludes', 'sound', '--short prints the short, --sound the effects'],
  ['short', 'excludes', 'scene', "a short's spans are its scenes"],
];

const range = (from: number, to: number) => `${from.toFixed(3).padStart(8)}–${to.toFixed(3)}`;

/** A short's spans: each one's film time and its time in the short, then the short's length. */
export const shortReport = (
  placed: ReadonlyArray<Placed>,
  short: Short,
  fps: number,
): Result.Result<ReadonlyArray<string>, ShortError> =>
  Result.map(resolveShort(placed, short, fps), (cut) => [
    `short ${cut.id} "${cut.title}" at ${fps} fps`,
    ...cut.spans.map((span, i) => {
      const len = span.to - span.from;
      return `  ${i + 1} ${span.scene.padEnd(11)} film ${range(span.from, span.to)}  short ${range(span.at, span.at + len)}  (${len.toFixed(2)}s)`;
    }),
    `length ${cut.duration.toFixed(2)}s`,
  ]);
