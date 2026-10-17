// The staging voice over a script, wherever its beats come from (`VoiceOver`):
// each spoken beat's staging take as the lab has it now (ready, still voicing,
// not voiced, or refused with why), asked again every few seconds while any
// is voicing (`polled`), and the day's staging spend; Hear, which plays a
// beat's take, the words selected in it, or the script from a beat on,
// as the page's one voice (`Media.hear`: a take heard elsewhere on the page
// is paused, and the film's Play hushes it; never a film's track, whose
// timings stay as they are), with the word heard lit; and the one write a reader
// makes, a beat's delivery marks, one at a time, the takes read again once
// it lands and the line read again once those takes do: a line put back
// elsewhere after the lab answered the page's read-back, before the takes
// past the write land, shows as put back. A film's Words reader
// (`../words/reader.tsx`) reads its film's (`GET …/script/voice`,
// `POST …/script/marks`: the lab rebuilds and the page reloads with the
// marks); a series draft's reader its draft's
// (`review/draft.tsx`). Either way the fill voices the beat again first.

import { useAtomRefresh, useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Array as Arr, Data, Effect, Exit, Fiber, Match, Option, Schedule, Stream } from 'effect';
import { Machine } from 'effect-machine';
import * as ActorAtom from 'effect-machine/atom';
import * as Atom from 'effect/reactivity/Atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
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
import { Frames } from '../../browser/frames.ts';
import { Media, type Playable, Played } from '../../browser/media.ts';
import type { Host } from '../../browser/host.ts';
import type { MarksPost, ScriptVoice, StagingTake } from '../../core/api.ts';
import { type LineRead, type Mark, sameMarks } from '../../core/delivery.ts';
import type { TakeWord } from '../../core/schema.ts';
import { type LabFailure, reasonOf } from '../api.ts';
import type { WordAt } from '../transcript/lit.ts';
import { heardAt, retaken, spanOf } from './delivery.ts';
import { type MarkWrite, MarkingEvent, type MarkingState, spawnMarking } from './marking.ts';

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

/** A beat's marks as the page read them, and as its write left them. */
interface Wrote {
  readonly read: ReadonlyArray<Mark>;
  readonly now: ReadonlyArray<Mark>;
}

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
  /**
   * Write beat `beat`'s marks as `marks`, made on its line as the page read
   * it (`read`; nothing while a write is out). The write carries the line as
   * the page has it (`marksOf`), so a second mark made before the line is
   * read again stands on the first.
   */
  readonly mark: (beat: string, marks: ReadonlyArray<Mark>, read: LineRead) => void;
  /**
   * Beat `beat`'s marks as the page has them: `read`, as it read them, or
   * the marks its own write left there until it reads the line again (the
   * first read past the write ends it, one with the marks put back too).
   */
  readonly marksOf: (beat: string, read: ReadonlyArray<Mark>) => ReadonlyArray<Mark>;
  /** What a beat's head says once its marks are written. */
  readonly written: string;
}

const VoiceContext = createContext<VoiceContextValue>();

/** The staging voice: only inside `<VoiceOver>` (a film's `<Script.Voice>`, a draft's reader). */
export const useVoice = (): VoiceContextValue => useContext(VoiceContext);

/** Whether any beat of `voice` is still voicing. */
const voicing = (voice: ScriptVoice): boolean => voice.beats.some((b) => b.take._tag === 'Voicing');

/** Whether two reads of the takes are the one read (a waiting result keeps its value). */
const sameRead = (a: Option.Option<ScriptVoice>, b: Option.Option<ScriptVoice>): boolean =>
  Option.isSome(a) && Option.isSome(b) && a.value === b.value;

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
  /**
   * Reads the script again, once a poll shows a line changed under the
   * reader (`retaken`): none where a change to the script reloads the page.
   */
  readonly reread: Option.Option<() => void>;
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
  // A line changed under the reader (another hand's marks, its takes keyed anew) is read again.
  // So is the line once the first takes read past the page's own write land (`pastWrite`, the
  // takes it had then: a stream's read is always waiting, so a new read is a new value): a line
  // put back elsewhere before that read keeps the takes it had before the write, and no change
  // would show to read it again for.
  let seen: ReadonlyMap<string, StagingTake> = new Map();
  let pastWrite = Option.none<Option.Option<ScriptVoice>>();
  createEffect(
    () => ({ now: takes(), read: voice() }),
    ({ now, read }) => {
      const before = seen;
      seen = now;
      const landed = Option.exists(pastWrite, (had) => Option.isSome(read) && !sameRead(had, read));
      if (landed) pastWrite = Option.none();
      if (landed || retaken(before, now)) Option.map(source.reread, (reread) => reread());
    },
  );
  const take = (id: string) => Option.fromUndefinedOr(takes().get(id));
  const readyOf = (id: string): Option.Option<Ready> =>
    Option.filter(take(id), (t): t is Ready => t._tag === 'Ready');

  // The takes' audio, through the page's media, one per take file, each made at its first Hear.
  const audios = new Map<string, Playable>();
  const audioOf = (file: string): Playable =>
    Option.getOrElse(Option.fromUndefinedOr(audios.get(file)), () => {
      const made = Effect.runSyncWith(source.host)(
        Media.useSync((m) => m.audio(source.takeUrl(file))),
      );
      audios.set(file, made);
      return made;
    });
  const [heard, setHeard] = createSignal<Heard>(Heard.Quiet(), { ownedWrite: true });
  /** The take being heard: what the voice pauses as it stops. */
  let current = Option.none<Playable>();
  let loop = Option.none<Fiber.Fiber<void>>();
  const stopLoop = () => {
    Option.map(loop, (f) => Effect.runFork(Fiber.interrupt(f)));
    loop = Option.none();
  };
  /** The take silenced and its loop ended: what the voice owns outside its state, let go as the voice goes. */
  const halt = () => {
    stopLoop();
    Option.map(current, (media) => Effect.runFork(media.pause));
  };
  const stop = () => {
    halt();
    setHeard(Heard.Quiet());
  };

  // Each play counts: a play the next one took the place of stops nothing when it is hushed or refused.
  let plays = 0;
  /**
   * Play `take` of beat `beat` from `start` to `end`, the beats `next` after
   * it: heard as the page's one voice (`Media.hear`), so the take another
   * hearer plays is paused and the film's Play hushes this one.
   */
  const play = (
    beat: string,
    take: Ready,
    start: number,
    end: number,
    next: ReadonlyArray<string>,
  ) => {
    stopLoop();
    const media = audioOf(take.file);
    current = Option.some(media);
    const n = ++plays;
    const mine = () => n === plays;
    setHeard(Heard.Hearing({ beat, words: take.words, end, next, index: Option.none() }));
    Option.map(source.player, (p) => p.pause());
    /** Quiet, unless a later play took this one's place. */
    const hushed = Effect.sync(() => {
      if (mine()) stop();
    });
    // The frames run until the stretch ends (on to the next beat) or Play takes over (quiet); then what follows.
    let then = stop;
    const heardThrough = Frames.use((f) =>
      f.loop(() =>
        Option.match(step(media), {
          onNone: () => true,
          onSome: (after) => {
            then = after;
            return false;
          },
        }),
      ),
    ).pipe(Effect.andThen(Effect.sync(() => then())));
    loop = Option.some(
      Effect.runForkWith(source.host)(
        media.seek(start).pipe(
          Effect.andThen(Media.use((m) => m.hear(media, hushed))),
          Effect.flatMap((played) =>
            Played.$match(played, {
              Playing: () => heardThrough,
              Muted: () => heardThrough,
              // A pause cut it short: whoever paused it says what follows.
              Aborted: () => Effect.void,
              Blocked: () => hushed,
              Failed: () => hushed,
            }),
          ),
        ),
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
  const step = (media: Playable): Option.Option<() => void> => {
    const now = untrack(heard);
    if (now._tag !== 'Hearing' || Option.exists(source.player, (p) => p.playing()))
      return Option.some(stop);
    const t = media.time();
    if (media.ended() || t >= now.end) return Option.some(() => playNext(now.next));
    const index = heardAt(now.words, t);
    if (Option.getOrElse(index, () => -1) !== Option.getOrElse(now.index, () => -1))
      setHeard(Heard.Hearing({ ...now, index }));
    return Option.none();
  };
  // Gone, the voice lets go of its take and its loop; its state goes with it, so no write is left to make (a
  // server's render, which disposes it as its stream ends, writes nothing).
  onCleanup(halt);

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

  // The marks this page wrote, by beat: those it had read (`read`) and those its write left
  // (`now`). Until the page reads the line again (its marks still `read`), the line is `now`.
  // The first read that is not `read` has the lab past the write (`moved`), and the line is
  // its read from then on, even one that puts the marks back as they were before it.
  const [wrote, setWrote] = createSignal<ReadonlyMap<string, Wrote>>(new Map(), {
    ownedWrite: true,
  });
  const moved = new WeakSet<Wrote>();
  const stillAhead = (w: Wrote, read: ReadonlyArray<Mark>): boolean => {
    if (moved.has(w)) return false;
    if (sameMarks(w.read, read)) return true;
    moved.add(w);
    return false;
  };
  const marksOf = (beat: string, read: ReadonlyArray<Mark>): ReadonlyArray<Mark> =>
    Option.getOrElse(
      Option.map(
        Option.filter(Option.fromUndefinedOr(wrote().get(beat)), (w) => stillAhead(w, read)),
        (w) => w.now,
      ),
      () => read,
    );

  // One write out at a time (`marking.ts`); once it lands the takes are read again, the beat's new key
  // queued first. The machine runs in the browser alone: the server's render writes nothing.
  const post = useAtomSet(() => source.write, { mode: 'promiseExit' });
  const write = (w: MarkWrite): Effect.Effect<void, string> =>
    Effect.flatMap(
      Effect.promise(() => post(w.post)),
      (exit) => {
        if (Exit.isFailure(exit)) return Effect.fail(reasonOf(exit.cause));
        return Effect.sync(() => {
          setWrote((was) => new Map(was).set(w.post.beat, { read: w.read, now: w.post.marks }));
          pastWrite = Option.some(untrack(voice));
          readAgain();
        });
      },
    );
  const spawned = Atom.make(Machine.scoped(spawnMarking(write)));
  const live = Atom.map(spawned, (made) => Option.map(AsyncResult.value(made), ActorAtom.make));
  const markingAtom = Atom.writable(
    (get) => Option.map(get(live), (actor) => get(actor)),
    (ctx, event: MarkingEvent) => {
      Option.map(ctx.get(live), (actor) => ctx.set(actor, event));
    },
  ).pipe(Atom.withServerValue(() => Option.none<MarkingState>()));
  const machine = useAtomValue(() => markingAtom);
  const sendMarking = useAtomSet(() => markingAtom);
  const marking = (): Marking =>
    Option.match(machine(), {
      onNone: () => Marking.Idle(),
      onSome: (state) =>
        Match.value(state).pipe(
          Match.tagsExhaustive({
            Idle: () => Marking.Idle(),
            Writing: (s) => Marking.Writing({ beat: s.beat }),
            Written: (s) => Marking.Written({ beat: s.beat }),
            Failed: (s) => Marking.Failed({ beat: s.beat, reason: s.reason }),
          }),
        ),
    });
  const mark = (beat: string, marks: ReadonlyArray<Mark>, read: LineRead) => {
    const on: LineRead = { spoken: read.spoken, marks: untrack(() => marksOf(beat, read.marks)) };
    sendMarking(
      MarkingEvent.Mark({ write: { post: { beat, marks, read: on }, read: read.marks } }),
    );
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
    marksOf,
    written: source.written,
  };
  return <VoiceContext value={value}>{props.children}</VoiceContext>;
};
