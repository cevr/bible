// The lab's `tweak` command (`lab-command.ts`; MCP and `film lab tweak`
// serve it, in the lab alone): one value of a scene's `drawing({...})`
// literal set, a cue's timing (`offset`, `dur`, `until`, `untilOffset`,
// `ease`, `stagger`) or a knob's value, by SceneWriter. The write is the
// lab's, so it carries the lab's proof: a cue the scene's timeline would not
// resolve with is refused, judged fresh on the clock the film's files give
// now; the text is formatted and read back before it lands, only over the
// text it read; `film check --static` runs fresh after it. It lands on the
// film's one history, so the owner's Undo on the studio page and the `undo`
// command step it as they step his own edits, and the change feed tells it
// (`source.written`). Tuning is the agents' work: the studio shows the code
// and draws none of these controls.

import { Effect, Option, Predicate, Record, Result, Schema } from 'effect';
import { Tool } from 'effect/ai';
import { CUE_PATCH_KEYS, CuePatchFields, Knob, LabWrite, spanEnds } from '../core/schema.ts';
import { type FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import { labCommand } from './lab-command.ts';
import { FilmParam, LabRefused, refused } from './lab-mcp-parts.ts';
import { readKnob, readSpans } from './scene-source.ts';
import { type CueWritten, SceneWriter } from './scene-writer.ts';
import { writeAnswer } from './steps-http.ts';

/** The fields of a tweak's input it is judged by: what it names, and which cue fields it sets. */
interface Asked {
  readonly cue?: string;
  readonly knob?: string;
  readonly value?: Knob;
}

/** A tweak names one cue or one knob, and gives what that one takes. Pure. */
const oneLiteral = Schema.makeFilter((input: Asked) => {
  const cue = Predicate.hasProperty(input, 'cue');
  const knob = Predicate.hasProperty(input, 'knob');
  const valued = Predicate.hasProperty(input, 'value');
  const fields = CUE_PATCH_KEYS.filter((key) => Predicate.hasProperty(input, key));
  if (cue === knob) return 'name one `cue` or one `knob`';
  if (cue && valued) return 'a cue takes its timing fields, not `value`';
  if (cue && fields.length === 0) return `set at least one of ${CUE_PATCH_KEYS.join(', ')}`;
  if (knob && !valued) return 'a knob takes its `value`';
  if (knob && fields.length > 0) return `a knob takes \`value\`, not ${fields.join(', ')}`;
  return true;
});

const TweakParams = Schema.Struct({
  ...FilmParam.fields,
  scene: Schema.String.annotate({ description: "The scene, by its id (the script's beat id)." }),
  cue: Schema.optionalKey(
    Schema.String.annotate({
      description: "The cue whose timing is set, by its name in the scene's `timeline`.",
    }),
  ),
  knob: Schema.optionalKey(
    Schema.String.annotate({
      description: "The knob whose value is set, by its name in the scene's `knobs`.",
    }),
  ),
  ...CuePatchFields,
  value: Schema.optionalKey(
    Knob.annotate({ description: "The knob's value: a number, or a point `[x, y]`." }),
  ),
})
  .check(oneLiteral)
  .check(...spanEnds);

const TweakTool = Tool.make('tweak', {
  description:
    "Set one value of a scene's `drawing({...})` literal: a `cue`'s timing (any of `offset`, `dur`, `until`, `untilOffset`, `ease`, `stagger`; `dur` and `until` each replace the other) or a `knob`'s `value`. The lab writes it into the scene file as a literal and reads it back formatted. Refused when the value is computed in the file, not a literal (the reason names the expression), when the drawing's literal is shared by other scenes, or when the cue's new timing would not resolve on the clock the film's files give now. One write through the lab's history: the owner's Undo on the studio and `undo` step it, and the change feed tells it. Answers the change's id, its file and what it set, the cue's span and where it lands on the scene's clock (or why it could not be resolved), or the knob as the file now declares it, and `film check --static` run after it.",
  parameters: TweakParams,
  success: LabWrite,
  failure: LabRefused,
});

/** A cue written, as the tweak answers it: the span as the file now reads it, and where it resolves (or why it does not). */
const cueAnswer = Effect.fn('tweak.cueAnswer')(function* (
  film: FilmName,
  cue: string,
  done: CueWritten,
) {
  const { written, read } = done;
  const spans = readSpans(written.file, written.after, written.exportName);
  const span = Option.match(Record.get(spans, cue), {
    onNone: () => ({}),
    onSome: (s) => ({ span: s }),
  });
  // Where the cue lands is the write's own check: run fresh, on the text the write made.
  const { _tag, ...where } = read;
  return yield* writeAnswer(film, written, Effect.succeed({ ...span, ...where }));
});

/** The tweak: a cue's timing or a knob's value, written and answered. */
export const tweakCommands = [
  labCommand(TweakTool, {
    run: ({ film: name, scene, cue, knob, value, ...patch }) =>
      Effect.gen(function* () {
        const writer = yield* SceneWriter;
        const films = yield* Effect.context<FilmFolder>();
        const film = yield* refused(filmNamed(name).pipe(Effect.provideContext(films)));
        const knobWrite = Effect.gen(function* () {
          // The input's check holds a knob and its value together.
          const [named, set] = yield* Effect.fromOption(
            Option.zipWith(
              Option.fromUndefinedOr(knob),
              Option.fromUndefinedOr(value),
              (k, v) => [k, v] as const,
            ),
            () => LabRefused.make({ reason: 'name one `cue` or one `knob`' }),
          );
          const written = yield* refused(writer.setKnob(film, scene, named, set));
          const read = Result.match(
            readKnob(written.file, written.after, written.exportName, named),
            {
              onFailure: () => ({}),
              onSuccess: (v) =>
                Option.match(v, { onNone: () => ({}), onSome: (k) => ({ knob: k }) }),
            },
          );
          return yield* writeAnswer(film, written, Effect.succeed(read));
        });
        return yield* Option.match(Option.fromUndefinedOr(cue), {
          onNone: () => knobWrite,
          onSome: (named) =>
            refused(
              Effect.flatMap(writer.setCue(film, scene, named, patch), (written) =>
                cueAnswer(film, named, written),
              ),
            ),
        });
      }),
  }),
];
