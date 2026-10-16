// The studio's inspector (design §5): the selected beat's pane, its head
// (the beat, its span, Approve or Withdraw for its Board, close) over a
// stack of sections in the flow's order, each a disclosure row (swatch,
// title, count, chevron) that opens on the beat's material and the writes
// the lab already serves for it:
//
//   Words           the words reader on the beat (or the whole script),
//                   following the playhead; delivery marks set in place
//   Board           each panel at its mark, its tries, the one kept; keep a
//                   try (the board's routes, `board-writes.ts`)
//   Voice           the beat's take, played; Record opens the recorder
//                   (a Dialog on a laptop, a Sheet on a phone)
//   Code            the scene's source, read only
//   Notes and asks  the owner's open notes on the beat with their threads
//                   (reply, resolve), and the open asks flagged in its span
//
// A section with no material in the version shown is one row and `–`. What
// is open is `inspector-state.ts`'s: the section of the kind clicked opens
// with the selection. The film's own files are written only while the
// version shown is the one they hold (`keptInFilm`); another version's
// Board shows its panels and nothing to press.

import { useAtomRefresh, useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Dialog } from '@bible/ui/dialog';
import { Separator } from '@bible/ui/separator';
import { Sheet as UiSheet } from '@bible/ui/sheet';
import { For, type JSX, Show } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Effect, Layer, Match, Option, Result } from 'effect';
import * as ActorAtom from 'effect-machine/atom';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import {
  type Accessor,
  type ParentProps,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from 'solid-js';
import { Media, type Playable } from '../../browser/media.ts';
import { reloadHere } from '../stage.ts';
import { pageHref } from '../../core/api.ts';
import { boardNamed } from '../../core/board.ts';
import type { BoardClip, FilmTimeline, ScriptClip, Track } from '../../core/timeline-schema.ts';
import { Actor } from '../actor.tsx';
import { LabApi } from '../api.ts';
import { hubKeys } from '../command/changes.ts';
import {
  Asks,
  NOTE_STATE,
  NotesFeed,
  ReplyForm,
  Said,
  Thread,
  noteLabel,
  useNotesFeed,
} from '../notes/thread.tsx';
import { pressed } from '../pressed.ts';
import { ReviewApi } from '../review/api.ts';
import { RecordStage } from '../studio/machine.ts';
import { Studio as Recorder } from '../studio/index.ts';
import type { RecordFocus, RecordPage } from '../studio/context.tsx';
import { type TakeHeard, takeHeard } from '../take.ts';
import { PHONE, useMatches } from '../viewport.ts';
import { FilmScriptReader } from '../words/film-script.tsx';
import { READER_CSS, type ReaderPage, useOwnSelecting } from '../words/reader.tsx';
import { PlaceStyle } from '../place-style.tsx';
import { SHELL_CSS } from '../page-shell-style.ts';
import { SCRIPT_READ_CSS } from '../script/style.ts';
import {
  type BeatBoard,
  type BoardWrite,
  type BoardWritesActor,
  BoardWritesEvent,
  type BoardWritesState,
  beatBoard,
  spawnBoardWrites,
  writesLine,
} from './board-writes.ts';
import { useStudio } from './context.tsx';
import { StudioIcon } from './icons.tsx';
import { INSPECTOR_CSS } from './style.ts';
import {
  type SectionName,
  type Toggled,
  boardText,
  openSections,
  toggle,
  wordsText,
} from './inspector-state.ts';
import {
  hasBoard,
  hasScene,
  keptInFilm,
  markersOfBeat,
  panelsOfBeat,
  timecode,
  voiceOfBeat,
} from './view-state.ts';

/** A beat's span as the inspector heads it: `2:27.6 – 3:06.1 · 38.5 s`. */
const spanText = (beat: ScriptClip) =>
  `${timecode(beat.start)} – ${timecode(beat.start + beat.dur)} · ${beat.dur.toFixed(1)} s`;

/** Whether the window is a phone's. */
const usePhone = (): Accessor<boolean> => useMatches(useStudio().meta.host, PHONE);

/** `n` of a thing, in words: `1 note`, `2 notes`. */
const counted = (n: number, thing: string) =>
  `${n} ${thing}${Bool.match(n === 1, { onTrue: () => '', onFalse: () => 's' })}`;

// ---------------------------------------------------------------- The Board's writes

/** The board writes as the pane reads them: where the last stands, and a write asked. */
interface Writes {
  readonly state: Accessor<BoardWritesState>;
  readonly send: (event: BoardWritesEvent) => void;
}

/** The writes actor's state and its send. */
const useWrites = (actor: BoardWritesActor): Writes => {
  const atom = ActorAtom.make(actor);
  const state = useAtomValue(() => atom);
  const send = useAtomSet(() => atom);
  return { state, send };
};

// ---------------------------------------------------------------- A section row

/**
 * One section of the pane: a disclosure whose row says what it holds (its
 * swatch, title, count and chevron) and whose body mounts only while it is
 * open, so a closed section reads nothing.
 */
const Section = (
  props: ParentProps<{
    readonly name: SectionName;
    readonly kind: Track | 'note';
    readonly count: string;
    readonly open: boolean;
    readonly onToggle: (open: boolean) => void;
  }>,
) => (
  <details
    class="st-sec"
    data-section={props.name}
    open={props.open}
    onToggle={(e) => {
      if (e.currentTarget.open !== props.open) props.onToggle(e.currentTarget.open);
    }}
  >
    <summary class="st-row">
      <i class="st-sw" data-kind={props.kind} aria-hidden="true" />
      <span>{props.name}</span>
      <span class="st-n">{props.count}</span>
      <i class="st-chev" aria-hidden="true" />
    </summary>
    <Show when={props.open}>
      <div class="st-sec-body">{props.children}</div>
    </Show>
  </details>
);

/** A section with no material in the version shown: its row and `–`. */
const Empty = (props: { readonly name: string; readonly kind: Track | 'note' }) => (
  <div class="st-row" data-section={props.name} data-empty="true">
    <i class="st-sw" data-kind={props.kind} aria-hidden="true" />
    <span>{props.name}</span>
    <span class="st-n">–</span>
  </div>
);

/** A quiet line in a section: why it has nothing to press, or where a read stands. */
const Line = (props: { readonly children: JSX.Element; readonly alert?: boolean }) => (
  <p
    class="st-line"
    role={Bool.match(props.alert === true, { onTrue: () => 'alert', onFalse: () => 'status' })}
  >
    {props.children}
  </p>
);

// ---------------------------------------------------------------- Head

/** The pane's head: the beat, its span, Approve or Withdraw for its Board, and close. */
const Head = (props: {
  readonly beat: ScriptClip;
  readonly timeline: FilmTimeline;
  readonly writes: Writes;
  readonly board: Accessor<Option.Option<BeatBoard>>;
  readonly ref: (el: HTMLElement) => void;
}) => {
  const { actions, meta } = useStudio();
  const keys = hubKeys(meta.hub);
  const sending = () => props.writes.state()._tag === 'Sending';
  // What the Board button does now: approve, withdraw, or nothing and why.
  const verdict = createMemo((): Result.Result<'approve' | 'withdraw', string> =>
    Bool.match(keptInFilm(props.timeline), {
      onFalse: () => Result.fail("This version's Board is read only"),
      onTrue: () =>
        Option.match(props.board(), {
          onNone: () => Result.fail('Reading the Board…'),
          onSome: (board) =>
            Bool.match(board.approval === 'approved', {
              onTrue: () => Result.succeed('withdraw' as const),
              onFalse: () => Result.map(board.approvable, () => 'approve' as const),
            }),
        }),
    }),
  );
  return (
    <div class="st-pane-head" ref={props.ref}>
      <i class="st-sw" data-kind="script" aria-hidden="true" />
      <div class="st-ttl">
        <h2>{props.beat.beat}</h2>
        <div class="st-sub">{spanText(props.beat)}</div>
      </div>
      <Show when={hasBoard(props.timeline, props.beat.beat)}>
        <button
          type="button"
          class={Result.match(verdict(), {
            onSuccess: (v) =>
              Bool.match(v === 'approve', {
                onTrue: () => 'st-btn primary',
                onFalse: () => 'st-btn',
              }),
            onFailure: () => 'st-btn primary',
          })}
          data-act={Result.match(verdict(), { onSuccess: (v) => v, onFailure: () => 'approve' })}
          disabled={Result.isFailure(verdict()) || sending()}
          title={Result.match(verdict(), {
            onSuccess: (v) =>
              Bool.match(v === 'approve', {
                onTrue: () => `Approve ${props.beat.beat}'s Board on the tries it keeps`,
                onFalse: () => `Withdraw ${props.beat.beat}'s approval`,
              }),
            onFailure: (why) => why,
          })}
          onClick={() =>
            Result.map(verdict(), (v) =>
              props.writes.send(
                Bool.match(v === 'approve', {
                  onTrue: () => BoardWritesEvent.Approve({ beat: props.beat.beat }),
                  onFalse: () => BoardWritesEvent.Withdraw({ beat: props.beat.beat }),
                }),
              ),
            )
          }
        >
          {Result.match(verdict(), {
            onSuccess: (v) =>
              Bool.match(v === 'approve', { onTrue: () => 'Approve', onFalse: () => 'Withdraw' }),
            onFailure: () => 'Approve',
          })}
        </button>
      </Show>
      <button
        type="button"
        class="st-close"
        data-act="close"
        aria-label="Close the inspector"
        title={keys.titled('Close the inspector', 'studio.close')}
        onClick={() => actions.select(Option.none())}
      >
        <StudioIcon of="close" />
      </button>
    </div>
  );
};

// ---------------------------------------------------------------- Words

/** The beat's words in the reader, following the playhead; the whole script once asked. */
const WordsBody = (props: {
  readonly beat: string;
  readonly box: () => Option.Option<HTMLElement>;
  readonly clearTop: () => number;
}) => {
  const { state, actions, meta } = useStudio();
  const selecting = useOwnSelecting();
  const [whole, setWhole] = createSignal(false, { ownedWrite: true });
  const page: ReaderPage = {
    host: meta.host,
    hub: meta.hub,
    runtime: meta.runtime,
    playhead: Option.some({
      beat: () => Option.map(state.current(), (b) => b.beat),
      clock: { drawn: state.T, playing: state.playing },
      box: props.box,
      clearTop: props.clearTop,
      pause: actions.pause,
    }),
  };
  return (
    <>
      <FilmScriptReader
        page={page}
        script={meta.script}
        film={meta.film}
        only={Bool.match(whole(), {
          onTrue: () => Option.none(),
          onFalse: () => Option.some([props.beat]),
        })}
        selecting={selecting}
        brief="disclosed"
      />
      <button
        type="button"
        class="st-btn st-more"
        data-act="whole-script"
        aria-pressed={pressed(whole())}
        onClick={() => setWhole(!whole())}
      >
        {Bool.match(whole(), {
          onTrue: () => `Read ${props.beat} alone`,
          onFalse: () => 'Read the whole script',
        })}
      </button>
    </>
  );
};

// ---------------------------------------------------------------- Board

/** The kept try's words beside a panel: `try 2 kept`, `card`, or `no try kept`. */
const panelState = (clip: BoardClip): string =>
  Bool.match(clip.card, {
    onTrue: () => 'card',
    onFalse: () =>
      Option.match(
        Option.filter(Option.fromUndefinedOr(clip.try), () => clip.state !== 'made'),
        { onNone: () => 'no try kept', onSome: (n) => `try ${n} kept` },
      ),
  });

/**
 * One panel of the beat: its mark and time (a press selects it), its tries
 * as a strip (the kept one ringed) and why it was kept, in two lines. A
 * try pressed shows large under the strip; while the version shown is the
 * film's own, it can be kept.
 */
const PanelRow = (props: {
  readonly clip: BoardClip;
  readonly board: Accessor<Option.Option<BeatBoard>>;
  readonly writes: Writes;
  /** Whether the version shown is the film's own, whose Board a Keep writes. */
  readonly kept: boolean;
}) => {
  const { state, actions, meta } = useStudio();
  const panel = () =>
    Option.flatMap(props.board(), (b) => Arr.findFirst(b.panels, (p) => p.id === props.clip.panel));
  const [shown, setShown] = createSignal(Option.none<number>(), { ownedWrite: true });
  const selected = () => Option.exists(state.panel(), (p) => p.panel === props.clip.panel);
  const sending = () => props.writes.state()._tag === 'Sending';
  return (
    <div class="st-panel" data-panel={props.clip.panel} data-selected={pressed(selected())}>
      <button
        type="button"
        class="st-panel-head"
        aria-pressed={pressed(selected())}
        onClick={() => actions.selectPanel(props.clip.panel)}
      >
        <span class="st-panel-mark">{props.clip.mark}</span>
        <span class="st-panel-at">{timecode(props.clip.markAt)}</span>
        <span class="st-panel-state">{panelState(props.clip)}</span>
      </button>
      <Show
        when={Option.getOrUndefined(Option.filter(panel(), (p) => p.tries.length > 0 && !p.text))}
        fallback={
          <Show when={props.clip.file}>
            {(file) => (
              <img
                class="st-try"
                data-kept="true"
                src={meta.boardUrl(file())}
                alt={`${props.clip.panel}, ${panelState(props.clip)}`}
                width="85"
                height="48"
                loading="lazy"
              />
            )}
          </Show>
        }
      >
        {(p) => (
          <>
            <div class="st-tries" role="group" aria-label={`Tries of ${props.clip.panel}`}>
              <For each={p().tries}>
                {(t) => (
                  <button
                    type="button"
                    class="st-try-btn"
                    data-try={t.n}
                    data-kept={pressed(p().kept === t.n)}
                    aria-pressed={pressed(Option.contains(shown(), t.n))}
                    aria-label={`Try ${t.n}${Bool.match(p().kept === t.n, { onTrue: () => ', kept', onFalse: () => '' })}`}
                    onClick={() =>
                      setShown(
                        Bool.match(Option.contains(shown(), t.n), {
                          onTrue: () => Option.none<number>(),
                          onFalse: () => Option.some(t.n),
                        }),
                      )
                    }
                  >
                    <img
                      class="st-try"
                      src={meta.boardUrl(t.file)}
                      alt=""
                      width="85"
                      height="48"
                      loading="lazy"
                    />
                    <span class="st-try-n" aria-hidden="true">
                      {t.n}
                    </span>
                  </button>
                )}
              </For>
            </div>
            <Show when={p().why}>{(why) => <p class="st-why">{`Kept: ${why()}`}</p>}</Show>
            <Show
              when={Option.getOrUndefined(
                Option.flatMap(shown(), (n) => Arr.findFirst(p().tries, (t) => t.n === n)),
              )}
            >
              {(t) => (
                <div class="st-try-shown" data-try={t().n}>
                  <img
                    src={meta.boardUrl(t().file)}
                    alt={`Try ${t().n} of ${props.clip.panel}`}
                    loading="lazy"
                  />
                  <Show when={props.kept}>
                    <button
                      type="button"
                      class="st-btn"
                      data-act="keep"
                      disabled={p().kept === t().n || sending()}
                      onClick={() =>
                        props.writes.send(BoardWritesEvent.Keep({ panel: p().id, n: t().n }))
                      }
                    >
                      {Bool.match(p().kept === t().n, {
                        onTrue: () => `Try ${t().n} is kept`,
                        onFalse: () => `Keep try ${t().n}`,
                      })}
                    </button>
                  </Show>
                </div>
              )}
            </Show>
          </>
        )}
      </Show>
    </div>
  );
};

// ---------------------------------------------------------------- Voice

/** The recorder on the studio's film, at the beat selected: what its page is here, once the film is staged. */
const useRecordPage = (beat: string): Accessor<Option.Option<RecordPage>> => {
  const { actions, meta } = useStudio();
  // Focus is kept for the page's life: the studio reloads the page only for a new take, whose recorder opens shut.
  let focus = Option.none<RecordFocus>();
  return createMemo(() =>
    Option.map(meta.player(), (staged): RecordPage => ({
      film: meta.film,
      host: meta.host,
      hub: meta.hub,
      client: meta.client,
      stage: Layer.succeed(
        RecordStage,
        RecordStage.of({
          pause: Effect.sync(() => staged.player.pause()),
          reload: reloadHere(staged.player, meta.host),
        }),
      ),
      linked: (beats) => Option.liftPredicate(beat, (b) => beats.includes(b)),
      go: (to) => actions.select(Option.some(to)),
      focus: {
        get: () => focus,
        set: (f) => {
          focus = Option.some(f);
        },
      },
      hold: () => Effect.void,
      listed: () => {},
      place: (children) => children,
    })),
  );
};

/** The recorder over the page: a Dialog on a laptop, a Sheet from the bottom on a phone. */
const RecordOver = (props: {
  readonly beat: string;
  readonly page: RecordPage;
  readonly onClose: () => void;
}) => {
  const phone = usePhone();
  // The recorder is the beat's page as it opened: its page is read once.
  const page = untrack(() => props.page);
  const body = () => (
    <Recorder.Provider page={page}>
      <Recorder.Section />
    </Recorder.Provider>
  );
  return (
    <Show
      when={phone()}
      fallback={
        <Dialog.Root
          open
          onOpenChange={(next) => {
            if (!next) props.onClose();
          }}
        >
          <Dialog.Portal>
            <Dialog.Backdrop class="st-record-backdrop" />
            <Dialog.Popup class="st-record" data-role="record">
              <div class="st-record-head">
                <Dialog.Title class="st-record-title">{`Record ${props.beat}`}</Dialog.Title>
                <Dialog.Close
                  class="st-close"
                  data-act="close-record"
                  aria-label="Close the recorder"
                >
                  <StudioIcon of="close" />
                </Dialog.Close>
              </div>
              {body()}
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      }
    >
      <UiSheet.Root
        open
        position="bottom"
        onOpenChange={(next) => {
          if (!next) props.onClose();
        }}
      >
        <UiSheet.Portal class="st-record-portal">
          <UiSheet.Overlay>
            <UiSheet.Backdrop class="st-record-sheet-backdrop" />
            <UiSheet.Popup class="st-record-panel">
              <UiSheet.Content class="st-record st-record-sheet" data-role="record">
                <div class="st-record-head">
                  <UiSheet.Title class="st-record-title">{`Record ${props.beat}`}</UiSheet.Title>
                  <UiSheet.Close
                    class="st-close"
                    data-act="close-record"
                    aria-label="Close the recorder"
                  >
                    <StudioIcon of="close" />
                  </UiSheet.Close>
                </div>
                {body()}
              </UiSheet.Content>
            </UiSheet.Popup>
          </UiSheet.Overlay>
        </UiSheet.Portal>
      </UiSheet.Root>
    </Show>
  );
};

/**
 * The take, heard through the page's media (`Media`): Hear plays it from
 * where it stopped and pauses the studio; Stop pauses it. It is made at the
 * first Hear and paused as the section closes.
 */
const HearTake = (props: { readonly take: TakeHeard }) => {
  const { actions, meta } = useStudio();
  const run = Effect.runForkWith(meta.host);
  const stop = new AbortController();
  const [playing, setPlaying] = createSignal(false, { ownedWrite: true });
  let made = Option.none<Playable>();
  const media = (): Playable =>
    Option.getOrElse(made, () => {
      const audio = Effect.runSyncWith(meta.host)(Media.useSync((m) => m.audio(props.take.url)));
      audio.on('ended', () => setPlaying(false), stop.signal);
      made = Option.some(audio);
      return audio;
    });
  onCleanup(() => {
    stop.abort();
    Option.map(made, (audio) => run(audio.pause));
  });
  return (
    <button
      type="button"
      class="st-btn"
      data-act="hear-take"
      data-source={props.take.source}
      aria-pressed={pressed(playing())}
      onClick={() =>
        Bool.match(playing(), {
          onTrue: () => {
            run(media().pause);
            setPlaying(false);
          },
          onFalse: () => {
            actions.pause();
            run(
              Media.use((m) => m.play(media())).pipe(
                Effect.map((played) => setPlaying(played._tag === 'Playing')),
              ),
            );
          },
        })
      }
    >
      {Bool.match(playing(), {
        onTrue: () => 'Stop',
        onFalse: () => `Hear the take · ${props.take.duration.toFixed(1)} s`,
      })}
    </button>
  );
};

/** The beat's take, its speech and marks, played here (the studio pauses); Record opens the recorder on it. */
const VoiceBody = (props: { readonly beat: ScriptClip; readonly timeline: FilmTimeline }) => {
  const { meta } = useStudio();
  // The pane is the beat's alone (a new beat is a new pane), so its takes are read for the beat it opened on.
  const beat = untrack(() => props.beat.beat);
  const read = meta.runtime.atom(ReviewApi.use((api) => api.attempts(meta.film, beat)));
  const attempts = useAtomValue(() => read);
  const take = () =>
    Option.flatMap(AsyncResult.value(attempts()), (a) => takeHeard(meta.film, a, Option.none()));
  const record = useRecordPage(beat);
  const [recording, setRecording] = createSignal(false, { ownedWrite: true });
  return (
    <>
      <dl class="st-facts">
        <Show when={Option.getOrUndefined(voiceOfBeat(props.timeline, props.beat.beat))}>
          {(clip) => (
            <>
              <dt>Take</dt>
              <dd data-role="take-source">
                {Match.value(clip().source).pipe(
                  Match.when('owner', () => 'your take'),
                  Match.orElse(() => 'the staging voice'),
                )}
              </dd>
            </>
          )}
        </Show>
        <Show when={props.beat.speech}>
          {(speech) => (
            <>
              <dt>Speech</dt>
              <dd>{`${timecode(speech().start)} – ${timecode(speech().end)}`}</dd>
            </>
          )}
        </Show>
        <dt>Marks</dt>
        <dd>{counted(props.beat.marks.length, 'mark')}</dd>
      </dl>
      <Show
        when={Option.getOrUndefined(take())}
        fallback={
          <Line alert={AsyncResult.isFailure(attempts())}>
            {AsyncResult.match(attempts(), {
              onInitial: () => 'Reading the takes…',
              onFailure: () => 'The takes could not be read.',
              onSuccess: () => 'No take to hear yet.',
            })}
          </Line>
        }
      >
        {(t) => (
          <>
            <HearTake take={t()} />
            <Show when={Option.getOrUndefined(t().heard)}>
              {(heard) => <p class="st-heard">{`Heard: ${heard()}`}</p>}
            </Show>
          </>
        )}
      </Show>
      <Show
        when={Option.getOrUndefined(Option.filter(record(), () => keptInFilm(props.timeline)))}
        fallback={<Line>Recording opens on the version the film plays.</Line>}
      >
        {(page) => (
          <>
            <button
              type="button"
              class="st-btn"
              data-act="record"
              onClick={() => setRecording(true)}
            >
              Record this beat
            </button>
            <Show when={recording()}>
              <RecordOver
                beat={props.beat.beat}
                page={page()}
                onClose={() => setRecording(false)}
              />
            </Show>
          </>
        )}
      </Show>
    </>
  );
};

// ---------------------------------------------------------------- Code

/** The scene's source as its file stands, read only, a line each; the Lab, where it is edited, a link away. */
const CodeBody = (props: { readonly scene: string }) => {
  const { meta } = useStudio();
  // The pane is the beat's alone, so the scene read is the one it opened on.
  const scene = untrack(() => props.scene);
  const read = meta.runtime.atom(LabApi.use((api) => api.code(scene)));
  const code = useAtomValue(() => read);
  return (
    <Show
      when={Option.getOrUndefined(AsyncResult.value(code()))}
      fallback={
        <Line alert={AsyncResult.isFailure(code())}>
          {AsyncResult.match(code(), {
            onInitial: () => 'Reading the scene…',
            onFailure: () => 'The scene could not be read.',
            onSuccess: () => '',
          })}
        </Line>
      }
    >
      {(c) => (
        <figure class="st-code" data-file={c().file}>
          <figcaption class="st-code-file">{c().file}</figcaption>
          <pre aria-label={`${c().file}, read only`}>
            <code>
              <For each={c().text.split('\n')}>
                {(line) => <span class="st-code-line">{line}</span>}
              </For>
            </code>
          </pre>
          <a
            class="st-btn st-lab"
            data-act="open-lab"
            href={pageHref.labScene(meta.film, scene, {}, Option.none())}
          >
            Edit in the Lab
          </a>
        </figure>
      )}
    </Show>
  );
};

// ---------------------------------------------------------------- Notes and asks

/** The owner's open notes on the beat, each with its thread and a reply, and the open asks in its span. */
const NotesBody = (props: { readonly beat: ScriptClip; readonly timeline: FilmTimeline }) => {
  const { meta } = useStudio();
  const feed = useNotesFeed();
  const notes = () =>
    feed.notes().filter((n) => n.scene === props.beat.beat && n.status !== 'resolved');
  const asks = () => markersOfBeat(props.timeline, props.beat).asks;
  return (
    <>
      {/* Keyed by the note's id: a read again (a reply landed) keeps its disclosure as the owner left it. */}
      <For each={notes()} keyed={(n) => n.id}>
        {(note) => (
          <details class="st-note" data-note={note().id}>
            <summary class="st-note-head">
              <span class="st-note-label">{noteLabel(note(), Option.none())}</span>
              <span class="sh-badge" data-state={NOTE_STATE[note().status]}>
                {note().status}
              </span>
              <i class="st-chev" aria-hidden="true" />
            </summary>
            <div class="st-note-body">
              <Asks note={note()} />
              <Said note={note()} />
              <Thread film={meta.film} note={note()} />
              <ReplyForm note={note()} />
            </div>
          </details>
        )}
      </For>
      <Show when={notes().length > 0 && asks().length > 0}>
        <Separator class="st-sep" />
      </Show>
      <For each={asks()}>
        {(ask) => (
          <a class="st-ask" data-ask={ask.id} href={ask.href}>
            <span class="st-ask-at">{timecode(ask.at)}</span>
            <span>{ask.title}</span>
          </a>
        )}
      </For>
      <Show when={notes().length === 0 && asks().length === 0}>
        <Line>Nothing waits on this beat.</Line>
      </Show>
    </>
  );
};

// ---------------------------------------------------------------- The pane

/** The selected beat's pane: its head, then its sections in the flow's order. */
const Pane = (props: {
  readonly beat: ScriptClip;
  readonly timeline: FilmTimeline;
  readonly writes: Writes;
  readonly board: Accessor<Option.Option<BeatBoard>>;
}) => {
  const { state } = useStudio();
  let box = Option.none<HTMLElement>();
  let head = Option.none<HTMLElement>();
  const [toggled, setToggled] = createSignal(Option.none<Toggled>(), { ownedWrite: true });
  const selected = () =>
    Option.match(state.panel(), {
      onNone: () => ({ kind: 'beat' as const, sel: `beat:${props.beat.beat}` }),
      onSome: (p) => ({ kind: 'panel' as const, sel: `panel:${p.panel}` }),
    });
  const open = createMemo(() => openSections(selected(), toggled()));
  const onToggle = (name: SectionName) => (now: boolean) =>
    setToggled(Option.some(toggle(selected(), toggled(), name, now)));
  const section = (name: SectionName) => ({
    name,
    open: open().has(name),
    onToggle: onToggle(name),
  });
  const panels = () => panelsOfBeat(props.timeline, props.beat.beat);
  const kept = () => keptInFilm(props.timeline);
  const markers = () => markersOfBeat(props.timeline, props.beat);
  const lane = (track: Track) => props.timeline.lanes.some((l) => l.track === track);
  return (
    <div
      class="st-pane"
      data-beat={props.beat.beat}
      ref={(el: HTMLElement) => {
        box = Option.some(el);
      }}
    >
      <Head
        beat={props.beat}
        timeline={props.timeline}
        writes={props.writes}
        board={props.board}
        ref={(el) => {
          head = Option.some(el);
        }}
      />
      <Show when={Option.getOrUndefined(writesLine(props.writes.state()))}>
        {(line) => (
          <Line alert={props.writes.state()._tag === 'Failed'}>
            <span data-role="board-write">{line()}</span>
          </Line>
        )}
      </Show>
      <Show when={kept()} fallback={<Empty name="Words" kind="script" />}>
        <Section
          {...section('Words')}
          kind="script"
          count={Option.getOrElse(
            Option.flatMap(state.words(props.beat.beat), (w) =>
              Option.map(Option.fromUndefinedOr(w.say), wordsText),
            ),
            () => '–',
          )}
        >
          <WordsBody
            beat={props.beat.beat}
            box={() => box}
            clearTop={() =>
              Option.getOrElse(
                Option.map(head, (h) => h.offsetHeight),
                () => 0,
              )
            }
          />
        </Section>
      </Show>
      <Show when={lane('concept')}>
        <Empty name="Concept" kind="concept" />
      </Show>
      <Show when={panels().length > 0} fallback={<Empty name="Board" kind="board" />}>
        <Section {...section('Board')} kind="board" count={boardText(panels())}>
          <Show when={!kept()}>
            <Line>This version's Board is read only.</Line>
          </Show>
          <For each={panels()}>
            {(clip) => (
              <PanelRow clip={clip} board={props.board} writes={props.writes} kept={kept()} />
            )}
          </For>
        </Section>
      </Show>
      <Show
        when={Option.isSome(voiceOfBeat(props.timeline, props.beat.beat)) || kept()}
        fallback={<Empty name="Voice" kind="voice" />}
      >
        <Section
          {...section('Voice')}
          kind="voice"
          count={Option.match(voiceOfBeat(props.timeline, props.beat.beat), {
            onNone: () => 'no take',
            onSome: (v) =>
              Match.value(v.source).pipe(
                Match.when('owner', () => 'your take'),
                Match.orElse(() => 'staging'),
              ),
          })}
        >
          <VoiceBody beat={props.beat} timeline={props.timeline} />
        </Section>
      </Show>
      <Show
        when={kept() && hasScene(props.timeline, props.beat.beat)}
        fallback={<Empty name="Code" kind="scenes" />}
      >
        <Section {...section('Code')} kind="scenes" count="read only">
          <CodeBody scene={props.beat.beat} />
        </Section>
      </Show>
      <Section
        {...section('Notes and asks')}
        kind="note"
        count={Bool.match(markers().notes.length + markers().asks.length === 0, {
          onTrue: () => '–',
          onFalse: () =>
            [
              ...Option.toArray(
                Option.liftPredicate(markers().notes.length, (n) => n > 0).pipe(
                  Option.map((n) => counted(n, 'note')),
                ),
              ),
              ...Option.toArray(
                Option.liftPredicate(markers().asks.length, (n) => n > 0).pipe(
                  Option.map((n) => counted(n, 'ask')),
                ),
              ),
            ].join(' · '),
        })}
      >
        <NotesBody beat={props.beat} timeline={props.timeline} />
      </Section>
    </div>
  );
};

/**
 * The board's writes for the inspector: keep a try, approve a beat, withdraw
 * its approval, each through the lab's board routes; a landed write reads the
 * board and the timeline again.
 */
const WithWrites = (props: {
  readonly children: (writes: Writes, board: Accessor<Option.Option<BeatBoard>>) => JSX.Element;
}) => {
  const { state, actions, meta } = useStudio();
  const boardRead = meta.runtime.atom(LabApi.use((api) => api.board));
  const board = useAtomValue(() => boardRead);
  const again = useAtomRefresh(() => boardRead);
  const send = (write: BoardWrite) =>
    LabApi.use((api) =>
      Match.value(write).pipe(
        Match.tagsExhaustive({
          Keep: (w) => api.boardPick(w.panel, w.n, Option.none()),
          Approve: (w) =>
            Option.match(boardNamed(w.beat), {
              onNone: () => Effect.die(`${w.beat} is not a board beat name`),
              onSome: (name) => api.boardApproval('approve', name),
            }),
          Withdraw: (w) =>
            Option.match(boardNamed(w.beat), {
              onNone: () => Effect.die(`${w.beat} is not a board beat name`),
              onSome: (name) => api.boardApproval('withdraw', name),
            }),
        }),
      ),
    ).pipe(
      Effect.mapError((failure) => failure.message),
      Effect.tap(() =>
        Effect.sync(() => {
          again();
          actions.refresh();
        }),
      ),
    );
  const beatOf = createMemo(() =>
    Option.flatMap(AsyncResult.value(board()), (b) =>
      Option.map(state.selected(), (beat) => beatBoard(b, beat.beat)),
    ),
  );
  return (
    <Actor runtime={meta.runtime} spawn={spawnBoardWrites(send)}>
      {(actor) => props.children(useWrites(actor), beatOf)}
    </Actor>
  );
};

/**
 * The inspector: the selected beat's pane, beside the viewer on a laptop
 * and in the reading block's place on a phone; nothing while no beat is
 * selected. The film's notes are read once for it, followed by their feed.
 */
/**
 * What the inspector's parts are styled by: the shell's kit (a button, a
 * badge, a segmented row), a script read aloud, the reader's own and the
 * sections'. They ride with the inspector, never in the page's head: the
 * studio is the browser's alone, so no first paint waits for them.
 */
const INSPECTOR_STYLES = `${SHELL_CSS}${SCRIPT_READ_CSS}${READER_CSS}${INSPECTOR_CSS}`;

export const Inspector = () => {
  const { state, meta } = useStudio();
  return (
    <aside class="st-insp" aria-label="Inspector">
      <PlaceStyle css={INSPECTOR_STYLES} />
      <Show when={Option.isSome(state.selected())}>
        <NotesFeed film={meta.film} runtime={meta.runtime} note={() => Option.none()}>
          <WithWrites>
            {(writes, board) => (
              <Show when={Option.getOrUndefined(state.timeline())}>
                {(timeline) => (
                  // A pane for each beat selected: its sections open afresh; a read again keeps it.
                  <Show
                    when={Option.getOrUndefined(Option.map(state.selected(), (b) => b.beat))}
                    keyed
                  >
                    {(_id: string) => (
                      <Show when={Option.getOrUndefined(state.selected())}>
                        {(beat) => (
                          <Pane beat={beat()} timeline={timeline()} writes={writes} board={board} />
                        )}
                      </Show>
                    )}
                  </Show>
                )}
              </Show>
            )}
          </WithWrites>
        </NotesFeed>
      </Show>
    </aside>
  );
};
