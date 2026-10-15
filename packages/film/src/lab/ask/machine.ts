// An ask's page, as one machine: it reads the ask (its record: the agent's
// machine and where its run is), keeps the owner's draft of every answer on
// its one page (each section the draft reaches, `sectionsOf`), and sends
// them all as the state's task, so one send is out at a time. The draft is
// checked as the lab will check it before it goes: a question left open is
// named by its label and marked (`missing`), so the page can take the owner
// to it. The lab's answer is the ask as it leaves it, its end, and a fresh
// draft.
//
// The page's answers are the owner's draft, and once the ask is read every
// state holds them as one `Page` (the record and the draft): there is no
// state past the first read without one, so no outcome can drop it. An
// answer is set in every such state, a send or a re-read out included, and
// the field keeps it. A draft gives up only what the lab holds answered (a
// step answered elsewhere, or by the send itself); an edit made after Send
// that the send did not carry is named when the send lands. A lab out of
// reach, a refusal, a re-read that fails and an ask that is gone each keep
// the page as drafted. Where the run is lives in the lab, not here: a
// reload or another device opens it where it was left.
//
//   Reading ─Read→ Open ─Set→ Open ─Submit→ Sending ─Landed→ Open
//   Reading ─Unread→ Unreadable ─Retry→ Reading     (no draft yet)
//   Sending ─Unreachable→ Open
//   Sending ─Refused→ Rereading ─Read→ Open (the draft of open steps)
//   Rereading ─Unread→ Open (said why), or Gone (the lab has no such ask)
//   Open | Sending | Rereading | Gone ─Set→ the same state, the draft set
//
// Nothing here touches the DOM: the lab's routes are the review's API,
// faked in tests.

import { Array as Arr, Effect, Option, Record, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import {
  AskRecord,
  askedIn,
  filled,
  pageRefusal,
  questionsOf,
  sectionsOf,
  unansweredText,
} from '../../core/ask.ts';
import type { LabFailure } from '../api.ts';
import { ReviewApi } from '../review/api.ts';
import { failureText } from '../review/format.ts';

const Draft = Schema.Record(Schema.String, Schema.String);
type Draft = typeof Draft.Type;

/** The page as the owner has it: the ask as last read, and his draft of every answer on it. */
export const Page = Schema.Struct({ record: AskRecord, draft: Draft });
export type Page = typeof Page.Type;

export const AskPageState = State({
  /** Reading the ask the first time, or again from Unreadable: no draft yet. */
  Reading: { said: Schema.String },
  /**
   * The page, what the last send said, and the question it was refused for
   * ('' when none is): the first left open.
   */
  Open: { page: Page, said: Schema.String, missing: Schema.String },
  /** The draft as it went (`sent`) is out; the page takes edits meanwhile. */
  Sending: { page: Page, sent: Draft },
  /** The lab refused the draft (`said`): the ask is read again, the page still showing it. */
  Rereading: { page: Page, said: Schema.String },
  /** The lab has no such ask any more (`why`): nothing can be sent, the draft is still shown. */
  Gone: { page: Page, why: Schema.String },
  /** The ask could not be read the first time: `why`. */
  Unreadable: { why: Schema.String },
});
export type AskPageState = typeof AskPageState.Type;

export const AskPageEvent = Event({
  Read: { record: AskRecord },
  /** The read failed: `why`, and whether the lab has no such ask (`gone`). */
  Unread: { why: Schema.String, gone: Schema.Boolean },
  /** Read the ask again, once it could not be read. */
  Retry: {},
  /** The owner's answer `id` set to `value` ('' takes it back). */
  Set: { id: Schema.String, value: Schema.String },
  Submit: {},
  Landed: { record: AskRecord },
  /** The lab refused the draft: `why`. */
  Refused: { why: Schema.String },
  /** The draft did not reach the lab: `why`. */
  Unreachable: { why: Schema.String },
});
export type AskPageEvent = typeof AskPageEvent.Type;

/** The sections `record`'s page shows with `draft`: from where its run is, as far as the draft reaches. */
export const pageSections = (record: AskRecord, draft: Draft) =>
  sectionsOf(record.ask, record.state, draft);

/** What the page sends with `draft`: each section's step and its answers, empty fields left out. */
const sent = (record: AskRecord, draft: Draft) =>
  pageSections(record, draft).map((s) => ({ step: s.name, values: filled(s.values) }));

/** What the owner drafted for the steps `record`'s page still shows: the rest the lab holds answered. */
const stillOpen = (record: AskRecord, draft: Draft): Draft =>
  Object.assign({}, ...pageSections(record, draft).map((s) => s.values));

/** `page` with the ask as the lab now has it: the draft of the steps it still asks. */
const reread = (page: Page, record: AskRecord): Page => ({
  record,
  draft: stillOpen(record, page.draft),
});

/** `page` with answer `id` set to `value`. */
const drafted = (page: Page, id: string, value: string): Page => ({
  ...page,
  draft: { ...page.draft, [id]: value },
});

/**
 * The questions whose answer the owner changed after Send (`went` is what
 * the send carried) and the lab no longer asks once it landed, by label:
 * changes the landed send did not carry.
 */
const lateLabels = (page: Page, went: Draft, landed: AskRecord): ReadonlyArray<string> => {
  const open = stillOpen(landed, page.draft);
  const asked = Object.values(page.record.ask.steps).flatMap(askedIn);
  return Record.keys(page.draft)
    .filter((id) => !Record.has(open, id))
    .filter((id) => (page.draft[id] ?? '').trim() !== (went[id] ?? '').trim())
    .map((id) =>
      Option.getOrElse(
        Option.map(
          Arr.findFirst(asked, (b) => b.id === id),
          (b) => b.label,
        ),
        () => id,
      ),
    );
};

/** What a landed send says: nothing, or the changes made after Send that it did not carry. */
const landedText = (late: ReadonlyArray<string>): string =>
  Option.match(Arr.match(late, { onEmpty: Option.none, onNonEmpty: Option.some }), {
    onNone: () => '',
    onSome: (labels) =>
      `Sent before your change to ${labels.map((l) => `“${l}”`).join(', ')}: the lab has the answer as it was at Send.`,
  });

/**
 * Why `draft` cannot go yet for `record`'s page, and the question it is
 * for: the first question left open, by its label, before any other check
 * the lab makes (an optional field may be empty).
 */
const draftRefusal = (
  record: AskRecord,
  draft: Draft,
): Option.Option<{ readonly why: string; readonly missing: string }> =>
  Option.orElse(
    Option.map(
      Arr.findFirst(questionsOf(pageSections(record, draft)), (q) => !q.answered),
      (q) => ({ why: unansweredText(q.block), missing: q.block.id }),
    ),
    () =>
      Option.map(pageRefusal(record.ask, record.state, sent(record, draft)), (why) => ({
        why,
        missing: '',
      })),
  );

/** A failed send, as the page's event: the lab said no, or was out of reach. */
const unsent = (failure: LabFailure): AskPageEvent => {
  if (failure._tag === 'LabUnreachable')
    return AskPageEvent.Unreachable({ why: failureText(failure) });
  return AskPageEvent.Refused({ why: failureText(failure) });
};

/** The page's machine for ask `id`, reading it first. */
const askPageMachine = (id: string) =>
  Machine.make({
    state: AskPageState,
    event: AskPageEvent,
    initial: AskPageState.Reading({ said: '' }),
  })
    .task(
      [AskPageState.Reading, AskPageState.Rereading],
      () => ReviewApi.use((api) => api.ask(id)),
      {
        onSuccess: (record) => AskPageEvent.Read({ record }),
        onFailure: (failure) =>
          AskPageEvent.Unread({ why: failureText(failure), gone: failure._tag === 'AskUnknown' }),
      },
    )
    .on(AskPageState.Reading, AskPageEvent.Read, ({ state, event }) =>
      AskPageState.Open({
        page: { record: event.record, draft: {} },
        said: state.said,
        missing: '',
      }),
    )
    .on(AskPageState.Reading, AskPageEvent.Unread, ({ event }) =>
      AskPageState.Unreadable({ why: event.why }),
    )
    .on(AskPageState.Unreadable, AskPageEvent.Retry, () => AskPageState.Reading({ said: '' }))
    // An answer is set wherever the page is shown; Open's last word gives way to it.
    .on(AskPageState.Open, AskPageEvent.Set, ({ state, event }) =>
      AskPageState.Open({
        page: drafted(state.page, event.id, event.value),
        said: '',
        missing: '',
      }),
    )
    .on(AskPageState.Sending, AskPageEvent.Set, ({ state, event }) =>
      AskPageState.Sending({ ...state, page: drafted(state.page, event.id, event.value) }),
    )
    .on(AskPageState.Rereading, AskPageEvent.Set, ({ state, event }) =>
      AskPageState.Rereading({ ...state, page: drafted(state.page, event.id, event.value) }),
    )
    .on(AskPageState.Gone, AskPageEvent.Set, ({ state, event }) =>
      AskPageState.Gone({ ...state, page: drafted(state.page, event.id, event.value) }),
    )
    .on(AskPageState.Open, AskPageEvent.Submit, ({ state }) =>
      Option.match(draftRefusal(state.page.record, state.page.draft), {
        onNone: (): AskPageState =>
          AskPageState.Sending({ page: state.page, sent: state.page.draft }),
        onSome: ({ why, missing }): AskPageState =>
          AskPageState.Open({ ...state, said: why, missing }),
      }),
    )
    .task(
      AskPageState.Sending,
      ({ state }) => ReviewApi.use((api) => api.answer(id, sent(state.page.record, state.sent))),
      {
        onSuccess: (record) => AskPageEvent.Landed({ record }),
        onFailure: unsent,
      },
    )
    .on(AskPageState.Sending, AskPageEvent.Landed, ({ state, event }) =>
      AskPageState.Open({
        page: reread(state.page, event.record),
        said: landedText(lateLabels(state.page, state.sent, event.record)),
        missing: '',
      }),
    )
    .on(AskPageState.Sending, AskPageEvent.Unreachable, ({ state, event }) =>
      AskPageState.Open({
        page: state.page,
        said: `Not sent: ${event.why}. Your answers are kept: send again.`,
        missing: '',
      }),
    )
    .on(AskPageState.Sending, AskPageEvent.Refused, ({ state, event }) =>
      AskPageState.Rereading({ page: state.page, said: event.why }),
    )
    .on(AskPageState.Rereading, AskPageEvent.Read, ({ state, event }) =>
      AskPageState.Open({ page: reread(state.page, event.record), said: state.said, missing: '' }),
    )
    // The lab has no such ask: nothing is left to send to, and the draft stays
    // on the page. Any other failure (out of reach, the store failing) leaves
    // the page as it was, to send again.
    .on(AskPageState.Rereading, AskPageEvent.Unread, ({ state, event }): AskPageState => {
      if (event.gone) return AskPageState.Gone({ page: state.page, why: event.why });
      return AskPageState.Open({
        page: state.page,
        said: `${state.said}; the ask could not be read again: ${event.why}`,
        missing: '',
      });
    });

/** The page's actor for ask `id`, started: reading it. */
export const spawnAskPage = (id: string) =>
  Machine.spawn(askPageMachine(id)).pipe(Effect.tap((actor) => actor.start));

export type AskPageActor = Effect.Success<ReturnType<typeof spawnAskPage>>;
