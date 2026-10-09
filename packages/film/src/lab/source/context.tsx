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
  useContext,
} from 'solid-js';
import type { NoteSource, SceneCode } from '../../core/schema.ts';
import { LabApi, reasonOf } from '../api.ts';
import { useEditor } from '../editor/context.tsx';
import { SourceKnown } from '../editor/grip.ts';
import { useLab } from '../shell.tsx';
import { lineOf, lineSite, lineStarts } from './lit.ts';
import { sourceCommands } from './commands.ts';
import { type CodeOpen } from './open.ts';

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
  /** Whether the view scrolls with the frame: it is open to follow and no hand has scrolled it since. */
  readonly following: Accessor<boolean>;
  /** A hand scrolled the view: it stops following until `resume`. */
  readonly suspend: () => void;
  /** Follow the frame again. */
  readonly resume: () => void;
  /** The file and line that write cue `name` of `scene`: from the code read, else from the small source answer. */
  readonly whereCue: (scene: string, name: string) => Option.Option<Where>;
  /** The file and line that write knob `name`, likewise. */
  readonly whereKnob: (scene: string, name: string) => Option.Option<Where>;
  /** The line that writes cue `name` in `scene`'s file, if known. */
  readonly lineOfCue: (scene: string, name: string) => Option.Option<number>;
  /** The line that writes knob `name`, likewise. */
  readonly lineOfKnob: (scene: string, name: string) => Option.Option<number>;
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

  const [suspended, setSuspended] = createSignal(false, { ownedWrite: true });
  createEffect(wanted, (open) => {
    if (!open) setSuspended(false);
  });
  const following = () => Option.exists(lab.code(), (o) => o._tag === 'Follow') && !suspended();

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
              line: lineOf(lineStarts(c.text), s.at[0]),
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
  const lineOfKnob = (at: string, name: string) => Option.map(whereKnob(at, name), (w) => w.line);
  onCleanup(
    meta.hub.commands.register(
      ...sourceCommands({
        open: () => Option.isSome(lab.code()),
        show: (to) => actions.showCode(Option.some(to)),
        hide: actions.dismissCode,
        lineOfCue,
      }),
    ),
  );
  // The line the view is held on, as a note cites it: of the code read, once it is.
  const cited = createMemo(() =>
    Option.flatMap(Option.all({ c: code(), o: lab.code() }), ({ c, o }) =>
      Option.map(
        Option.filter(
          Option.some(o),
          (x): x is Extract<CodeOpen, { _tag: 'Line' }> => x._tag === 'Line',
        ),
        (held) => ({ scene: c.scene, line: held.line, code: c }),
      ),
    ),
  );
  const heldSite = () =>
    Option.flatMap(cited(), ({ scene: of, line, code: c }) =>
      Option.map(lineSite(c, line), (source) => ({ scene: of, source })),
    );
  const value: SourceContextValue = {
    scene,
    code,
    state,
    retry: () => retrying(),
    open: lab.code,
    following,
    suspend: () => setSuspended(true),
    resume: () => setSuspended(false),
    whereCue,
    whereKnob,
    lineOfCue,
    lineOfKnob,
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
