// The staging voice over a script, wherever its beats come from (`VoiceOver`):
// each spoken beat's staging take as the lab has it now (ready, still voicing,
// not voiced, or refused with why), asked again every few seconds while any
// is voicing (`polled`), and the day's staging spend; Hear, which plays a
// beat's take, the words selected in it, or the script from a beat on,
// through the reader's own audio (never a film's: its track and timings
// stay as they are), with the word heard lit; and the one write a reader
// makes, a beat's delivery marks, one at a time, the takes read again once
// it lands. A film's Script reader (`VoiceProvider`) reads its film's
// (`GET …/script/voice`, `POST …/script/marks`: the lab rebuilds and the
// page reloads with the marks); a series draft's reader its draft's
// (`review/draft.tsx`). Either way the fill voices the beat again first.

import { useAtomRefresh, useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Array as Arr, Data, Effect, Exit, Fiber, Option, Schedule, Stream } from 'effect';
import type * as Atom from 'effect/reactivity/Atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createMemo, createSignal, onCleanup, untrack, useContext } from 'solid-js';
import { Frames } from '../../browser/frames.ts';
import type { Host } from '../../browser/host.ts';
import {
  type MarksPost,
  type ScriptVoice,
  type StagingTake,
  stagingTakeUrl,
} from '../../core/api.ts';
import type { Mark } from '../../core/delivery.ts';
import type { TakeWord } from '../../core/schema.ts';
import { LabApi, type LabFailure, reasonOf } from '../api.ts';
import { useLab } from '../shell.tsx';
import type { WordAt } from '../transcript/lit.ts';
import { useScript } from './context.tsx';
import { heardAt, spanOf } from './delivery.ts';

/** How often the takes are asked for again: often while one is still voicing, else now and then (a new day, another film's spend, a take another process made). */
const ASKED_AGAIN = { voicing: '4 seconds', resting: '1 minute' } as const;

/** A take ready to play: its file and its words, on the take's clock. */
type Ready = Extract<StagingTake, { readonly _tag: 'Ready' }>;

/** What the reader is hearing: nothing, or a beat's take from `start` to `end`, the beats after it to follow. */
type Heard = Data.TaggedEnum<{
  Quiet: {};
  Hearing: {
    readonly beat: string;
    readonly words: ReadonlyArray<TakeWord>;
    readonly end: number;
    readonly next: ReadonlyArray<string>;
    readonly index: Option.Option<number>;
  };
}>;
const Heard = Data.taggedEnum<Heard>();

/** The reader's one write, where it stands. */
export type Marking = Data.TaggedEnum<{
  Idle: {};
  Writing: { readonly beat: string };
  Written: { readonly beat: string };
  Failed: { readonly beat: string; readonly reason: string };
}>;
export const Marking = Data.taggedEnum<Marking>();

interface VoiceContextValue {
  /** Beat `id`'s staging take: none until the takes are read, or for a beat that says nothing. */
  readonly take: (id: string) => Option.Option<StagingTake>;
  /** Every spoken beat's staging take, in the reader's order: none until read. */
  readonly takes: Accessor<ReadonlyArray<StagingTake>>;
  /** The day's staging spend, in characters, and its cap: none until read. */
  readonly spend: Accessor<Option.Option<{ readonly spent: number; readonly cap: number }>>;
  /** Why the takes could not be read: none while they are, or are being. */
  readonly unread: Accessor<Option.Option<string>>;
  /** The word being heard: none while nothing is. */
  readonly heard: Accessor<Option.Option<WordAt>>;
  /** The beat being heard: none while nothing is. */
  readonly hearing: Accessor<Option.Option<string>>;
  /** Hear beat `id`'s take, or words `from`–`to` of it; `on` goes on to the beats after it. */
  readonly hear: (
    id: string,
    words: Option.Option<{ readonly from: number; readonly to: number }>,
    on: boolean,
  ) => void;
  /** Stop hearing. */
  readonly stop: () => void;
  /** Where the reader's write of marks stands. */
  readonly marking: Accessor<Marking>;
  /** Write beat `beat`'s marks as `marks`, made on its line as `spoken` (nothing while a write is out). */
  readonly mark: (beat: string, marks: ReadonlyArray<Mark>, spoken: string) => void;
  /** What a beat's head says once its marks are written. */
  readonly written: string;
}

const VoiceContext = createContext<VoiceContextValue>();

/** The staging voice: only inside `<VoiceOver>` (a film's `<Script.Voice>`, a draft's reader). */
export const useVoice = (): VoiceContextValue => useContext(VoiceContext);

/** Whether any beat of `voice` is still voicing. */
const voicing = (voice: ScriptVoice): boolean => voice.beats.some((b) => b.take._tag === 'Voicing');

/** How often to ask again after `voice`. */
const voicingOrResting = (voice: ScriptVoice): keyof typeof ASKED_AGAIN => {
  if (voicing(voice)) return 'voicing';
  return 'resting';
};

/**
 * `read` asked once, then again every few seconds while a beat voices, and
 * every minute after: what a reader's takes are read through.
 */
export const polled = <R,>(read: Effect.Effect<ScriptVoice, LabFailure, R>) =>
  Stream.fromEffectSchedule(
    read,
    Schedule.forever.pipe(
      Schedule.modifyDelay(({ input }: Schedule.InputMetadata<ScriptVoice>) =>
        Effect.succeed(ASKED_AGAIN[voicingOrResting(input)]),
      ),
    ),
  );

/** A player a reader's Hear pauses and gives way to: a film's. */
interface Gives {
  readonly pause: () => void;
  readonly playing: () => boolean;
}

/** What a reader's staging voice is over: where its takes and its write go, and its beats. */
export interface VoiceSource {
  /** The takes, as `polled` reads them on the page's runtime (a stream's atom: it may also fail empty). */
  readonly reading: Atom.Atom<AsyncResult.AsyncResult<ScriptVoice, unknown>>;
  /** The marks written: its answer is the source's own (a film reloads, a draft shows it). */
  readonly write: Atom.AtomResultFn<MarksPost, unknown, LabFailure>;
  /** A take's audio, by the name its `Ready` gives it. */
  readonly takeUrl: (file: string) => string;
  /** The script's beats, in reading order: what Hear goes on through. */
  readonly beats: Accessor<ReadonlyArray<string>>;
  /** The page's host: the frames Hear lights the word heard on. */
  readonly host: Host;
  /** The player Hear pauses, and gives way to once it plays: none where the page has none. */
  readonly player: Option.Option<Gives>;
  /** What a beat's head says once its marks are written. */
  readonly written: string;
}

/** The staging voice over `source`, for the reader inside it (`useVoice`). */
export const VoiceOver = (props: ParentProps<{ readonly source: VoiceSource }>) => {
  const source = props.source;
  const result = useAtomValue(() => source.reading);
  const readAgain = useAtomRefresh(() => source.reading);
  const voice = createMemo(() => AsyncResult.value(result()));
  const takes = createMemo(
    (): ReadonlyMap<string, StagingTake> =>
      new Map(
        Option.getOrElse(
          Option.map(voice(), (v) => v.beats.map((b) => [b.id, b.take])),
          () => [],
        ),
      ),
  );
  const take = (id: string) => Option.fromUndefinedOr(takes().get(id));
  const readyOf = (id: string): Option.Option<Ready> =>
    Option.filter(take(id), (t): t is Ready => t._tag === 'Ready');

  // The reader's own audio, made at the first Hear.
  let audio = Option.none<HTMLAudioElement>();
  const audioEl = (): HTMLAudioElement =>
    Option.getOrElse(audio, () => {
      const el = document.createElement('audio');
      el.preload = 'auto';
      audio = Option.some(el);
      return el;
    });
  const [heard, setHeard] = createSignal<Heard>(Heard.Quiet(), { ownedWrite: true });
  let loop = Option.none<Fiber.Fiber<void>>();
  const stopLoop = () => {
    Option.map(loop, (f) => Effect.runFork(Fiber.interrupt(f)));
    loop = Option.none();
  };
  const stop = () => {
    stopLoop();
    Option.map(audio, (el) => el.pause());
    setHeard(Heard.Quiet());
  };

  // Each play counts: a play the next one cut short (its promise refused as the source changed) stops nothing.
  let plays = 0;
  /** Play `take` of beat `beat` from `start` to `end`, the beats `next` after it. */
  const play = (
    beat: string,
    take: Ready,
    start: number,
    end: number,
    next: ReadonlyArray<string>,
  ) => {
    stopLoop();
    const el = audioEl();
    const n = ++plays;
    el.src = source.takeUrl(take.file);
    el.currentTime = start;
    setHeard(Heard.Hearing({ beat, words: take.words, end, next, index: Option.none() }));
    Option.map(source.player, (p) => p.pause());
    el.play().catch(() => {
      if (n === plays) stop();
    });
    // The frames run until the stretch ends (on to the next beat) or Play takes over (quiet); then what follows.
    let then = stop;
    loop = Option.some(
      Effect.runForkWith(source.host)(
        Frames.use((f) =>
          f.loop(() =>
            Option.match(step(el), {
              onNone: () => true,
              onSome: (after) => {
                then = after;
                return false;
              },
            }),
          ),
        ).pipe(Effect.andThen(Effect.sync(() => then()))),
      ),
    );
  };
  /** The first of `next` with a take ready, played whole, the rest after it; or quiet. */
  const playNext = (next: ReadonlyArray<string>) =>
    Option.match(
      Arr.findFirst(
        next.map((id, i) => ({ id, i, take: readyOf(id) })),
        (b) => Option.isSome(b.take),
      ),
      {
        onNone: stop,
        onSome: (b) => Option.map(b.take, (t) => play(b.id, t, 0, t.duration, next.slice(b.i + 1))),
      },
    );
  /**
   * One frame of hearing: the word heard lit; at the stretch's end, on to the
   * next beat; once the film plays, quiet. Some names what follows the frames.
   */
  const step = (el: HTMLAudioElement): Option.Option<() => void> => {
    const now = untrack(heard);
    if (now._tag !== 'Hearing' || Option.exists(source.player, (p) => p.playing()))
      return Option.some(stop);
    const t = el.currentTime;
    if (el.ended || t >= now.end) return Option.some(() => playNext(now.next));
    const index = heardAt(now.words, t);
    if (Option.getOrElse(index, () => -1) !== Option.getOrElse(now.index, () => -1))
      setHeard(Heard.Hearing({ ...now, index }));
    return Option.none();
  };
  onCleanup(stop);

  const hear: VoiceContextValue['hear'] = (id, words, on) =>
    Option.map(readyOf(id), (t) => {
      const span = Option.getOrElse(
        Option.flatMap(words, (w) => spanOf(t.words, w.from, w.to)),
        () => ({ start: 0, end: t.duration }),
      );
      const after = Arr.dropWhile(source.beats(), (b) => b !== id).slice(1);
      play(
        id,
        t,
        span.start,
        span.end,
        Arr.filter(after, () => on),
      );
    });

  // One write out at a time; once it lands the takes are read again, the beat's new key queued first.
  const [marking, setMarking] = createSignal<Marking>(Marking.Idle(), { ownedWrite: true });
  const send = useAtomSet(() => source.write, { mode: 'promiseExit' });
  const mark = (beat: string, marks: ReadonlyArray<Mark>, spoken: string) => {
    if (untrack(marking)._tag === 'Writing') return;
    setMarking(Marking.Writing({ beat }));
    void send({ beat, marks, spoken }).then((exit) => {
      if (Exit.isSuccess(exit)) {
        setMarking(Marking.Written({ beat }));
        readAgain();
        return;
      }
      setMarking(Marking.Failed({ beat, reason: reasonOf(exit.cause) }));
    });
  };

  const value: VoiceContextValue = {
    take,
    takes: () => [...takes().values()],
    spend: () => Option.map(voice(), (v) => ({ spent: v.spent, cap: v.cap })),
    unread: () =>
      AsyncResult.match(result(), {
        onInitial: () => Option.none<string>(),
        onFailure: (f) => Option.some(reasonOf(f.cause)),
        onSuccess: () => Option.none<string>(),
      }),
    heard: () =>
      Heard.$match(heard(), {
        Quiet: () => Option.none<WordAt>(),
        Hearing: (h) => Option.map(h.index, (index): WordAt => ({ section: h.beat, index })),
      }),
    hearing: () =>
      Heard.$match(heard(), {
        Quiet: () => Option.none<string>(),
        Hearing: (h) => Option.some(h.beat),
      }),
    hear,
    stop,
    marking,
    mark,
    written: source.written,
  };
  return <VoiceContext value={value}>{props.children}</VoiceContext>;
};

/** A film's Script reader's staging voice: its film's takes and marks, the lab's player given way to. */
export const VoiceProvider = (props: ParentProps) => {
  const { meta } = useLab();
  const beats = useScript().beats.map((b) => b.id);
  const source: VoiceSource = {
    reading: meta.runtime.atom(polled(LabApi.use((api) => api.scriptVoice))),
    // Its answer is the rebuild, which reloads the page with the marks.
    write: meta.runtime.fn((post: MarksPost) => LabApi.use((api) => api.writeMarks(post))),
    takeUrl: (file) => stagingTakeUrl(meta.name, file),
    beats: () => beats,
    host: meta.host,
    player: Option.some(meta.player),
    written: 'marked; the page reloads with it',
  };
  return <VoiceOver source={source}>{props.children}</VoiceOver>;
};
