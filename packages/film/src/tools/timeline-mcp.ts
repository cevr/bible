// The lab MCP's studio tools (`lab-mcp.ts` serves them): a film's timeline
// read as the studio page reads it (`timeline`, over `FilmTimelines`), an
// agent's "doing now" line said on the studio's header (`working`, held in
// the lab's memory by `Working`), and the studio's edits of a version's
// script (`beat_move`, `beat_hold`, and `undo` of the film's newest change),
// made by `BeatEdits` as the page makes them: the owner and the agents step
// one history.

import { Duration, Effect, Layer, Match, Option, Schema } from 'effect';
import { ChangeId } from '../core/schema.ts';
import { BeatEdits, type Edited } from './beat-edits.ts';
import { McpServer, Tool, Toolkit } from 'effect/ai';
import { onlyTracks } from '../core/film-timeline.ts';
import { seamsAround } from '../core/beat-edit.ts';
import { FilmTimeline, Track, WorkingLine } from '../core/timeline-schema.ts';
import { LabLinks } from '../core/lab-events.ts';
import { type FilmFolder, filmNamed } from './film-repo.ts';
import { FilmTimelines } from './film-timeline.ts';
import { FilmParam, LabRefused, type LabMcpOptions, refused } from './lab-mcp-parts.ts';
import { logged } from './mcp-calls.ts';
import { WORKING_HELD, Working } from './working.ts';

// ---------------------------------------------------------------------------
// What the tools answer, and the tools

/** A timeline as an agent reads it: the model, and the lab's address its `href`s are paths under. */
const TimelineRead = Schema.Struct({
  ...FilmTimeline.fields,
  /** The lab's own address (on this machine, and from the owner's phone): each `href` is a path under it. */
  lab: LabLinks,
});

const WorkingRead = Schema.Struct({
  film: Schema.String,
  /** The film's lines now, the newest first. */
  working: Schema.Array(WorkingLine),
});

const TimelineTool = Tool.make('timeline', {
  description:
    "A film's timeline at one version, as the studio draws it: each stage of the flow that has material is a lane of clips on the film's clock (script beats, Board panels on their marks, takes, scenes, score movements, renders), each with its start and length in seconds, its state (made, kept, approved) and its clock (`estimated`: words at the reading pace, no take yet). Beside it: the act bands, the flags of what waits on the owner (open asks, his notes not yet done) at their times, each of the nine stages reached, a gap or ahead, the Next row (the first stage ahead and what starts it), and the header (the stage, what waits on him, the agents' `working` lines). `version` (a number) reads another version; the production's open one when left out. `tracks` keeps only those lanes.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    version: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
        description: "The version's number (the production's open one when left out).",
      }),
    ),
    tracks: Schema.optionalKey(Schema.Array(Track)),
  }),
  success: TimelineRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

const WorkingTool = Tool.make('working', {
  description: `Say on the film's studio header what you are doing now, in one line (\`text\`: "drawing cold from its Board"), as \`by\` (who you are): it replaces your last line on that film. Say \`done: true\` (no \`text\` needed) when you finish and your line clears; a line you leave clears after ${Duration.toMinutes(WORKING_HELD)} minutes of silence. The lab holds it in memory only. Answers the film's lines now.`,
  parameters: Schema.Struct({
    ...FilmParam.fields,
    text: Schema.optionalKey(
      Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(200)).annotate({
        description: 'What you are doing now, in one line: needed unless `done` is true.',
      }),
    ),
    by: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)).annotate({
      description: 'Who you are: your line on the film is the one this names.',
    }),
    done: Schema.optionalKey(Schema.Boolean),
  }),
  success: WorkingRead,
  failure: LabRefused,
});

/** An edit as an agent reads it: the change it made (the id `undo` takes), what it set, and what it says. */
const EditRead = Schema.Struct({
  change: Schema.optionalKey(ChangeId),
  target: Schema.String,
  said: Schema.String,
  /** A hold's: the seams into and out of its beat as the version reads after it, seconds from one beat's words to the next's. */
  seams: Schema.optionalKey(
    Schema.Array(Schema.Struct({ from: Schema.String, to: Schema.String, seconds: Schema.Finite })),
  ),
});

const VersionParam = Schema.optionalKey(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).annotate({
    description:
      "The version whose script is edited, by its number (the production's open one when left out).",
  }),
);

const ByParam = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80)).annotate({
  description: 'Who you are: the work the edit files on the ledger names you.',
});

const BeatMoveTool = Tool.make('beat_move', {
  description:
    "Move a beat of a version's script before another beat, or to the end (`before` left out), as the studio's drag does: one write of the script's beats order through the lab's history (the owner's ⌘Z undoes it, and `undo` undoes his). Refused when the move is no move or would put an act or a score movement before the one declared ahead of it. The film follows on its next read (later beats, their Board panels, scenes and movements move with their beats); a film with a production gets \"re-time, re-check seams, re-render\" filed on its ledger while the move stands. Answers the change's id, what it set and what it says.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    version: VersionParam,
    beat: Schema.String.annotate({ description: 'The beat to move, by its id.' }),
    before: Schema.optionalKey(
      Schema.String.annotate({ description: 'The beat it goes before; the end when left out.' }),
    ),
    by: ByParam,
  }),
  success: EditRead,
  failure: LabRefused,
});

const BeatHoldTool = Tool.make('beat_hold', {
  description:
    "Set a beat's hold, as the studio's trim of a clip's edge does: `lead` (the time before its words) or `tail` (the time after them) held `seconds`, snapped to 0.1 s and kept at or above its floor (lead 0.5 s, tail 0.1 s, or less when the beat already holds less); a tail on 0.1 s is the default and is written as none. Refused when it would change nothing the film plays: a beat with no words, or a tail its `min` absorbs. One write of the script through the lab's history, filed on the ledger as `beat_move` is. Answers the change's id, what it set, what it says, and the seams into and out of the beat as the version reads after it.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    version: VersionParam,
    beat: Schema.String.annotate({ description: 'The beat whose hold is set, by its id.' }),
    edge: Schema.Literals(['lead', 'tail']),
    seconds: Schema.Finite.annotate({ description: 'The hold, in seconds.' }),
    by: ByParam,
  }),
  success: EditRead,
  failure: LabRefused,
});

const UndoTool = Tool.make('undo', {
  description:
    "Undo the film's newest change in the lab's one history (the owner's edits on the studio page and the agents' alike), or, given `change` (an id an edit answered), that change only: refused when another change stands before it, so an older step is never undone past a newer one. Withdraws the work its edit filed on the ledger. Answers what it undid.",
  parameters: Schema.Struct({
    ...FilmParam.fields,
    change: Schema.optionalKey(ChangeId),
  }),
  success: EditRead,
  failure: LabRefused,
});

const TimelineToolkit = Toolkit.make(
  TimelineTool,
  WorkingTool,
  BeatMoveTool,
  BeatHoldTool,
  UndoTool,
);

/** An edit as the tools answer it. */
const editRead = (edited: Edited) => ({
  ...Option.match(edited.change, { onNone: () => ({}), onSome: (c) => ({ change: c.id }) }),
  target: edited.target,
  said: edited.said,
});

/** The script lane's clips of `timeline`: its beats in film order. */
const scriptLane = (timeline: FilmTimeline) =>
  timeline.lanes.flatMap((lane) =>
    Match.value(lane).pipe(
      Match.when({ track: 'script' }, (l) => l.clips),
      Match.orElse(() => []),
    ),
  );

/** What a line said with no words is refused with. */
const NO_TEXT = LabRefused.make({
  reason: 'say `text` (what you are doing now), or `done: true` to clear your line',
});

/** The studio's tools, served by the lab's MCP server. */
export const timelineMcp = (options: LabMcpOptions) =>
  McpServer.toolkit(TimelineToolkit).pipe(
    Layer.provideMerge(
      TimelineToolkit.toLayer(
        Effect.gen(function* () {
          const timelines = yield* FilmTimelines;
          const working = yield* Working;
          const films = yield* Effect.context<FilmFolder>();
          const edits = yield* BeatEdits;
          return TimelineToolkit.of({
            beat_move: logged('beat_move', ({ film, version, beat, before, by }) =>
              refused(
                Effect.map(
                  edits.move({
                    film,
                    version: Option.fromUndefinedOr(version),
                    beat,
                    before: Option.fromUndefinedOr(before),
                    by,
                  }),
                  editRead,
                ),
              ),
            ),
            beat_hold: logged('beat_hold', ({ film, version, beat, edge, seconds, by }) =>
              refused(
                Effect.gen(function* () {
                  const held = yield* edits.hold({
                    film,
                    version: Option.fromUndefinedOr(version),
                    beat,
                    edge,
                    seconds,
                    by,
                  });
                  // The version read again after the write: the seams the hold moved.
                  const after = yield* timelines.timeline(film, Option.fromUndefinedOr(version));
                  return { ...editRead(held), seams: seamsAround(scriptLane(after), beat) };
                }),
              ),
            ),
            undo: logged('undo', ({ film, change }) =>
              refused(
                Effect.map(
                  edits.step(
                    'undo',
                    film,
                    Option.match(Option.fromUndefinedOr(change), {
                      onNone: () => ({}),
                      onSome: (c) => ({ change: c }),
                    }),
                  ),
                  editRead,
                ),
              ),
            ),
            timeline: logged('timeline', ({ film, version, tracks }) =>
              refused(
                Effect.map(timelines.timeline(film, Option.fromUndefinedOr(version)), (read) => ({
                  ...onlyTracks(read, Option.fromUndefinedOr(tracks)),
                  lab: options.links,
                })),
              ),
            ),
            working: logged('working', ({ film, text, by, done }) =>
              refused(
                Effect.gen(function* () {
                  const named = yield* filmNamed(film).pipe(Effect.provideContext(films));
                  if (done === true) yield* working.done(named, by);
                  else
                    yield* Option.match(Option.fromUndefinedOr(text), {
                      onNone: () => Effect.fail(NO_TEXT),
                      onSome: (line) => working.say(named, by, line),
                    });
                  return { film: named, working: yield* working.on(named) };
                }),
              ),
            ),
          });
        }),
      ),
    ),
  );
