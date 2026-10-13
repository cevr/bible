// The Script page's provider: the film's beats in play order, each as the
// staged film plays it (where it starts, its line's words laid out as the
// Transcript lays a talk's, `transcript/lit.ts`, whether its line is timed
// by the estimate, and its cues tied to its words, `ties.ts`) beside what
// its script says of it (`GET …/script`, read as the page stands: the
// picture's brief and the beat's sources); the word playing at the frame
// shown and the beat under it; what is selected in the path's beat, one
// thing at a time (`?words=`, `?mark=` or `?cue=`; a note, `?note=`, lets
// them go), the cues tied to it, the words a mark or a cue selected lands
// on, and the words selected as a note on them carries them; and Follow (the lab's one
// rule, `lab/follow.ts`: the reader keeps the word playing in sight until a
// hand scrolls it, and Follow or Play takes it back). It writes nothing of
// the film's: a word, a mark or a cue picked seeks the player to where it
// is and selects it. The reader (`view.tsx`, `tied.tsx`) and the commands
// (`commands.ts`) read this context; none holds the script of its own.

import { useAtomRefresh, useAtomValue } from '@bible/atom-solid';
import { Array as Arr, Data, Option, Record as Rec } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { Accessor, ParentProps } from 'solid-js';
import { createContext, createMemo, createSignal, onCleanup, useContext } from 'solid-js';
import {
  type MarkSelection,
  Selection,
  type WordsSelection,
  cueOf,
  markOf,
} from '../../command/selection.ts';
import type { ScriptBeat } from '../../core/api.ts';
import type { NoteWords } from '../../core/schema.ts';
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
import { type Tie, tiesOf, tiesOfCue, tiesOfMark, tiesOfWords } from './ties.ts';

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
  /** Its cues, each tied to the words its start and end land on, in play order. */
  readonly ties: ReadonlyArray<Tie>;
}

/** What the selection in a beat ties to: what it is, as the reader names it, the cues tied to it, and the cue selected among them. */
interface Tied {
  readonly beat: string;
  /**
   * The selection in its beat, one to each thing selected whatever it reads: `cue:lift`, `mark:grace`,
   * `words:3-4`. Two runs of the same words are two selections; what opens under each is a box of its own.
   */
  readonly id: string;
  /** The selection, named: `{grace}`, `“By grace”`, `cue lift`. */
  readonly what: string;
  readonly ties: ReadonlyArray<Tie>;
  readonly cue: Option.Option<string>;
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
  /** The words selected as a note on them carries them: their beat, their first and last word, and what they read. */
  readonly words: Accessor<Option.Option<NoteWords>>;
  /** The mark selected, as the URL holds it. */
  readonly mark: Accessor<Option.Option<MarkSelection>>;
  /** What the selection ties to, in the beat it is in: none while nothing of a beat's line is selected. */
  readonly tied: Accessor<Option.Option<Tied>>;
  /** The words a mark or a cue selected lands on, as the lines have them. */
  readonly read: Accessor<ReadonlyArray<Row>>;
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
  /** Show mark `name` of beat `beat`: seek to where it is, and select it. */
  readonly selectMark: (beat: string, name: string) => void;
  /** Show cue `name` of beat `beat`: seek to where it starts, and select it. */
  readonly selectCue: (beat: string, name: string) => void;
  /** Select nothing of the beats' lines. */
  readonly clear: () => void;
}

const ScriptContext = createContext<ScriptContextValue>();

/** The Script's context: only inside `<Script.Provider>`. */
export const useScript = (): ScriptContextValue => useContext(ScriptContext);

export const Provider = (props: ParentProps) => {
  const { state: lab, actions, meta } = useLab();
  const placed = meta.film.placed;
  // The film on the stage is the page's for its life (a write reloads it): laid out once.
  const lines = lineRows(placed);
  const beats = placed.map((p): BeatRow => {
    const line = Arr.findFirst(lines, (l) => l.id === p.spec.id);
    return {
      id: p.spec.id,
      start: p.start,
      line,
      estimated: p.voice.duration > 0 && !p.voice.recorded,
      ties: tiesOf(p, line),
    };
  });
  const beatOf = (id: string) => Arr.findFirst(beats, (b) => b.id === id);
  const tiesIn = (id: string): ReadonlyArray<Tie> =>
    Option.getOrElse(
      Option.map(beatOf(id), (b) => b.ties),
      () => [],
    );
  /** The rows of beat `id`'s line at word indices `at`. */
  const rowsAt = (id: string, at: ReadonlyArray<number>): ReadonlyArray<Row> =>
    Option.getOrElse(
      Option.map(
        Option.flatMap(beatOf(id), (b) => b.line),
        (l) => l.rows.filter((r) => at.includes(r.index)),
      ),
      () => [],
    );
  /** Show film second `t` when there is one: a mark or a cue picked is shown where it is. */
  const seekTo = (t: Option.Option<number>) => Option.map(t, (at) => meta.player.seek(at));
  const placedOf = (id: string) => Arr.findFirst(placed, (p) => p.spec.id === id);

  // Read through the page's one client, on the shell's runtime, as the page stands.
  const reading = meta.runtime.atom(LabApi.use((api) => api.scriptBeats));
  const result = useAtomValue(() => reading);
  const retry = useAtomRefresh(() => reading);
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
  const words = createMemo(() =>
    Option.flatMap(lab.words(), (w) =>
      Option.zipWith(Arr.head(picked()), Arr.last(picked()), (first, last): NoteWords => ({
        beat: w.scene,
        from: first.index,
        to: last.index,
        text: picked()
          .map((r) => r.text)
          .join(' '),
      })),
    ),
  );
  // The Script's selection is one thing: words, a mark, or a cue (of the Lab's selection, only a cue reaches it).
  const cue = lab.selection;
  const tied = createMemo((): Option.Option<Tied> =>
    Option.firstSomeOf<Tied>([
      Option.map(cue(), (c) => ({
        beat: c.scene,
        id: `cue:${c.name}`,
        what: `cue ${c.name}`,
        ties: tiesOfCue(tiesIn(c.scene), c.name),
        cue: Option.some(c.name),
      })),
      Option.map(lab.mark(), (m) => ({
        beat: m.scene,
        id: `mark:${m.name}`,
        what: `{${m.name}}`,
        ties: tiesOfMark(tiesIn(m.scene), m.name),
        cue: Option.none(),
      })),
      Option.map(lab.words(), (w) => ({
        beat: w.scene,
        id: `words:${w.from}-${w.to}`,
        what: `“${picked()
          .map((r) => r.text)
          .join(' ')}”`,
        ties: tiesOfWords(tiesIn(w.scene), w.from, w.to),
        cue: Option.none(),
      })),
    ]),
  );
  // A cue lights the words its start and end land on; a mark, the word it stands before.
  const read = createMemo((): ReadonlyArray<Row> =>
    Option.getOrElse(
      Option.firstSomeOf([
        Option.map(cue(), (c) =>
          rowsAt(
            c.scene,
            Option.getOrElse(
              Option.map(
                Arr.findFirst(tiesIn(c.scene), (t) => t.cue === c.name),
                (t) => t.words,
              ),
              () => [],
            ),
          ),
        ),
        Option.map(lab.mark(), (m) =>
          rowsAt(
            m.scene,
            Option.toArray(
              Option.flatMap(
                Option.flatMap(beatOf(m.scene), (b) => b.line),
                (l) => Rec.get(l.marks, m.name),
              ),
            ),
          ),
        ),
      ]),
      () => [],
    ),
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
    words,
    mark: lab.mark,
    tied,
    read,
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
    selectMark: (beat, name) => {
      // Where the mark is: the beat's start, its voice's, then the mark's in the take or the estimate.
      seekTo(
        Option.flatMap(placedOf(beat), (p) =>
          Option.map(
            Option.fromUndefinedOr(p.voice.marks.get(name)),
            (at) => p.start + p.speechStart + at,
          ),
        ),
      );
      actions.selectMark(Option.some(markOf(beat, name)));
    },
    selectCue: (beat, name) => {
      seekTo(
        Option.flatMap(placedOf(beat), (p) =>
          Option.map(Option.fromUndefinedOr(p.cues.get(name)), (c) => p.start + c.start),
        ),
      );
      actions.select(Option.some(cueOf(beat, name)));
    },
    // On the Script one pick lets the others go (`lab/place.ts`): picking no words picks nothing.
    clear: () => actions.selectWords(Option.none()),
  };
  return <ScriptContext value={value}>{props.children}</ScriptContext>;
};
