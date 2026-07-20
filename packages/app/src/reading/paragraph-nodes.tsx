import type { Node } from '@bible/core/egw';
import { For, Match, Switch } from '@solidjs/web';

export interface ParagraphNodesProps {
  readonly nodes: readonly Node[];
  readonly onReference?: (input: {
    readonly kind: 'scripture' | 'writings';
    readonly target: string;
    readonly label: string;
  }) => void;
}

export const ParagraphNodes = (props: ParagraphNodesProps) => (
  <For each={props.nodes}>
    {(node) => (
      <Switch>
        <Match when={node._tag === 'Text'}>
          {() => {
            if (node._tag !== 'Text') return null;
            return node.text;
          }}
        </Match>
        <Match when={node._tag === 'LineBreak'}>
          <br />
        </Match>
        <Match when={node._tag === 'PageBreak'}>
          {() => {
            if (node._tag !== 'PageBreak') return null;
            return (
              <span class="bible-page-break" aria-label={`Page ${String(node.page)}`}>
                {node.page}
              </span>
            );
          }}
        </Match>
        <Match when={node._tag === 'Emphasis'}>
          {() => {
            if (node._tag !== 'Emphasis') return null;
            return (
              <em>
                <ParagraphNodes nodes={node.children} onReference={props.onReference} />
              </em>
            );
          }}
        </Match>
        <Match when={node._tag === 'Comment'}>
          {() => {
            if (node._tag !== 'Comment') return null;
            return (
              <span class="bible-editorial-note">
                <ParagraphNodes nodes={node.children} onReference={props.onReference} />
              </span>
            );
          }}
        </Match>
        <Match when={node._tag === 'ScriptureRef'}>
          {() => {
            if (node._tag !== 'ScriptureRef') return null;
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
                <ParagraphNodes nodes={node.children} onReference={props.onReference} />
              </button>
            );
          }}
        </Match>
        <Match when={node._tag === 'BookRef'}>
          {() => {
            if (node._tag !== 'BookRef') return null;
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
                <ParagraphNodes nodes={node.children} onReference={props.onReference} />
              </button>
            );
          }}
        </Match>
        <Match when={node._tag === 'Unknown'}>
          {() => {
            if (node._tag !== 'Unknown') return null;
            return (
              <span data-source-tag={node.tag}>
                <ParagraphNodes nodes={node.children} onReference={props.onReference} />
              </span>
            );
          }}
        </Match>
      </Switch>
    )}
  </For>
);
