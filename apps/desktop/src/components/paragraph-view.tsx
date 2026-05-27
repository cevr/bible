import { type Component, For, Match, Switch } from 'solid-js';
import { type Node } from '@bible/core/egw';

// Pure render of a ParagraphAst Node[] into Solid JSX. No data fetching, no
// navigation — links carry their `dataLink` as data attributes so a parent
// component can attach a delegated click handler if it wants to wire navigation.
// Keeping this dumb is the point: the same component renders cached and live
// content identically, and tests can mount it without an Effect runtime.

export interface ParagraphViewProps {
  readonly nodes: readonly Node[];
  /** Optional click delegate. Called with the link's dataLink, kind, and
   *  human-readable title when a ScriptureRef/BookRef is clicked. The title
   *  is what callers parse (e.g. "Genesis 3:1") — dataLink is EGW's internal
   *  "bookId.paraId" form, unsuitable for the Bible drawer. */
  readonly onLinkClick?: (dataLink: string, kind: 'scripture' | 'book', title: string) => void;
}

export const ParagraphView: Component<ParagraphViewProps> = (props) => (
  <NodeList nodes={props.nodes} onLinkClick={props.onLinkClick} />
);

interface NodeListProps {
  readonly nodes: readonly Node[];
  readonly onLinkClick?: (dataLink: string, kind: 'scripture' | 'book', title: string) => void;
}

const NodeList: Component<NodeListProps> = (props) => (
  <For each={props.nodes}>
    {(node) => <RenderNode node={node} onLinkClick={props.onLinkClick} />}
  </For>
);

interface RenderNodeProps {
  readonly node: Node;
  readonly onLinkClick?: (dataLink: string, kind: 'scripture' | 'book', title: string) => void;
}

const RenderNode: Component<RenderNodeProps> = (props) => (
  <Switch>
    <Match when={props.node._tag === 'Text' ? props.node : null}>{(n) => <>{n().text}</>}</Match>
    <Match when={props.node._tag === 'LineBreak'}>
      <br />
    </Match>
    <Match when={props.node._tag === 'PageBreak' ? props.node : null}>
      {(n) => (
        <sup
          class="page-break mx-0.5 text-[0.7em] text-muted opacity-70 align-super select-none"
          aria-label={`page ${n().page}`}
          title={`page ${n().page}`}
        >
          [{n().page}]
        </sup>
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
          class="cursor-pointer text-fg underline decoration-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] decoration-1 underline-offset-2 transition-[color,text-decoration-color,background] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:text-accent hover:decoration-accent hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:text-accent focus-visible:decoration-accent focus-visible:outline-none"
          href="#"
          title={n().title}
          data-link={n().dataLink}
          data-link-kind="scripture"
          onClick={(e) => {
            e.preventDefault();
            props.onLinkClick?.(n().dataLink, 'scripture', n().title);
          }}
        >
          <NodeList nodes={n().children} onLinkClick={props.onLinkClick} />
        </a>
      )}
    </Match>
    <Match when={props.node._tag === 'BookRef' ? props.node : null}>
      {(n) => (
        <a
          class="cursor-pointer text-fg underline decoration-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] decoration-1 underline-offset-2 transition-[color,text-decoration-color,background] duration-[0.12s] ease-in-out hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] hover:text-accent hover:decoration-accent hover:outline-none focus-visible:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:text-accent focus-visible:decoration-accent focus-visible:outline-none"
          href="#"
          title={n().title}
          data-link={n().dataLink}
          data-link-kind="book"
          onClick={(e) => {
            e.preventDefault();
            props.onLinkClick?.(n().dataLink, 'book', n().title);
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
