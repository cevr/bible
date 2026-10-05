// The film's clock as text: each scene's placement, its marks, its resolved
// named cues (an `until` cue's offset off its point beside it) and the seam to
// the next voice, each sound effect's film time, or a short's spans. Pure;
// `film cues` prints it.

import { Array as Arr, Option, Result } from 'effect';
import type { SoundCueError, UnknownScene } from '../core/errors.ts';
import { type Placed, sceneOf } from '../core/layout.ts';
import type { Cue, Sound } from '../core/schema.ts';
import type { ResolvedShort } from '../core/shorts.ts';
import { cueTime } from '../core/sound.ts';
import { untilEndText } from '../core/timeline.ts';
import { longSeams, seamAfter } from './check.ts';
import type { FlagRule } from './render-plan.ts';

interface CueReport {
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

/** ` (until {first} + 0.10 s)`: where a cue ends off the point it runs until; nothing on the point or for a dur. */
const offPoint = (p: Placed, cue: string): string =>
  Option.match(
    Option.flatMap(Option.fromNullishOr(p.spec.timeline?.[cue]), (span) =>
      Option.all({
        until: Option.fromUndefinedOr(span.until),
        off: Option.fromUndefinedOr(span.untilOffset),
      }),
    ),
    {
      onNone: () => '',
      onSome: ({ until, off }) => ` (until ${untilEndText(until, off)})`,
    },
  );

const lineOf = (p: Placed, seam: string): CueLine => {
  const marks = [...p.voice.marks].map(([k, v]) => `${k}@${(p.speechStart + v).toFixed(2)}`);
  let late = 0;
  const cues = [...p.cues].map(([k, c]) => {
    const span = `${k}@${c.start.toFixed(2)}–${c.end.toFixed(2)}${offPoint(p, k)}`;
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

/**
 * A sound cue's point as the report prints it: `lower`, `lower.end`,
 * `{three}`, `{gift}~faith`, `@speech`; nothing for the scene's start.
 */
const anchorLabel = (cue: Cue): string =>
  Option.getOrElse(
    Option.firstSomeOf([
      Option.map(Option.fromUndefinedOr(cue.cue), (name) =>
        Option.match(Option.fromUndefinedOr(cue.edge), {
          onNone: () => name,
          onSome: (edge) => `${name}.${edge}`,
        }),
      ),
      Option.map(Option.fromUndefinedOr(cue.mark), (mark) =>
        Option.match(Option.fromUndefinedOr(cue.word), {
          onNone: () => `{${mark}}`,
          onSome: (word) => `{${mark}}~${word}`,
        }),
      ),
      Option.map(Option.fromUndefinedOr(cue.at), (at) => `@${at}`),
    ]),
    () => '',
  );

/** How an effect meets its cue, as the report marks it: its start (unmarked), its onset or its hit. */
const SYNC_LABEL = { start: '', onset: ' onset', hit: ' hit' } as const;

/**
 * Each effect placement's film time and library sound (marked `onset` or
 * `hit` where that moment of the sound, not its first sample, lands there),
 * then each bed's span.
 */
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
          `${name.padEnd(8)} ${cue.scene.padEnd(11)} ${at.toFixed(3).padStart(8)} ${anchorLabel(cue)}${SYNC_LABEL[Option.getOrElse(Option.fromUndefinedOr(effect.sync), () => 'start' as const)]}  ${effect.sound}`,
        );
      }
    for (const bed of sound.beds ?? []) {
      if (!inScene(bed.from.scene) && !inScene(bed.to.scene)) continue;
      const from = yield* cueTime(bed.from, placed);
      const to = yield* cueTime(bed.to, placed);
      lines.push(
        `bed      ${bed.from.scene.padEnd(11)} ${range(from, to)} ${anchorLabel(bed.from)}→${bed.to.scene}${anchorLabel(bed.to)}  ${bed.sound}`,
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

/**
 * A short's spans, resolved on its page's frames (`Checker.cut`): each one's
 * film time and its time in the short, then the short's length.
 */
export const shortReport = (cut: ResolvedShort): ReadonlyArray<string> => [
  `short ${cut.id} "${cut.title}" at ${cut.fps} fps`,
  ...cut.spans.map((span, i) => {
    const len = span.to - span.from;
    return `  ${i + 1} ${span.scene.padEnd(11)} film ${range(span.from, span.to)}  short ${range(span.at, span.at + len)}  (${len.toFixed(2)}s)`;
  }),
  `length ${cut.duration.toFixed(2)}s`,
];
