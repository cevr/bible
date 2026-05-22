import {
  createEffect,
  createMemo,
  createUniqueId,
  onCleanup,
  Show,
  type Component,
  type JSX,
} from 'solid-js';
import { defaultEase, Motion, Presence } from '../../motion/index.js';

// Headless slide-in drawer with the a11y wins we kept rewriting by hand:
//
//  • Esc to close
//  • Click outside to close
//  • Focus trapped while open (Tab / Shift-Tab cycle inside)
//  • Focus restored to whatever owned focus when the drawer opened
//  • Body scroll locked (no scroll-leak behind the modal)
//  • `inert` + aria-hidden on siblings so AT skips the background
//  • aria-modal + aria-labelledby wired automatically
//
// The drawer renders into its caller's tree (no Portal). Solid's portal isn't
// required here — the click-catcher is `position:fixed` at z-40 and the panel
// at z-50, so as long as the consumer mounts it at app-shell level it sits on
// top of everything. Avoids the SSR/hydration complications a portal adds.

export type DrawerSide = 'left' | 'right';

export interface DrawerResize {
  /** Called with the proposed new width as the user drags. Caller is expected
   *  to clamp + persist. */
  readonly onResize: (px: number) => void;
  /** Min/max bounds rendered as the handle's aria range, and used to halt
   *  the drag cursor at sensible extremes. */
  readonly minPx: number;
  readonly maxPx: number;
}

export interface DrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Which edge to slide from. Defaults to `right`. */
  readonly side?: DrawerSide;
  /** Width on `sm+` screens. Below 640px we fall back to full-width.
   *  Accepts a function so callers can drive resizing without re-instantiating
   *  the drawer. */
  readonly widthPx?: number | (() => number);
  /** Accessible name for the dialog. */
  readonly label: string;
  /** Esc closes. Set to false for drawers that must be dismissed by an action. */
  readonly dismissOnEscape?: boolean;
  /** Click-on-overlay closes. Same opt-out as Esc. */
  readonly dismissOnOverlayClick?: boolean;
  /** Optional ref to the panel element (e.g. for measuring). */
  readonly panelRef?: (el: HTMLElement) => void;
  readonly children?: JSX.Element;
  /** Extra classes on the panel for app-level styling. */
  readonly panelClass?: string;
  /** When set, renders a drag handle on the panel's inner edge. The caller
   *  owns the width state — `widthPx` must be a function and `resize.onResize`
   *  must persist the new value back. */
  readonly resize?: DrawerResize;
}

const DEFAULT_WIDTH = 420;

export const Drawer: Component<DrawerProps> = (props) => {
  const labelId = createUniqueId();
  const side = (): DrawerSide => props.side ?? 'right';
  const widthPx = (): number => {
    const w = props.widthPx;
    if (w === undefined) return DEFAULT_WIDTH;
    return typeof w === 'function' ? w() : w;
  };
  const dismissOnEscape = (): boolean => props.dismissOnEscape !== false;
  const dismissOnOverlayClick = (): boolean => props.dismissOnOverlayClick !== false;

  // Translation distance for the slide animation, signed by side. We snapshot
  // on open (Motion's `initial`/`exit` aren't reactive after first run), so
  // a width change mid-drag won't yank the animation midway.
  const offset = createMemo(() => (side() === 'right' ? widthPx() : -widthPx()));

  return (
    <>
      <Presence>
        <Show when={props.open}>
          <Motion.div
            class="fixed inset-0 z-40 bg-[color-mix(in_srgb,#000_18%,transparent)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: defaultEase }}
            onClick={() => {
              if (dismissOnOverlayClick()) props.onOpenChange(false);
            }}
            aria-hidden="true"
          />
        </Show>
      </Presence>

      <Presence>
        <Show when={props.open}>
          <DrawerPanel
            labelId={labelId}
            label={props.label}
            side={side()}
            widthPx={widthPx}
            offset={offset()}
            dismissOnEscape={dismissOnEscape()}
            onClose={() => props.onOpenChange(false)}
            panelClass={props.panelClass}
            panelRef={props.panelRef}
            resize={props.resize}
          >
            {props.children}
          </DrawerPanel>
        </Show>
      </Presence>
    </>
  );
};

interface DrawerPanelProps {
  readonly labelId: string;
  readonly label: string;
  readonly side: DrawerSide;
  readonly widthPx: () => number;
  readonly offset: number;
  readonly dismissOnEscape: boolean;
  readonly onClose: () => void;
  readonly panelClass?: string;
  readonly panelRef?: (el: HTMLElement) => void;
  readonly resize?: DrawerResize;
  readonly children?: JSX.Element;
}

const DrawerPanel: Component<DrawerPanelProps> = (props) => {
  let panelEl: HTMLElement | undefined;
  // Remember who owned focus before we opened so we can restore on close.
  let returnFocusEl: HTMLElement | null = null;

  // Side anchor classes. Tailwind doesn't accept arbitrary expressions in the
  // `[right-0]` slot so we branch a fixed pair instead.
  const sideClass = props.side === 'right' ? 'right-0' : 'left-0';
  const borderClass = props.side === 'right' ? 'border-l' : 'border-r';
  const shadowClass =
    props.side === 'right'
      ? 'shadow-[-12px_0_40px_color-mix(in_srgb,#000_18%,transparent)]'
      : 'shadow-[12px_0_40px_color-mix(in_srgb,#000_18%,transparent)]';

  return (
    <Motion.aside
      class={`fixed top-0 ${sideClass} bottom-0 z-50 flex flex-col bg-bg ${borderClass} border-rule ${shadowClass} w-full sm:w-[var(--drawer-w)] max-w-full sm:transition-[width] sm:duration-[0.24s] sm:[transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)] ${props.panelClass ?? ''}`}
      style={{ '--drawer-w': `${String(props.widthPx())}px` }}
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
        // Capture the return-focus target BEFORE shifting focus into the panel.
        const active = document.activeElement;
        returnFocusEl = active instanceof HTMLElement ? active : null;
        // Defer focus + side-effects one frame so the slide-in animation runs
        // (focus snaps invalidate transitions if applied synchronously) and
        // children have a chance to mount before we hunt for tabbables.
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
      {/* Visually-hidden accessible name so AT announces "<label> dialog"
          even when the header chrome is later restructured. */}
      <span id={props.labelId} class="sr-only">
        {props.label}
      </span>
      <Show when={props.resize}>
        {(resize) => (
          <ResizeHandle
            side={props.side}
            widthPx={props.widthPx}
            min={resize().minPx}
            max={resize().maxPx}
            onResize={resize().onResize}
          />
        )}
      </Show>
      {props.children}
      <PanelEffects panelEl={() => panelEl} returnFocusEl={() => returnFocusEl} />
    </Motion.aside>
  );
};

interface PanelEffectsProps {
  readonly panelEl: () => HTMLElement | undefined;
  readonly returnFocusEl: () => HTMLElement | null;
}

// Side-effects (body scroll lock, sibling `inert`, focus restoration) live in
// a child component so they get a fresh scope per open. createEffect/onCleanup
// inside the Motion.aside `ref` callback would fire on every measure pass.
const PanelEffects: Component<PanelEffectsProps> = (props) => {
  createEffect(() => {
    const panel = props.panelEl();
    if (!panel) return;

    // Body scroll lock. Preserve the prior value so nested drawers don't
    // clobber each other (we restore on cleanup either way).
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // `inert` on the entire app shell except us. Easier and safer than
    // hand-managing aria-hidden on siblings — the browser blocks focus/
    // pointer/AT for inert subtrees automatically. Walk up to <body> and
    // mark every direct child that isn't an ancestor of the panel.
    const inerted: HTMLElement[] = [];
    document.body.childNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.contains(panel)) return;
      if (node.hasAttribute('inert')) return;
      node.setAttribute('inert', '');
      inerted.push(node);
    });

    onCleanup(() => {
      document.body.style.overflow = prevOverflow;
      for (const el of inerted) el.removeAttribute('inert');
      // Restore focus to whatever owned it before open. Skip if that node is
      // gone (DOM moved during the open lifecycle) — browser will default to
      // <body> which is fine.
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
    // Nothing to focus — fall back to the panel itself (tabindex=-1) so the
    // user has a sensible focus root and Esc/Tab handlers fire.
    root.focus({ preventScroll: true });
  }
};

interface ResizeHandleProps {
  readonly side: DrawerSide;
  readonly widthPx: () => number;
  readonly min: number;
  readonly max: number;
  readonly onResize: (px: number) => void;
}

const clampNum = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

const ResizeHandle: Component<ResizeHandleProps> = (props) => {
  // For a right-side drawer the handle sits at the panel's left edge; dragging
  // left grows the drawer, dragging right shrinks it. Mirror for a left
  // drawer. Pointer capture keeps the drag alive even if the cursor leaves
  // the 4px hit area mid-drag.
  const edgeClass = props.side === 'right' ? 'left-0 -ml-px' : 'right-0 -mr-px';

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize drawer"
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      aria-valuenow={props.widthPx()}
      tabindex={0}
      class={`absolute top-0 bottom-0 ${edgeClass} z-10 w-1 cursor-col-resize select-none hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none`}
      onPointerDown={(e) => {
        e.preventDefault();
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const startW = props.widthPx();
        const move = (ev: PointerEvent): void => {
          // Right-drawer: leftward (dx<0) increases width.
          const dx = ev.clientX - startX;
          const next = props.side === 'right' ? startW - dx : startW + dx;
          props.onResize(clampNum(next, props.min, props.max));
        };
        const up = (ev: PointerEvent): void => {
          if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId);
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerup', up);
          target.removeEventListener('pointercancel', up);
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
      }}
      onKeyDown={(e) => {
        // 8px per step, 32px with shift. Arrow direction depends on side so
        // "←" always shrinks and "→" always grows from the user's POV.
        const step = e.shiftKey ? 32 : 8;
        const grow = props.side === 'right' ? 'ArrowLeft' : 'ArrowRight';
        const shrink = props.side === 'right' ? 'ArrowRight' : 'ArrowLeft';
        if (e.key === grow) {
          e.preventDefault();
          props.onResize(clampNum(props.widthPx() + step, props.min, props.max));
        } else if (e.key === shrink) {
          e.preventDefault();
          props.onResize(clampNum(props.widthPx() - step, props.min, props.max));
        }
      }}
    />
  );
};

const trapTab = (e: KeyboardEvent, root: HTMLElement): void => {
  const list = focusableElements(root);
  if (list.length === 0) {
    // Nothing to cycle through — pin focus on the panel so Tab doesn't escape.
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
