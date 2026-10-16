// The lab MCP's studio tools (`lab-mcp.ts` serves them): a film's timeline
// read as the studio page reads it (`timeline`, over `FilmTimelines`), and an
// agent's "doing now" line said on the studio's header (`working`, held in
// the lab's memory by `Working`).

import { Duration, Effect, Layer, Option, Schema } from 'effect';
import { McpServer, Tool, Toolkit } from 'effect/ai';
import { FilmTimeline, Track, WorkingLine, onlyTracks } from '../core/film-timeline.ts';
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
  description: `Say on the film's studio header what you are doing now, in one line (\`text\`: "drawing cold from its Board"), as \`by\` (who you are): it replaces your last line on that film. Say \`done: true\` when you finish and it clears; a line you leave clears after ${Duration.toMinutes(WORKING_HELD)} minutes of silence. The lab holds it in memory only. Answers the film's lines now.`,
  parameters: Schema.Struct({
    ...FilmParam.fields,
    text: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(200)),
    by: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(80))),
    done: Schema.optionalKey(Schema.Boolean),
  }),
  success: WorkingRead,
  failure: LabRefused,
});

const TimelineToolkit = Toolkit.make(TimelineTool, WorkingTool);

/** Who says a line when the call names no one. */
const AN_AGENT = 'agent';

/** The studio's tools, served by the lab's MCP server. */
export const timelineMcp = (options: LabMcpOptions) =>
  McpServer.toolkit(TimelineToolkit).pipe(
    Layer.provideMerge(
      TimelineToolkit.toLayer(
        Effect.gen(function* () {
          const timelines = yield* FilmTimelines;
          const working = yield* Working;
          const films = yield* Effect.context<FilmFolder>();
          return TimelineToolkit.of({
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
                  const who = by ?? AN_AGENT;
                  if (done === true) yield* working.done(named, who);
                  else yield* working.say(named, who, text);
                  return { film: named, working: yield* working.on(named) };
                }),
              ),
            ),
          });
        }),
      ),
    ),
  );
