// An ask's page, as one machine: it reads the ask (its record: the agent's
// machine and where its run is), keeps the owner's draft of every answer on
// its one page (each section the draft reaches, `sectionsOf`), and sends
// them all as the state's task, so one send is out at a time. The draft is
// checked as the lab will check it before it goes: a question left open is
// named by its label and marked (`missing`), so the page can take the owner
// to it. The lab's answer is the ask as it leaves it, its end, and a fresh
// draft. The owner's words are never lost to a failed send: a lab out of
// reach keeps the page as it was, to send again; a refusal (the phone
// answered first, the ask was closed) reads the ask again with the page
// still showing, and keeps what was drafted for the steps still open. Where
// the run is lives in the lab, not here: a reload or another device opens
// it where it was left.
//
//   Reading ─Read→ Open ─Set→ Open ─Submit→ Sending ─Landed→ Open
//   Reading ─Unread→ Unreadable ─Retry→ Reading
//   Sending ─Unreachable→ Open (the draft kept)
//   Sending ─Refused→ Rereading ─Read→ Open (the draft of open steps kept)
//
// Nothing here touches the DOM: the lab's routes are the review's API,
// faked in tests.

import { Array as Arr, Effect, Option, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import {
  AskRecord,
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

export const AskPageState = State({
  /** Reading the ask the first time, or again from Unreadable. */
  Reading: { said: Schema.String },
  /**
   * The ask as last read, the owner's draft of every answer on its page,
   * what the last send said, and the question it was refused for ('' when
   * none is): the first left open.
   */
  Open: { record: AskRecord, draft: Draft, said: Schema.String, missing: Schema.String },
  /** The draft is out. */
  Sending: { record: AskRecord, draft: Draft },
  /** The lab refused the draft (`said`): the ask is read again, the page still showing it. */
  Rereading: { record: AskRecord, draft: Draft, said: Schema.String },
  /** The ask could not be read: `why`. */
  Unreadable: { why: Schema.String },
});
export type AskPageState = typeof AskPageState.Type;

export const AskPageEvent = Event({
  Read: { record: AskRecord },
  /** The read failed: the lab refused it (`refused`), or could not be reached. */
  Unread: { why: Schema.String, refused: Schema.Boolean },
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

/** What the owner drafted for the steps `record`'s page still shows: the rest was answered elsewhere. */
const stillOpen = (record: AskRecord, draft: Draft): Draft =>
  Object.assign({}, ...pageSections(record, draft).map((s) => s.values));

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

const outOfReach = (failure: LabFailure): boolean => failure._tag === 'LabUnreachable';

/** A failed send, as the page's event: the lab said no, or was out of reach. */
const unsent = (failure: LabFailure): AskPageEvent => {
  if (outOfReach(failure)) return AskPageEvent.Unreachable({ why: failureText(failure) });
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
          AskPageEvent.Unread({ why: failureText(failure), refused: !outOfReach(failure) }),
      },
    )
    .on(AskPageState.Reading, AskPageEvent.Read, ({ state, event }) =>
      AskPageState.Open({ record: event.record, draft: {}, said: state.said, missing: '' }),
    )
    .on(AskPageState.Reading, AskPageEvent.Unread, ({ event }) =>
      AskPageState.Unreadable({ why: event.why }),
    )
    .on(AskPageState.Unreadable, AskPageEvent.Retry, () => AskPageState.Reading({ said: '' }))
    .on(AskPageState.Open, AskPageEvent.Set, ({ state, event }) =>
      AskPageState.Open({
        ...state,
        draft: { ...state.draft, [event.id]: event.value },
        said: '',
        missing: '',
      }),
    )
    .on(AskPageState.Open, AskPageEvent.Submit, ({ state }) =>
      Option.match(draftRefusal(state.record, state.draft), {
        onNone: (): AskPageState =>
          AskPageState.Sending({ record: state.record, draft: state.draft }),
        onSome: ({ why, missing }): AskPageState =>
          AskPageState.Open({ ...state, said: why, missing }),
      }),
    )
    .task(
      AskPageState.Sending,
      ({ state }) => ReviewApi.use((api) => api.answer(id, sent(state.record, state.draft))),
      {
        onSuccess: (record) => AskPageEvent.Landed({ record }),
        onFailure: unsent,
      },
    )
    .on(AskPageState.Sending, AskPageEvent.Landed, ({ event }) =>
      AskPageState.Open({ record: event.record, draft: {}, said: '', missing: '' }),
    )
    .on(AskPageState.Sending, AskPageEvent.Unreachable, ({ state, event }) =>
      AskPageState.Open({
        ...state,
        said: `Not sent: ${event.why}. Your answers are kept: send again.`,
        missing: '',
      }),
    )
    .on(AskPageState.Sending, AskPageEvent.Refused, ({ state, event }) =>
      AskPageState.Rereading({ ...state, said: event.why }),
    )
    .on(AskPageState.Rereading, AskPageEvent.Read, ({ state, event }) =>
      AskPageState.Open({
        record: event.record,
        draft: stillOpen(event.record, state.draft),
        said: state.said,
        missing: '',
      }),
    )
    // Refused on the read too: the ask is gone (closed, or never was), so
    // nothing is left to answer. Out of reach: the page stays as drafted.
    .on(AskPageState.Rereading, AskPageEvent.Unread, ({ state, event }): AskPageState => {
      if (event.refused) return AskPageState.Unreadable({ why: event.why });
      return AskPageState.Open({
        record: state.record,
        draft: state.draft,
        said: `${state.said}; the ask could not be read again: ${event.why}`,
        missing: '',
      });
    });

/** The page's actor for ask `id`, started: reading it. */
export const spawnAskPage = (id: string) =>
  Machine.spawn(askPageMachine(id)).pipe(Effect.tap((actor) => actor.start));

export type AskPageActor = Effect.Success<ReturnType<typeof spawnAskPage>>;
