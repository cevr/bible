import type { Node } from '@bible/core/egw';
import { For, Match, Switch } from '@solidjs/web';
import { Option } from 'effect';

import { HotText } from './hot-text.js';
import { EMPTY_PARAGRAPH_PLAN, nodeSpans, type ParagraphPlan } from './match-plan.js';
import type { Peeked, PhraseOccurrenceId } from './peek-state.js';

export interface ParagraphNodesProps {
  readonly nodes: readonly Node[];
  readonly onReference?: (input: {
    readonly kind: 'scripture' | 'writings';
    readonly target: string;
    readonly label: string;
  }) => void;
  /** The wiki phrase overlay for this paragraph (§4.6), as the page's match plan
   *  decided it: the `Text` nodes the matcher entered and each one's spans,
   *  already numbered with their occurrence ids.
   *
   *  A **plan**, never a matcher. Solid compiles a dynamic JSX prop into a
   *  getter, so this prop is read once per consuming expression and more than
   *  once per render; a matcher call here would consume §4.5's per-phrase
   *  section slot on the first read and hand back empty spans on every read
   *  after it. See `match-plan.ts`.
   *
   *  `None` on a surface with no overlay — a `ScriptureRef`'s children, or a
   *  host with no dictionary — in which case every `Text` node renders as the
   *  plain string it always did. */
  readonly phrases: Option.Option<ParagraphOverlay>;
}

/** The overlay, as this renderer consumes it: the paragraph's plan, plus what
 *  the peek state is and where a tap goes. */
export interface ParagraphOverlay {
  readonly plan: ParagraphPlan;
  readonly peeked: Option.Option<PhraseOccurrenceId>;
  readonly onPhrase: (tapped: Peeked) => void;
}

const planOf = (overlay: Option.Option<ParagraphOverlay>): ParagraphPlan =>
  Option.match(overlay, {
    onNone: () => EMPTY_PARAGRAPH_PLAN,
    onSome: (value) => value.plan,
  });

const peekedOf = (overlay: Option.Option<ParagraphOverlay>): Option.Option<PhraseOccurrenceId> =>
  Option.flatMap(overlay, (value) => value.peeked);

const noTap = (): void => {};

const tapOf = (overlay: Option.Option<ParagraphOverlay>): ((tapped: Peeked) => void) =>
  Option.match(overlay, {
    onNone: (): ((tapped: Peeked) => void) => noTap,
    onSome: (value) => value.onPhrase,
  });

export const ParagraphNodes = (props: ParagraphNodesProps) => (
  <For each={props.nodes}>
    {(node) => (
      <Switch>
        <Match when={node._tag === 'Text'}>
          {() => {
            if (node._tag !== 'Text') return <></>;
            return (
              <HotText
                text={node.text}
                spans={nodeSpans(planOf(props.phrases), node)}
                peeked={peekedOf(props.phrases)}
                onPhrase={tapOf(props.phrases)}
              />
            );
          }}
        </Match>
        <Match when={node._tag === 'LineBreak'}>
          <br />
        </Match>
        <Match when={node._tag === 'PageBreak'}>
          {() => {
            if (node._tag !== 'PageBreak') return <></>;
            return (
              <span class="bible-page-break" aria-label={`Page ${String(node.page)}`}>
                {node.page}
              </span>
            );
          }}
        </Match>
        <Match when={node._tag === 'Emphasis'}>
          {() => {
            if (node._tag !== 'Emphasis') return <></>;
            return (
              <em>
                <ParagraphNodes
                  nodes={node.children}
                  onReference={props.onReference}
                  phrases={props.phrases}
                />
              </em>
            );
          }}
        </Match>
        <Match when={node._tag === 'Comment'}>
          {() => {
            if (node._tag !== 'Comment') return <></>;
            return (
              <span class="bible-editorial-note">
                <ParagraphNodes
                  nodes={node.children}
                  onReference={props.onReference}
                  phrases={props.phrases}
                />
              </span>
            );
          }}
        </Match>
        <Match when={node._tag === 'ScriptureRef'}>
          {() => {
            if (node._tag !== 'ScriptureRef') return <></>;
            // No `phrases` passed down: §4.6 keeps the phrase layer out of a
            // `ScriptureRef` entirely, and `matchNodes` already refused to
            // descend into one — so there are no spans to hand it, and omitting
            // the prop makes that structural rather than incidental.
            return (
              <button
                type="button"
                class="bible-inline-reference"
                onClick={() =>
                  props.onReference?.({
                    kind: 'scripture',
                    target: node.dataLink,
                    label: node.title,
                  })
                }
              >
                <ParagraphNodes
                  nodes={node.children}
                  onReference={props.onReference}
                  phrases={Option.none()}
                />
              </button>
            );
          }}
        </Match>
        <Match when={node._tag === 'BookRef'}>
          {() => {
            if (node._tag !== 'BookRef') return <></>;
            return (
              <button
                type="button"
                class="bible-inline-reference"
                onClick={() =>
                  props.onReference?.({
                    kind: 'writings',
                    target: node.dataLink,
                    label: node.title,
                  })
                }
              >
                <ParagraphNodes
                  nodes={node.children}
                  onReference={props.onReference}
                  phrases={Option.none()}
                />
              </button>
            );
          }}
        </Match>
        <Match when={node._tag === 'Unknown'}>
          {() => {
            if (node._tag !== 'Unknown') return <></>;
            return (
              <span data-source-tag={node.tag}>
                <ParagraphNodes
                  nodes={node.children}
                  onReference={props.onReference}
                  phrases={props.phrases}
                />
              </span>
            );
          }}
        </Match>
      </Switch>
    )}
  </For>
);
