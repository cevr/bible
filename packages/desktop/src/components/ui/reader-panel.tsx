import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  type JSX,
  onCleanup,
  Show,
} from 'solid-js';
import { defaultEase, Motion, Presence } from '../../motion/index.js';

// Shared in-shell side panel. Replaces the older modal `Drawer` for the
// reader-side surfaces (left book/library nav, right scripture/commentary).
//
// Geometry: anchored absolutely to the left or right edge of its nearest
// `position: relative` ancestor (the app's reader canvas), so it sits *inside*
// the reading area instead of covering the whole viewport. Animates between
// two width presets — `widthPx` (collapsed, e.g. 360) and `expandedWidthPx`
// (e.g. 720) — driven by the `expanded` prop. No drag handle: the only width
// states are those two presets, switched by a button elsewhere in the UI.
//
// A11y wins it keeps from the old modal Drawer:
//   • Esc to close
//   • Focus trap (Tab / Shift-Tab cycle inside)
//   • Focus restored to whatever owned focus when the panel opened
//   • Body scroll lock while open
//   • `inert` on sibling subtrees so AT skips the background
//   • aria-modal + aria-labelledby wired automatically
//
// Both sides use the same component to stay true mirrors of each other —
// chrome, animation, focus model, and dismissal semantics match by
// construction instead of by copy-paste.

export type PanelSide = 'left' | 'right';

export interface ReaderPanelProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Which edge the panel slides in from. */
  readonly side: PanelSide;
  /** Collapsed-mode width in px. */
  readonly widthPx: number;
  /** Expanded-mode width in px. Used when `expanded` is true. Defaults to
   *  `widthPx` if omitted (i.e. no expand state for this panel). */
  readonly expandedWidthPx?: number;
  /** Whether the panel is in its wider "expanded" form (e.g. study pane
   *  visible). Drives the animated width swap. */
  readonly expanded?: boolean;
  /** Accessible name for the dialog. */
  readonly label: string;
  /** Esc closes. Set to false for panels that must be dismissed by an action. */
  readonly dismissOnEscape?: boolean;
  /** Optional click-catcher overlay behind the panel. Off by default — these
   *  in-shell panels are non-modal and don't dim the canvas. */
  readonly overlay?: boolean;
  /** Optional ref to the panel element. */
  readonly panelRef?: (el: HTMLElement) => void;
  readonly children?: JSX.Element;
  /** Extra classes on the panel for app-level styling. */
  readonly panelClass?: string;
}

export const ReaderPanel: Component<ReaderPanelProps> = (props) => {
  const labelId = createUniqueId();
  const dismissOnEscape = (): boolean => props.dismissOnEscape !== false;
  const overlay = (): boolean => props.overlay === true;

  // Active width follows the expanded flag. Memoized so width-only changes
  // don't re-trigger the slide-in animation.
  const currentWidth = createMemo<number>(() =>
    props.expanded === true && props.expandedWidthPx !== undefined
      ? props.expandedWidthPx
      : props.widthPx,
  );

  // Slide offset for the open/close animation. Signed by side; snapshot
  // separately from the width memo so a width change mid-life doesn't yank
  // the slide.
  const offset = createMemo(() => (props.side === 'right' ? currentWidth() : -currentWidth()));

  return (
    <>
      <Presence>
        <Show when={props.open && overlay()}>
          <Motion.div
            class="absolute inset-0 z-30 bg-[color-mix(in_srgb,#000_18%,transparent)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: defaultEase }}
            onClick={() => props.onOpenChange(false)}
            aria-hidden="true"
          />
        </Show>
      </Presence>

      <Presence>
        <Show when={props.open}>
          <ReaderPanelInner
            labelId={labelId}
            label={props.label}
            side={props.side}
            widthPx={currentWidth}
            open={() => props.open}
            offset={offset()}
            dismissOnEscape={dismissOnEscape()}
            onClose={() => props.onOpenChange(false)}
            panelClass={props.panelClass}
            panelRef={props.panelRef}
          >
            {props.children}
          </ReaderPanelInner>
        </Show>
      </Presence>
    </>
  );
};

interface InnerProps {
  readonly labelId: string;
  readonly label: string;
  readonly side: PanelSide;
  readonly widthPx: () => number;
  /** Live `open` flag from the parent. Used to freeze width + ignore content
   *  pointerdowns once the close has been requested. */
  readonly open: () => boolean;
  readonly offset: number;
  readonly dismissOnEscape: boolean;
  readonly onClose: () => void;
  readonly panelClass?: string;
  readonly panelRef?: (el: HTMLElement) => void;
  readonly children?: JSX.Element;
}

const ReaderPanelInner: Component<InnerProps> = (props) => {
  let panelEl: HTMLElement | undefined;
  let returnFocusEl: HTMLElement | null = null;

  // Side anchor classes. Tailwind doesn't accept arbitrary expressions in the
  // `[right-0]` slot so we branch fixed pairs.
  const sideClass = props.side === 'right' ? 'right-0' : 'left-0';
  const borderClass = props.side === 'right' ? 'border-l' : 'border-r';
  const shadowClass =
    props.side === 'right'
      ? 'shadow-[-12px_0_40px_color-mix(in_srgb,#000_18%,transparent)]'
      : 'shadow-[12px_0_40px_color-mix(in_srgb,#000_18%,transparent)]';

  // Freeze the width at the moment `open` flips false so the exit animation
  // slides out at the size the user was just looking at. Without this, the
  // parent often collapses `expanded` in the same tick (e.g. a `tocPlusLib`
  // → `closed` transition both closes the panel *and* drops `expanded`), and
  // the inner content reflows from 720px → 360px while it's sliding away.
  const [frozenWidth, setFrozenWidth] = createSignal<number | null>(null);
  createEffect(() => {
    if (props.open()) {
      // Stay reactive while open — width changes between 360/720 still animate
      // via the CSS transition on the panel.
      setFrozenWidth(null);
      return;
    }
    // First time we see open=false during this inner's lifetime: snapshot the
    // last known width and stop tracking. Inner unmounts after the exit
    // animation completes; the snapshot only needs to survive ~0.22s.
    setFrozenWidth((curr) => curr ?? props.widthPx());
  });
  const effectiveWidth = createMemo(() => frozenWidth() ?? props.widthPx());

  return (
    <Motion.aside
      class={`absolute top-0 ${sideClass} bottom-0 z-40 flex flex-col bg-bg ${borderClass} border-rule ${shadowClass} w-[var(--panel-w)] max-w-full transition-[width] duration-[0.24s] [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] ${props.panelClass ?? ''}`}
      style={{ '--panel-w': `${String(effectiveWidth())}px` }}
      initial={{ x: props.offset }}
      animate={{ x: 0 }}
      exit={{ x: props.offset }}
      transition={{ duration: 0.22, ease: defaultEase }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={props.labelId}
      tabindex={-1}
      ref={(el) => {
        panelEl = el;
        props.panelRef?.(el);
        const active = document.activeElement;
        returnFocusEl = active instanceof HTMLElement ? active : null;
        requestAnimationFrame(() => {
          focusFirstTabbable(el);
        });
      }}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Escape' && props.dismissOnEscape) {
          e.preventDefault();
          e.stopPropagation();
          props.onClose();
          return;
        }
        if (e.key === 'Tab' && panelEl) {
          trapTab(e, panelEl);
        }
      }}
    >
      <span id={props.labelId} class="sr-only">
        {props.label}
      </span>
      {props.children}
      <PanelEffects
        panelEl={() => panelEl}
        returnFocusEl={() => returnFocusEl}
        open={props.open}
        onClose={props.onClose}
      />
    </Motion.aside>
  );
};

interface EffectsProps {
  readonly panelEl: () => HTMLElement | undefined;
  readonly returnFocusEl: () => HTMLElement | null;
  readonly open: () => boolean;
  readonly onClose: () => void;
}

// Side-effects (body scroll lock, sibling `inert`, focus restoration,
// click-outside-to-close). Lives in a child so it gets a fresh scope per open
// instead of firing on every measure pass.
const PanelEffects: Component<EffectsProps> = (props) => {
  createEffect(() => {
    const panel = props.panelEl();
    if (!panel) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const inerted: HTMLElement[] = [];
    document.body.childNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.contains(panel)) return;
      if (node.hasAttribute('inert')) return;
      node.setAttribute('inert', '');
      inerted.push(node);
    });

    // Dismiss on click outside the panel. pointerdown (not click) so the
    // close fires before any in-flight click handlers on the outside target —
    // matches Radix/headlessui semantics. Capture phase so we beat handlers
    // that stopPropagation. Skip if the parent has already requested close
    // (open === false): we're mid-exit, the click should land on whatever's
    // underneath instead of re-firing onClose.
    const onPointerDown = (e: PointerEvent): void => {
      if (!props.open()) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panel.contains(target)) return;
      props.onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);

    onCleanup(() => {
      document.body.style.overflow = prevOverflow;
      for (const el of inerted) el.removeAttribute('inert');
      document.removeEventListener('pointerdown', onPointerDown, true);
      const target = props.returnFocusEl();
      if (target && document.body.contains(target)) {
        target.focus({ preventScroll: true });
      }
    });
  });

  return null;
};

/* ---------- focus helpers ---------- */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const focusableElements = (root: HTMLElement): HTMLElement[] => {
  const els = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const out: HTMLElement[] = [];
  els.forEach((el) => {
    if (el.offsetParent !== null || el === document.activeElement) out.push(el);
  });
  return out;
};

const focusFirstTabbable = (root: HTMLElement): void => {
  const list = focusableElements(root);
  if (list.length > 0) {
    list[0]?.focus({ preventScroll: true });
  } else {
    root.focus({ preventScroll: true });
  }
};

const trapTab = (e: KeyboardEvent, root: HTMLElement): void => {
  const list = focusableElements(root);
  if (list.length === 0) {
    e.preventDefault();
    root.focus({ preventScroll: true });
    return;
  }
  const first = list[0];
  const last = list[list.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (e.shiftKey) {
    if (active === first || !root.contains(active)) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    }
  } else {
    if (active === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  }
};
