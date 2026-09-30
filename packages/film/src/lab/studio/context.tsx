// The studio's provider: its own runtime (the stage, the studio's routes and
// the page's microphone, so the shell knows nothing of the studio), the beats
// as the server lists them, the recorder (one actor, spawned on the first
// beat once the beats are read), the selected beat's attempts, the
// microphones and the one picked, the meter, and the recording under review
// as a URL to play. The panel's components read this context and act through
// it; none reads the recorder's states. An import that settles (a take kept,
// or refused with an attempt saved) reads the beats and the attempts again.

import { useAtomRefresh, useAtomSet, useAtomSuspense, useAtomValue } from '@bible/atom-solid';
import { Loading, Show } from '@solidjs/web';
import { Cause, Effect, Layer, Option, Stream } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createEffect, createMemo, createSignal, useContext } from 'solid-js';
import type { StudioBeat, StudioBeats } from '../../core/studio.ts';
import { useLab } from '../shell.tsx';
import { type Stage, stageLayer } from '../stage.ts';
import { StudioApi, type StudioRefused, attemptSrc, studioApiLayer } from './api.ts';
import { Capture } from './capture.ts';
import { browserCaptureLayer } from './capture-browser.ts';
import { RecorderEvent, type RecorderActor, spawnRecorder } from './machine.ts';
import { localStore, micChoice } from './mic-choice.ts';
import {
  type Act,
  type Control,
  type Meter,
  attemptLine,
  beatCounts,
  controlsOf,
  eventOf,
  keyOf,
  meterOf,
  micOptions,
  type MicOption,
  nearLimit,
  neighbour,
  reviewWav,
  statusOf,
} from './view.ts';

/** One recording of the selected beat, as its row shows it. */
export interface AttemptRow {
  readonly file: string;
  /** What was heard, how far off the line, how long. */
  readonly line: string;
  /** Where its audio plays from. */
  readonly src: string;
  /** The take the timings name. */
  readonly kept: boolean;
  /** Recorded for the line as it reads now. */
  readonly current: boolean;
}

/** How the status line reads: at rest, working, near the take limit, a take kept, or refused. */
export type StudioTone = 'rest' | 'busy' | 'warn' | 'kept' | 'refused';

export interface StudioStateValue {
  /** Every beat with a line, in the film's order. */
  readonly beats: Accessor<ReadonlyArray<StudioBeat>>;
  /** How many beats are recorded, staging, stale. */
  readonly counts: Accessor<string>;
  /** Why the beats are not shown, while they are not. */
  readonly beatsStatus: Accessor<string>;
  /** The beat selected. */
  readonly beat: Accessor<string>;
  /** The selected beat as the server lists it. */
  readonly current: Accessor<Option.Option<StudioBeat>>;
  /** What the owner can do now, each with its key. */
  readonly controls: Accessor<ReadonlyArray<Control>>;
  /** Where the recorder stands, a take's result, or the refusal in the server's words. */
  readonly status: Accessor<string>;
  readonly tone: Accessor<StudioTone>;
  /** The recording under review, to play before it is submitted. */
  readonly review: Accessor<Option.Option<string>>;
  /** The microphone's level while it is open. */
  readonly meter: Accessor<Option.Option<Meter>>;
  /** The microphone picker's choices: the default, each one listed, and one remembered but gone. */
  readonly mics: Accessor<ReadonlyArray<MicOption>>;
  /** The selected beat's recordings, newest first. */
  readonly attempts: Accessor<ReadonlyArray<AttemptRow>>;
  /** Why the attempts are not shown, while they are not. */
  readonly attemptsStatus: Accessor<string>;
  /** Whether an attempt may be kept now (at rest or after a refusal); a row adds its own terms. */
  readonly keepable: Accessor<boolean>;
  /** Whether focus was in the studio when the page last went (a take kept reloads it). */
  readonly hadFocus: boolean;
}

export interface StudioActions {
  readonly select: (beat: string) => void;
  readonly perform: (act: Act) => void;
  /** Keep an earlier attempt as the beat's take. */
  readonly keep: (file: string) => void;
  readonly pick: (device: Option.Option<string>) => void;
  /** A key pressed in the studio: whether it was the studio's (and so done here). */
  readonly press: (key: string) => boolean;
  /** Focus came into the studio, or left it. */
  readonly focused: (inside: boolean) => void;
}

export interface StudioContextValue {
  readonly state: StudioStateValue;
  readonly actions: StudioActions;
}

const StudioContext = createContext<StudioContextValue>();

/** The studio's context: only inside `<Studio.Provider>`. */
export const useStudio = (): StudioContextValue => useContext(StudioContext);

type StudioRuntime = Atom.AtomRuntime<StudioApi | Capture | Stage>;

interface Reads {
  readonly runtime: StudioRuntime;
  readonly beats: Atom.Atom<AsyncResult.AsyncResult<StudioBeats, StudioRefused>>;
}

/** A failed read in the server's words. */
const refusalText = (cause: Cause.Cause<StudioRefused>): string =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => Cause.pretty(cause),
    onSome: (e) => e.message,
  });

/** A signal the recorder's effects write. */
const written = { ownedWrite: true } as const;

/** Whether the recorder is learning what became of a take: the server's answer, or its attempts read back. */
const settling = (tag: string) => tag === 'Importing' || tag === 'Checking';

const Body = (props: ParentProps<{ readonly actor: RecorderActor; readonly reads: Reads }>) => {
  const { meta } = useLab();
  const { runtime } = props.reads;
  const stateAtom = ActorAtom.make(props.actor);
  const recorder = useAtomValue(() => stateAtom);
  const send = useAtomSet(() => stateAtom);

  const beatsResult = useAtomValue(() => props.reads.beats);
  const refreshBeats = useAtomRefresh(() => props.reads.beats);
  const beats = createMemo(() =>
    Option.getOrElse(
      Option.map(AsyncResult.value(beatsResult()), (b) => b.beats),
      () => [],
    ),
  );
  const beat = createMemo(() => recorder().beat);
  // The beat, and whether focus is in the studio, are remembered through the
  // reload a take kept causes.
  const hadFocus = Option.exists(
    Option.flatMap(Option.fromUndefinedOr(meta.view.get().studio), (s) =>
      Option.fromUndefinedOr(s.focused),
    ),
    (f) => f,
  );
  const [focused, setFocused] = createSignal(hadFocus);
  createEffect(
    () => ({ beat: beat(), focused: focused() }),
    (studio) => meta.view.patch({ studio }),
  );

  const attemptsOf = Atom.family((id: string) =>
    runtime.atom(StudioApi.use((api) => api.attempts(id))),
  );
  const attemptsResult = useAtomValue(() => attemptsOf(beat()));
  const refreshAttempts = useAtomRefresh(() => attemptsOf(beat()));

  const levels = runtime.atom(
    Stream.unwrap(Capture.use((capture) => Effect.succeed(capture.levels))),
  );
  const levelResult = useAtomValue(() => levels);
  const level = createMemo(() => Option.flatten(AsyncResult.value(levelResult())));

  const devicesAtom = runtime.atom(Capture.use((capture) => capture.devices));
  const devicesResult = useAtomValue(() => devicesAtom);
  const refreshDevices = useAtomRefresh(() => devicesAtom);

  const choice = micChoice(localStore());
  const [device, setDevice] = createSignal(choice.get());

  // An import that settles (answered, or read back from the attempts) reads
  // the beats and the beat's attempts again;
  // a microphone opened names the devices (their labels come with permission).
  let was = recorder()._tag;
  createEffect(
    () => recorder()._tag,
    (tag) => {
      if (settling(was) && !settling(tag)) {
        refreshBeats();
        refreshAttempts();
      }
      if (tag === 'CountIn' && was !== 'CountIn') refreshDevices();
      was = tag;
    },
  );

  // The recording under review, as a URL the page's audio plays; let go when it changes.
  const [review, setReview] = createSignal(Option.none<string>(), written);
  createEffect(
    () => reviewWav(recorder()),
    (wav) => {
      const url = Option.map(wav, (bytes) =>
        URL.createObjectURL(new Blob([bytes.slice()], { type: 'audio/wav' })),
      );
      setReview(url);
      return () => Option.map(url, (u) => URL.revokeObjectURL(u));
    },
  );

  const keepable = createMemo(() => recorder()._tag === 'Idle' || recorder()._tag === 'Failed');
  const attempts = createMemo((): ReadonlyArray<AttemptRow> =>
    Option.getOrElse(
      Option.map(AsyncResult.value(attemptsResult()), (a) =>
        a.attempts.map((attempt) => ({
          file: attempt.file,
          line: attemptLine(attempt),
          src: attemptSrc(meta.api, a.beat, attempt.file),
          kept: attempt.kept,
          current: attempt.current,
        })),
      ),
      () => [],
    ),
  );

  const tone = createMemo((): StudioTone => {
    const s = recorder();
    if (s._tag === 'Failed') return 'refused';
    if (s._tag === 'Idle' && Option.isSome(s.kept)) return 'kept';
    if (s._tag === 'Idle') return 'rest';
    if (nearLimit(s, level())) return 'warn';
    return 'busy';
  });

  const select = (id: string) => send(RecorderEvent.SelectBeat({ beat: id }));
  const perform = (act: Act) => send(eventOf(act, device()));
  const actions: StudioActions = {
    select,
    perform,
    keep: (file) => send(RecorderEvent.KeepAttempt({ file })),
    pick: (next) => {
      choice.set(next);
      setDevice(next);
    },
    press: (key) =>
      Option.match(keyOf(recorder(), key), {
        onNone: () => false,
        onSome: (k) => {
          if (k._tag === 'Act') perform(k.act);
          if (k._tag === 'Beat') Option.map(neighbour(beats(), beat(), k.step), select);
          return true;
        },
      }),
    focused: setFocused,
  };

  const value: StudioContextValue = {
    state: {
      beats,
      counts: () => beatCounts(beats()),
      beatsStatus: () =>
        AsyncResult.match(beatsResult(), {
          onInitial: () => 'reading the beats…',
          onSuccess: () => '',
          onFailure: (f) => refusalText(f.cause),
        }),
      beat,
      current: () => Option.fromUndefinedOr(beats().find((b) => b.id === beat())),
      controls: () => controlsOf(recorder()),
      status: () => statusOf(recorder(), level()),
      tone,
      review,
      meter: () => meterOf(level()),
      mics: () =>
        micOptions(
          Option.getOrElse(AsyncResult.value(devicesResult()), () => []),
          device(),
        ),
      attempts,
      attemptsStatus: () =>
        AsyncResult.match(attemptsResult(), {
          onInitial: () => 'reading the attempts…',
          onSuccess: (a) =>
            Option.match(Option.fromUndefinedOr(a.value.attempts[0]), {
              onNone: () => 'no recordings of this beat yet',
              onSome: () => '',
            }),
          onFailure: (f) => refusalText(f.cause),
        }),
      keepable,
      hadFocus,
    },
    actions,
  };
  return <StudioContext value={value}>{props.children}</StudioContext>;
};

/** The recorder on `beat`, once it is spawned. */
const Recorder = (props: ParentProps<{ readonly beat: string; readonly reads: Reads }>) => {
  const actor = useAtomSuspense(() =>
    props.reads.runtime.atom(Machine.scoped(spawnRecorder(props.beat))),
  );
  return (
    <Show when={actor()} keyed>
      {(a: RecorderActor) => (
        <Body actor={a} reads={props.reads}>
          {props.children}
        </Body>
      )}
    </Show>
  );
};

/** The beat the recorder starts on: the one remembered, while the server lists it, else the first. */
const startBeat = (
  beats: AsyncResult.AsyncResult<StudioBeats, StudioRefused>,
  remembered: Option.Option<string>,
) =>
  Option.flatMap(AsyncResult.value(beats), (b) =>
    Option.map(
      Option.orElse(
        Option.flatMap(remembered, (id) =>
          Option.fromUndefinedOr(b.beats.find((x) => x.id === id)),
        ),
        () => Option.fromUndefinedOr(b.beats[0]),
      ),
      (start) => start.id,
    ),
  );

/** Why there is no recorder yet: the beats are being read, refused, or none has a line. */
const waitingText = (beats: AsyncResult.AsyncResult<StudioBeats, StudioRefused>) =>
  AsyncResult.match(beats, {
    onInitial: () => 'reading the beats…',
    onSuccess: () => 'no beat has a line to record',
    onFailure: (f) => refusalText(f.cause),
  });

/**
 * The studio's state and actions, for its section. The recorder is spawned
 * once the beats are read, on the beat the view remembers (a take kept
 * reloads the page) or else the first; until then the children render
 * nothing and the fallback says why.
 */
export const Provider = (props: ParentProps) => {
  const { meta } = useLab();
  const runtime: StudioRuntime = Atom.runtime(
    Layer.mergeAll(
      stageLayer(meta.stage),
      studioApiLayer(location.origin, meta.api),
      browserCaptureLayer,
    ),
  );
  const reads: Reads = {
    runtime,
    beats: runtime.atom(StudioApi.use((api) => api.beats)),
  };
  const beats = useAtomValue(() => reads.beats);
  // Read once: the beat selected later is remembered for the next page, not this one.
  const remembered = Option.map(Option.fromUndefinedOr(meta.view.get().studio), (s) => s.beat);
  const start = createMemo(() => Option.getOrUndefined(startBeat(beats(), remembered)));
  return (
    <Show when={start()} keyed fallback={<p class="studio-waiting">{waitingText(beats())}</p>}>
      {(beat: string) => (
        <Loading>
          <Recorder beat={beat} reads={reads}>
            {props.children}
          </Recorder>
        </Loading>
      )}
    </Show>
  );
};
