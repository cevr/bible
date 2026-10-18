// The studio's edits (`Editing.Root`, inside `Studio.Root`): what the page
// writes exactly and undoes byte for byte, and what it files for an agent.
// A Script clip carried to another gap moves its beat; a clip's edge pulled
// sets its hold (`edit.ts`, the one edit in flight, through the lab's
// `beats/move` and `beats/hold`); ⌘Z and ⇧⌘Z, and a receipt's Undo, step the
// film's one history (`edits/undo`, `edits/redo`: the agents' edits and his
// on one stack, each step its own). Each edit ripples on the timeline at
// once (`ripple.ts`), until the lab's read of the version holds it; the
// playhead comes back to the same moment of the same beat once it does, and
// a version the staged film draws loads again there, its new order drawn.
// A newer build of the pages (`rebuilt.ts`: a scene's source changed in an
// editor or by an agent) loads the page again at its place too, once no
// edit is in hand, no frame is drawn on and the recorder is not over it.
//
// What the page cannot write exactly is a note for an agent, through the
// inspector's note machine (`note-save.ts`): a frame drawn on in red with
// one line (Note, N, or a clip's Note on this frame), a beat split at the
// playhead, a Board panel moved to another beat. A receipt's Withdraw takes
// a note back while no one has answered it.
//
// The parts read `{ state, actions }` (`useEditing`); the page's verbs are
// commands on its hub, so a key, the context menu, ⌘K and a receipt's
// button run the same ones.

import { useAtomSet, useAtomValue } from '@bible/atom-solid';
import { Dialog } from '@bible/ui/dialog';
import { For } from '@solidjs/web';
import { Array as Arr, Boolean as Bool, Effect, Fiber, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as ActorAtom from 'effect-machine/atom';
import type { Accessor, ParentProps } from 'solid-js';
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
  useContext,
} from 'solid-js';
import { reloadAtAddress } from '../../browser/host.ts';
import {
  type Command,
  busy,
  quiet,
  quietly,
  refused,
  said,
  Unfit,
  boundChange,
  boundNote,
} from '../../command/command.ts';
import { selected } from '../../command/context.ts';
import { type Steps, type StudioEdit } from '../../core/api.ts';
import { trimReadout } from '../../core/beat-edit.ts';
import type { NoteDraft, NoteBox } from '../../core/schema.ts';
import type { SketchItem } from '../../core/sketch.ts';
import { FILM_FPS, onTheMs } from '../../core/time.ts';
import type { FilmTimeline, ScriptClip } from '../../core/timeline-schema.ts';
import { Actor } from '../actor.tsx';
import { registerWhile } from '../command/changes.ts';
import { focusFor } from '../focus.ts';
import { LabClient, NotesApi, type StepVerb, called, stepWhyNot } from '../api.ts';
import { type SketchEvent, type SketchState, sketchOf, step } from '../sketch/gesture.ts';
import { Sketch } from '../sketch/surface.tsx';
import { reloadOnRebuild } from '../rebuilt.ts';
import { playerStill, reloadHere } from '../stage.ts';
import { useStudio } from './context.tsx';
import {
  type EditActor,
  EditEvent,
  type EditState,
  StudioAsk,
  atRest,
  previewOf,
  spawnEdit,
} from './edit.ts';
import { type NoteSave, type NoteSaveActor, NoteSaveEvent, spawnNoteSave } from './note-save.ts';
import { STILL_SIZE, frameStill } from './panel-still.ts';
import { type Anchor, anchorOf, anchoredT, rippled, scriptOf } from './ripple.ts';
import { beatAt, beatNamed, keptInFilm, panelNamed, timecode } from './view-state.ts';

/** The receipts' slots: an edit's, and a note's. */
const EDIT_SLOT = 'studio-edit';
const NOTE_SLOT = 'studio-note';

/** The frame drawn on: film second `T`, in beat `beat`. */
interface Drawing {
  readonly T: number;
  readonly beat: string;
}

/** A Move… being picked: where beat `beat` goes, or which beat panel `panel` goes to. */
type Picking =
  | { readonly _tag: 'Beat'; readonly beat: string }
  | { readonly _tag: 'Panel'; readonly panel: string; readonly beat: string };

/** A note an agent answers, as it is about to be filed: its frame, its words and its marks. */
interface Filing {
  readonly beat: ScriptClip;
  readonly T: number;
  readonly text: string;
  readonly sketch: ReadonlyArray<SketchItem>;
  /** What the receipt says it filed. */
  readonly what: string;
}

/** The drop line: the film second it stands at, and what it says lands there (`job before court`). */
interface DropLine {
  readonly at: number;
  readonly text: string;
}

/** A trim's live readout: the beat trimmed, the edge pulled, and what it says. */
interface TrimReadout {
  readonly beat: string;
  readonly edge: 'lead' | 'tail';
  readonly text: string;
}

interface EditingState {
  readonly edit: Accessor<EditState>;
  /** The timeline the lanes draw: the version's, with the edit in flight rippled through it. */
  readonly laid: Accessor<Option.Option<FilmTimeline>>;
  /** Where a carried clip lands, while it is over a gap that moves it: the line's film second and its tag. */
  readonly drop: Accessor<Option.Option<DropLine>>;
  /** The beat lifted, while it is carried. */
  readonly lifted: Accessor<Option.Option<string>>;
  /** A trim's live readout, on the beat trimmed and the edge pulled: `hold +3.0 s · 41.5 s long`. */
  readonly readout: Accessor<Option.Option<TrimReadout>>;
  /** Whether an edit is on its way: sent, or written and its version not yet read again. No clip is carried or trimmed until it lands. */
  readonly waiting: Accessor<boolean>;
  /** Whether the version shown can be edited: it has files the lab writes. */
  readonly editable: Accessor<boolean>;
  readonly drawing: Accessor<Option.Option<Drawing>>;
  readonly picking: Accessor<Option.Option<Picking>>;
  /** Whether a note is on its way to the lab. */
  readonly filing: Accessor<boolean>;
  /** What is drawn on the frame. */
  readonly ink: Accessor<SketchState>;
  /** The note's one line. */
  readonly line: Accessor<string>;
}

interface EditingActions {
  /** Lift Script clip `beat`, to carry it. */
  readonly lift: (beat: string) => void;
  /** The carried clip is over film second `T` (none: off the beats). */
  readonly over: (T: Option.Option<number>) => void;
  readonly drop: () => void;
  /** Grip beat `beat`'s `edge`. */
  readonly grip: (beat: string, edge: 'lead' | 'tail') => void;
  /** The gripped edge is pulled `seconds` from where it was gripped (right is later). */
  readonly pull: (seconds: number) => void;
  readonly letGo: () => void;
  /** Let a carried clip or a gripped edge go back where it was. */
  readonly cancel: () => void;
  /** Draw on the frame at the playhead, or stop. */
  readonly draw: (open: boolean) => void;
  /** A stroke drawn on the frame, in the surface's view. */
  readonly inked: (event: SketchEvent, view: { readonly w: number; readonly h: number }) => void;
  /** The note's one line, as typed. */
  readonly typed: (line: string) => void;
  /** File the frame drawn on, with its line and its marks. */
  readonly fileDrawn: () => void;
  readonly pick: (picking: Option.Option<Picking>) => void;
  /** The Move… picked: before beat `to`, or to the end (none). */
  readonly picked: (to: Option.Option<string>) => void;
}

interface EditingValue {
  readonly state: EditingState;
  readonly actions: EditingActions;
}

const EditingContext = createContext<EditingValue>();

/** The studio's edits: only inside `<Editing.Root>`. */
export const useEditing = (): EditingValue => useContext(EditingContext);

/** What the lab's answer to an edit says the history is now. */
const stepsOf = (answer: StudioEdit): Steps => answer.steps;

/** A beat's frame as a box in the film's pixels: the bounds of what was drawn, in the frame's fractions. */
const boxOf = (
  sketch: ReadonlyArray<SketchItem>,
  size: { readonly w: number; readonly h: number },
): Option.Option<NoteBox> => {
  const points = sketch.flatMap((item) =>
    Match.value(item).pipe(
      Match.tagsExhaustive({
        Pen: (p) => p.points.map((q) => [q.x, q.y] as const),
        Arrow: (a) => [[a.from.x, a.from.y] as const, [a.to.x, a.to.y] as const],
        Rect: (r) => [[r.x, r.y] as const, [r.x + r.w, r.y + r.h] as const],
        Ellipse: (r) => [[r.x, r.y] as const, [r.x + r.w, r.y + r.h] as const],
        Text: (t) => [[t.at.x, t.at.y] as const],
      }),
    ),
  );
  return Option.map(Option.liftPredicate(points, Arr.isReadonlyArrayNonEmpty), (all) => {
    const xs = all.map(([x]) => x * size.w);
    const ys = all.map(([, y]) => y * size.h);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  });
};

/** The note `filing` files, as its draft: its beat, its frame, its words, its marks and their bounds. */
const draftOf = (filing: Filing, size: { readonly w: number; readonly h: number }): NoteDraft => ({
  scene: filing.beat.beat,
  T: filing.T,
  local: Math.max(0, filing.T - filing.beat.start),
  frame: Math.round(filing.T * FILM_FPS),
  text: filing.text,
  ...Option.match(
    Option.liftPredicate(filing.sketch, (s) => s.length > 0),
    {
      onNone: () => ({}),
      onSome: (sketch) => ({
        sketch,
        ...Option.match(boxOf(sketch, size), { onNone: () => ({}), onSome: (box) => ({ box }) }),
      }),
    },
  ),
});

const Body = (
  props: ParentProps<{
    readonly actor: EditActor;
    readonly notes: NoteSaveActor;
    readonly filings: { current: Option.Option<Filing> };
    readonly steps: Accessor<Option.Option<Steps>>;
    readonly setSteps: (steps: Steps) => void;
  }>,
) => {
  const { state: studio, actions: studioActions, meta } = useStudio();
  const editAtom = ActorAtom.make(props.actor);
  const edit = useAtomValue(() => editAtom);
  const send = useAtomSet(() => editAtom);
  const noteAtom = ActorAtom.make(props.notes);
  const noting = useAtomValue(() => noteAtom);
  const sendNote = useAtomSet(() => noteAtom);

  const [drawing, setDrawing] = createSignal(Option.none<Drawing>(), { ownedWrite: true });
  const [picking, setPicking] = createSignal(Option.none<Picking>(), { ownedWrite: true });
  const [ink, setInk] = createSignal<SketchState>(sketchOf(), { ownedWrite: true });
  const [line, setLine] = createSignal('', { ownedWrite: true });
  const editable = () => Option.exists(studio.timeline(), (t) => t.version.files !== 'none');

  // The timeline as the lanes show it: the version as read, an edit's preview laid on it.
  const preview = createMemo(() => previewOf(edit()));
  const laid = createMemo(() =>
    Option.map(studio.timeline(), (t) =>
      Option.match(preview(), { onNone: () => t, onSome: (p) => rippled(t, p) }),
    ),
  );
  const ids = () =>
    Option.match(laid(), {
      onNone: () => [],
      onSome: (t) => scriptOf(t).map((b) => b.beat),
    });

  // Where the playhead stood as an edit went out: it comes back there once the lab's read holds it.
  let anchor = Option.none<{ readonly at: Anchor; readonly T: number }>();
  createEffect(
    () => edit()._tag,
    (tag) => {
      if (tag !== 'Sending') return;
      anchor = Option.flatMap(untrack(studio.timeline), (t) =>
        Option.map(anchorOf(t, untrack(studio.T)), (at) => ({ at, T: untrack(studio.T) })),
      );
    },
  );

  // The film's history as the lab has it now: a refused Undo or Redo reads it again, so the
  // next one names the newest step. A ⌘Z or ⇧⌘Z pressed while it is read waits for it
  // (`afterHistory`), and then steps the newest.
  let readingHistory = false;
  let afterHistory = Option.none<StepVerb>();
  const historyAgain = () => {
    readingHistory = true;
    Effect.runForkWith(meta.host)(
      LabClient.use((client) => called(client.steps.steps({ params: { film: meta.film } }))).pipe(
        Effect.match({
          onSuccess: (steps) => {
            props.setSteps(steps);
            return Option.some(steps);
          },
          onFailure: () => Option.none<Steps>(),
        }),
        // The steps as read, not the signal's: a signal set here reads its old value until it flushes.
        Effect.map((read) => {
          readingHistory = false;
          const waiting = afterHistory;
          afterHistory = Option.none();
          Option.map(
            Option.filter(waiting, () => atRest(untrack(edit))),
            (verb) =>
              stepNewest(
                verb,
                Option.orElse(read, () => untrack(props.steps)),
              ),
          );
        }),
        Effect.provide(meta.client),
      ),
    );
  };

  // The timeline a landed write was answered over, and whether its read has begun since.
  let over = Option.none<FilmTimeline>();
  let reread = false;

  /** A landed write's receipt, its Undo or Redo bound to its change; `after`, said after its words. */
  const receipt = (ask: StudioAsk, answer: StudioEdit, after = '') => {
    props.setSteps(stepsOf(answer));
    const undoing = Match.value(ask).pipe(
      Match.tag('Step', (st) =>
        Bool.match(st.verb === 'undo', {
          onTrue: () => 'edit.redo',
          onFalse: () => 'edit.undo',
        }),
      ),
      Match.orElse(() => 'edit.undo'),
    );
    meta.hub.announce(
      said(
        `${answer.said}${after}`,
        Option.map(Option.fromUndefinedOr(answer.change), (change) => ({
          command: undoing,
          bound: { film: meta.film, change },
        })),
      ),
      EDIT_SLOT,
    );
  };

  // An edit's receipt, once, in the edit's slot: on its way, landed (its Undo or Redo bound to
  // its change, the version read again), answered with nothing changed, or refused.
  createEffect(edit, (now) =>
    untrack(() =>
      Match.value(now).pipe(
        Match.tag('Sending', (s) =>
          meta.hub.announce(
            busy(
              Match.value(s.ask).pipe(
                Match.tagsExhaustive({
                  Move: (m) => `Moving ${m.beat}…`,
                  Hold: (h) => `Holding ${h.beat}…`,
                  Step: (st) =>
                    Bool.match(st.verb === 'undo', {
                      onTrue: () => 'Undoing…',
                      onFalse: () => 'Redoing…',
                    }),
                }),
              ),
            ),
            EDIT_SLOT,
          ),
        ),
        Match.tag('Landed', (l) => {
          receipt(l.ask, l.answer);
          over = untrack(studio.timeline);
          reread = false;
          studioActions.refresh();
        }),
        // Done after Landed was announced there; Done with no change is announced here.
        Match.tag('Done', (d) =>
          Option.match(Option.fromUndefinedOr(d.answer.change), {
            onNone: () => receipt(d.ask, d.answer),
            onSome: () => {},
          }),
        ),
        Match.tag('Failed', (f) => {
          meta.hub.announce(refused(f.reason), EDIT_SLOT);
          if (f.ask._tag === 'Step') historyAgain();
        }),
        Match.orElse(() => {}),
      ),
    ),
  );

  // A reload waits (the server rebuilt the pages, or a version the staged film draws was read
  // again after a write): it runs once no edit is in hand or unread, nothing is drawn on the
  // frame and the recorder is not over the page.
  const [reloading, setReloading] = createSignal(false, { ownedWrite: true });
  const awaiting = Effect.runForkWith(meta.host)(
    reloadOnRebuild(
      meta.film,
      Effect.sync(() => setReloading(true)),
    ).pipe(Effect.provide(meta.client)),
  );
  onCleanup(() => Effect.runFork(Fiber.interrupt(awaiting)));

  // The read that holds a landed write, once it has begun and ended: the playhead back on its
  // moment, the edit at rest, and a version the staged film draws loaded again there so the
  // film plays the new order. A read that failed keeps the timeline shown, the receipt says
  // so (the clips show the film from before the write), and the edit rests.
  createEffect(
    () => ({ landed: edit()._tag === 'Landed', reading: studio.reading() }),
    (now) =>
      untrack(() => {
        const landed = edit();
        if (landed._tag !== 'Landed') return;
        if (now.reading) {
          reread = true;
          return;
        }
        if (!reread) return;
        reread = false;
        Option.map(studio.missed(), (why) =>
          receipt(
            landed.ask,
            landed.answer,
            ` The page could not read it again (${why}): the timeline shows the film from before it.`,
          ),
        );
        const shown = studio.timeline();
        Option.map(
          Option.filter(shown, (t) => Option.exists(over, (was) => was !== t)),
          (t) => {
            Option.map(anchor, ({ at, T }) => studioActions.seek(anchoredT(t, at, T)));
            if (keptInFilm(t) && Option.isSome(meta.player())) setReloading(true);
          },
        );
        anchor = Option.none();
        over = Option.none();
        send(EditEvent.Read);
      }),
  );

  createEffect(
    () => reloading() && atRest(edit()) && Option.isNone(drawing()) && !studio.recording(),
    (now) => {
      if (!now) return;
      setReloading(false);
      Effect.runFork(
        Option.match(untrack(meta.player), {
          onSome: (shown) => reloadHere(shown.player, meta.host),
          onNone: () => Effect.provideContext(reloadAtAddress, meta.host),
        }),
      );
    },
  );

  /** The newest step of `verb` in `steps`, asked once the history read again has landed. */
  const stepNewest = (verb: StepVerb, steps: Option.Option<Steps>) =>
    send(
      EditEvent.Ask({
        ask: StudioAsk.cases.Step.make({
          verb,
          change: Option.map(
            Option.flatMap(steps, (s) => Option.fromUndefinedOr(s[verb])),
            (s) => s.change,
          ),
        }),
      }),
    );
  const top = (verb: StepVerb) =>
    Option.flatMap(props.steps(), (s) => Option.fromUndefinedOr(s[verb]));
  const notNow = (): Option.Option<string> =>
    Option.liftPredicate('wait for the edit on its way', () => !atRest(untrack(edit)));
  const stepCommand = (verb: StepVerb, label: string, key: string): Command => ({
    id: `edit.${verb}`,
    label,
    group: 'Edit',
    keys: [key],
    about: ['Page'],
    touch: `the receipt's ${label}`,
    // While drawing, ⌘Z and ⇧⌘Z are the sketch's.
    when: () => Option.isSome(top(verb)) && Option.isNone(drawing()),
    // A receipt's button steps the change it names, or says why it cannot.
    fits: (bound) =>
      Option.orElse(
        Option.map(notNow(), (reason) => Unfit.Now({ reason })),
        () => stepWhyNot(verb, meta.film, props.steps())(bound),
      ),
    run: (_, how) =>
      Effect.sync(() =>
        Option.match(notNow(), {
          onSome: (why) => refused(`${label} not taken: ${why}`),
          onNone: () => {
            const bound = Option.flatMap(Option.fromUndefinedOr(how.bound), boundChange);
            // A key's step while the history is read again waits to step the newest.
            if (Option.isNone(bound) && readingHistory) {
              afterHistory = Option.some(verb);
              return busy('Reading the film’s history…');
            }
            send(
              EditEvent.Ask({
                ask: StudioAsk.cases.Step.make({
                  verb,
                  change: Option.orElse(bound, () => Option.map(top(verb), (s) => s.change)),
                }),
              }),
            );
            return quiet;
          },
        }),
      ),
  });

  // The note machine's answers, as receipts in the note's slot; a filed note's Withdraw takes it back.
  const [filed, setFiled] = createSignal<ReadonlyArray<string>>([], { ownedWrite: true });
  createEffect(noting, (now) =>
    untrack(() =>
      Match.value(now).pipe(
        Match.tag('Saving', () => meta.hub.announce(busy('Filing the note…'), NOTE_SLOT)),
        Match.tag('Saved', (s) => {
          const what = Option.getOrElse(
            Option.map(props.filings.current, (f) => f.what),
            () => 'a note',
          );
          setFiled((all) => [...all, s.id]);
          setDrawing(Option.none());
          meta.hub.announce(
            said(
              `Filed ${what} (${s.id}). An agent answers it.`,
              Option.some({
                command: 'studio.withdraw',
                bound: { film: meta.film, note: s.id },
              }),
            ),
            NOTE_SLOT,
          );
          studioActions.refresh();
        }),
        Match.tag('Failed', (f) => meta.hub.announce(refused(`Not filed: ${f.reason}`), NOTE_SLOT)),
        Match.orElse(() => {}),
      ),
    ),
  );
  const file = (filing: Filing) => {
    props.filings.current = Option.some(filing);
    sendNote(
      NoteSaveEvent.Save({ ask: 'note', text: filing.text, replace: '', sketch: filing.sketch }),
    );
  };
  // A note taken back while no one has answered it: the lab refuses one answered.
  const withdrawn = meta.runtime.fn((id: string) =>
    NotesApi.use((api) => api.withdraw(id)).pipe(
      Effect.match({
        onSuccess: (note) => {
          setFiled((all) => all.filter((n) => n !== note.id));
          meta.hub.announce(said(`Withdrew note ${note.id}.`), NOTE_SLOT);
          studioActions.refresh();
        },
        onFailure: (failure) => meta.hub.announce(refused(failure.message), NOTE_SLOT),
      }),
    ),
  );
  const withdraw = useAtomSet(() => withdrawn);

  /** The beat at the playhead, on the version shown. */
  const atPlayhead = () => Option.flatMap(studio.timeline(), (t) => beatAt(t, studio.T()));
  /** Beat `id` as the lanes show it. */
  const beatOf = (id: string) => Option.flatMap(laid(), (t) => beatNamed(t, id));

  const actions: EditingActions = {
    lift: (beat) =>
      Bool.match(editable() && atRest(edit()), {
        onTrue: () => send(EditEvent.Lift({ beat, ids: ids() })),
        onFalse: () => {},
      }),
    over: (T) =>
      send(
        EditEvent.Over({
          gap: Option.map(T, (at) => {
            const beats = Option.match(laid(), { onNone: () => [], onSome: scriptOf });
            return beats.filter((b) => b.start + b.dur / 2 < at).length;
          }),
        }),
      ),
    drop: () => send(EditEvent.Drop),
    grip: (beat, edge) =>
      Option.map(
        Option.filter(beatOf(beat), () => editable() && atRest(edit())),
        (clip) => send(EditEvent.Grip({ beat, edge, from: clip.hold[edge] })),
      ),
    pull: (seconds) =>
      Match.value(edit()).pipe(
        Match.tag('Trimming', (t) =>
          send(
            EditEvent.Pull({
              to:
                t.from +
                Bool.match(t.edge === 'tail', { onTrue: () => seconds, onFalse: () => -seconds }),
            }),
          ),
        ),
        Match.orElse(() => {}),
      ),
    letGo: () => send(EditEvent.Let),
    cancel: () => send(EditEvent.Cancel),
    draw: (open) => {
      setInk(sketchOf());
      setLine('');
      if (!open) return setDrawing(Option.none());
      studioActions.pause();
      Option.map(atPlayhead(), (b) =>
        setDrawing(Option.some({ T: untrack(studio.T), beat: b.beat })),
      );
    },
    inked: (event, view) => {
      if (untrack(noting)._tag !== 'Saving') setInk((s) => step(s, event, view));
    },
    typed: setLine,
    fileDrawn: () =>
      Option.map(
        Option.flatMap(drawing(), (d) => Option.map(beatOf(d.beat), (beat) => ({ d, beat }))),
        ({ d, beat }) =>
          file({
            beat,
            T: d.T,
            text: untrack(line).trim(),
            sketch: untrack(ink).items,
            what: `a note on ${beat.beat}`,
          }),
      ),
    pick: setPicking,
    picked: (to) => {
      const was = picking();
      setPicking(Option.none());
      Option.map(was, (p) =>
        Match.value(p).pipe(
          Match.tag('Beat', (b) =>
            send(EditEvent.Ask({ ask: StudioAsk.cases.Move.make({ beat: b.beat, before: to }) })),
          ),
          Match.tag('Panel', (pl) =>
            Option.map(
              Option.zipWith(beatOf(pl.beat), to, (beat, target) => ({ beat, target })),
              ({ beat, target }) =>
                file({
                  beat,
                  T: beat.start,
                  text: `Move panel ${pl.panel} to beat ${target}.`,
                  sketch: [],
                  what: `a move of ${pl.panel}`,
                }),
            ),
          ),
          Match.exhaustive,
        ),
      );
    },
  };

  /** The beat a menu or a key acts on: the one the menu opened on, else the one at the playhead. */
  const beatIn = (ctx: Parameters<Command['when']>[0]) =>
    Option.orElse(
      Option.flatMap(selected(ctx, 'Beat'), (b) => beatOf(b.beat)),
      atPlayhead,
    );
  const notDrawing = () => Option.isNone(drawing());

  onSettled(() =>
    meta.hub.commands.register(
      stepCommand('undo', 'Undo', 'mod+z'),
      stepCommand('redo', 'Redo', 'mod+shift+z'),
      {
        id: 'studio.open',
        label: 'Open',
        group: 'Studio',
        about: ['Beat'],
        touch: 'long-press a beat, then Open',
        when: (ctx) => Option.isSome(selected(ctx, 'Beat')),
        run: quietly((ctx) =>
          studioActions.select(Option.map(selected(ctx, 'Beat'), (b) => b.beat)),
        ),
      },
      {
        id: 'studio.note',
        label: 'Note on this frame',
        group: 'Studio',
        keys: ['n'],
        about: ['Beat', 'Page'],
        touch: 'the Note key, or long-press a beat, then Note on this frame',
        when: (ctx) => notDrawing() && Option.isSome(beatIn(ctx)),
        run: quietly((ctx) => {
          // A beat's menu draws on its frame: the playhead goes into it first.
          Option.map(selected(ctx, 'Beat'), (b) => studioActions.select(Option.some(b.beat)));
          actions.draw(true);
        }),
      },
      {
        id: 'studio.split',
        label: 'Split at the playhead',
        group: 'Studio',
        about: ['Beat'],
        touch: 'long-press a beat, then Split at the playhead',
        when: (ctx) =>
          Option.exists(beatIn(ctx), (b) => {
            const T = studio.T();
            return T > b.start && T < b.start + b.dur;
          }) && noting()._tag !== 'Saving',
        run: quietly((ctx) =>
          Option.map(beatIn(ctx), (beat) => {
            const T = untrack(studio.T);
            file({
              beat,
              T,
              text: `Split ${beat.beat} at ${timecode(T)}, ${(T - beat.start).toFixed(1)} s into it.`,
              sketch: [],
              what: `a split of ${beat.beat}`,
            });
          }),
        ),
      },
      {
        id: 'studio.move-before',
        label: 'Move before…',
        group: 'Studio',
        about: ['Beat'],
        touch: 'long-press a beat, then Move before…',
        when: (ctx) => editable() && atRest(edit()) && Option.isSome(selected(ctx, 'Beat')),
        run: quietly((ctx) =>
          Option.map(selected(ctx, 'Beat'), (b) =>
            setPicking(Option.some({ _tag: 'Beat', beat: b.beat })),
          ),
        ),
      },
      {
        id: 'studio.move-panel',
        label: 'Move…',
        group: 'Studio',
        about: ['Panel'],
        touch: 'long-press a Board panel, then Move…',
        when: (ctx) => Option.isSome(selected(ctx, 'Panel')),
        run: quietly((ctx) =>
          Option.map(
            Option.flatMap(selected(ctx, 'Panel'), (p) =>
              Option.flatMap(studio.timeline(), (t) => panelNamed(t, p.panel)),
            ),
            (clip) =>
              setPicking(Option.some({ _tag: 'Panel', panel: clip.panel, beat: clip.beat })),
          ),
        ),
      },
      {
        id: 'studio.withdraw',
        label: 'Withdraw',
        group: 'Studio',
        touch: "the receipt's Withdraw",
        when: () => filed().length > 0,
        fits: (bound) =>
          Option.match(boundNote(bound), {
            onNone: () => Option.some(Unfit.Never({ reason: 'it names no note' })),
            onSome: (id) =>
              Option.liftPredicate(
                Unfit.Never({ reason: `note ${id} is not one this page filed and holds` }),
                () => !filed().includes(id),
              ),
          }),
        run: (_, how) =>
          Effect.sync(() => {
            Option.map(
              Option.orElse(Option.flatMap(Option.fromUndefinedOr(how.bound), boundNote), () =>
                Arr.last(filed()),
              ),
              withdraw,
            );
            return quiet;
          }),
      },
    ),
  );

  // Escape lets an edit in hand go: registered while one is, so it is the last Escape and runs
  // before the inspector's close.
  registerWhile(meta.hub, () =>
    Bool.match(
      Option.isSome(drawing()) || edit()._tag === 'Dragging' || edit()._tag === 'Trimming',
      {
        onTrue: (): ReadonlyArray<Command> => [
          {
            id: 'studio.cancel-edit',
            label: 'Cancel the edit',
            group: 'Studio',
            keys: ['escape'],
            keysIn: ['page', 'field'],
            touch: 'Cancel, in the note bar',
            when: () =>
              Option.isSome(drawing()) || edit()._tag === 'Dragging' || edit()._tag === 'Trimming',
            run: quietly(() => {
              actions.cancel();
              setDrawing(Option.none());
            }),
          },
        ],
        onFalse: () => [],
      },
    ),
  );

  const value: EditingValue = {
    state: {
      edit,
      laid,
      drop: () =>
        Match.value(edit()).pipe(
          Match.tag('Dragging', (d) =>
            Option.flatMap(d.gap, (gap) =>
              Option.flatMap(laid(), (t) => {
                const beats = scriptOf(t);
                const at = d.ids.indexOf(d.beat);
                if (gap === at || gap === at + 1) return Option.none();
                return Option.some(
                  Option.match(Arr.get(beats, gap), {
                    onSome: (b): DropLine => ({ at: b.start, text: `${d.beat} before ${b.beat}` }),
                    onNone: (): DropLine => ({ at: t.duration, text: `${d.beat} to the end` }),
                  }),
                );
              }),
            ),
          ),
          Match.orElse(() => Option.none<DropLine>()),
        ),
      lifted: () =>
        Match.value(edit()).pipe(
          Match.tag('Dragging', (d) => Option.some(d.beat)),
          Match.orElse(() => Option.none<string>()),
        ),
      readout: () =>
        Match.value(edit()).pipe(
          Match.tag('Trimming', (t) =>
            Option.map(beatOf(t.beat), (b) => ({
              beat: t.beat,
              edge: t.edge,
              // The beat as the lanes lay it with the trim, by the layout's own rule: the hold
              // it plays (a min may take some of a tail's change) and its length.
              text: trimReadout(onTheMs(b.hold[t.edge] - t.from), b.dur),
            })),
          ),
          Match.orElse(() => Option.none<TrimReadout>()),
        ),
      waiting: () => edit()._tag === 'Sending' || edit()._tag === 'Landed',
      editable,
      drawing,
      picking,
      filing: () => noting()._tag === 'Saving',
      ink,
      line,
    },
    actions,
  };
  return <EditingContext value={value}>{props.children}</EditingContext>;
};

/**
 * The studio's edits around `children`: the edit machine and the note
 * machine on the page's runtime, the film's history read once and kept from
 * each edit's answer.
 */
const Root = (props: ParentProps) => {
  const { state, meta } = useStudio();
  const [steps, setSteps] = createSignal(Option.none<Steps>(), { ownedWrite: true });
  const film = meta.film;
  // The history as the lab has it when the page opens: what Undo and Redo name.
  const history = meta.runtime.atom(
    LabClient.use((client) => called(client.steps.steps({ params: { film } }))),
  );
  const read = useAtomValue(() => history);
  createEffect(read, (now) => {
    Option.map(AsyncResult.value(now), (s) => setSteps(Option.some(s)));
  });
  const version = () =>
    Option.match(state.timeline(), {
      onNone: () => ({}),
      onSome: (t) => ({ version: t.version.n }),
    });
  const write = (ask: StudioAsk) =>
    LabClient.use((client) =>
      called(
        Match.value(ask).pipe(
          Match.tagsExhaustive({
            Move: (m) =>
              client.edits.move({
                params: { film },
                payload: {
                  ...untrack(version),
                  beat: m.beat,
                  ...Option.match(m.before, {
                    onNone: () => ({}),
                    onSome: (before) => ({ before }),
                  }),
                },
              }),
            Hold: (h) =>
              client.edits.hold({
                params: { film },
                payload: { ...untrack(version), beat: h.beat, edge: h.edge, seconds: h.seconds },
              }),
            Step: (s) =>
              client.edits[s.verb]({
                params: { film },
                payload: Option.match(s.change, {
                  onNone: () => ({}),
                  onSome: (change) => ({ change }),
                }),
              }),
          }),
        ),
      ).pipe(Effect.mapError((failure) => failure.message)),
    );
  // A note's still: the frame the staged film paints, else the Board try the viewer shows, else paper; the marks over it.
  const filings = { current: Option.none<Filing>() };
  const size = Option.match(untrack(meta.drawn), {
    onNone: () => STILL_SIZE,
    onSome: (f) => ({ w: f.width, h: f.height }),
  });
  const save = (s: NoteSave) =>
    Effect.gen(function* () {
      const filing = yield* Effect.fromOption(filings.current).pipe(
        Effect.mapError(() => 'nothing to file'),
      );
      // The still is of what the viewer shows: the staged film's frame on a scene, a Board
      // panel's try, else the paper the viewer shows.
      const url = yield* Match.value(untrack(state.picture)).pipe(
        Match.tag('Scene', () =>
          Option.match(untrack(meta.player), {
            onNone: () => Effect.succeed(Option.none<string>()),
            onSome: (shown) =>
              playerStill(shown.player, filing.T).pipe(
                Effect.mapError((e) => e.message),
                // The frame as a URL the still loads, let go once the still is drawn.
                Effect.flatMap((bytes) =>
                  Effect.acquireRelease(
                    Effect.sync(() =>
                      URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/png' })),
                    ),
                    (made) => Effect.sync(() => URL.revokeObjectURL(made)),
                  ),
                ),
                Effect.asSome,
              ),
          }),
        ),
        Match.tag('Board', (b) => Effect.succeedSome(meta.boardUrl(b.file))),
        Match.orElse(() => Effect.succeedNone),
      );
      const still = yield* frameStill(url, s.sketch, size);
      const draft = draftOf(filing, size);
      const note = yield* NotesApi.use((api) => api.add({ ...draft, still })).pipe(
        Effect.mapError((failure) => failure.message),
      );
      return note.id;
    }).pipe(Effect.scoped);
  return (
    <Actor runtime={meta.runtime} spawn={spawnEdit(write)}>
      {(actor) => (
        <Actor runtime={meta.runtime} spawn={spawnNoteSave(save)}>
          {(notes) => (
            <Body
              actor={actor}
              notes={notes}
              filings={filings}
              steps={steps}
              setSteps={(s) => setSteps(Option.some(s))}
            >
              {props.children}
            </Body>
          )}
        </Actor>
      )}
    </Actor>
  );
};

/**
 * The red ink over the viewer, while drawing on the frame: the inspector's
 * markup surface (`Sketch.Surface`), in the film's pixels, its keys on the page while it shows.
 */
const Ink = () => {
  const { state, actions } = useEditing();
  const { meta } = useStudio();
  const size = Option.match(untrack(meta.drawn), {
    onNone: () => STILL_SIZE,
    onSome: (f) => ({ w: f.width, h: f.height }),
  });
  return (
    <Sketch.Provider host={meta.host} state={state.ink} send={actions.inked}>
      <svg
        class="lab-overlay st-draw-over"
        data-role="draw"
        viewBox={`0 0 ${size.w} ${size.h}`}
        preserveAspectRatio="none"
        aria-label="Draw on the frame"
      >
        <Sketch.Surface width={size.w} height={size.h} />
      </svg>
      <Sketch.Keys hub={meta.hub} />
    </Sketch.Provider>
  );
};

/**
 * The note bar, in the transport's place while drawing on the frame: one
 * line (its field takes the keys as it opens), File note, and Cancel.
 */
const NoteBar = () => {
  const { state, actions } = useEditing();
  const { meta } = useStudio();
  let field = Option.none<HTMLInputElement>();
  onSettled(() => {
    Option.map(field, (el) => focusFor(el, meta.hub.input()));
  });
  return (
    <section class="st-notebar" aria-label="Note on this frame" data-role="note-bar">
      <input
        class="sh-field st-notebar-text"
        type="text"
        data-role="note-text"
        aria-label="What to change on this frame"
        placeholder="Say what to change"
        autocomplete="off"
        disabled={state.filing()}
        value={state.line()}
        onInput={(e) => actions.typed(e.currentTarget.value)}
        ref={(el: HTMLInputElement) => {
          field = Option.some(el);
        }}
      />
      <button
        type="button"
        class="sh-btn"
        data-primary
        data-act="file-note"
        disabled={state.filing() || state.line().trim() === ''}
        onClick={() => actions.fileDrawn()}
      >
        File note
      </button>
      <button
        type="button"
        class="sh-btn"
        data-act="cancel-note"
        onClick={() => actions.draw(false)}
      >
        Cancel
      </button>
    </section>
  );
};

const MovePicker = () => {
  const { state, actions } = useEditing();
  const { state: studio } = useStudio();
  const beats = () => Option.match(studio.timeline(), { onNone: () => [], onSome: scriptOf });
  const title = () =>
    Option.match(state.picking(), {
      onNone: () => '',
      onSome: (p) =>
        Match.value(p).pipe(
          Match.tag('Beat', (b) => `Move ${b.beat}`),
          Match.tag('Panel', (pl) => `Move ${pl.panel}`),
          Match.exhaustive,
        ),
    });
  const choices = () =>
    Option.match(state.picking(), {
      onNone: () => [],
      onSome: (p) =>
        Match.value(p).pipe(
          Match.tag('Beat', (b) => {
            const all = beats().map((x) => x.beat);
            const at = all.indexOf(b.beat);
            return [
              ...all
                .filter((id, i) => id !== b.beat && i !== at + 1)
                .map((id) => ({ to: Option.some(id), label: `Before ${id}` })),
              ...Bool.match(at === all.length - 1, {
                onTrue: () => [],
                onFalse: () => [{ to: Option.none<string>(), label: 'To the end' }],
              }),
            ];
          }),
          Match.tag('Panel', (pl) =>
            beats()
              .filter((x) => x.beat !== pl.beat)
              .map((x) => ({ to: Option.some(x.beat), label: `To ${x.beat}` })),
          ),
          Match.exhaustive,
        ),
    });
  return (
    <Dialog.Root
      open={Option.isSome(state.picking())}
      onOpenChange={(open) => {
        if (!open) actions.pick(Option.none());
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop class="st-record-backdrop" />
        <Dialog.Popup class="st-picker" data-role="move-picker">
          <Dialog.Title class="st-record-title">{title()}</Dialog.Title>
          <div class="st-picker-list" role="group" aria-label={title()}>
            <For each={choices()}>
              {(choice) => (
                <button
                  type="button"
                  class="st-picker-row"
                  data-to={Option.getOrUndefined(choice.to)}
                  data-end={Option.getOrUndefined(
                    Option.map(Option.liftPredicate(choice.to, Option.isNone), () => 'true'),
                  )}
                  onClick={() => actions.picked(choice.to)}
                >
                  {choice.label}
                </button>
              )}
            </For>
          </div>
          <Dialog.Close class="sh-btn st-picker-close">Cancel</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export const Editing = { Root, Ink, NoteBar, MovePicker };
