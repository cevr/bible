// The Source view's provider: the scene whose code the lab shows (the
// selection's scene, else the one under the playhead), that scene's code as
// the server reads it now (`GET …/scenes/<scene>/code`, read when the view is
// open or something is selected, and not before), and the view's commands.
// The view, the inspector's `file:line` and the commands read this context;
// none holds the code of its own.

import { useAtomValue } from '@bible/atom-solid';
import { Show } from '@solidjs/web';
import { Option } from 'effect';
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
import { LabApi } from '../api.ts';
import { useLab } from '../shell.tsx';
import { lineOf, lineSite, lineStarts } from './lit.ts';
import { sourceCommands } from './commands.ts';
import { type CodeOpen } from './open.ts';

interface SourceContextValue {
  /** The scene whose code is shown: the selection's, else the one under the playhead. */
  readonly scene: Accessor<string>;
  /** That scene's code once the server has answered; none until then, and none for a scene it cannot read. */
  readonly code: Accessor<Option.Option<SceneCode>>;
  /** The view as the URL holds it. */
  readonly open: Accessor<Option.Option<CodeOpen>>;
  /** The line that writes cue `name` in the code read, if it is the code of `scene`. */
  readonly lineOfCue: (scene: string, name: string) => Option.Option<number>;
  /** The line that writes knob `name`, likewise. */
  readonly lineOfKnob: (scene: string, name: string) => Option.Option<number>;
  /** The line the view is held on, as a note cites it, with the scene whose file it is: none while it follows or is shut. */
  readonly heldSite: () => Option.Option<{ readonly scene: string; readonly source: NoteSource }>;
}

const SourceContext = createContext<SourceContextValue>();

/** The Source view's context: only inside `<Source.Provider>`. */
export const useSource = (): SourceContextValue => useContext(SourceContext);

/** Reads the code of the scene shown while it is mounted, into `into`. */
const Reader = (props: {
  readonly scene: Accessor<string>;
  readonly reads: (scene: string) => Atom.Atom<AsyncResult.AsyncResult<SceneCode, unknown>>;
  readonly into: (code: Option.Option<SceneCode>) => void;
}) => {
  const result = useAtomValue(() => props.reads(props.scene()));
  createEffect(
    () => AsyncResult.value(result()),
    (code) => {
      props.into(code);
    },
  );
  onCleanup(() => props.into(Option.none()));
  return <></>;
};

export const Provider = (props: ParentProps) => {
  const { state: lab, actions, meta } = useLab();
  const reads = Atom.family((scene: string) =>
    meta.runtime.atom(LabApi.use((api) => api.code(scene))),
  );
  const scene = createMemo(() =>
    Option.match(lab.selection(), { onNone: lab.scene, onSome: (s) => s.scene }),
  );
  const [code, setCode] = createSignal(Option.none<SceneCode>(), { ownedWrite: true });
  // Read when something is selected (its `file:line`) or the view is open: a lab at rest reads nothing.
  const wanted = () => Option.isSome(lab.selection()) || Option.isSome(lab.code());
  const lineOfSite = (site: 'cues' | 'knobs') => (at: string, name: string) =>
    Option.flatMap(
      Option.filter(code(), (c) => c.scene === at),
      (c) =>
        Option.map(Option.fromUndefinedOr(c[site].find((s) => s.name === name)), (s) =>
          lineOf(lineStarts(c.text), s.at[0]),
        ),
    );
  const lineOfCue = lineOfSite('cues');
  const lineOfKnob = lineOfSite('knobs');
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
    open: lab.code,
    lineOfCue,
    lineOfKnob,
    heldSite,
  };
  return (
    <SourceContext value={value}>
      <Show when={wanted()}>
        <Reader scene={scene} reads={reads} into={setCode} />
      </Show>
      {props.children}
    </SourceContext>
  );
};
