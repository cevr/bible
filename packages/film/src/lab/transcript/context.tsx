// The Transcript view's provider: the talk's words as the server reads its
// `talk.ts` and cuts it now (`GET …/talk`, read while the view is open and
// not before: a lab at rest reads none of it), laid out for the film on the
// stage (`lit.ts`); the word playing at the frame shown; the words selected
// (`?words=`); "Show cuts" (`?cuts=1`); Follow (the lab's one rule,
// `lab/follow.ts`, suspended by a hand's scroll); and the view's writes, Cut,
// Restore and Mark here. A write of `talk.ts` is a write of the film's
// source, so the editor's one machine sends it (`useEditor().actions.talk`):
// one write out at a time, `#t=` and the page's reloads held until it is
// answered (the server rebuilds the page on a write of `talk.ts`, and the
// page reads the talk again and plays its new mix), its receipt in the
// editor's slot among the page's receipts: what it wrote with the Undo that
// steps the change it made, judged against the changes this page made, or
// the server's refusal in its words, with nothing written. The view and the
// commands (`commands.ts`) read this context; none holds the talk of its own.

import { useAtomRefresh, useAtomValue } from '@bible/atom-solid';
import { Boolean as Bool, Data, Option } from 'effect';
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
import { Selection, type WordsSelection } from '../../command/selection.ts';
import type { TalkWords } from '../../core/api.ts';
import { LabApi, type LabFailure, reasonOf } from '../api.ts';
import { useEditor } from '../editor/context.tsx';
import { useLab } from '../shell.tsx';
import { extendedTo, transcriptCommands } from './commands.ts';
import {
  type Row,
  type SectionRows,
  type WordAt,
  markName,
  rowsIn,
  rowsOf,
  sameWord,
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

/** What the view reads while it is shut: nothing, so the talk is not read. */
const unread = Atom.make(AsyncResult.initial<TalkWords, LabFailure>());

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
  /** Whether a write of the film's source is out (the editor's): the view's writes wait for its answer. */
  readonly writing: Accessor<boolean>;
  /** Show word `row` of `section`: seek to where it starts (a word the cut plays), and select it, or the words from the selection's first to it (`extend`). */
  readonly tap: (section: string, row: Row, extend: boolean) => void;
  /** Select words `from`–`to` of `section` (a text selection in the view). */
  readonly selectRange: (section: string, from: number, to: number) => void;
}

const TranscriptContext = createContext<TranscriptContextValue>();

/** The Transcript view's context: only inside `<Transcript.Provider>`. */
export const useTranscript = (): TranscriptContextValue => useContext(TranscriptContext);

export const Provider = (props: ParentProps) => {
  const { state: lab, actions, meta } = useLab();
  const editor = useEditor();
  const wanted = () => Option.isSome(lab.text());
  // Read through the page's one client, on the shell's runtime, while the view is open; shut, it reads nothing.
  const read = meta.runtime.atom(LabApi.use((api) => api.talkWords));
  const reading = () => Bool.match(wanted(), { onTrue: () => read, onFalse: () => unread });
  const result = useAtomValue(reading);
  const retry = useAtomRefresh(reading);

  const state = createMemo((): TalkState =>
    Bool.match(wanted(), {
      onFalse: () => TalkState.Idle(),
      onTrue: () =>
        AsyncResult.match(result(), {
          onInitial: () => TalkState.Reading(),
          onFailure: (f) => TalkState.Refused({ reason: reasonOf(f.cause) }),
          onSuccess: (s) => TalkState.Read({ talk: s.value }),
        }),
    }),
  );
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
    equals: sameWord,
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
  const rows = (w: WordsSelection) => rowsIn(sections(), w.scene, w.from, w.to);
  const picked = createMemo(() =>
    Option.match(lab.words(), { onNone: (): ReadonlyArray<Row> => [], onSome: rows }),
  );

  const select = (words: WordsSelection) => actions.selectWords(Option.some(words));
  const words = (w: WordsSelection) => ({ section: w.scene, from: w.from, to: w.to });
  onCleanup(
    meta.hub.commands.register(
      ...transcriptCommands({
        talk: () => readsFootage(meta.film),
        open: wanted,
        show: () => actions.showText(Option.some(FOLLOW_TEXT)),
        hide: actions.dismissText,
        selection: lab.words,
        rows,
        writing: editor.state.writing,
        select,
        cut: (w) => editor.actions.talk({ _tag: 'Cut', ...words(w) }),
        restore: (w) => editor.actions.talk({ _tag: 'Restore', ...words(w) }),
        mark: (w) =>
          Option.map(Option.fromUndefinedOr(rows(w).find((r) => !r.struck)), (row) =>
            editor.actions.talk({
              _tag: 'Mark',
              section: w.scene,
              word: row.index,
              name: markName(
                row.text,
                row.index,
                Option.getOrElse(
                  Option.map(
                    Option.fromUndefinedOr(sections().find((s) => s.id === w.scene)),
                    (s) => s.marks,
                  ),
                  () => ({}),
                ),
              ),
            }),
          ),
      }),
    ),
  );

  const value: TranscriptContextValue = {
    file: () => Option.map(talk(), (t) => t.file),
    sections,
    state,
    retry,
    open: lab.text,
    held,
    lit,
    picked,
    selected: lab.words,
    placing,
    following,
    suspend: () => setSuspended(true),
    resume: () => setSuspended(false),
    cuts: lab.cuts,
    showCuts: actions.showCuts,
    writing: editor.state.writing,
    tap: (section, row, extend) => {
      // A word the cut plays is shown where it starts; a struck one is only selected.
      Option.map(row.start, (start) => meta.player.seek(start));
      select(
        extendedTo(
          Option.filter(lab.words(), () => extend),
          section,
          row.index,
        ),
      );
    },
    selectRange: (section, from, to) => {
      if (Option.exists(lab.words(), (w) => w.scene === section && w.from === from && w.to === to))
        return;
      select(Selection.cases.Words.make({ scene: section, from, to }));
    },
  };
  return <TranscriptContext value={value}>{props.children}</TranscriptContext>;
};
