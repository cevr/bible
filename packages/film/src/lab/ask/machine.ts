// An ask's page, as one machine: it reads the ask (its record: the agent's
// machine and where its run is), keeps the owner's draft of every answer on
// its one page (each section the draft reaches, `sectionsOf`), and sends
// them all as the state's task, so one send is out at a time. The draft is
// checked as the lab will check it (`pageRefusal`) before it goes; the
// lab's answer is the ask as it leaves it, its end, and a fresh draft. A
// refusal (the phone answered first, the ask was closed) reads the ask
// again and says why. Where the run is lives in the lab, not here: a reload
// or another device opens it where it was left.
//
//   Reading ─Read→ Open ─Set→ Open ─Submit→ Sending ─Landed→ Open
//   Reading ─Unread→ Unreadable        Sending ─Refused→ Reading
//
// Nothing here touches the DOM: the lab's routes are the review's API,
// faked in tests.

import { Effect, Option, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { AskRecord, filled, pageRefusal, sectionsOf } from '../../core/ask.ts';
import { ReviewApi } from '../review/api.ts';
import { failureText } from '../review/format.ts';

const Draft = Schema.Record(Schema.String, Schema.String);

export const AskPageState = State({
  /** Reading the ask; `said` is why it is read again, when it is. */
  Reading: { said: Schema.String },
  /** The ask as last read, the owner's draft of the step it is on, and what the last send said. */
  Open: { record: AskRecord, draft: Draft, said: Schema.String },
  /** The draft is out. */
  Sending: { record: AskRecord, draft: Draft },
  /** The ask could not be read: `why`. */
  Unreadable: { why: Schema.String },
});
export type AskPageState = typeof AskPageState.Type;

export const AskPageEvent = Event({
  Read: { record: AskRecord },
  Unread: { why: Schema.String },
  /** The owner's answer `id` set to `value` ('' takes it back). */
  Set: { id: Schema.String, value: Schema.String },
  Submit: {},
  Landed: { record: AskRecord },
  Refused: { why: Schema.String },
});
export type AskPageEvent = typeof AskPageEvent.Type;

/** The sections `record`'s page shows with `draft`: from where its run is, as far as the draft reaches. */
export const pageSections = (record: AskRecord, draft: typeof Draft.Type) =>
  sectionsOf(record.ask, record.state, draft);

/** What the page sends with `draft`: each section's step and its answers, empty fields left out. */
const sent = (record: AskRecord, draft: typeof Draft.Type) =>
  pageSections(record, draft).map((s) => ({ step: s.name, values: filled(s.values) }));

/** Why `draft` cannot go yet for `record`'s page, or none when it can (an optional field may be empty). */
const draftRefusal = (record: AskRecord, draft: typeof Draft.Type): Option.Option<string> =>
  pageRefusal(record.ask, record.state, sent(record, draft));

/** The page's machine for ask `id`, reading it first. */
const askPageMachine = (id: string) =>
  Machine.make({
    state: AskPageState,
    event: AskPageEvent,
    initial: AskPageState.Reading({ said: '' }),
  })
    .task(AskPageState.Reading, () => ReviewApi.use((api) => api.ask(id)), {
      onSuccess: (record) => AskPageEvent.Read({ record }),
      onFailure: (failure) => AskPageEvent.Unread({ why: failureText(failure) }),
    })
    .on(AskPageState.Reading, AskPageEvent.Read, ({ state, event }) =>
      AskPageState.Open({ record: event.record, draft: {}, said: state.said }),
    )
    .on(AskPageState.Reading, AskPageEvent.Unread, ({ event }) =>
      AskPageState.Unreadable({ why: event.why }),
    )
    .on(AskPageState.Open, AskPageEvent.Set, ({ state, event }) =>
      AskPageState.Open({
        ...state,
        draft: { ...state.draft, [event.id]: event.value },
        said: '',
      }),
    )
    .on(AskPageState.Open, AskPageEvent.Submit, ({ state }) =>
      Option.match(draftRefusal(state.record, state.draft), {
        onNone: (): AskPageState =>
          AskPageState.Sending({ record: state.record, draft: state.draft }),
        onSome: (why): AskPageState => AskPageState.Open({ ...state, said: why }),
      }),
    )
    .task(
      AskPageState.Sending,
      ({ state }) => ReviewApi.use((api) => api.answer(id, sent(state.record, state.draft))),
      {
        onSuccess: (record) => AskPageEvent.Landed({ record }),
        onFailure: (failure) => AskPageEvent.Refused({ why: failureText(failure) }),
      },
    )
    .on(AskPageState.Sending, AskPageEvent.Landed, ({ event }) =>
      AskPageState.Open({ record: event.record, draft: {}, said: '' }),
    )
    .on(AskPageState.Sending, AskPageEvent.Refused, ({ event }) =>
      AskPageState.Reading({ said: event.why }),
    );

/** The page's actor for ask `id`, started: reading it. */
export const spawnAskPage = (id: string) =>
  Machine.spawn(askPageMachine(id)).pipe(Effect.tap((actor) => actor.start));

export type AskPageActor = Effect.Success<ReturnType<typeof spawnAskPage>>;
