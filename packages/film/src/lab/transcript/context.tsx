// The Transcript view's provider: the talk's words as the server reads its
// `talk.ts` and cuts it now (`GET …/talk`, read while the view is open and
// not before: a lab at rest reads none of it), laid out for the film on the
// stage (`lit.ts`); the word playing at the frame shown; the words selected
// (`?words=`); the viewer's "Show cuts"; Follow (the lab's one rule,
// `lab/follow.ts`, suspended by a hand's scroll); and the view's writes, Cut,
// Restore and Mark here, each one `POST …/talk/<verb>` that holds `#t=` while
// it is out, as the editor's writes do (the server rebuilds the page on a
// write of `talk.ts`, and the page derives the talk again and plays its new
// mix), and answers in the editor's slot among the page's receipts: what it
// wrote with the Undo that steps the change it made (`edit.undo`), or the
// server's refusal in its words, with nothing written. The view and the
// commands read this context; none holds the talk of its own.

import { useAtomRefresh, useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Show } from '@solidjs/web';
import { Boolean as Bool, Data, Effect, Exit, Layer, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
} from 'solid-js';
import { readsFootage } from '../../browser/footage.ts';
import { keptText } from '../../browser/storage.ts';
import { ViewerStore } from '../../browser/storage-browser.ts';
import { busy, refused, said } from '../../command/command.ts';
import { Selection, type WordsSelection } from '../../command/selection.ts';
import type { TalkWords } from '../../core/api.ts';
import type { LabWrite } from '../../core/schema.ts';
import { reasonOf } from '../api.ts';
import { useLabPage } from '../panel.tsx';
import { useLab } from '../shell.tsx';
import { TalkApi, type WordsAsked, talkApiLayer } from './api.ts';
import { transcriptCommands } from './commands.ts';
import {
  type Row,
  type SectionRows,
  type WordAt,
  markName,
  rowsIn,
  rowsOf,
  wordAt,
} from './lit.ts';
import { FOLLOW_TEXT, type TextOpen, textText } from './open.ts';

/** The talk as the view knows it: not asked for, being read, read, or refused (with the server's words). */
export type TalkState = Data.TaggedEnum<{
  Idle: {};
  Reading: {};
  Read: { readonly talk: TalkWords };
  Refused: { readonly reason: string };
}>;
export const TalkState = Data.taggedEnum<TalkState>();

/** A write the view asks of the server. */
type TalkAsk = Data.TaggedEnum<{
  Cut: { readonly words: WordsAsked };
  Restore: { readonly words: WordsAsked };
  Mark: { readonly section: string; readonly word: number; readonly name: string };
}>;
const TalkAsk = Data.taggedEnum<TalkAsk>();

/**
 * The view's slot among the page's receipts (`Hub.announce`): the editor's,
 * as a write of the film's source is one, so a write's receipt replaces the
 * last, and its Undo's answer (`edit.undo`) replaces it in turn.
 */
const TALK_SLOT = 'edit';

/** What a write on its way says, by its verb. */
const DOING: Readonly<Record<TalkAsk['_tag'], string>> = {
  Cut: 'cutting…',
  Restore: 'restoring…',
  Mark: 'marking…',
};

/** The viewer's "Show cuts", kept in the browser: a convenience, safe to lose (off with nothing kept). */
const keptCuts = keptText(ViewerStore, 'film-studio.transcript-cuts');

interface TranscriptContextValue {
  /** The talk's file as the server names it, once read. */
  readonly file: Accessor<Option.Option<string>>;
  /** The talk's sections as the view lays them out: none until the server has answered. */
  readonly sections: Accessor<ReadonlyArray<SectionRows>>;
  /** Where the talk stands: not asked for while the view is shut, then reading, read, or refused. */
  readonly state: Accessor<TalkState>;
  /** Ask the server for the talk again after a refusal. */
  readonly retry: () => void;
  /** The view as the URL holds it. */
  readonly open: Accessor<Option.Option<TextOpen>>;
  /** The word the view is held on (`?text=<word>`), against the talk read: none while it follows, is shut, or reads. */
  readonly held: Accessor<Option.Option<WordAt>>;
  /** The word playing at the frame shown, or the last said before it in its section. */
  readonly lit: Accessor<Option.Option<WordAt>>;
  /** The words selected, as the talk read has them: none for words it does not have. */
  readonly picked: Accessor<ReadonlyArray<Row>>;
  /** The words selected, as the URL holds them. */
  readonly selected: Accessor<Option.Option<WordsSelection>>;
  /** Whether the view places its scroll: no hand has scrolled it since it opened, or it was taken back. */
  readonly placing: Accessor<boolean>;
  /** Whether the view scrolls with the frame: it is open to follow and placing. */
  readonly following: Accessor<boolean>;
  /** A hand scrolled the view: it stops placing until `resume`. */
  readonly suspend: () => void;
  /** Place the view again. */
  readonly resume: () => void;
  /** Whether struck words show (the viewer's "Show cuts"). */
  readonly cuts: Accessor<boolean>;
  readonly showCuts: (on: boolean) => void;
  /** Whether a write is out: the view's writes wait for its answer. */
  readonly writing: Accessor<boolean>;
  /** Show word `row` of `section`: seek to where it starts (a word the cut plays), and select it, or the words from the selection's first to it (`extend`). */
  readonly tap: (section: string, row: Row, extend: boolean) => void;
  /** Select words `from`–`to` of `section` (a text selection in the view). */
  readonly selectRange: (section: string, from: number, to: number) => void;
  /** Strike the words selected, Play them again, or mark the first played one. */
  readonly cut: () => void;
  readonly restore: () => void;
  readonly mark: () => void;
  /** Whether the selection has a word the cut plays, a word it strikes. */
  readonly canCut: Accessor<boolean>;
  readonly canRestore: Accessor<boolean>;
}

const TranscriptContext = createContext<TranscriptContextValue>();

/** The Transcript view's context: only inside `<Transcript.Provider>`. */
export const useTranscript = (): TranscriptContextValue => useContext(TranscriptContext);

/** Reads the talk while it is mounted, into `into`; hands over how to ask again. */
const Reader = (props: {
  readonly read: Atom.Atom<AsyncResult.AsyncResult<TalkWords, unknown>>;
  readonly into: (state: TalkState) => void;
  readonly offer: (retry: () => void) => void;
}) => {
  const result = useAtomValue(() => props.read);
  const refresh = useAtomRefresh(() => props.read);
  props.offer(refresh);
  createEffect(
    () => result(),
    (read) => {
      props.into(
        AsyncResult.match(read, {
          onInitial: () => TalkState.Reading(),
          onFailure: (f) => TalkState.Refused({ reason: reasonOf(f.cause) }),
          onSuccess: (s) => TalkState.Read({ talk: s.value }),
        }),
      );
    },
  );
  onCleanup(() => {
    props.offer(() => {});
    props.into(TalkState.Idle());
  });
  return <></>;
};

export const Provider = (props: ParentProps) => {
  const { state: lab, actions, meta } = useLab();
  const page = useLabPage();
  // Its own runtime over the page's one client: the shell's services know nothing of a talk.
  const runtime = Atom.runtime(talkApiLayer(meta.name).pipe(Layer.provide(page.client)));
  const read = runtime.atom(TalkApi.use((api) => api.words));
  const send = runtime.fn((ask: TalkAsk) =>
    TalkApi.use((api) =>
      TalkAsk.$match(ask, {
        Cut: ({ words }) => api.cut(words),
        Restore: ({ words }) => api.restore(words),
        Mark: ({ section, word, name }) => api.mark(section, word, name),
      }),
    ),
  );
  useAtomValue(() => send);
  const sent = useAtomSet(() => send, { mode: 'promiseExit' });

  const [state, setState] = createSignal<TalkState>(TalkState.Idle(), { ownedWrite: true });
  let retrying = () => {};
  const talk = createMemo(() =>
    TalkState.$match(state(), {
      Idle: () => Option.none<TalkWords>(),
      Reading: () => Option.none<TalkWords>(),
      Read: (s) => Option.some(s.talk),
      Refused: () => Option.none<TalkWords>(),
    }),
  );
  const sections = createMemo(() =>
    Option.match(talk(), {
      onNone: (): ReadonlyArray<SectionRows> => [],
      onSome: (t) => rowsOf(t, meta.film.placed),
    }),
  );
  const wanted = () => Option.isSome(lab.text());

  // A hand's scroll holds until the view is opened, shut or held anew (`?text=` changes), or taken back.
  const [suspended, setSuspended] = createSignal(false, { ownedWrite: true });
  createEffect(
    () => textText(lab.text()),
    () => {
      setSuspended(false);
    },
  );
  const placing = () => !suspended();
  const following = () => Option.exists(lab.text(), (o) => o._tag === 'Follow') && placing();
  const lit = createMemo(() => wordAt(sections(), meta.film.placed, lab.T()), {
    equals: (a, b) =>
      Option.getOrElse(
        Option.zipWith(a, b, (x, y) => x.section === y.section && x.index === y.index),
        () => Option.isNone(a) && Option.isNone(b),
      ),
  });
  // The word the view is held on: in the words selected's section when it has it, else the first that does.
  const held = createMemo(() =>
    Option.flatMap(
      Option.filter(lab.text(), (o): o is Extract<TextOpen, { _tag: 'Word' }> => o._tag === 'Word'),
      ({ word }) => {
        const has = (s: SectionRows) => s.rows.some((r) => r.index === word);
        const preferred = sections().filter((s) =>
          Option.exists(lab.words(), (w) => w.scene === s.id),
        );
        return Option.map(
          Option.orElse(Option.fromUndefinedOr(preferred.find(has)), () =>
            Option.fromUndefinedOr(sections().find(has)),
          ),
          (s): WordAt => ({ section: s.id, index: word }),
        );
      },
    ),
  );
  const picked = createMemo(() =>
    Option.match(lab.words(), {
      onNone: (): ReadonlyArray<Row> => [],
      onSome: (w) => rowsIn(sections(), w.scene, w.from, w.to),
    }),
  );

  const keptShow = useAtomValue(() => keptCuts);
  const keepShow = useAtomSet(() => keptCuts);
  const cuts = () => Option.contains(keptShow(), 'on');

  // The guard against a second write is the call's, not a signal's: a signal written now reads back only once the
  // page flushes, so two writes in one tick would both go out.
  let inFlight = false;
  const [writing, setWriting] = createSignal(false, { ownedWrite: true });
  const landed = (exit: Exit.Exit<LabWrite, unknown>) => {
    inFlight = false;
    setWriting(false);
    // Landed or refused, `#t=` moves with the frame again, as the editor's writes leave it: the rebuild a
    // write of `talk.ts` causes reloads the page on the address bar's frame.
    Effect.runSync(meta.stage.settle);
    Exit.match(exit, {
      onSuccess: (w) => {
        meta.hub.announce(
          said(
            `${w.target} in ${w.file}`,
            Option.map(Option.fromUndefinedOr(w.change), (change) => ({
              command: 'edit.undo',
              bound: { film: meta.name, change },
            })),
          ),
          TALK_SLOT,
        );
        // The talk as it now cuts, at once: the reload the write causes reads it again with its new mix.
        retrying();
      },
      onFailure: (cause) => {
        // Nothing was written: no reload follows.
        meta.hub.announce(refused(reasonOf(cause)), TALK_SLOT);
      },
    });
  };
  const write = (ask: TalkAsk) => {
    if (inFlight) {
      meta.hub.announce(refused('not written: a write is still out; ask once it lands'), TALK_SLOT);
      return;
    }
    inFlight = true;
    setWriting(true);
    meta.hub.announce(busy(DOING[ask._tag]), TALK_SLOT);
    // The write reloads the page (`talk.ts` is the page's code): it lands on this frame.
    Effect.runSync(meta.stage.holdT);
    void sent(ask).then(landed);
  };
  const asked = (): Option.Option<WordsAsked> =>
    Option.map(lab.words(), (w) => ({ section: w.scene, from: w.from, to: w.to }));
  const canCut = () => picked().some((r) => !r.struck);
  const canRestore = () => picked().some((r) => r.struck);

  onCleanup(
    meta.hub.commands.register(
      ...transcriptCommands({
        talk: () => readsFootage(meta.film),
        open: () => Option.isSome(lab.text()),
        show: () => actions.showText(Option.some(FOLLOW_TEXT)),
        hide: actions.dismissText,
      }),
    ),
  );

  const value: TranscriptContextValue = {
    file: () => Option.map(talk(), (t) => t.file),
    sections,
    state,
    retry: () => retrying(),
    open: lab.text,
    held,
    lit,
    picked,
    selected: lab.words,
    placing,
    following,
    suspend: () => setSuspended(true),
    resume: () => setSuspended(false),
    cuts,
    showCuts: (on) => keepShow(Bool.match(on, { onTrue: () => 'on', onFalse: () => 'off' })),
    writing,
    tap: (section, row, extend) => {
      // A word the cut plays is shown where it starts; a struck one is only selected.
      Option.map(row.start, (start) => meta.player.seek(start));
      const from = Option.getOrElse(
        Option.map(
          Option.filter(lab.words(), (w) => extend && w.scene === section),
          (w) => w.from,
        ),
        () => row.index,
      );
      actions.selectWords(
        Option.some(
          Selection.cases.Words.make({
            scene: section,
            from: Math.min(from, row.index),
            to: Math.max(from, row.index),
          }),
        ),
      );
    },
    selectRange: (section, from, to) => {
      if (Option.exists(lab.words(), (w) => w.scene === section && w.from === from && w.to === to))
        return;
      actions.selectWords(Option.some(Selection.cases.Words.make({ scene: section, from, to })));
    },
    cut: () => Option.map(Option.filter(asked(), canCut), (words) => write(TalkAsk.Cut({ words }))),
    restore: () =>
      Option.map(Option.filter(asked(), canRestore), (words) => write(TalkAsk.Restore({ words }))),
    mark: () =>
      Option.map(
        Option.flatMap(asked(), (w) =>
          Option.map(Option.fromUndefinedOr(picked().find((r) => !r.struck)), (row) => ({
            w,
            row,
          })),
        ),
        ({ w, row }) => {
          const marks = Option.getOrElse(
            Option.map(
              Option.fromUndefinedOr(sections().find((s) => s.id === w.section)),
              (s) => s.marks,
            ),
            () => ({}),
          );
          write(
            TalkAsk.Mark({
              section: w.section,
              word: row.index,
              name: markName(row.text, row.index, marks),
            }),
          );
        },
      ),
    canCut,
    canRestore,
  };
  return (
    <TranscriptContext value={value}>
      <Show when={wanted()}>
        <Reader
          read={read}
          into={setState}
          offer={(retry) => {
            retrying = retry;
          }}
        />
      </Show>
      {props.children}
    </TranscriptContext>
  );
};
