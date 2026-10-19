// The lab's changes as pure data: what an agent is told happened in the lab
// (a note written, a try kept, a beat approved, a render commented on, a set
// published), each with enough to act on (the film, the panel or the render,
// the words, a link to the place), and how each is read off two states of
// the files that hold it. The lab's change feed (`tools/lab-events.ts`)
// reads the files; these say what changed between two reads. A change is
// read from the record, never from the route that made it, so a write from
// the page, a terminal or an agent is seen alike. Pure and DOM-free.

import { Array as Arr, Boolean as Bool, Match, Option, Record, Schema } from 'effect';
import { addressKey } from './address.ts';
import {
  AskAnswer,
  type AskAnswers,
  type AskName,
  type AskRecord,
  answeredToEnd,
  answersLine,
  askedIn,
} from './ask.ts';
import { beatSelection, pageHref, panelSelection } from './api.ts';
import type { BoardFile, Panel } from './board.ts';
import type { Catalogue } from './catalogue.ts';
import { type PointRef, pointIdOf } from './point.ts';
import type { ProductionFile } from './production.ts';
import type { Note, NoteEvent } from './schema.ts';

/**
 * Where a place in the lab opens: on this machine (`local`, at `localhost`)
 * and from the owner's phone (`phone`), when the lab listens on its address
 * (`FILM_LAB_PHONE_URL`). Every link the lab hands out is these two.
 */
export const LabLinks = Schema.Struct({
  local: Schema.String,
  phone: Schema.optionalKey(Schema.String),
});
export type LabLinks = typeof LabLinks.Type;

/** `at`, a lab path (`/films/f/board`), under each of the lab's own `links`. Pure. */
export const linksAt = (links: LabLinks, at: string): LabLinks => ({
  local: new URL(at, links.local).href,
  ...Option.match(Option.fromUndefinedOr(links.phone), {
    onNone: () => ({}),
    onSome: (phone) => ({ phone: new URL(at, phone).href }),
  }),
});

/**
 * The lab command that reads an event's whole record: the MCP tool and its
 * arguments (also `film lab <tool>`, `tool`), and the line a terminal in
 * `apps/animations` runs for it (`cli`). A record no lab command reads (a
 * track's ledger) has its CLI line alone.
 */
const ReadCommand = Schema.Struct({
  tool: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String,
      arguments: Schema.Record(Schema.String, Schema.String),
    }),
  ),
  cli: Schema.String,
});
type ReadCommand = typeof ReadCommand.Type;

/** What an event's read is made from: the fields its change names. */
interface ReadFrom {
  readonly film?: string;
  readonly beat?: string;
  readonly set?: string;
  readonly ask?: string;
  readonly production?: string;
}

const BARE_WORD = /^[A-Za-z0-9_./:@%+=,-]+$/;

/** A word as a POSIX shell reads it back unchanged: bare when it can be, else single-quoted. Pure. */
const shellWord = (word: string): string =>
  Bool.match(BARE_WORD.test(word), {
    onTrue: () => word,
    onFalse: () => `'${word.replaceAll("'", `'\\''`)}'`,
  });

/** The read of `tool` over `args`: the MCP call, and its `film lab` line. Pure. */
const labRead = (tool: string, args: ReadonlyArray<readonly [string, string]>): ReadCommand => ({
  tool: { name: tool, arguments: Object.fromEntries(args) },
  cli: ['bun cli.ts lab', tool, ...args.map(([key, value]) => `--${key} ${shellWord(value)}`)].join(
    ' ',
  ),
});

/** The fields of `from` that are given, as a read's arguments, in `keys`' order. Pure. */
const given = (
  from: ReadFrom,
  keys: ReadonlyArray<keyof ReadFrom>,
): ReadonlyArray<readonly [string, string]> =>
  keys.flatMap((key) =>
    Option.toArray(Option.map(Option.fromUndefinedOr(from[key]), (value) => [key, value] as const)),
  );

const notesRead = (from: ReadFrom) =>
  labRead('notes', [...given(from, ['film']), ['status', 'all']]);
const boardRead = (from: ReadFrom) => labRead('board', given(from, ['film', 'beat']));
const catalogueRead = (from: ReadFrom) => labRead('catalogue', given(from, ['set']));
const setRead = (from: ReadFrom) => labRead('set', given(from, ['set']));
const askRead = (from: ReadFrom) => labRead('ask_read', given(from, ['ask']));
/** A film's ledger reads as its timeline; a track's (no film) by the production CLI alone. */
const productionRead = (from: ReadFrom): ReadCommand =>
  Option.match(Option.fromUndefinedOr(from.film), {
    onSome: (film) => labRead('timeline', [['film', film]]),
    onNone: () => ({
      cli: `bun cli.ts production show ${shellWord(from.production ?? '')}`,
    }),
  });

/** One event of the lab's: what it says, and the read of its whole record. */
interface LabEventDefinition {
  readonly description: string;
  readonly read: (from: ReadFrom) => ReadCommand;
}

/**
 * The lab's events, by name: the one list the change feed (`changes`), the
 * terminal's stream (`film lab events`) and MCP Events (`events/list`) all
 * read. Every event carries one payload (`LabChange`): its summary, the
 * fields it is about, its link and its read.
 */
export const LAB_EVENTS = {
  'note.added': {
    description: "A note written on a frame, a line's words or a panel.",
    read: notesRead,
  },
  'note.replied': { description: "A reply in a note's thread.", read: notesRead },
  'note.resolved': { description: 'A note marked done.', read: notesRead },
  'tweak.requested': {
    description: 'A note on a panel that asks for it to be made again (`film board tweak`).',
    read: notesRead,
  },
  'board.kept': { description: "A panel's try kept (or a different one kept).", read: boardRead },
  'board.tried': { description: 'A try added to a panel.', read: boardRead },
  'beat.approved': { description: "A beat's board approved as it stands.", read: boardRead },
  'beat.withdrawn': { description: "A beat's board approval withdrawn.", read: boardRead },
  'render.commented': { description: "A comment on a render's version.", read: catalogueRead },
  'render.approved': { description: "A render's version approved.", read: catalogueRead },
  'render.withdrawn': { description: "A render's approval withdrawn.", read: catalogueRead },
  'render.recorded': {
    description: "A render recorded in a project folder's catalogue.",
    read: catalogueRead,
  },
  'set.published': {
    description: 'A set (a folder with a `review.json`) that was not there before.',
    read: setRead,
  },
  'set.updated': { description: "A set's `review.json` written again.", read: setRead },
  'ask.step': {
    description: "A step of an agent's ask answered by the owner: that step's answers, typed.",
    read: askRead,
  },
  'ask.answered': {
    description: 'An ask answered to its end: every answer, typed.',
    read: askRead,
  },
  'ask.closed': { description: 'An ask closed by its agent.', read: askRead },
  'production.decided': {
    description:
      "The owner's decision filed on a production's timeline (from chat, or by an ask he answered).",
    read: productionRead,
  },
  'production.noted': {
    description: "The owner's feedback filed on a production's timeline.",
    read: productionRead,
  },
  'production.asked': {
    description: "A question an agent's ask put on a production's timeline.",
    read: productionRead,
  },
  'production.forwarded': {
    description: 'A production moved into its next version.',
    read: productionRead,
  },
} satisfies Record<string, LabEventDefinition>;

/** An event's name: one of the catalogue's. */
const LabEventName = Schema.Literals(Record.keys(LAB_EVENTS));

/** Whether `name` matches one of `globs` (`ask.*`, `*.approved`; `*` any run of characters), or none is given. Pure. */
export const namesMatch = (globs: ReadonlyArray<string>, name: string): boolean =>
  Arr.match(globs, {
    onEmpty: () => true,
    onNonEmpty: (all) =>
      all.some((glob) =>
        new RegExp(
          `^${glob
            .split('*')
            .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*')}$`,
        ).test(name),
      ),
  });

/** The most bytes an event's payload takes as JSON: an MCP Events delivery body is at most 256 KiB, with room for its envelope. */
const PAYLOAD_MAX_BYTES = 240 * 1024;

/** Who made a change, when the record says: the owner (`user` in a note) or an agent. */
const LabActor = Schema.Literals(['owner', 'agent']);
type LabActor = typeof LabActor.Type;

/**
 * One change as the feed hands it on: its place in the feed, when the lab
 * saw it, what happened, who did it when the record says, what it is about,
 * a line that says it all, and the lab page it is on.
 */
export const LabChange = Schema.Struct({
  /** Its place in the feed, from 1: a cursor waits past it. */
  seq: Schema.Int,
  /** ISO time the lab read it. */
  at: Schema.String,
  kind: LabEventName,
  by: Schema.optionalKey(LabActor),
  film: Schema.optionalKey(Schema.String),
  /** The set (a review folder's ref, `p5/storyboard-2026-10-14`). */
  set: Schema.optionalKey(Schema.String),
  /** The note (`n12`) or the comment (`c3`). */
  note: Schema.optionalKey(Schema.String),
  /** The board panel (`cold.righteous`). */
  panel: Schema.optionalKey(Schema.String),
  beat: Schema.optionalKey(Schema.String),
  try: Schema.optionalKey(Schema.Int),
  /** A render's address (`scenes:cold`, `film`) and variant. */
  address: Schema.optionalKey(Schema.String),
  variant: Schema.optionalKey(Schema.String),
  /** The words: the note's, the reply's, the comment's, why a try was kept, why an ask was closed. */
  text: Schema.optionalKey(Schema.String),
  /** The production whose timeline it is on, and the version it opened (`production.forwarded`). */
  production: Schema.optionalKey(Schema.String),
  version: Schema.optionalKey(Schema.Int),
  /** The ask (`a1f…`) and its step answered. */
  ask: Schema.optionalKey(Schema.String),
  step: Schema.optionalKey(Schema.String),
  /** The answers, typed by the block that asked each, by its name: the step's, or every one at the end. */
  answers: Schema.optionalKey(Schema.Record(Schema.String, AskAnswer)),
  /** The whole change in one line. */
  summary: Schema.String,
  /** The lab page it is on, local and on the phone. */
  links: LabLinks,
  /** The lab command that reads its whole record. */
  read: ReadCommand,
  /** Its words or answers were left out to keep it under `PAYLOAD_MAX_BYTES`: `read` has them. */
  trimmed: Schema.optionalKey(Schema.Boolean),
});
export type LabChange = typeof LabChange.Type;

/**
 * A change of a kind this checkout's catalogue does not name (a lab newer
 * than the checkout sends it): the fields every change carries, read as
 * they are, so a reader tells it from them rather than stopping at it.
 */
const ForeignChange = Schema.Struct({
  seq: Schema.Int,
  at: Schema.String,
  kind: Schema.String,
  by: Schema.optionalKey(Schema.String),
  film: Schema.optionalKey(Schema.String),
  set: Schema.optionalKey(Schema.String),
  note: Schema.optionalKey(Schema.String),
  panel: Schema.optionalKey(Schema.String),
  beat: Schema.optionalKey(Schema.String),
  try: Schema.optionalKey(Schema.Int),
  address: Schema.optionalKey(Schema.String),
  variant: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
  production: Schema.optionalKey(Schema.String),
  ask: Schema.optionalKey(Schema.String),
  step: Schema.optionalKey(Schema.String),
  summary: Schema.String,
  links: LabLinks,
  read: Schema.optionalKey(Schema.Struct({ cli: Schema.String })),
});

/** A change as a reader of the feed hears it: one of the catalogue's, or one of a kind it does not know. */
export const HeardChange = Schema.Union([LabChange, ForeignChange]);
export type HeardChange = typeof HeardChange.Type;

/** Whether `change` is one of the catalogue's, as this checkout reads it. Pure. */
export const isKnownChange: (change: HeardChange) => change is LabChange = Schema.is(LabChange);

/** A change as it is read, before the feed numbers it, dates it and makes its links. */
export type LabChangeDraft = Omit<LabChange, 'seq' | 'at' | 'links' | 'read' | 'trimmed'> & {
  /** The lab path it is on (`/films/f/studio?sel=panel:cold.judge`). */
  readonly path: string;
};

/** A note's words cut to one line of at most `max` characters, for a summary. */
export const gist = (text: string, max = 120): string => {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
};

/** The studio on `beat`, its Board open on the panel held from `at` (`start` too) when one is named. */
export const boardPath = (film: string, beat: string, at: Option.Option<string>) =>
  pageHref.studio(film, {
    sel: Option.match(at, {
      onNone: () => beatSelection(beat),
      onSome: (mark) => panelSelection(`${beat}.${mark}`),
    }),
  });

/** The studio on a panel, try `n` of it shown in the viewer. */
const tryPath = (film: string, panel: Panel, n: number) =>
  pageHref.studio(film, { sel: panelSelection(panel.id), try: n });

/**
 * Where a note is read: the studio with the note open in its inspector
 * (`?note=`), its panel selected when it is on one, else its beat (a note on
 * a frame or on words is on its scene, the beat of that id).
 */
export const notePath = (note: Note): string =>
  pageHref.studio(note.film, {
    sel: Option.match(Option.fromUndefinedOr(note.panel), {
      onSome: (panel) => panelSelection(panel.id),
      onNone: () => beatSelection(note.scene),
    }),
    note: note.id,
  });

/** What a note is about, said briefly: its panel, its words, or its scene. */
const aboutNote = (note: Note): string =>
  Option.match(Option.fromUndefinedOr(note.panel), {
    onSome: (panel) => `panel ${panel.id}`,
    onNone: () =>
      Option.match(Option.fromUndefinedOr(note.words), {
        onSome: (words) => `"${gist(words.text, 40)}" in ${words.beat}`,
        onNone: () => `scene ${note.scene}`,
      }),
  });

/** The note's own fields every change on it carries. */
const noteFields = (note: Note) => ({
  film: note.film,
  note: note.id,
  ...Option.match(Option.fromUndefinedOr(note.panel), {
    onNone: () => ({}),
    onSome: (panel) => ({
      panel: panel.id,
      beat: note.scene,
      ...Option.match(Option.fromUndefinedOr(panel.try), {
        onNone: () => ({}),
        onSome: (n) => ({ try: n }),
      }),
    }),
  }),
  path: notePath(note),
});

/** Who a reply is by, as the feed says it: the owner (`user`) or an agent. */
const actorOf = (by: NoteEvent['note']['thread'][number]['by']): LabActor =>
  Bool.match(by === 'user', { onTrue: () => 'owner', onFalse: () => 'agent' });

/** One change of a film's note log, as the feed says it. */
const noteChange = Match.type<NoteEvent>().pipe(
  Match.tagsExhaustive({
    NoteAdded: ({ note }): LabChangeDraft => {
      const tweak = note.panel?.ask === 'tweak';
      return {
        ...noteFields(note),
        kind: Bool.match(tweak, { onTrue: () => 'tweak.requested', onFalse: () => 'note.added' }),
        by: 'owner',
        text: note.text,
        summary: `${note.film} ${note.id}: ${Bool.match(tweak, {
          onTrue: () => 'tweak asked of',
          onFalse: () => 'note on',
        })} ${aboutNote(note)}: ${gist(note.text)}`,
      };
    },
    NoteReplied: ({ note, reply }): LabChangeDraft => {
      const by = actorOf(reply.by);
      return {
        ...noteFields(note),
        kind: 'note.replied',
        by,
        text: reply.text,
        summary: `${note.film} ${note.id}: ${by} replied: ${gist(reply.text)}`,
      };
    },
    NoteResolved: ({ note }): LabChangeDraft => ({
      ...noteFields(note),
      kind: 'note.resolved',
      text: note.text,
      summary: `${note.film} ${note.id} done: ${gist(note.text)}`,
    }),
  }),
);

/** The changes a film's note log made past a cursor (`eventsSince`), as the feed says them. */
export const noteChanges = (events: ReadonlyArray<NoteEvent>): ReadonlyArray<LabChangeDraft> =>
  events.map(noteChange);

/** The panel `id` in `board`, if it has it. */
const panelIn = (board: BoardFile, id: string): Option.Option<Panel> =>
  Arr.findFirst(board.panels, (p) => p.id === id);

/**
 * What changed on a film's board between two reads: each try kept (or kept
 * instead of another), each try added, each beat approved (again, on other
 * tries) and each approval withdrawn.
 */
export const boardChanges = (
  before: BoardFile,
  after: BoardFile,
): ReadonlyArray<LabChangeDraft> => {
  const film = after.film;
  const panels = after.panels.flatMap((panel): Array<LabChangeDraft> => {
    const was = panelIn(before, panel.id);
    const where = { film, panel: panel.id, beat: panel.beat };
    const known = new Set(
      Option.match(was, { onNone: () => [], onSome: (p) => p.tries.map((t) => t.n) }),
    );
    const tried = panel.tries
      .filter((t) => !known.has(t.n))
      .map((t): LabChangeDraft => ({
        ...where,
        kind: 'board.tried',
        try: t.n,
        ...Option.match(Option.fromUndefinedOr(t.note), {
          onNone: () => ({}),
          onSome: (note) => ({ note }),
        }),
        summary: `${film} ${panel.id}: try ${t.n} added (${t.made}${Option.match(Option.fromUndefinedOr(t.note), { onNone: () => '', onSome: (n) => ` for ${n}` })})`,
        path: tryPath(film, panel, t.n),
      }));
    const keptBefore = Option.flatMap(was, (p) => Option.fromUndefinedOr(p.kept));
    const kept = Option.filter(
      Option.fromUndefinedOr(panel.kept),
      (n) => !Option.contains(keptBefore, n),
    );
    const keeps = Option.toArray(
      Option.map(kept, (n): LabChangeDraft => ({
        ...where,
        kind: 'board.kept',
        try: n,
        ...Option.match(Option.fromUndefinedOr(panel.why), {
          onNone: () => ({}),
          onSome: (text) => ({ text }),
        }),
        summary: `${film} ${panel.id}: try ${n} kept${Option.match(Option.fromUndefinedOr(panel.why), { onNone: () => '', onSome: (why) => `: ${gist(why)}` })}`,
        path: tryPath(film, panel, n),
      })),
    );
    return [...tried, ...keeps];
  });
  const approvalKey = (a: BoardFile['approvals'][number]) => `${a.beat} ${a.at}`;
  const had = new Set(before.approvals.map(approvalKey));
  const has = new Set(after.approvals.map(approvalKey));
  const approved = after.approvals
    .filter((a) => !had.has(approvalKey(a)))
    .map((a): LabChangeDraft => ({
      film,
      beat: a.beat,
      kind: 'beat.approved',
      summary: `${film} beat ${a.beat}: board approved (${a.kept.map((k) => `${k.panel}#${k.try}`).join(', ')})`,
      path: boardPath(film, a.beat, Option.none()),
    }));
  const stillApproved = new Set(after.approvals.map((a) => a.beat));
  const withdrawn = before.approvals
    .filter((a) => !has.has(approvalKey(a)) && !stillApproved.has(a.beat))
    .map((a): LabChangeDraft => ({
      film,
      beat: a.beat,
      kind: 'beat.withdrawn',
      summary: `${film} beat ${a.beat}: board approval withdrawn`,
      path: boardPath(film, a.beat, Option.none()),
    }));
  return [...panels, ...approved, ...withdrawn];
};

/** What a say is about on the review: its point's id (a render set's, unless it names another). */
const pointIdAbout = (say: Pick<Catalogue['comments'][number], 'address' | 'point'>): string =>
  pointIdOf(
    Option.getOrElse(say.point, (): PointRef => ({ _tag: 'Render', address: say.address })),
  );

/**
 * What changed in a project folder's catalogue between two reads: each
 * comment said, each approval given or withdrawn, each render recorded.
 * `set` is the folder's ref, where its sets are linked.
 */
export const catalogueChanges = (
  set: string,
  before: Catalogue,
  after: Catalogue,
): ReadonlyArray<LabChangeDraft> => {
  const film = after.film;
  const about = (say: Pick<Catalogue['comments'][number], 'address' | 'point' | 'variant'>) => ({
    film,
    set,
    address: addressKey(say.address),
    variant: say.variant,
    path: pageHref.set(set, pointIdAbout(say), say.variant),
  });
  const named = (say: Pick<Catalogue['comments'][number], 'address' | 'point' | 'variant'>) =>
    `${film} ${pointIdAbout(say)} ${say.variant}`;
  const said = new Set(before.comments.map((c) => c.id));
  const comments = after.comments
    .filter((c) => !said.has(c.id))
    .map((c): LabChangeDraft => ({
      ...about(c),
      kind: 'render.commented',
      by: 'owner',
      note: c.id,
      text: c.text,
      summary: `${named(c)}: ${c.id}: ${gist(c.text)}`,
    }));
  const approvalKey = (a: Catalogue['approvals'][number]) =>
    `${pointIdAbout(a)} ${a.variant} ${a.key} ${a.at}`;
  const had = new Set(before.approvals.map(approvalKey));
  const has = new Set(after.approvals.map(approvalKey));
  const approved = after.approvals
    .filter((a) => !had.has(approvalKey(a)))
    .map((a): LabChangeDraft => ({
      ...about(a),
      kind: 'render.approved',
      summary: `${named(a)}: approved`,
    }));
  const withdrawn = before.approvals
    .filter((a) => !has.has(approvalKey(a)))
    .map((a): LabChangeDraft => ({
      ...about(a),
      kind: 'render.withdrawn',
      summary: `${named(a)}: approval withdrawn`,
    }));
  const renderKey = (r: Catalogue['renders'][number]) =>
    `${addressKey(r.address)} ${r.variant} ${r.kind} ${r.at}`;
  const recorded = new Set(before.renders.map(renderKey));
  const renders = after.renders
    .filter((r) => !recorded.has(renderKey(r)))
    .map((r): LabChangeDraft => ({
      film,
      set,
      address: addressKey(r.address),
      variant: r.variant,
      kind: 'render.recorded',
      summary: `${film} ${addressKey(r.address)} ${r.variant}: ${r.kind} recorded`,
      path: Bool.match(r.kind === 'video', {
        onTrue: () =>
          pageHref.set(set, pointIdOf({ _tag: 'Render', address: r.address }), r.variant),
        onFalse: () => pageHref.folder(set),
      }),
    }));
  return [...comments, ...approved, ...withdrawn, ...renders];
};

/** A set as the feed knows it: its title and the stamp its `review.json` had when read. */
export interface SetSeen {
  readonly title: Option.Option<string>;
  readonly stamp: string;
}

/** The sets published or written again between two reads, by ref. */
export const setChanges = (
  before: ReadonlyMap<string, SetSeen>,
  after: ReadonlyMap<string, SetSeen>,
): ReadonlyArray<LabChangeDraft> =>
  [...after].flatMap(([set, seen]): Array<LabChangeDraft> => {
    const was = Option.fromUndefinedOr(before.get(set));
    const titled = Option.match(seen.title, { onNone: () => set, onSome: (t) => `${set} (${t})` });
    if (Option.isNone(was))
      return [
        {
          set,
          kind: 'set.published',
          summary: `set ${titled} published`,
          path: pageHref.folder(set),
        },
      ];
    if (was.value.stamp === seen.stamp) return [];
    return [
      { set, kind: 'set.updated', summary: `set ${titled} updated`, path: pageHref.folder(set) },
    ];
  });

/** The answers `record` holds that step `step` asked. */
const answersOf = (record: AskRecord, step: AskName): AskAnswers =>
  Option.match(Record.get(record.ask.steps, step), {
    onNone: () => ({}),
    onSome: (at) =>
      Record.filter(record.state.answers, (_, id) => askedIn(at).some((b) => b.id === id)),
  });

/**
 * What happened to an ask between two reads (none before: made since; its
 * making is not news, the agent that made it knows): each step the owner
 * answered since, with its answers; the ask answered to its end, with them
 * all (read from its answered steps, so a close in the same look keeps it);
 * and closed.
 */
export const askChanges = (
  before: Option.Option<AskRecord>,
  after: AskRecord,
): ReadonlyArray<LabChangeDraft> => {
  const was = Option.match(before, { onNone: () => 0, onSome: (b) => b.answered.length });
  const path = pageHref.ask(after.id);
  const of = {
    ask: after.id,
    ...Option.match(Option.fromUndefinedOr(after.film), {
      onNone: () => ({}),
      onSome: (film) => ({ film }),
    }),
  };
  const steps = after.answered.slice(was).map((a): LabChangeDraft => {
    const answers = answersOf(after, a.step);
    return {
      ...of,
      kind: 'ask.step',
      by: 'owner',
      step: a.step,
      answers,
      summary: `ask ${after.id} (${gist(after.title, 60)}) step ${a.step} answered: ${gist(answersLine(answers), 200)}`,
      path,
    };
  });
  // Each from the history, not the state's tag alone: an answer and a close
  // read in one look still tell that the ask was answered, then closed.
  const held = (test: (r: AskRecord) => boolean) => Option.exists(before, test);
  const answered = Arr.filter(
    [
      {
        ...of,
        kind: 'ask.answered' as const,
        by: 'owner' as const,
        answers: after.state.answers,
        summary: `ask ${after.id} (${gist(after.title, 60)}) answered: ${gist(answersLine(after.state.answers), 200)}`,
        path,
      },
    ],
    () => answeredToEnd(after) && !held(answeredToEnd),
  );
  const isClosed = (r: AskRecord) => r.state._tag === 'Closed';
  const closed = Match.value(after.state).pipe(
    Match.tag('Closed', (s): ReadonlyArray<LabChangeDraft> => [
      {
        ...of,
        kind: 'ask.closed',
        by: 'agent',
        text: s.why,
        answers: s.answers,
        summary: `ask ${after.id} (${gist(after.title, 60)}) closed: ${gist(s.why, 80)}`,
        path,
      },
    ]),
    Match.orElse((): ReadonlyArray<LabChangeDraft> => []),
  );
  return [...steps, ...answered, ...Arr.filter(closed, () => !held(isClosed))];
};

/** What is new on a production's ledger between two reads: each word filed, each version opened. */
export const productionChanges = (
  before: Option.Option<ProductionFile>,
  after: ProductionFile,
): ReadonlyArray<LabChangeDraft> => {
  const of = {
    production: after.production,
    ...Option.match(after.film, { onNone: () => ({}), onSome: (film) => ({ film }) }),
  };
  // Words are kept in time order, so one filed with an earlier time lands among them: known by what it is.
  const wordKey = (word: ProductionFile['said'][number]) => `${word._tag} ${word.at} ${word.text}`;
  const known = new Set(
    Option.match(before, { onNone: () => [], onSome: (b) => b.said.map(wordKey) }),
  );
  const versions = Option.match(before, { onNone: () => 0, onSome: (b) => b.versions.length });
  const kinds = {
    Decided: 'production.decided',
    Noted: 'production.noted',
    Asked: 'production.asked',
  } as const;
  const verbs = { Decided: 'decided', Noted: 'noted', Asked: 'asked' } as const;
  const said = after.said
    .filter((word) => !known.has(wordKey(word)))
    .map((word): LabChangeDraft => ({
      ...of,
      kind: kinds[word._tag],
      by: Bool.match(word._tag === 'Asked', { onTrue: () => 'agent', onFalse: () => 'owner' }),
      text: word.text,
      ...Option.match(word.set, { onNone: () => ({}), onSome: (set) => ({ set }) }),
      ...Option.match(word.ask, { onNone: () => ({}), onSome: (ask) => ({ ask }) }),
      summary: `${after.production} ${verbs[word._tag]}: ${gist(word.text)}`,
      path: pageHref.production(after.production),
    }));
  const opened = after.versions.slice(versions).map((version, i): LabChangeDraft => {
    const number = versions + i + 1;
    return {
      ...of,
      kind: 'production.forwarded',
      version: number,
      text: version.title,
      summary: `${after.production} v${number}: ${gist(version.title)}`,
      path: pageHref.production(after.production, number),
    };
  });
  // A ledger first seen is its first version: news only past it.
  return [...said, ...Arr.filter(opened, () => Option.isSome(before))];
};

const jsonBytes = (change: LabChange) =>
  new TextEncoder().encode(Schema.encodeSync(Schema.fromJsonString(LabChange))(change)).length;

/** `change` within `PAYLOAD_MAX_BYTES`: its answers left out and its words cut, said as `trimmed`, when it is over. Pure. */
const bounded = (change: LabChange): LabChange =>
  Bool.match(jsonBytes(change) <= PAYLOAD_MAX_BYTES, {
    onTrue: () => change,
    onFalse: () => {
      const { answers: _answers, text, ...rest } = change;
      return {
        ...rest,
        ...Option.match(Option.fromUndefinedOr(text), {
          onNone: () => ({}),
          onSome: (words) => ({ text: gist(words, 2000) }),
        }),
        trimmed: true,
      };
    },
  });

/** A draft as the feed keeps it: numbered, dated, linked under the lab's `links`, its read named, within its bound. Pure. */
export const changeOf = (
  { path: place, ...draft }: LabChangeDraft,
  seq: number,
  at: string,
  links: LabLinks,
): LabChange =>
  bounded({
    ...draft,
    seq,
    at,
    links: linksAt(links, place),
    read: LAB_EVENTS[draft.kind].read(draft),
  });
