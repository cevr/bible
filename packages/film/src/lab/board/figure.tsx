// A Board panel as a page shows it (an ask's Board block): its thumb (its
// try's image, or what a card or a verse says), the words said while it
// holds, its mark, and its tries, the one kept and its open notes.

import { type JSX, Show } from '@solidjs/web';
import { Boolean as Bool, Option, Predicate } from 'effect';
import type { ParentProps } from 'solid-js';
import type { Panel as BoardPanel } from '../../core/board.ts';
import { counted } from '../../core/words.ts';

/** A card's or a verse's words, as the engine sets them. */
type PanelText = NonNullable<BoardPanel['text']>;

/** What a card's or a verse's thumb says. */
const thumbSaid = (t: PanelText): string => {
  if (t._tag === 'Card') return `card · “${t.payoff}”`;
  return `verse · ${t.ref}`;
};

/** How many tries a panel has, said: `1 try`, `2 tries`. */
const triesSaid = (n: number): string =>
  Bool.match(n === 1, { onTrue: () => '1 try', onFalse: () => `${n} tries` });

/** What a panel shows as its thumb: its try's image (`src`, the board file's URL), or what a card or a verse says. */
export const PanelThumb = (props: {
  readonly panel: BoardPanel;
  readonly src: Option.Option<string>;
}) => (
  <Show
    when={props.panel.text}
    fallback={
      <Show
        when={Option.getOrUndefined(props.src)}
        fallback={<span class="lab-board-thumb lab-board-thumb-empty">no try yet</span>}
      >
        {(src) => (
          <img class="lab-board-thumb" src={src()} alt="" loading="lazy" width="160" height="90" />
        )}
      </Show>
    }
  >
    {(text) => (
      <span class="lab-board-thumb lab-board-thumb-card" data-kind={text()._tag}>
        {thumbSaid(text())}
      </span>
    )}
  </Show>
);

/** A panel's tries and the one kept, and its open notes when it has some: the line under its thumb. */
const PanelSaid = (props: { readonly panel: BoardPanel; readonly notes: number }) => (
  <span class="lab-board-panel-meta">
    <Show when={!props.panel.text}>
      <span>{triesSaid(props.panel.tries.length)}</span>
    </Show>
    <Show when={Predicate.isNotUndefined(props.panel.kept)}>
      <span class="sh-badge" data-state="approved">
        try {props.panel.kept} kept
      </span>
    </Show>
    <Show when={props.notes > 0}>
      <span class="sh-badge" data-state="note">
        {counted(props.notes, 'note')}
      </span>
    </Show>
  </span>
);

/**
 * A panel as a page shows it: its thumb (`thumb`, the page's own: a still
 * that opens large in an ask), the words said while it holds, its mark
 * (with what the page adds beside it, `children`), and its tries, the one
 * kept and its open notes.
 */
export const PanelFigure = (
  props: ParentProps<{
    readonly panel: BoardPanel;
    readonly thumb: JSX.Element;
    readonly words: string;
    readonly notes: number;
  }>,
) => (
  <>
    {props.thumb}
    <Show when={props.words !== ''}>
      <span class="lab-board-panel-words">{props.words}</span>
    </Show>
    <span class="lab-board-panel-label">
      <span class="lab-board-panel-at">{props.panel.at}</span>
      {props.children}
    </span>
    <PanelSaid panel={props.panel} notes={props.notes} />
  </>
);

/**
 * A panel as a page shows it (`PanelFigure`): a card's thumb is its words in
 * a padded box the width of the panel, its padding inside that width.
 */
export const PANEL_THUMB_CSS = `
.lab-board-thumb { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 100%;
  height: auto; aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--r-1); background: var(--surface-3);
  outline: 1px solid var(--line); outline-offset: -1px; }
.lab-board-thumb-empty, .lab-board-thumb-card { padding: var(--s-2); color: var(--text-3); font-size: var(--fs-2);
  line-height: var(--lh-2); text-align: center; }
/* A card or a verse: the engine sets it in the film's card style, so its thumb is the words, not a picture. */
.lab-board-thumb-card { background: var(--surface-1); color: var(--text-1); font-weight: var(--w-2); }
.lab-board-panel-meta { display: flex; flex-wrap: wrap; gap: var(--s-1); font-size: var(--fs-1); line-height: var(--lh-1);
  color: var(--text-3); }
/* A panel's words: what the narrator says while it holds, from its mark to the next panel's. */
.lab-board-panel-words { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: clip;
  color: var(--text-1); font-size: var(--fs-2); line-height: var(--lh-2); }
.lab-board-panel-label { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2);
  font-size: var(--fs-1); line-height: var(--lh-1); }
.lab-board-panel-at { color: var(--text-1); font-weight: var(--w-2); }
`;
