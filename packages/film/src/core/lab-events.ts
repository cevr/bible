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

/** What happened. */
const LabChangeKind = Schema.Literals([
  /** A note written on a frame, a line's words or a panel. */
  'note.added',
  /** A reply in a note's thread. */
  'note.replied',
  /** A note marked done. */
  'note.resolved',
  /** A note on a panel that asks for it to be made again (`film board tweak`). */
  'tweak.requested',
  /** A panel's try kept (or a different one kept). */
  'board.kept',
  /** A try added to a panel. */
  'board.tried',
  /** A beat's board approved as it stands. */
  'beat.approved',
  /** A beat's board approval withdrawn. */
  'beat.withdrawn',
  /** A comment on a render's version. */
  'render.commented',
  /** A render's version approved. */
  'render.approved',
  /** A render's approval withdrawn. */
  'render.withdrawn',
  /** A render recorded in a project folder's catalogue. */
  'render.recorded',
  /** A set (a folder with a `review.json`) that was not there before. */
  'set.published',
  /** A set's `review.json` written again. */
  'set.updated',
  /** A step of an agent's ask answered by the owner: that step's answers, typed. */
  'ask.step',
  /** An ask answered to its end: every answer, typed. */
  'ask.answered',
  /** An ask closed by its agent. */
  'ask.closed',
]);
type LabChangeKind = typeof LabChangeKind.Type;

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
  kind: LabChangeKind,
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
  /** The ask (`a1f…`) and its step answered. */
  ask: Schema.optionalKey(Schema.String),
  step: Schema.optionalKey(Schema.String),
  /** The answers, typed by the block that asked each, by its name: the step's, or every one at the end. */
  answers: Schema.optionalKey(Schema.Record(Schema.String, AskAnswer)),
  /** The whole change in one line. */
  summary: Schema.String,
  /** The lab page it is on, local and on the phone. */
  links: LabLinks,
});
export type LabChange = typeof LabChange.Type;

/** A change as it is read, before the feed numbers it, dates it and makes its links. */
export type LabChangeDraft = Omit<LabChange, 'seq' | 'at' | 'links'> & {
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
