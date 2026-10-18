// The lab's command set: every action an agent or a terminal takes on the
// lab, each defined once (`lab-command.ts`), and both transports made from
// this list alone: the lab's MCP (`lab-mcp.ts`) serves each as a tool, and
// `film lab <name>` (`lab-cli.ts`) as a command, a flag for each field.
//
// Where a terminal runs a command follows from what it needs, and the types
// hold it there:
//
// - `here`: over the lab's files alone (`HereNeeds`), so a terminal runs it
//   in its own process, through the stores the lab writes through; each
//   write holds its file's lock across processes (`ContentStore`).
// - `inLab`: over what only the running lab holds (`InLabNeeds`): its change
//   feed (`overview`, `changes`), the agents' "doing now" lines (`working`,
//   and `timeline`, which shows them), the film's one history of edits
//   (`beat_move`, `beat_hold`, `undo`: the studio page steps it too), the asks' page lock (`ask`: an ask
//   joins its asker's open page under a lock held in memory), and the easel
//   (`look`, `match`, `critique`: the warm page and the critic beside it). A
//   terminal calls it on the lab at `FILM_LAB_URL` (`lab-client.ts`).

import { Duration, Effect, type FileSystem, Option, type Path, Schema } from 'effect';
import { Tool } from 'effect/ai';
import { pageHref } from '../core/api.ts';
import { LabLinks, linksAt } from '../core/lab-events.ts';
import { unresolved } from '../core/notes.ts';
import type { AskStore } from './ask-store.ts';
import type { BeatEdits } from './beat-edits.ts';
import { askInLab, asksCommands } from './asks-mcp.ts';
import { BoardStore } from './board-store.ts';
import type { RenderCatalogue } from './catalogue.ts';
import type { ContentStore } from './content-store.ts';
import type { Critic } from './critique.ts';
import type { Easel } from './easel.ts';
import { easelCommands, easelInLab } from './easel-mcp.ts';
import { FilmFolder, filmNamed } from './film-repo.ts';
import type { FilmTimelines } from './film-timeline.ts';
import type { FreshFilm } from './fresh-film.ts';
import { LabAddress, type LabCommand, labCommand } from './lab-command.ts';
import { LabChanges, LabEvents } from './lab-events.ts';
import { LabRefused, refused } from './lab-mcp-parts.ts';
import { notesCommands } from './notes-mcp.ts';
import { NotesStore } from './notes-store.ts';
import type { ProductionStore } from './production-store.ts';
import type { Review } from './review.ts';
import { SetRead, setsCommands, setsReads } from './sets-mcp.ts';
import { timelineCommands } from './timeline-mcp.ts';
import type { Working } from './working.ts';

/** The longest a `changes` call waits for a change, in seconds: well inside the lab's idle limit. */
const MAX_WAIT_S = 120;

// ---------------------------------------------------------------------------
// The lab now, and what changed

const FilmRead = Schema.Struct({
  film: Schema.String,
  links: LabLinks,
  notes: Schema.Struct({ open: Schema.Int, replied: Schema.Int, tweaks: Schema.Int }),
  board: Schema.Struct({
    panels: Schema.Int,
    kept: Schema.Int,
    beatsApproved: Schema.Int,
  }),
});

export const OverviewRead = Schema.Struct({
  /** The lab's address as the owner opens it. */
  lab: LabLinks,
  /** The change feed's cursor now: hand it to `changes`. */
  cursor: Schema.String,
  films: Schema.Array(FilmRead),
  sets: Schema.Array(SetRead),
});

const Overview = Tool.make('overview', {
  description:
    "The lab now: every film (its open notes, tweaks asked, its board's panels kept and beats approved), every set, the lab's address, and the change feed's cursor to hand to `changes`. Start here.",
  success: OverviewRead,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

export const Changes = Tool.make('changes', {
  description: `What changed in the lab past \`since\` (a cursor from \`overview\` or an earlier \`changes\`): notes, replies and notes done, tweaks asked, tries kept and beats approved or withdrawn on a board, comments, approvals and withdrawals on renders, renders recorded, sets published or updated, and each step of an ask answered (\`ask.step\`, its answers typed), an ask answered to its end (\`ask.answered\`) or closed. Each change names its film, panel, render or set, its words, and its lab link. With \`wait\` (seconds, at most ${MAX_WAIT_S}) it answers as soon as there is one, else with none when the time is up: call it again with the cursor it answers to keep listening. With no \`since\`, it answers no changes and the cursor now. \`reset\` means the cursor was from an earlier run of the lab: the changes are all this run kept.`,
  parameters: Schema.Struct({
    since: Schema.optionalKey(Schema.String),
    wait: Schema.optionalKey(
      Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: MAX_WAIT_S })),
    ),
  }),
  success: LabChanges,
  failure: LabRefused,
}).annotate(Tool.Readonly, true);

/** The lab as the overview, the resources and the prompt read it. */
export const overviewRead = Effect.gen(function* () {
  const notes = yield* NotesStore;
  const boards = yield* BoardStore;
  const folder = yield* FilmFolder;
  const events = yield* LabEvents;
  const links = yield* LabAddress;
  const films = yield* Effect.context<FilmFolder>();
  const { sets } = yield* setsReads();
  const linksOf = (at: string) => linksAt(links, at);
  const named = (film: string) => refused(filmNamed(film).pipe(Effect.provideContext(films)));
  const filmsRead = yield* Effect.forEach(yield* folder.names, (name) =>
    Effect.gen(function* () {
      const film = yield* named(name);
      const log = yield* refused(notes.read(film));
      const board = yield* refused(boards.read(film));
      const waiting = unresolved(log);
      return {
        film,
        links: linksOf(pageHref.studio(film)),
        notes: {
          open: waiting.filter((n) => n.status === 'open').length,
          replied: waiting.filter((n) => n.status === 'replied').length,
          tweaks: waiting.filter((n) => n.panel?.ask === 'tweak').length,
        },
        board: {
          panels: board.panels.length,
          kept: board.panels.filter((p) => Option.isSome(Option.fromUndefinedOr(p.kept))).length,
          beatsApproved: board.approvals.length,
        },
      };
    }),
  );
  return {
    lab: links,
    cursor: (yield* events.since(Option.none())).cursor,
    films: filmsRead,
    sets: yield* sets,
  };
});

const labCommands = [
  labCommand(Overview, { run: () => overviewRead }),
  labCommand(Changes, {
    run: ({ since, wait }) =>
      Effect.gen(function* () {
        const events = yield* LabEvents;
        return yield* events.wait(Option.fromUndefinedOr(since), Duration.seconds(wait ?? 0));
      }),
  }),
];

// ---------------------------------------------------------------------------
// The set

/** What a command over the lab's files needs: its stores, its folders and the lab's address. */
type HereNeeds =
  | AskStore
  | ProductionStore
  | NotesStore
  | RenderCatalogue
  | BoardStore
  | FilmFolder
  | Review
  | ContentStore
  | FreshFilm
  | LabAddress
  | FileSystem.FileSystem
  | Path.Path;

/** What a command over the running lab needs beside: its change feed, its easel and critic, the timelines and the agents' lines. */
export type InLabNeeds =
  | HereNeeds
  | LabEvents
  | Easel
  | Critic
  | FilmTimelines
  | Working
  | BeatEdits;

/** The commands a terminal runs in its own process. */
export const hereCommands: ReadonlyArray<LabCommand<HereNeeds>> = [
  ...notesCommands,
  ...setsCommands,
  ...asksCommands,
  ...easelCommands,
];

/** The commands only the running lab runs: a terminal asks the lab. */
export const inLabCommands: ReadonlyArray<LabCommand<InLabNeeds>> = [
  ...labCommands,
  askInLab,
  ...timelineCommands,
  ...easelInLab,
];

/** The whole set, as the lab serves it. */
export const allCommands: ReadonlyArray<LabCommand<InLabNeeds>> = [
  ...inLabCommands,
  ...hereCommands,
];
