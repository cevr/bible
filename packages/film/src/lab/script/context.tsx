// The Script page's provider: the film's beats in play order, each as the
// staged film plays it (where it starts, its line's words laid out as the
// Transcript lays a talk's, `transcript/lit.ts`, and whether its line is
// timed by the estimate) beside what its script says of it (`GET …/script`,
// read as the page stands: the picture's brief and the beat's sources); the
// word playing at the frame shown and the beat under it; the words selected
// (`?words=` in the path's beat); and Follow (the lab's one rule,
// `lab/follow.ts`: the reader keeps the word playing in sight until a hand
// scrolls it, and Follow or Play takes it back). It writes nothing of the
// film's: a word tapped seeks the player to it and selects it. The reader
// (`view.tsx`) and the commands (`commands.ts`) read this context; none
// holds the script of its own.

import { useAtomRefresh, useAtomValue } from '@bible/atom-solid';
import { Array as Arr, Data, Option, Record as Rec } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createMemo, createSignal, onCleanup, useContext } from 'solid-js';
import { Selection, type WordsSelection } from '../../command/selection.ts';
import type { ScriptBeat } from '../../core/api.ts';
import { LabApi, reasonOf } from '../api.ts';
import { useLab } from '../shell.tsx';
import { extendedTo } from '../transcript/commands.ts';
import {
  type Row,
  type SectionRows,
  type WordAt,
  lineRows,
  rowsIn,
  sameWord,
  wordAt,
} from '../transcript/lit.ts';
import { scriptCommands } from './commands.ts';

/** The script as the page knows it: being read, read (each beat as `script.ts` says it), or refused with the server's words. */
export type ScriptState = Data.TaggedEnum<{
  Reading: {};
  Read: { readonly beats: Readonly<Record<string, ScriptBeat>> };
  Refused: { readonly reason: string };
}>;
export const ScriptState = Data.taggedEnum<ScriptState>();

/** A beat as the Script shows it: as the staged film plays it. */
export interface BeatRow {
  readonly id: string;
  /** Where it starts, on the film's clock. */
  readonly start: number;
  /** Its line's words, as the Script lays them out: none for a beat that says nothing. */
  readonly line: Option.Option<SectionRows>;
  /** Whether its line is timed by the estimate: no take voices it as it reads now. */
  readonly estimated: boolean;
}

interface ScriptContextValue {
  /** The film's beats in play order. */
  readonly beats: ReadonlyArray<BeatRow>;
  /** Where the script's read stands: reading, read, or refused. */
  readonly state: Accessor<ScriptState>;
  /** Ask the server for the script again after a refusal. */
  readonly retry: () => void;
  /** What the script says of beat `id`: none until it is read, or for a beat it does not have. */
  readonly said: (id: string) => Option.Option<ScriptBeat>;
  /** The beats' lines, as the highlights paint them. */
  readonly lines: ReadonlyArray<SectionRows>;
  /** The word playing at the frame shown, or the last said before it in its beat. */
  readonly lit: Accessor<Option.Option<WordAt>>;
  /** The beat under the frame shown. */
  readonly live: Accessor<string>;
  /** The words selected, as the lines have them: none for words they do not have. */
  readonly picked: Accessor<ReadonlyArray<Row>>;
  /** The words selected, as the URL holds them. */
  readonly selected: Accessor<Option.Option<WordsSelection>>;
  /** Whether the reader keeps the frame's word in sight: no hand has scrolled it since it was last taken back. */
  readonly following: Accessor<boolean>;
  /** A hand scrolled the reader: it stops placing until `resume`. */
  readonly suspend: () => void;
  /** Place the reader again (Follow, Play). */
  readonly resume: () => void;
  /** Show beat `id`: seek to its first frame. */
  readonly seekBeat: (id: string) => void;
  /** Show word `row` of beat `section`: seek to where it starts, and select it, or the words from the selection's first to it (`extend`). */
  readonly tap: (section: string, row: Row, extend: boolean) => void;
  /** Select words `from`–`to` of beat `section` (a text selection in the reader). */
  readonly selectRange: (section: string, from: number, to: number) => void;
}

const ScriptContext = createContext<ScriptContextValue>();

/** The Script's context: only inside `<Script.Provider>`. */
export const useScript = (): ScriptContextValue => useContext(ScriptContext);

export const Provider = (props: ParentProps) => {
  const { state: lab, actions, meta } = useLab();
  const placed = meta.film.placed;
  // The film on the stage is the page's for its life (a write reloads it): laid out once.
  const lines = lineRows(placed);
  const beats = placed.map((p): BeatRow => ({
    id: p.spec.id,
    start: p.start,
    line: Arr.findFirst(lines, (l) => l.id === p.spec.id),
    estimated: p.voice.duration > 0 && !p.voice.recorded,
  }));

  // Read through the page's one client, on the shell's runtime, as the page stands.
  const read = meta.runtime.atom(LabApi.use((api) => api.scriptBeats));
  const result = useAtomValue(() => read);
  const retry = useAtomRefresh(() => read);
  const state = createMemo((): ScriptState =>
    AsyncResult.match(result(), {
      onInitial: () => ScriptState.Reading(),
      onFailure: (f) => ScriptState.Refused({ reason: reasonOf(f.cause) }),
      onSuccess: (s) =>
        ScriptState.Read({
          beats: Object.fromEntries(s.value.beats.map((b) => [b.id, b])),
        }),
    }),
  );
  const said = (id: string) =>
    ScriptState.$match(state(), {
      Reading: () => Option.none<ScriptBeat>(),
      Read: (s) => Rec.get(s.beats, id),
      Refused: () => Option.none<ScriptBeat>(),
    });

  const lit = createMemo(() => wordAt(lines, placed, lab.T()), { equals: sameWord });
  const picked = createMemo(() =>
    Option.match(lab.words(), {
      onNone: (): ReadonlyArray<Row> => [],
      onSome: (w) => rowsIn(lines, w.scene, w.from, w.to),
    }),
  );
  // A hand's scroll holds until Follow or Play takes the reader back.
  const [suspended, setSuspended] = createSignal(false, { ownedWrite: true });

  const select = (words: WordsSelection) => actions.selectWords(Option.some(words));
  onCleanup(meta.hub.commands.register(...scriptCommands({ selection: lab.words, select })));

  const value: ScriptContextValue = {
    beats,
    state,
    retry,
    said,
    lines,
    lit,
    live: lab.scene,
    picked,
    selected: lab.words,
    following: () => !suspended(),
    suspend: () => setSuspended(true),
    resume: () => setSuspended(false),
    seekBeat: (id) =>
      Option.map(
        Arr.findFirst(beats, (b) => b.id === id),
        (b) => meta.player.seek(b.start),
      ),
    tap: (section, row, extend) => {
      // A word the beat voices is shown where it starts.
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
  return <ScriptContext value={value}>{props.children}</ScriptContext>;
};
