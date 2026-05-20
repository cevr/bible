import { type Component, For, Match, Switch } from 'solid-js';
import { type Node } from '../services/paragraph-ast.js';

// Pure render of a ParagraphAst Node[] into Solid JSX. No data fetching, no
// navigation — links carry their `dataLink` as data attributes so a parent
// component can attach a delegated click handler if it wants to wire navigation.
// Keeping this dumb is the point: the same component renders cached and live
// content identically, and tests can mount it without an Effect runtime.

export interface ParagraphViewProps {
  readonly nodes: readonly Node[];
  /** Optional click delegate. Called with the link's dataLink + kind when a
   *  ScriptureRef/BookRef is clicked. If omitted, links are inert. */
  readonly onLinkClick?: (dataLink: string, kind: 'scripture' | 'book') => void;
}

export const ParagraphView: Component<ParagraphViewProps> = (props) => (
  <NodeList nodes={props.nodes} onLinkClick={props.onLinkClick} />
);

interface NodeListProps {
  readonly nodes: readonly Node[];
  readonly onLinkClick?: (dataLink: string, kind: 'scripture' | 'book') => void;
}

const NodeList: Component<NodeListProps> = (props) => (
  <For each={props.nodes}>
    {(node) => <RenderNode node={node} onLinkClick={props.onLinkClick} />}
  </For>
);

interface RenderNodeProps {
  readonly node: Node;
  readonly onLinkClick?: (dataLink: string, kind: 'scripture' | 'book') => void;
}

const RenderNode: Component<RenderNodeProps> = (props) => (
  <Switch>
    <Match when={props.node._tag === 'Text' ? props.node : null}>{(n) => <>{n().text}</>}</Match>
    <Match when={props.node._tag === 'LineBreak'}>
      <br />
    </Match>
    <Match when={props.node._tag === 'PageBreak' ? props.node : null}>
      {(n) => (
        <span class="page-break" aria-label={`page ${n().page}`} title={`page ${n().page}`}>
          {n().page}
        </span>
      )}
    </Match>
    <Match when={props.node._tag === 'Emphasis' ? props.node : null}>
      {(n) => (
        <em>
          <NodeList nodes={n().children} onLinkClick={props.onLinkClick} />
        </em>
      )}
    </Match>
    <Match when={props.node._tag === 'Comment' ? props.node : null}>
      {(n) => (
        <span class="non-egw-comment">
          <NodeList nodes={n().children} onLinkClick={props.onLinkClick} />
        </span>
      )}
    </Match>
    <Match when={props.node._tag === 'ScriptureRef' ? props.node : null}>
      {(n) => (
        <a
          class="egwlink egwlink-bible"
          href="#"
          title={n().title}
          data-link={n().dataLink}
          onClick={(e) => {
            e.preventDefault();
            props.onLinkClick?.(n().dataLink, 'scripture');
          }}
        >
          <NodeList nodes={n().children} onLinkClick={props.onLinkClick} />
        </a>
      )}
    </Match>
    <Match when={props.node._tag === 'BookRef' ? props.node : null}>
      {(n) => (
        <a
          class="egwlink egwlink-book"
          href="#"
          title={n().title}
          data-link={n().dataLink}
          onClick={(e) => {
            e.preventDefault();
            props.onLinkClick?.(n().dataLink, 'book');
          }}
        >
          <NodeList nodes={n().children} onLinkClick={props.onLinkClick} />
        </a>
      )}
    </Match>
    <Match when={props.node._tag === 'Unknown' ? props.node : null}>
      {(n) => (
        // Best-effort fallback: keep children visible so text isn't lost; the
        // wrapper carries the original tag/class for debug-time inspection.
        <span class="ast-unknown" data-tag={n().tag} data-class={n().className}>
          <NodeList nodes={n().children} onLinkClick={props.onLinkClick} />
        </span>
      )}
    </Match>
  </Switch>
);
