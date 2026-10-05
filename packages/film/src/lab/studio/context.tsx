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
import { Cause, Effect, Equal, Layer, Option, Stream } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
  useContext,
} from 'solid-js';
import * as UrlAtom from '@bible/url-state/atom';
import { said } from '../../command/command.ts';
import { attemptUrl } from '../../core/api.ts';
import type { StudioBeat, StudioBeats } from '../../core/studio.ts';
import { type BrowserServices, addressOn, hostLayer } from '../../browser/host.ts';
import { beatAt, labHrefWith } from '../place.ts';
import type { LabFailure } from '../api.ts';
import { useLab } from '../shell.tsx';
import { type Stage, stageLayer } from '../stage.ts';
import { StudioApi, studioApiLayer } from './api.ts';
import { Capture } from './capture.ts';
import { browserCaptureLayer } from './capture-browser.ts';
import { RecorderEvent, type RecorderActor, spawnRecorder } from './machine.ts';
import { keptText } from '../../browser/storage.ts';
import { ViewerStore } from '../../browser/storage-browser.ts';
import {
  type Act,
  type Control,
  type ControlCommand,
  type Meter,
  atRest,
  attemptLine,
  beatCounts,
  controlFor,
  controlsOf,
  eventOf,
  meterOf,
  micOptions,
  type MicOption,
  nearLimit,
  neighbour,
  reviewWav,
  statusOf,
  stepsBeats,
  unsubmitted,
} from './view.ts';

/** Where the studio's receipts stand among the page's. */
const STUDIO_SLOT = 'studio';

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
type StudioTone = 'rest' | 'busy' | 'warn' | 'kept' | 'refused';

interface StudioStateValue {
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

interface StudioActions {
  readonly select: (beat: string) => void;
  readonly perform: (act: Act) => void;
  /** Keep an earlier attempt as the beat's take. */
  readonly keep: (file: string) => void;
  readonly pick: (device: Option.Option<string>) => void;
  /** The control `command` presses now, if it presses one (`controlFor`, `view.ts`). */
  readonly control: (command: ControlCommand) => Option.Option<Control>;
  /** Whether ←/→ step through the beats now. */
  readonly stepsBeats: () => boolean;
  /** Select the beat `by` places on (1 the next, -1 the previous): a step Back does not walk. */
  readonly step: (by: 1 | -1) => void;
  /** Focus came into the studio, or left it. */
  readonly focused: (inside: boolean) => void;
}

interface StudioContextValue {
  readonly state: StudioStateValue;
  readonly actions: StudioActions;
}

const StudioContext = createContext<StudioContextValue>();

/** The studio's context: only inside `<Studio.Provider>`. */
export const useStudio = (): StudioContextValue => useContext(StudioContext);

type StudioRuntime = Atom.AtomRuntime<StudioApi | Capture | Stage | BrowserServices>;

interface Reads {
  readonly runtime: StudioRuntime;
  readonly beats: Atom.Atom<AsyncResult.AsyncResult<StudioBeats, LabFailure>>;
}

/** A failed read in the server's words. */
const refusalText = (cause: Cause.Cause<LabFailure>): string =>
  Option.match(Cause.findErrorOption(cause), {
    onNone: () => Cause.pretty(cause),
    onSome: (e) => e.message,
  });

/** A signal the recorder's effects write. */
const written = { ownedWrite: true } as const;

/**
 * The microphone the viewer picked, kept in this browser as its device id
 * (empty for the browser's default): one choice for every film, as it is the
 * viewer's desk, not the film's.
 */
const micChosen = keptText(ViewerStore, 'film-lab-mic');

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
  // Whether focus is in the studio is remembered through the reload a take kept causes.
  const hadFocus = Option.exists(
    Option.flatMap(Option.fromUndefinedOr(meta.view.get().studio), (s) =>
      Option.fromUndefinedOr(s.focused),
    ),
    (f) => f,
  );
  const [focused, setFocused] = createSignal(hadFocus);
  createEffect(focused, (f) => meta.view.patch({ studio: { focused: f } }));

  // The beat is the link's (`beatAt`: `?beat=`, else the path's scene): a
  // beat picked is written there. The recorder is on the link's beat whenever
  // it is at rest (`atRest`): the link landing on another beat (Back,
  // Forward, play into the next scene) or the recorder coming back to rest
  // (a count-in cancelled, a take discarded) on a beat the link has left
  // moves it there. A recorder holding a take no one has kept stays on its
  // beat, so a take is never lost to a navigation, and the link moving on
  // says so; once it rejoins the link, that receipt is replaced in its slot
  // by the beat it is on now, so none still names a beat the recorder left.
  const address = addressOn(meta.host);
  const href = useAtomValue(() => UrlAtom.href);
  const linked = createMemo(() => listedBeat(beats(), beatAt(href())), { equals: Equal.equals });
  const due = createMemo(
    () => {
      const now = recorder();
      return Option.filter(linked(), (id) => id !== now.beat && atRest(now));
    },
    { equals: Equal.equals },
  );
  /** Whether the studio's slot says the recorder stayed on a beat the link left. */
  let stayedSaid = false;
  createEffect(due, (at) => {
    Option.map(at, (id) => {
      send(RecorderEvent.SelectBeat({ beat: id }));
      if (stayedSaid) meta.hub.announce(said(`Record follows the link to ${id}`), STUDIO_SLOT);
      stayedSaid = false;
    });
  });
  createEffect(linked, (at) => {
    const now = untrack(recorder);
    Option.map(
      Option.flatMap(
        Option.filter(at, (id) => id !== now.beat),
        () => unsubmitted(now),
      ),
      (why) => {
        meta.hub.announce(said(`Record stays on ${now.beat}: ${why}`), STUDIO_SLOT);
        stayedSaid = true;
      },
    );
  });

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

  const chosen = useAtomValue(() => micChosen);
  const choose = useAtomSet(() => micChosen);
  const device = createMemo(() => Option.filter(chosen(), (id) => id !== ''));

  // An import that settles (answered, or read back from the attempts) reads
  // the beats and the beat's attempts again;
  // a microphone opened names the devices (their labels come with permission).
  let was = untrack(() => recorder()._tag);
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

  // A recording only this page has holds every reload (an Undo's, a rebuild's) until it is kept or discarded.
  createEffect(
    () => unsubmitted(recorder()),
    (why) => {
      Effect.runFork(meta.reloads.hold('studio', why));
    },
  );
  onCleanup(() => {
    Effect.runFork(meta.reloads.hold('studio', Option.none()));
  });

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
          src: attemptUrl(meta.name, a.beat, attempt.file),
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

  // A beat picked is a step Back walks; a ←/→ step through the beats follows in place.
  const select = (id: string, move: 'go' | 'follow') => {
    send(RecorderEvent.SelectBeat({ beat: id }));
    if (Option.contains(untrack(linked), id)) return;
    address[move](
      labHrefWith(
        meta.name,
        meta.film.placed,
        address.href(),
        { beat: Option.some(id) },
        meta.player.now(),
      ),
    );
  };
  const perform = (act: Act) => send(eventOf(act, device()));
  const actions: StudioActions = {
    select: (id) => select(id, 'go'),
    perform,
    keep: (file) => send(RecorderEvent.KeepAttempt({ file })),
    pick: (next) => choose(Option.getOrElse(next, () => '')),
    control: (command) => controlFor(recorder(), command),
    stepsBeats: () => stepsBeats(recorder()),
    step: (by) => {
      Option.map(neighbour(beats(), beat(), by), (id) => select(id, 'follow'));
    },
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

/** `beat`, while the server lists it. */
const listedBeat = (
  beats: ReadonlyArray<StudioBeat>,
  beat: Option.Option<string>,
): Option.Option<string> => Option.filter(beat, (id) => beats.some((x) => x.id === id));

/** The beat the recorder starts on: the link's (`beatAt`), while the server lists it, else the first. */
const startBeat = (
  beats: AsyncResult.AsyncResult<StudioBeats, LabFailure>,
  linked: Option.Option<string>,
) =>
  Option.flatMap(AsyncResult.value(beats), (b) =>
    Option.orElse(listedBeat(b.beats, linked), () =>
      Option.map(Option.fromUndefinedOr(b.beats[0]), (first) => first.id),
    ),
  );

/** Why there is no recorder yet: the beats are being read, refused, or none has a line. */
const waitingText = (beats: AsyncResult.AsyncResult<StudioBeats, LabFailure>) =>
  AsyncResult.match(beats, {
    onInitial: () => 'reading the beats…',
    onSuccess: () => 'no beat has a line to record',
    onFailure: (f) => refusalText(f.cause),
  });

/**
 * The studio's state and actions, for its section. The recorder is spawned
 * once the beats are read, on the link's beat (`?beat=`, else the path's
 * scene, so Record opens where the lab is) or else the first; until then the
 * children render nothing and the fallback says why.
 */
export const Provider = (props: ParentProps) => {
  const { meta } = useLab();
  const runtime: StudioRuntime = Atom.runtime(
    Layer.mergeAll(
      stageLayer(meta.stage),
      studioApiLayer(meta.name),
      browserCaptureLayer,
      hostLayer(meta.host),
    ).pipe(Layer.provide(meta.clientLayer)),
  );
  const reads: Reads = {
    runtime,
    beats: runtime.atom(StudioApi.use((api) => api.beats)),
  };
  const beats = useAtomValue(() => reads.beats);
  // Read once: the link's later beats move the recorder spawned here (`linked`), never respawn it.
  const opened = beatAt(addressOn(meta.host).href());
  const start = createMemo(() => Option.getOrUndefined(startBeat(beats(), opened)));
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
