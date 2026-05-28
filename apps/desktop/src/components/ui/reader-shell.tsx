import { type Accessor, type Component, type JSX, type ParentComponent, Show } from 'solid-js';
import { ReaderPanel } from './reader-panel.js';

// Shared visual chrome for the right-side study drawer. Pulled out so the
// drawer renders with consistent spacing, border treatment, button affordances,
// and tab strip metrics. Consumers wire their own state machines and content;
// the shell only owns layout.

// ─── Frame ─────────────────────────────────────────────────────────────────
// Thin wrapper over `ReaderPanel` that fixes the slide side + label + width
// plumbing. Children compose the rest (header / body / split / tabs).
//
// Width model: two presets — `widthPx` (collapsed) and `expandedWidthPx`
// (when `expanded` is true). No resize handle; both presets are fixed.

interface FrameProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly label: string;
  readonly side?: 'left' | 'right';
  readonly widthPx: Accessor<number>;
  /** Optional expanded width preset (e.g. 720) used when `expanded` is true. */
  readonly expandedWidthPx?: number;
  /** Drives the animated swap between `widthPx` and `expandedWidthPx`. */
  readonly expanded?: boolean;
  /** Render a dimmed click-catcher backdrop behind the panel. Off by default. */
  readonly overlay?: boolean;
  readonly children?: JSX.Element;
}

const Frame: Component<FrameProps> = (props) => (
  <ReaderPanel
    open={props.open}
    onOpenChange={props.onOpenChange}
    side={props.side ?? 'right'}
    widthPx={props.widthPx()}
    expandedWidthPx={props.expandedWidthPx}
    expanded={props.expanded}
    overlay={props.overlay}
    label={props.label}
  >
    {props.children}
  </ReaderPanel>
);

// ─── Header ────────────────────────────────────────────────────────────────
// Top bar: flex row with consistent padding + bottom border. Children plug
// in icon buttons + a title. `flex-[0_0_auto]` keeps the header from
// collapsing when the body scrolls.

const Header: ParentComponent = (props) => (
  <header class="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-rule flex-[0_0_auto]">
    {props.children}
  </header>
);

const HeaderTitle: Component<{ readonly children: JSX.Element; readonly title?: string }> = (
  props,
) => (
  <div class="flex-1 min-w-0 text-ui-base font-medium text-fg truncate" title={props.title}>
    {props.children}
  </div>
);

const HeaderBadge: ParentComponent = (props) => (
  <span class="text-ui-xs text-muted [font-variant-numeric:tabular-nums]">{props.children}</span>
);

interface HeaderIconButtonProps {
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly pressed?: boolean;
  readonly ariaLabel: string;
  readonly title?: string;
  readonly children: JSX.Element;
}

const HeaderIconButton: Component<HeaderIconButtonProps> = (props) => (
  <button
    type="button"
    class="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-rule/30 hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent data-[on=true]:bg-accent-soft data-[on=true]:text-accent"
    onClick={props.onClick}
    disabled={props.disabled}
    aria-pressed={props.pressed}
    data-on={props.pressed === true ? 'true' : undefined}
    aria-label={props.ariaLabel}
    title={props.title ?? props.ariaLabel}
  >
    {props.children}
  </button>
);

// ─── Body ──────────────────────────────────────────────────────────────────
// Scrolling region under the header. The default flex-1 + min-h-0 keeps it
// honest inside a column-flex Drawer panel. `padded` lets consumers opt out
// (BibleDrawer's split mode does its own padding per pane).

interface BodyProps {
  readonly children?: JSX.Element;
  readonly padded?: boolean;
}

const Body: Component<BodyProps> = (props) => {
  const padded = (): boolean => props.padded !== false;
  return (
    <div class="flex-1 min-h-0 overflow-y-auto" classList={{ 'px-5 py-4': padded() }}>
      {props.children}
    </div>
  );
};

// ─── SplitBody ─────────────────────────────────────────────────────────────
// Two-column body: primary pane on the left (always shown), aside on the
// right (Show'd by the consumer). The divider is a right-border on the left
// pane so the right pane can grow/shrink without leaving a gap line. Each
// pane is independently scrollable.

interface SplitBodyProps {
  readonly primary: JSX.Element;
  readonly aside?: JSX.Element;
  /** Whether the aside is mounted. Drives the divider on the left pane. */
  readonly asideOpen: boolean;
}

const SplitBody: Component<SplitBodyProps> = (props) => (
  <div class="flex-1 min-h-0 flex">
    <div
      class="flex-1 min-h-0 min-w-0 overflow-y-auto px-5 py-4"
      classList={{ 'border-r border-rule': props.asideOpen }}
    >
      {props.primary}
    </div>
    <Show when={props.asideOpen}>
      <div class="flex-1 min-h-0 min-w-0 flex flex-col">{props.aside}</div>
    </Show>
  </div>
);

// ─── Tabs ──────────────────────────────────────────────────────────────────
// Underlined tab strip + scrolling tab panel. Matches the existing BibleDrawer
// study-pane chrome exactly so the refactor is a no-visual-diff swap.

const TabsList: ParentComponent = (props) => (
  <div class="flex items-center gap-0 px-4 pt-3 pb-0 border-b border-rule" role="tablist">
    {props.children}
  </div>
);

interface TabProps {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: JSX.Element;
}

const Tab: Component<TabProps> = (props) => (
  <button
    type="button"
    role="tab"
    aria-selected={props.active}
    data-on={props.active ? 'true' : undefined}
    class="flex h-7 items-center px-2.5 text-ui-sm font-medium text-muted hover:text-fg border-b-2 border-transparent -mb-px data-[on=true]:border-accent data-[on=true]:text-fg"
    onClick={props.onClick}
  >
    {props.children}
  </button>
);

const TabPanel: ParentComponent = (props) => (
  <div class="flex-1 min-h-0 overflow-y-auto px-5 py-4">{props.children}</div>
);

// ─── EmptyState ────────────────────────────────────────────────────────────
// Compact title + sub copy used by empty study tabs / commentary drawer's
// no-verse placeholder. Action slot lets recovery affordances (Reimport KJV)
// share the same vertical rhythm.

interface EmptyStateProps {
  readonly title: string;
  readonly body: JSX.Element;
  readonly action?: JSX.Element;
}

const EmptyState: Component<EmptyStateProps> = (props) => (
  <div class="flex flex-col gap-1">
    <p class="text-ui-sm font-medium text-fg">{props.title}</p>
    <p class="text-ui-sm text-muted m-0">{props.body}</p>
    <Show when={props.action}>{(a) => <div class="mt-3">{a()}</div>}</Show>
  </div>
);

// ─── Compound export ───────────────────────────────────────────────────────

export const ReaderShell = {
  Frame,
  Header,
  HeaderTitle,
  HeaderBadge,
  HeaderIconButton,
  Body,
  SplitBody,
  TabsList,
  Tab,
  TabPanel,
  EmptyState,
};
