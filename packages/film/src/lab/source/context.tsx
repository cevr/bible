// The Source view's provider: the scene whose code the lab shows (the
// selection's scene, else the one under the playhead), that scene's code as
// the server reads it now (`GET …/scenes/<scene>/code`, read while the view is
// open and not before: a lab at rest, or with something selected, reads none
// of it), and the view's commands. The inspector's `file:line` comes from the
// small source answer the editor already holds (`GET …/scenes/<scene>/source`),
// so selecting a cue costs the code nothing. The view, the inspector's
// `file:line` and the commands read this context; none holds the code of its own.

import { useAtomRefresh, useAtomValue } from '@bible/atom-solid';
import { Show } from '@solidjs/web';
import { Data, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
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
import { type Ask, newestAsked } from '../../core/asked.ts';
import type { NoteSource, SceneCode } from '../../core/schema.ts';
import { LabApi, reasonOf } from '../api.ts';
import { useEditor } from '../editor/context.tsx';
import { SourceKnown } from '../editor/grip.ts';
import { useLabPage } from '../panel.tsx';
import { useLab } from '../shell.tsx';
import { lastLine, lineAt, lineSite } from './lit.ts';
import { sourceCommands } from './commands.ts';
import { type CodeOpen, FOLLOW, codeText, followsFrame, isLive } from './open.ts';

/** The code as the view knows it: not asked for, being read, read, or refused (with the server's words). */
export type CodeState = Data.TaggedEnum<{
  Idle: {};
  Reading: {};
  Read: { readonly code: SceneCode };
  Refused: { readonly reason: string };
}>;
export const CodeState = Data.taggedEnum<CodeState>();

/** Where a cue or knob is written: its file and its line. */
interface Where {
  readonly file: string;
  readonly line: number;
}

interface SourceContextValue {
  /** The scene whose code is shown: the selection's, else the one under the playhead. */
  readonly scene: Accessor<string>;
  /** That scene's code once the server has answered; none until then, and none for a scene it cannot read. */
  readonly code: Accessor<Option.Option<SceneCode>>;
  /** Where the code stands: not asked for while the view is shut, then reading, read, or refused. */
  readonly state: Accessor<CodeState>;
  /** Ask the server for the code again after a refusal. */
  readonly retry: () => void;
  /** The view as the URL holds it. */
  readonly open: Accessor<Option.Option<CodeOpen>>;
  /**
   * The line the view is held on, against the code read: `?code=<n>`, or the
   * file's last line for an `n` past it. None while it follows, is shut, or
   * reads. The view lights it and a note cites it: one line.
   */
  readonly held: Accessor<Option.Option<number>>;
  /** Whether the view places its scroll: no hand has scrolled it since it opened, was held on a line, or was taken back. */
  readonly placing: Accessor<boolean>;
  /** Whether the view scrolls with the frame: it is open to follow (or in Code mode) and placing. */
  readonly following: Accessor<boolean>;
  /** Whether the view is open in Code mode (`?code=live`): the code beside the picture, the panel set aside. */
  readonly live: Accessor<boolean>;
  /**
   * A hand scrolled the view: it stops placing until `resume`, or until a line is held. The scroll is an ask of
   * where the view stands, answered at once (`askPlace`), so a settle asked before it shows nothing.
   */
  readonly suspend: () => void;
  /**
   * An ask of where the view stands (`core/asked.ts`), for what moves it once an answer lands (the face's settle
   * on a line once a read names it): its `answer` shows nothing once a hand's scroll, asked after it, has shown.
   */
  readonly askPlace: () => Ask;
  /** Place the view again: follow the frame, or show the held line. */
  readonly resume: () => void;
  /**
   * Whether a hand has the view now, its scroll event heard or still on its way (a busy page tells it late):
   * found so, the view stops placing. Asked before the view moves on the page's word. No view shown: none has.
   */
  readonly handHas: () => boolean;
  /**
   * The view shown hands over how to ask it (`useFollow`'s answer). Answers its release, for when the view goes:
   * it clears the slot only while the slot still holds this view's ask (a view mounted in its place, as Edit hands a
   * phone's view from the selection's face to its own sheet, mounts before the old one goes).
   */
  readonly offerHand: (ask: () => boolean) => () => void;
  /** The file and line that write cue `name` of `scene`: from the code read, else from the small source answer. */
  readonly whereCue: (scene: string, name: string) => Option.Option<Where>;
  /** The file and line that write knob `name`, likewise. */
  readonly whereKnob: (scene: string, name: string) => Option.Option<Where>;
  /** The line the view is held on, as a note cites it, with the scene whose file it is: none while it follows or is shut. */
  readonly heldSite: () => Option.Option<{ readonly scene: string; readonly source: NoteSource }>;
}

const SourceContext = createContext<SourceContextValue>();

/** The Source view's context: only inside `<Source.Provider>`. */
export const useSource = (): SourceContextValue => useContext(SourceContext);

/** Reads the code of the scene shown while it is mounted, into `into`; hands over how to ask again. */
const Reader = (props: {
  readonly scene: Accessor<string>;
  readonly reads: (scene: string) => Atom.Atom<AsyncResult.AsyncResult<SceneCode, unknown>>;
  readonly into: (state: CodeState) => void;
  readonly offer: (retry: () => void) => void;
}) => {
  const atom = () => props.reads(props.scene());
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  props.offer(refresh);
  createEffect(
    () => result(),
    (read) => {
      props.into(
        AsyncResult.match(read, {
          onInitial: () => CodeState.Reading(),
          onFailure: (f) => CodeState.Refused({ reason: reasonOf(f.cause) }),
          onSuccess: (s) => CodeState.Read({ code: s.value }),
        }),
      );
    },
  );
  onCleanup(() => {
    props.offer(() => {});
    props.into(CodeState.Idle());
  });
  return <></>;
};

export const Provider = (props: ParentProps) => {
  const { state: lab, actions, meta } = useLab();
  const { state: editor } = useEditor();
  const reads = Atom.family((scene: string) =>
    meta.runtime.atom(LabApi.use((api) => api.code(scene))),
  );
  const scene = createMemo(() =>
    Option.match(lab.selection(), { onNone: lab.scene, onSome: (s) => s.scene }),
  );
  const [state, setState] = createSignal<CodeState>(CodeState.Idle(), { ownedWrite: true });
  let retrying = () => {};
  // How to ask the view shown whether a hand has it: none shown, none has.
  let askHand = () => false;
  const code = createMemo(() =>
    CodeState.$match(state(), {
      Idle: () => Option.none<SceneCode>(),
      Reading: () => Option.none<SceneCode>(),
      Read: (s) => Option.some(s.code),
      Refused: () => Option.none<SceneCode>(),
    }),
  );
  // Read while the view is open: the file's text is its payload, and a lab at rest reads nothing.
  const wanted = () => Option.isSome(lab.code());

  // A hand's scroll holds until the view is opened, shut or held anew (`?code=` changes), or taken back.
  const [suspended, setSuspended] = createSignal(false, { ownedWrite: true });
  // Where the view stands, asked by a hand's scroll (shown at once) and by a face waiting on its line (shown when
  // the line lands): the newest asked wins.
  const place = newestAsked();
  createEffect(
    () => codeText(lab.code()),
    () => {
      setSuspended(false);
    },
  );
  const placing = () => !suspended();
  const following = () => Option.exists(lab.code(), followsFrame) && placing();
  const live = () => isLive(lab.code());
  // The held line, clamped once against the code read: the view and the note read this one.
  const held = createMemo(() =>
    Option.flatMap(Option.all({ c: code(), o: lab.code() }), ({ c, o }) =>
      Option.map(
        Option.filter(
          Option.some(o),
          (x): x is Extract<CodeOpen, { _tag: 'Line' }> => x._tag === 'Line',
        ),
        (x) => Math.min(x.line, lastLine(c)),
      ),
    ),
  );

  // Where a cue or knob is written: the code read, else the small answer the editor holds for the scene shown.
  const whereIn =
    (site: 'cues' | 'knobs') =>
    (at: string, name: string): Option.Option<Where> =>
      Option.orElse(
        Option.flatMap(
          Option.filter(code(), (c) => c.scene === at),
          (c) =>
            Option.map(Option.fromUndefinedOr(c[site].find((s) => s.name === name)), (s) => ({
              file: c.file,
              line: lineAt(c, s.at[0]),
            })),
        ),
        () =>
          SourceKnown.$match(editor.inspectedSource(), {
            Reading: () => Option.none<Where>(),
            Unread: () => Option.none<Where>(),
            Read: ({ source }) =>
              Option.flatMap(
                Option.liftPredicate(source, (s) => s.scene === at),
                (s) =>
                  Option.flatMap(
                    Option.fromUndefinedOr(s[site].find((x) => x.name === name)),
                    (x) =>
                      Option.map(Option.fromUndefinedOr(x.line), (line) => ({
                        file: s.file,
                        line,
                      })),
                  ),
              ),
          }),
      );
  const whereCue = whereIn('cues');
  const whereKnob = whereIn('knobs');
  const lineOfCue = (at: string, name: string) => Option.map(whereCue(at, name), (w) => w.line);
  onCleanup(
    meta.hub.commands.register(
      ...sourceCommands({
        open: () => Option.isSome(lab.code()),
        live,
        show: (to) => actions.showCode(Option.some(to)),
        hide: actions.dismissCode,
        lineOfCue,
      }),
    ),
  );
  // Code mode sets the panel aside: a mode shown in it (the tray, ⌘K, a note begun) is asked to be
  // seen, so Code mode is left for it, the view following the frame, as a step Back walks. Heard
  // from an effect's callback (a note begun) as well, where the place is read untracked.
  onCleanup(
    useLabPage().onModeShown(() => {
      if (untrack(live)) actions.showCode(Option.some(FOLLOW));
    }),
  );
  // The line the view is held on, as a note cites it: of the code read, once it is.
  const heldSite = () =>
    Option.flatMap(Option.all({ c: code(), line: held() }), ({ c, line }) =>
      Option.map(lineSite(c, line), (source) => ({ scene: c.scene, source })),
    );
  const value: SourceContextValue = {
    scene,
    code,
    state,
    retry: () => retrying(),
    open: lab.code,
    held,
    placing,
    following,
    live,
    suspend: () => void place.ask().answer(() => setSuspended(true)),
    askPlace: () => place.ask(),
    resume: () => setSuspended(false),
    handHas: () => askHand(),
    offerHand: (ask) => {
      askHand = ask;
      return () => {
        if (askHand === ask) askHand = () => false;
      };
    },
    whereCue,
    whereKnob,
    heldSite,
  };
  return (
    <SourceContext value={value}>
      <Show when={wanted()}>
        <Reader
          scene={scene}
          reads={reads}
          into={setState}
          offer={(retry) => {
            retrying = retry;
          }}
        />
      </Show>
      {props.children}
    </SourceContext>
  );
};
