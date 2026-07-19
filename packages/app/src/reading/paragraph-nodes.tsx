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
        <Match when={node._tag === 'Text' ? node : undefined}>{(text) => text().text}</Match>
        <Match when={node._tag === 'LineBreak'}>
          <br />
        </Match>
        <Match when={node._tag === 'PageBreak' ? node : undefined}>
          {(pageBreak) => (
            <span class="bible-page-break" aria-label={`Page ${String(pageBreak().page)}`}>
              {pageBreak().page}
            </span>
          )}
        </Match>
        <Match when={node._tag === 'Emphasis' ? node : undefined}>
          {(emphasis) => (
            <em>
              <ParagraphNodes nodes={emphasis().children} onReference={props.onReference} />
            </em>
          )}
        </Match>
        <Match when={node._tag === 'Comment' ? node : undefined}>
          {(comment) => (
            <span class="bible-editorial-note">
              <ParagraphNodes nodes={comment().children} onReference={props.onReference} />
            </span>
          )}
        </Match>
        <Match when={node._tag === 'ScriptureRef' ? node : undefined}>
          {(reference) => (
            <button
              type="button"
              class="bible-inline-reference"
              onClick={() =>
                props.onReference?.({
                  kind: 'scripture',
                  target: reference().dataLink,
                  label: reference().title,
                })
              }
            >
              <ParagraphNodes nodes={reference().children} onReference={props.onReference} />
            </button>
          )}
        </Match>
        <Match when={node._tag === 'BookRef' ? node : undefined}>
          {(reference) => (
            <button
              type="button"
              class="bible-inline-reference"
              onClick={() =>
                props.onReference?.({
                  kind: 'writings',
                  target: reference().dataLink,
                  label: reference().title,
                })
              }
            >
              <ParagraphNodes nodes={reference().children} onReference={props.onReference} />
            </button>
          )}
        </Match>
        <Match when={node._tag === 'Unknown' ? node : undefined}>
          {(unknown) => (
            <span data-source-tag={unknown().tag}>
              <ParagraphNodes nodes={unknown().children} onReference={props.onReference} />
            </span>
          )}
        </Match>
      </Switch>
    )}
  </For>
);
