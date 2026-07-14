import { type Component, For, type JSX, Match, Show, Switch } from 'solid-js';

import { defaultEase, Motion, Presence } from '../../motion/index.js';
import type { PaletteView, Row } from './model.js';

export const PaletteModal: Component<{
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onOverlayKeyCapture: (e: KeyboardEvent) => void;
  readonly children: JSX.Element;
}> = (props) => (
  <Presence>
    <Show when={props.open}>
      <Motion.div
        class="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12, ease: defaultEase }}
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
        onKeyDown={props.onOverlayKeyCapture}
      >
        <Motion.div
          class="w-full max-w-[560px] overflow-hidden rounded-xl border border-rule bg-bg shadow-2xl"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.14, ease: defaultEase }}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          {props.children}
        </Motion.div>
      </Motion.div>
    </Show>
  </Presence>
);

export const PaletteInput: Component<{
  readonly value: string;
  readonly onInput: (next: string) => void;
  readonly onKeyDown: (e: KeyboardEvent) => void;
  readonly inputRef: (el: HTMLInputElement) => void;
}> = (props) => (
  <input
    ref={props.inputRef}
    type="text"
    class="w-full bg-transparent px-4 py-3 text-ui-base text-fg outline-none placeholder:text-muted"
    placeholder="Type a reference (e.g. john 3:16) or filter…"
    value={props.value}
    onInput={(e) => props.onInput(e.currentTarget.value)}
    onKeyDown={props.onKeyDown}
    autocomplete="off"
    spellcheck={false}
  />
);

export const PaletteList: Component<{
  readonly listRef: (el: HTMLDivElement) => void;
  readonly rows: readonly Row[];
  readonly activeIdx: number;
  readonly onActivate: (row: Row) => void;
  readonly onHover: (idx: number) => void;
}> = (props) => (
  <div ref={props.listRef} class="max-h-[50vh] overflow-y-auto border-t border-rule" role="listbox">
    <Show
      when={props.rows.length > 0}
      fallback={
        <p class="px-4 py-6 text-center text-ui-sm text-muted">
          No matches. Try a reference like "gen 1:1".
        </p>
      }
    >
      <For each={props.rows}>
        {(row, idx) => (
          <RowView
            row={row}
            active={idx() === props.activeIdx}
            idx={idx()}
            onClick={() => props.onActivate(row)}
            onHover={() => props.onHover(idx())}
          />
        )}
      </For>
    </Show>
  </div>
);

const RowView: Component<{
  readonly row: Row;
  readonly active: boolean;
  readonly idx: number;
  readonly onClick: () => void;
  readonly onHover: () => void;
}> = (props) => (
  <button
    type="button"
    class="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-ui-sm text-fg data-[active=true]:bg-accent-soft data-[active=true]:text-accent"
    data-active={props.active ? 'true' : undefined}
    data-row-idx={String(props.idx)}
    onClick={props.onClick}
    onMouseMove={props.onHover}
  >
    <span class="flex min-w-0 items-center gap-3">
      <RowIcon row={props.row} />
      <span class="truncate">{props.row.label}</span>
    </span>
    <Switch>
      <Match when={props.row.kind === 'parsed' && props.row}>
        {(r) => <span class="shrink-0 text-ui-xs text-muted">{r().hint}</span>}
      </Match>
    </Switch>
  </button>
);

const RowIcon: Component<{ readonly row: Row }> = (props) => (
  <span
    class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-ui-xs uppercase text-muted"
    aria-hidden="true"
  >
    <Switch>
      <Match when={props.row.kind === 'book'}>B</Match>
      <Match when={props.row.kind === 'chapter'}>C</Match>
      <Match when={props.row.kind === 'verse'}>V</Match>
      <Match when={props.row.kind === 'parsed'}>↵</Match>
    </Switch>
  </span>
);

export const PaletteFooter: Component<{ readonly view: PaletteView }> = (props) => (
  <div class="flex items-center justify-between gap-3 border-t border-rule bg-bg-soft px-4 py-2 text-ui-xs text-muted">
    <span>
      <Switch>
        <Match when={props.view._tag === 'root'}>All books</Match>
        <Match when={props.view._tag === 'book'}>Chapters</Match>
        <Match when={props.view._tag === 'chapter'}>Verses</Match>
      </Switch>
    </span>
    <span class="flex items-center gap-3">
      <Kbd>↑↓</Kbd>
      <Kbd>Enter</Kbd>
      <Kbd>Esc</Kbd>
    </span>
  </div>
);

const Kbd: Component<{ readonly children: string }> = (props) => (
  <kbd class="rounded border border-rule px-1.5 py-0.5 font-mono text-[10px] text-muted">
    {props.children}
  </kbd>
);
