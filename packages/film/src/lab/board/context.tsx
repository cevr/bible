// The Board's provider: the film's storyboard as its record stands (`GET
// …/board`, read as the page stands, again after each write), laid on the
// staged film's narration clock (`animatic.ts`: each panel held from its
// mark); the panel the URL picks (`?panel=&try=&view=` in the path's beat,
// `lab/place.ts`) with the try shown in it; the sketch being drawn over it
// (`sketch/gesture.ts`, one machine); the images, loaded once each; and the
// panel's requests as one lifecycle (`Asked`: idle, sending, done, failed),
// so a pick, an approval, a comment and a tweak each say where they stand
// and none is sent twice. The picture (`picture.tsx`), the column
// (`view.tsx`) and the toolbar read this context; none holds the board of
// its own. Writes go through the lab's routes: a try kept (`board/pick`), a
// beat approved or withdrawn, and a note posted through the notes' own
// route with the panel on it (`note.ts`).

import { useAtomRefresh, useAtomSet, useAtomValue } from '@bible/atom-solid';
import * as UrlAtom from '@bible/url-state/atom';
import {
  Array as Arr,
  Data,
  Effect,
  Equal,
  Match,
  Option,
  Predicate,
  Result,
  Schema,
} from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  untrack,
  useContext,
} from 'solid-js';
import { type BoardView, type ScriptBeat, boardFileUrl } from '../../core/api.ts';
import {
  type BoardFile,
  type BoardName,
  type BoardTry,
  type Panel,
  boardNamed,
  panelById,
  shownTry,
  tryOf,
} from '../../core/board.ts';
import type { Placed } from '../../core/layout.ts';
import { parse } from '../../core/narration.ts';
import type { Note } from '../../core/schema.ts';
import { addressOn } from '../../browser/host.ts';
import { LabApi, NotesApi, reasonOf } from '../api.ts';
import { useNotesFeed } from '../notes/list.tsx';
import { type BoardPick, NO_BOARD_PICK, labHrefWith, labPlaceOf } from '../place.ts';
import { useLab } from '../shell.tsx';
import { type SketchEvent, type SketchState, sketchOf, step } from '../sketch/gesture.ts';
import { type Shot, type TimedBeat, panelTime, shotAt, shotsOf } from './animatic.ts';
import { type PanelAsking, panelNoteOf } from './note.ts';
import { StillUnmade, stillOf } from './still.ts';
import { Sketch } from '../sketch/surface.tsx';

/** A request the Board cannot make as it stands: no panel picked, or a note with nothing to say. */
class BoardAskUnfit extends Schema.TaggedError<BoardAskUnfit>()('BoardAskUnfit', {
  message: Schema.String,
}) {}

/** The board as the page knows it: being read, read, or refused with the server's words. */
export type BoardRead = Data.TaggedEnum<{
  Reading: {};
  Read: { readonly board: BoardFile };
  Refused: { readonly reason: string };
}>;
export const BoardRead = Data.taggedEnum<BoardRead>();

/** Where the panel's last request stands: none yet, on its way, landed (a note's id with it), or refused. */
export type Asked = Data.TaggedEnum<{
  Idle: {};
  Sending: { readonly what: string };
  Done: {
    readonly what: string;
    readonly note: Option.Option<{ readonly id: string; readonly asking: PanelAsking }>;
  };
  Failed: { readonly what: string; readonly reason: string };
}>;
export const Asked = Data.taggedEnum<Asked>();

/** A word of a beat's line as the column sets it: the marks said before it, then the word. */
interface LineWord {
  readonly marks: ReadonlyArray<string>;
  readonly text: string;
}

/** A beat as the Board shows it: as the staged film plays it, beside what its script says of its picture. */
export interface BoardBeat extends TimedBeat {
  readonly placed: Placed;
  /** Its line's words, each after the marks said before it: none for a beat that says nothing. */
  readonly line: ReadonlyArray<LineWord>;
}

/** The panel the URL picks, as the Board shows it. */
export interface PickedPanel {
  readonly beat: BoardBeat;
  readonly panel: Panel;
  /** Film seconds its mark is said at. */
  readonly at: number;
  /** The try shown: the one the link names, else the kept one, else the first. None on a card or a verse. */
  readonly tried: Option.Option<BoardTry>;
}

/** One write a panel asks of the lab. */
type BoardWrite = Data.TaggedEnum<{
  Keep: { readonly panel: string; readonly tried: number; readonly why: Option.Option<string> };
  Approve: { readonly beat: BoardName };
  Withdraw: { readonly beat: BoardName };
  Post: {
    readonly asking: PanelAsking;
    readonly text: string;
    readonly items: SketchState['items'];
  };
}>;
const BoardWrite = Data.taggedEnum<BoardWrite>();

/** Why a note of each asking cannot be posted as it stands. */
const UNFIT: Readonly<Record<PanelAsking, string>> = {
  note: 'write the note, or draw on the panel, first',
  tweak: 'a tweak needs words or a sketch, on a panel with a try',
};

/** What each write is called while it is under way. */
const WHAT: Readonly<Record<BoardWrite['_tag'], string>> = {
  Keep: 'Keeping the try',
  Approve: 'Approving the beat',
  Withdraw: 'Withdrawing the approval',
  Post: 'Posting the note',
};

/** What a write that landed did, said once it has. */
const DONE: Readonly<Record<BoardWrite['_tag'], string>> = {
  Keep: 'Kept',
  Approve: 'Approved',
  Withdraw: 'Approval withdrawn',
  Post: 'Posted',
};

interface BoardContextValue {
  readonly state: {
    readonly read: Accessor<BoardRead>;
    /** The film's beats in play order. */
    readonly beats: ReadonlyArray<BoardBeat>;
    /** What the script says of beat `id`'s picture: none until it is read. */
    readonly brief: (id: string) => Option.Option<string>;
    /** The animatic's shots, on the board as it stands. */
    readonly shots: Accessor<ReadonlyArray<Shot>>;
    /** The shot under the frame shown. */
    readonly shot: Accessor<Option.Option<Shot>>;
    /** The panel the URL picks. */
    readonly picked: Accessor<Option.Option<PickedPanel>>;
    readonly view: Accessor<BoardView>;
    /** The sketch over the picked panel. */
    readonly sketch: Accessor<SketchState>;
    readonly asked: Accessor<Asked>;
    /** The note being written on the picked panel: kept until its post lands. */
    readonly draft: Accessor<string>;
    /** The notes on panel `id`, oldest first. */
    readonly notesOf: (id: string) => ReadonlyArray<Note>;
  };
  readonly actions: {
    /** Read the board again after a refusal. */
    readonly retry: () => void;
    /** Pick panel `panel` of `beat` (none: let the panel go), showing try `tried` (none: its kept one). */
    readonly pick: (
      beat: string,
      panel: Option.Option<string>,
      tried?: Option.Option<number>,
    ) => void;
    /** Show the picked panel by `view`. */
    readonly show: (view: BoardView) => void;
    /** Show beat `id`'s first frame. */
    readonly seekBeat: (id: string) => void;
    /** Keep try `tried` of the picked panel, saying why. */
    readonly keep: (tried: number, why: string) => void;
    readonly approve: (beat: string) => void;
    readonly withdraw: (beat: string) => void;
    /** Write the note on the picked panel. */
    readonly write: (text: string) => void;
    /** Post the draft as a comment on the picked panel, or as a tweak asked of it, the sketch riding along. */
    readonly post: (asking: PanelAsking) => void;
    /** One event for the sketch surface, shown at `view` (its size on screen). */
    readonly sketch: (event: SketchEvent, view: { readonly w: number; readonly h: number }) => void;
  };
  readonly meta: {
    readonly name: string;
    /** The URL of an image of the board. */
    readonly url: (file: string) => string;
    /** The image of `file`, loaded once: none until it has loaded. */
    readonly image: (file: string) => Option.Option<HTMLImageElement>;
    /** Counts the images loaded: a painter that waits on one reads it. */
    readonly loaded: Accessor<number>;
  };
}

const BoardContext = createContext<BoardContextValue>();

/** The Board's context: only inside `<Board.Provider>`. */
export const useBoard = (): BoardContextValue => useContext(BoardContext);

/** Beat `p`'s line's words, each after the marks said before it. */
const lineOf = (p: Placed): ReadonlyArray<LineWord> =>
  Result.match(parse(p.spec.id, p.spec.say ?? ''), {
    onFailure: () => [],
    onSuccess: (parsed) => {
      const words = parsed.spoken.split(/\s+/).filter((w) => w.length > 0);
      const at = [...parsed.marks];
      return words.map((text, i) => ({
        marks: at.filter(([, index]) => index === i).map(([name]) => name),
        text,
      }));
    },
  });

export const Provider = (props: ParentProps) => {
  const { state: lab, meta: labMeta } = useLab();
  const { name, player, host, runtime } = labMeta;
  const placed = labMeta.film.placed;
  const feed = useNotesFeed();
  const address = addressOn(host);

  // The film on the stage is the page's for its life: its beats are timed once.
  const beats = placed.map((p): BoardBeat => ({
    id: p.spec.id,
    start: p.start,
    end: p.start + p.dur,
    markAt: (mark) =>
      Option.map(
        Option.fromUndefinedOr(p.voice.marks.get(mark)),
        (t) => p.start + p.speechStart + t,
      ),
    placed: p,
    line: lineOf(p),
  }));
  const beatOf = (id: string) => Arr.findFirst(beats, (b) => b.id === id);

  const reading = runtime.atom(LabApi.use((api) => api.board));
  const result = useAtomValue(() => reading);
  const retry = useAtomRefresh(() => reading);
  // A change on a panel's note is most often an agent's answer (a tweak's new tries): the board is read again.
  const answered = createMemo(() =>
    feed
      .notes()
      .filter((n) => Predicate.isNotUndefined(n.panel))
      .map((n) => `${n.id}:${n.changed}`)
      .join(' '),
  );
  let heard = Option.none<string>();
  createEffect(answered, (now) => {
    if (Option.exists(heard, (was) => was !== now)) retry();
    heard = Option.some(now);
  });
  const read = createMemo((): BoardRead =>
    AsyncResult.match(result(), {
      onInitial: () => BoardRead.Reading(),
      onFailure: (f) => BoardRead.Refused({ reason: reasonOf(f.cause) }),
      onSuccess: (s) => BoardRead.Read({ board: s.value }),
    }),
  );
  const board = createMemo((): Option.Option<BoardFile> =>
    BoardRead.$match(read(), {
      Reading: () => Option.none(),
      Read: (r) => Option.some(r.board),
      Refused: () => Option.none(),
    }),
  );
  const briefs = runtime.atom(LabApi.use((api) => api.scriptBeats));
  const briefed = useAtomValue(() => briefs);
  const brief = (id: string): Option.Option<string> =>
    AsyncResult.match(briefed(), {
      onInitial: () => Option.none<string>(),
      onFailure: () => Option.none<string>(),
      onSuccess: (s) =>
        Option.flatMap(
          Arr.findFirst(s.value.beats, (b: ScriptBeat) => b.id === id),
          (b) => Option.fromUndefinedOr(b.picture),
        ),
    });

  const shots = createMemo(() =>
    Option.match(board(), { onNone: () => [], onSome: (b) => shotsOf(beats, b) }),
  );
  const shot = createMemo(() => shotAt(shots(), lab.T()));

  // The Board's pick, as the URL holds it: its own keys and the path's beat.
  const href = useAtomValue(() => UrlAtom.href);
  const pick = createMemo(
    (): BoardPick & { readonly scene: Option.Option<string> } => {
      const at = labPlaceOf(href());
      return { ...at.board, scene: at.scene };
    },
    { equals: Equal.equals },
  );
  const picked = createMemo((): Option.Option<PickedPanel> => {
    const { scene, panel, tried } = pick();
    return Option.flatMap(
      Option.all({ scene, panel, b: board() }),
      ({ scene: beatId, panel: at, b }) =>
        Option.flatMap(beatOf(beatId), (beat) =>
          Option.map(panelById(b, `${beatId}.${at}`), (found): PickedPanel => ({
            beat,
            panel: found,
            at: panelTime(beat, found),
            tried: Option.orElse(
              Option.flatMap(tried, (n) => tryOf(found, n)),
              () => shownTry(found),
            ),
          })),
        ),
    );
  });
  const view = createMemo((): BoardView =>
    Option.match(picked(), { onNone: () => 'animatic', onSome: () => pick().view }),
  );

  // The sketch over the picked panel's try and the note being written on the panel: each kept while its panel (the
  // sketch: its panel and try) stays picked, across a view change or a fresh read of the board, until a post of it
  // lands. A sketch is drawn on one image, so another try starts a fresh one; the words carry to it.
  const [sketch, setSketch] = createSignal<SketchState>(sketchOf(), { ownedWrite: true });
  const [draft, setDraft] = createSignal('', { ownedWrite: true });
  const panelKey = createMemo(() => Option.map(picked(), (p) => p.panel.id), {
    equals: Equal.equals,
  });
  const sketchKey = createMemo(
    () =>
      Option.map(picked(), (p) =>
        Option.match(p.tried, { onNone: () => p.panel.id, onSome: (t) => `${p.panel.id}#${t.n}` }),
      ),
    { equals: Equal.equals },
  );
  createEffect(panelKey, () => {
    setDraft('');
  });
  createEffect(sketchKey, () => {
    setSketch(sketchOf());
  });

  const go = (board: { readonly scene: string } & BoardPick, T: number) =>
    address.go(labHrefWith(name, placed, address.href(), { board }, T));

  // The images, each loaded once; a load counted so the picture paints again.
  const images = new Map<string, HTMLImageElement>();
  const [loaded, setLoaded] = createSignal(0, { ownedWrite: true });
  const url = (file: string) => boardFileUrl(name, file);
  const image = (file: string): Option.Option<HTMLImageElement> =>
    Option.match(Option.fromUndefinedOr(images.get(file)), {
      onSome: (had) => Option.liftPredicate(had, (img) => img.complete && img.naturalWidth > 0),
      onNone: () => {
        const img = new Image();
        img.decoding = 'async';
        img.addEventListener('load', () => setLoaded((n) => n + 1));
        img.src = url(file);
        images.set(file, img);
        return Option.none<HTMLImageElement>();
      },
    });
  /** The image of `file` once it has loaded and decoded, starting its load if none has; refused if it will not load. */
  const loadedImage = (file: string) =>
    Effect.suspend(() => {
      image(file);
      return Effect.fromOption(Option.fromUndefinedOr(images.get(file)));
    }).pipe(
      Effect.flatMap((img) =>
        Effect.as(
          Effect.tryPromise(() => img.decode()),
          img,
        ),
      ),
      Effect.mapError(() => StillUnmade.make({ reason: `the try's image ${file} did not load` })),
    );

  // One write at a time, its answer the board as it stands after (the board read again), or the note it made.
  const [asked, setAsked] = createSignal<Asked>(Asked.Idle(), { ownedWrite: true });
  const write = runtime.fn((w: BoardWrite) =>
    Effect.gen(function* () {
      const made: Option.Option<string> = yield* Match.value(w).pipe(
        Match.tagsExhaustive({
          Keep: (k) =>
            Effect.as(
              LabApi.use((api) => api.boardPick(k.panel, k.tried, k.why)),
              Option.none<string>(),
            ),
          Approve: (a) =>
            Effect.as(
              LabApi.use((api) => api.boardApproval('approve', a.beat)),
              Option.none<string>(),
            ),
          Withdraw: (a) =>
            Effect.as(
              LabApi.use((api) => api.boardApproval('withdraw', a.beat)),
              Option.none<string>(),
            ),
          Post: (p) => postNote(p.asking, p.text, p.items),
        }),
      );
      return made;
    }).pipe(
      Effect.tap((made) =>
        Effect.sync(() => {
          setAsked(
            Asked.Done({
              what: DONE[w._tag],
              note: Option.map(made, (id) => ({
                id,
                asking: BoardWrite.$match(w, {
                  Post: (p): PanelAsking => p.asking,
                  Keep: (): PanelAsking => 'note',
                  Approve: (): PanelAsking => 'note',
                  Withdraw: (): PanelAsking => 'note',
                }),
              })),
            }),
          );
          retry();
          // A post clears what it sent, never what was written or drawn while it was on its way.
          if (w._tag === 'Post') {
            feed.refresh();
            if (untrack(sketch).items === w.items) setSketch(sketchOf());
            if (untrack(draft) === w.text) setDraft('');
          }
        }),
      ),
      Effect.tapError((e) =>
        Effect.sync(() => setAsked(Asked.Failed({ what: WHAT[w._tag], reason: e.message }))),
      ),
    ),
  );
  const send = useAtomSet(() => write);
  const ask = (w: BoardWrite) => {
    if (untrack(asked)._tag === 'Sending') return;
    setAsked(Asked.Sending({ what: WHAT[w._tag] }));
    send(w);
  };

  /** Post a note on the picked panel: the draft (`note.ts`) and its still (the panel with the sketch on it). */
  const postNote = (asking: PanelAsking, text: string, items: SketchState['items']) =>
    Effect.gen(function* () {
      const p = yield* Effect.fromOption(untrack(picked)).pipe(
        Effect.mapError(() => BoardAskUnfit.make({ message: 'pick a panel first' })),
      );
      const draft = yield* Effect.fromOption(
        panelNoteOf({
          panel: p.panel,
          tried: Option.map(p.tried, (t) => t.n),
          asking,
          text,
          sketch: items,
          at: p.at,
          beatStart: p.beat.start,
          fps: labMeta.film.fps,
        }),
      ).pipe(Effect.mapError(() => BoardAskUnfit.make({ message: UNFIT[asking] })));
      const still = yield* panelStill(p, items);
      const note = yield* NotesApi.use((api) => api.add({ ...draft, still }));
      return Option.some(note.id);
    });

  /** The panel shown with `items` drawn on it, as a PNG's bytes: the note's still. */
  const panelStill = (p: PickedPanel, items: SketchState['items']) =>
    Effect.suspend(() => stillOf(labMeta.film, p, items, loadedImage, lab.T()));

  const value: BoardContextValue = {
    state: {
      read,
      beats,
      brief,
      shots,
      shot,
      picked,
      view,
      sketch,
      asked,
      draft,
      notesOf: (id) => feed.notes().filter((n) => n.panel?.id === id),
    },
    actions: {
      retry,
      pick: (beat, panel, tried = Option.none()) => {
        const T = Option.match(
          Option.flatMap(
            Option.all({ b: beatOf(beat), at: panel, board: board() }),
            ({ b, at, board: bd }) =>
              Option.map(panelById(bd, `${beat}.${at}`), (found) => panelTime(b, found)),
          ),
          { onNone: () => player.now(), onSome: (t) => t },
        );
        go({ scene: beat, ...NO_BOARD_PICK, panel, tried, view: untrack(pick).view }, T);
        player.seek(T);
      },
      show: (v) =>
        Option.map(untrack(picked), (p) => {
          go(
            {
              scene: p.beat.id,
              panel: Option.some(p.panel.at),
              tried: untrack(pick).tried,
              view: v,
            },
            p.at,
          );
          if (v !== 'animatic') {
            player.pause();
            player.seek(p.at);
          }
        }),
      seekBeat: (id) => Option.map(beatOf(id), (b) => player.seek(b.start)),
      keep: (tried, why) =>
        Option.map(untrack(picked), (p) =>
          ask(
            BoardWrite.Keep({
              panel: p.panel.id,
              tried,
              why: Option.liftPredicate(why.trim(), (w) => w !== ''),
            }),
          ),
        ),
      // A beat whose id names no board panel has none to approve.
      approve: (beat) => Option.map(boardNamed(beat), (b) => ask(BoardWrite.Approve({ beat: b }))),
      withdraw: (beat) =>
        Option.map(boardNamed(beat), (b) => ask(BoardWrite.Withdraw({ beat: b }))),
      write: setDraft,
      post: (asking) =>
        ask(BoardWrite.Post({ asking, text: untrack(draft), items: untrack(sketch).items })),
      sketch: (event, at) => setSketch((s) => step(s, event, at)),
    },
    meta: { name, url, image, loaded },
  };
  return (
    <BoardContext value={value}>
      <Sketch.Provider state={sketch} send={value.actions.sketch}>
        {props.children}
      </Sketch.Provider>
    </BoardContext>
  );
};
