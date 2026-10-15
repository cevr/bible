// An ask's page, as one machine: it reads the ask (its record: the agent's
// machine and where its run is), keeps the owner's draft of the step the run
// is on, and sends it as the state's task, so one answer is out at a time.
// The draft is checked as the lab will check it (`answerRefusal`) before it
// goes; the lab's answer is the ask as it leaves it, the next step's page or
// its end, and a fresh draft. A refusal (the phone answered first, the ask
// was closed) reads the ask again and says why. Where the run is lives in
// the lab, not here: a reload or another device opens it where it was left.
//
//   Reading ─Read→ Open ─Set→ Open ─Submit→ Sending ─Landed→ Open
//   Reading ─Unread→ Unreadable        Sending ─Refused→ Reading
//
// Nothing here touches the DOM: the lab's routes are the review's API,
// faked in tests.

import { Effect, Match, Option, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { AskRecord, answerRefusal, filled } from '../../core/ask.ts';
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

/** The step the ask's run is on, when it is asking. */
export const stepOf = (record: AskRecord): Option.Option<string> =>
  Match.value(record.state).pipe(
    Match.tag('Asking', (s) => Option.some(s.step)),
    Match.orElse(() => Option.none<string>()),
  );

/** Why `draft` cannot go yet for `record`'s step, or none when it can (an optional field may be empty). */
const draftRefusal = (record: AskRecord, draft: typeof Draft.Type): Option.Option<string> =>
  Option.flatMap(stepOf(record), (step) =>
    answerRefusal(record.ask, record.state, step, filled(draft)),
  );

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
      ({ state }) =>
        ReviewApi.use((api) =>
          api.answer(
            id,
            Option.getOrElse(stepOf(state.record), () => ''),
            filled(state.draft),
          ),
        ),
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
