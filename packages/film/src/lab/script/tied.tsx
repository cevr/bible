// How the Script shows a beat's cues tied to its words (`ties.ts`): each
// `{mark}` of a line a small chip before the word it stands before, each
// name in backticks in a picture's brief a link to the cue or the mark it
// names, and, under the line of the beat something is selected in, the cues
// tied to it, each where it starts and ends in the beat and what its span
// says, a link that selects it. Every one is a link to its own place on the
// Script (`?mark=`, `?cue=`), so it can be opened apart; a plain click picks
// it in the page instead, which shows it (the frame seeks to where it is) and
// lights the words it lands on.

import { For, Show } from '@solidjs/web';
import { Option } from 'effect';
import type { ParentProps } from 'solid-js';
import { plainClick } from '../../browser/pointer.ts';
import { pageHref } from '../../core/api.ts';
import { pressed } from '../pressed.ts';
import { useLab } from '../shell.tsx';
import { useScript } from './context.tsx';
import { Brief, briefOf, tieTimes } from './ties.ts';

/** A link's plain click, picked in the page by `pick`; any other (a new tab, a download) is the link's own. */
export const picking = (pick: () => void) => (e: MouseEvent) => {
  if (!plainClick(e)) return;
  e.preventDefault();
  pick();
};

/** What a mark or a cue of a beat is called by: its beat and its name. */
interface Named {
  readonly beat: string;
  readonly name: string;
}

/** Whether mark `of` is the one selected. */
const useMarkCurrent = () => {
  const script = useScript();
  return (of: Named) =>
    Option.exists(script.mark(), (m) => m.scene === of.beat && m.name === of.name);
};

/** Mark `name` of beat `beat`: a chip before the word it stands before, current while it is selected. */
export const MarkChip = (props: Named) => {
  const { meta } = useLab();
  const script = useScript();
  const current = useMarkCurrent();
  return (
    <a
      class="lab-script-mark"
      href={pageHref.scriptBeat(meta.name, props.beat, { mark: props.name })}
      data-mark={props.name}
      aria-label={`mark ${props.name}`}
      aria-current={pressed(current(props))}
      onClick={picking(() => script.selectMark(props.beat, props.name))}
    >
      {props.name}
    </a>
  );
};

/** A name in a picture's brief, a link to its place that `pick` picks in the page. */
const Ref = (
  props: ParentProps<{
    readonly href: string;
    readonly current: boolean;
    readonly pick: () => void;
  }>,
) => (
  <a
    class="lab-script-ref"
    href={props.href}
    aria-current={pressed(props.current)}
    onClick={picking(() => props.pick())}
  >
    {props.children}
  </a>
);

/** Cue `name` of beat `beat`, named in its picture's brief. */
const CueRef = (props: Named) => {
  const { meta, state } = useLab();
  const script = useScript();
  return (
    <Ref
      href={pageHref.scriptBeat(meta.name, props.beat, { cue: props.name })}
      current={Option.exists(
        state.selection(),
        (s) => s.scene === props.beat && s.name === props.name,
      )}
      pick={() => script.selectCue(props.beat, props.name)}
    >
      {props.name}
    </Ref>
  );
};

/** Mark `name` of beat `beat`, named in its picture's brief. */
const MarkRef = (props: Named) => {
  const { meta } = useLab();
  const script = useScript();
  const current = useMarkCurrent();
  return (
    <Ref
      href={pageHref.scriptBeat(meta.name, props.beat, { mark: props.name })}
      current={current(props)}
      pick={() => script.selectMark(props.beat, props.name)}
    >
      {props.name}
    </Ref>
  );
};

/** Beat `beat`'s picture brief, each name in backticks that is one of its cues or marks a link to it. */
export const Picture = (props: {
  readonly beat: string;
  readonly text: string;
  readonly cues: ReadonlyArray<string>;
  readonly marks: Readonly<Record<string, number>>;
}) => (
  <p class="lab-script-picture">
    <For each={briefOf(props.text, props.cues, props.marks)}>
      {(piece) =>
        Brief.$match(piece, {
          Text: ({ text }) => text,
          Cue: ({ name }) => <CueRef beat={props.beat} name={name} />,
          Mark: ({ name }) => <MarkRef beat={props.beat} name={name} />,
          Code: ({ text }) => <code class="lab-script-code">{text}</code>,
        })
      }
    </For>
  </p>
);

/**
 * Under beat `beat`'s line while something of it is selected: what is
 * selected, the page's verbs on it (`children`: Note… on words), Clear, and
 * the cues tied to it (each where it starts and ends in the beat and what
 * its span says, a link that picks it).
 */
export const Ties = (props: ParentProps<{ readonly beat: string }>) => {
  const { meta } = useLab();
  const script = useScript();
  return (
    <Show when={Option.getOrUndefined(Option.filter(script.tied(), (t) => t.beat === props.beat))}>
      {(tied) => (
        <section class="lab-script-ties" aria-label="Cues tied to the selection">
          <header class="lab-script-ties-head">
            <span class="lab-script-ties-what lab-clamp">{tied().what}</span>
            {props.children}
            <button
              type="button"
              class="sh-btn"
              data-act="clear-script"
              title="Select nothing"
              onClick={() => script.clear()}
            >
              Clear
            </button>
          </header>
          <Show
            when={tied().ties.length > 0}
            fallback={<p class="lab-script-ties-none">No cue is tied here.</p>}
          >
            <ul class="lab-script-ties-list">
              <For each={tied().ties}>
                {(tie) => (
                  <li>
                    <a
                      class="lab-script-tie"
                      href={pageHref.scriptBeat(meta.name, tied().beat, { cue: tie.cue })}
                      data-cue={tie.cue}
                      aria-current={pressed(Option.contains(tied().cue, tie.cue))}
                      onClick={picking(() => script.selectCue(tied().beat, tie.cue))}
                    >
                      <span class="lab-script-tie-name">{tie.cue}</span>
                      <span class="lab-script-tie-at">{tieTimes(tie)}</span>
                      <span class="lab-script-tie-said lab-clamp">{tie.said}</span>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      )}
    </Show>
  );
};
