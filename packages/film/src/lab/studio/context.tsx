// The record studio's provider: its own runtime over the page's one client
// (the page's film, the studio's routes and the page's microphone, so the
// page knows nothing of the recorder), the beats as the server lists them,
// the recorder (one actor, spawned on the first beat once the beats are
// read), the selected beat's attempts, the microphones and the one picked,
// the meter, and the recording under review as a URL to play. The page it is
// on (`RecordPage`: the film studio, whose Record dialog shows it) gives its
// client, its keys, its film, the beat it selects, how a beat picked is
// selected there and where the recorder's parts stand. The
// section's components read this context and act through it; the page
// around them reads the take it holds (`useHeld`: what a close asks before
// it drops a take, and the drop), none while the recorder waits on its
// beats. None reads the recorder's states. An import that settles
// (a take kept, or refused with an attempt saved) reads the beats and the
// attempts again.

import { useAtomRefresh, useAtomSet, useAtomValue } from '@bible/atom-solid';
import { type JSX, Show } from '@solidjs/web';
import { Cause, Effect, Equal, Layer, Option, Stream } from 'effect';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  untrack,
  useContext,
} from 'solid-js';
import type { Input } from '../../browser/keys.ts';
import type { Hub } from '../../command/hub.ts';
import { said } from '../../command/command.ts';
import { hubKeys } from '../command/changes.ts';
import { attemptUrl } from '../../core/api.ts';
import type { StudioBeat, StudioBeats } from '../../core/studio.ts';
import { type BrowserServices, type Host, hostLayer } from '../../browser/host.ts';
import type { LabClient, LabFailure } from '../api.ts';
import { Actor } from '../actor.tsx';
import { StudioApi, studioApiLayer } from './api.ts';
import { Capture } from './capture.ts';
import { browserCaptureLayer } from './capture-browser.ts';
import { type RecordStage, RecorderEvent, type RecorderActor, spawnRecorder } from './machine.ts';
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
  discardOf,
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

/** Whether focus was in the recorder as the page last went, and the input of its last act. */
export interface RecordFocus {
  readonly focused?: boolean;
  readonly input?: Input;
}

/**
 * The page a recorder is on: its film, host, keys and one client; what its
 * film does when asked (`stage`: pause, load again once a take is mixed); the
 * beat the page selects among `beats` (`linked`, read as it changes), and how
 * a beat picked is selected there (`go`); and where focus is remembered
 * through a reload (`focus`).
 */
export interface RecordPage {
  readonly film: string;
  readonly host: Host;
  readonly hub: Hub;
  readonly client: Layer.Layer<LabClient>;
  readonly stage: Layer.Layer<RecordStage>;
  readonly linked: (beats: ReadonlyArray<string>) => Option.Option<string>;
  readonly go: (beat: string) => void;
  readonly focus: {
    readonly get: () => Option.Option<RecordFocus>;
    readonly set: (focus: RecordFocus) => void;
  };
  /**
   * Where the page shows the recorder's parts (the dialog over the page):
   * the recorder stays outside it, so a place made again never spawns it
   * again.
   */
  readonly place: (children: JSX.Element) => JSX.Element;
}

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
  /** How many beats are recorded, scratch, stale: the beat list's label, disclosed. */
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
  /**
   * The input of the studio's last act, when focus was in the studio as the page last went
   * (a take kept reloads it): the focus comes back as that input left it; none, it stays out.
   */
  readonly refocus: Option.Option<Input>;
}

interface StudioActions {
  readonly select: (beat: string) => void;
  /** Do `act`, asked by `input` (a command's `Invocation.input`). */
  readonly perform: (act: Act, input: Input) => void;
  /** Keep an earlier attempt as the beat's take, asked by `input`. */
  readonly keep: (file: string, input: Input) => void;
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

/**
 * The recorder's take as the page around it sees it (`useHeld`): the beat it
 * records, what a close asks before it drops a take only this page has
 * (`discardOf`; none while it holds none), and the drop.
 */
interface RecordHeld {
  readonly beat: Accessor<string>;
  readonly discardable: Accessor<Option.Option<string>>;
  readonly discard: () => void;
}

interface StudioContextValue {
  readonly state: StudioStateValue;
  readonly actions: StudioActions;
  /** The page's keys, and the host they are heard through. */
  readonly meta: { readonly hub: Hub; readonly host: Host };
}

const StudioContext = createContext<StudioContextValue>();
const HeldContext = createContext<Option.Option<RecordHeld>>(Option.none());

/** The studio's context: only inside `<Studio.Provider>`. */
export const useStudio = (): StudioContextValue => useContext(StudioContext);
/** The recorder's take, for the page around it: none while the recorder waits on its beats. */
export const useHeld = (): Option.Option<RecordHeld> => useContext(HeldContext);

type StudioRuntime = Atom.AtomRuntime<StudioApi | Capture | RecordStage | BrowserServices>;

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

const Body = (
  props: ParentProps<{
    readonly page: RecordPage;
    readonly actor: RecorderActor;
    readonly reads: Reads;
  }>,
) => {
  const page = props.page;
  const { runtime } = props.reads;
  // The status line names each control's key as the hub's keymap binds it now.
  const keys = hubKeys(page.hub);
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
  // Whether focus is in the studio, and the input of the studio's last act (a take submitted
  // or kept: a key, or a click), are remembered through the reload a take kept causes. The
  // input is the act's, read once: this page rewrites the slot without it, so a later reload
  // nothing in the studio asked for (a write's, a rebuild's) brings the focus back without
  // the ring, as no key asked for it.
  const kept = page.focus.get();
  const hadFocus = Option.exists(
    Option.flatMap(kept, (s) => Option.fromUndefinedOr(s.focused)),
    (f) => f,
  );
  const [focused, setFocused] = createSignal(hadFocus);
  const keptBy = Option.getOrElse(
    Option.flatMap(kept, (s) => Option.fromUndefinedOr(s.input)),
    (): Input => 'pointer',
  );
  const [actedBy, setActedBy] = createSignal<Option.Option<Input>>(Option.none());
  createEffect(
    () => [focused(), actedBy()] as const,
    ([f, by]) =>
      page.focus.set(
        Option.match(by, {
          onNone: () => ({ focused: f }),
          onSome: (input) => ({ focused: f, input }),
        }),
      ),
  );
  const refocus = Option.liftPredicate(keptBy, () => hadFocus);

  // The beat is the page's (`page.linked`): a beat picked is selected there
  // (`page.go`). The recorder is on the page's beat whenever it is at rest
  // (`atRest`): the page landing on another beat (Back, Forward, a beat
  // selected) or the recorder coming back to rest (a count-in cancelled, a
  // take discarded) on a beat the page has left moves it there. A recorder
  // holding a take no one has kept stays on its beat, so a take is never
  // lost to a navigation, and the page moving on says so; once it rejoins
  // the page, that receipt is replaced in its slot by the beat it is on now,
  // so none still names a beat the recorder left.
  const linked = createMemo(() => page.linked(beatIds(beats())), { equals: Equal.equals });
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
      if (stayedSaid) page.hub.announce(said(`Record follows the link to ${id}`), STUDIO_SLOT);
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
        page.hub.announce(said(`Record stays on ${now.beat}: ${why}`), STUDIO_SLOT);
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
          src: attemptUrl(page.film, a.beat, attempt.file),
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

  // A beat picked, or a ←/→ step through the beats, is the page's selection too.
  const select = (id: string) => {
    send(RecorderEvent.SelectBeat({ beat: id }));
    if (Option.contains(untrack(linked), id)) return;
    page.go(id);
  };
  const perform = (act: Act, input: Input) => {
    setActedBy(Option.some(input));
    send(eventOf(act, device()));
  };
  const actions: StudioActions = {
    select,
    perform,
    keep: (file, input) => {
      setActedBy(Option.some(input));
      send(RecorderEvent.KeepAttempt({ file }));
    },
    pick: (next) => choose(Option.getOrElse(next, () => '')),
    control: (command) => controlFor(recorder(), command),
    stepsBeats: () => stepsBeats(recorder()),
    step: (by) => {
      Option.map(neighbour(beats(), beat(), by), select);
    },
    focused: setFocused,
  };
  const held: RecordHeld = {
    beat,
    discardable: () => Option.map(discardOf(recorder()), (d) => d.question),
    discard: () => {
      Option.map(discardOf(untrack(recorder)), (d) => send(d.event));
    },
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
      status: () => statusOf(recorder(), level(), keys.titled),
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
      refocus,
    },
    actions,
    meta: { hub: page.hub, host: page.host },
  };
  return (
    <StudioContext value={value}>
      <HeldContext value={Option.some(held)}>{props.children}</HeldContext>
    </StudioContext>
  );
};

/** The ids of the beats the server lists. */
const beatIds = (beats: ReadonlyArray<StudioBeat>): ReadonlyArray<string> =>
  beats.map((beat) => beat.id);

/** The beat the recorder starts on: the one the page names (`linked`), else the first. */
const startBeat = (
  beats: AsyncResult.AsyncResult<StudioBeats, LabFailure>,
  linked: (beats: ReadonlyArray<string>) => Option.Option<string>,
) =>
  Option.flatMap(AsyncResult.value(beats), (b) =>
    Option.orElse(linked(beatIds(b.beats)), () =>
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
 * The record studio's state and actions on `page`, for its section. The
 * recorder is spawned once the beats are read, on the beat the page names
 * (so Record opens where the page is) or else the first; until then the
 * children render nothing and the line says why.
 */
export const Provider = (props: ParentProps<{ readonly page: RecordPage }>) => {
  const page = props.page;
  // Its own runtime over the page's one client: the page's services know nothing of the recorder.
  const runtime: StudioRuntime = Atom.runtime(
    Layer.mergeAll(
      page.stage,
      studioApiLayer(page.film),
      browserCaptureLayer,
      hostLayer(page.host),
    ).pipe(Layer.provide(page.client)),
  );
  const reads: Reads = {
    runtime,
    beats: runtime.atom(StudioApi.use((api) => api.beats)),
  };
  const beats = useAtomValue(() => reads.beats);
  // The page's beat as the beats first land, kept (`first`): the page's later beats, and
  // the beats read again, move the recorder spawned here (`linked`), never respawn it.
  const kept = createMemo<Option.Option<string>>((first) =>
    Option.orElse(Option.flatten(Option.fromNullishOr(first)), () =>
      startBeat(beats(), (ids) => untrack(() => page.linked(ids))),
    ),
  );
  const start = () => Option.getOrUndefined(kept());
  return (
    <Show
      when={start()}
      keyed
      fallback={page.place(<p class="studio-waiting">{waitingText(beats())}</p>)}
    >
      {(beat: string) => (
        <Actor runtime={runtime} spawn={spawnRecorder(beat)}>
          {(actor) => (
            <Body page={page} actor={actor} reads={reads}>
              {page.place(props.children)}
            </Body>
          )}
        </Actor>
      )}
    </Show>
  );
};
