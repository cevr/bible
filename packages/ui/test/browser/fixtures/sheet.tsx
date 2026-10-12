// Fixtures for the sheet. Every sheet is opened as a page opens one: its
// owner holds `open`, a plain button sets it, and the sheet's own opens and
// closes reach the owner through `onOpenChange`. URL params for `sheet`:
// `position` (`bottom` by default, `top`, `left`, `right`, `center`, or
// `breakpoint` for the lab's: bottom under 900px wide, right from there, the
// panel styled by the window's width and the sheet told of it a task later),
// `swipe` (a `swipeDirection` other than the position's), `modal=false`,
// `dismissal=disabled` (an outside press never closes it), `prevent=true`
// (`preventDismissal`), `snap` (comma-separated snap points, `150` or `50%`),
// `portal=inline` (in place, not moved to the body), `owner=cancel` for an
// owner that cancels every close, `initial=first|false` for an `initialFocus`
// that returns the first button or `false`, `body=tall` for a content body
// that scrolls (120px tall over 600px of content, as the phone inspector's
// body does), `timeline=none` for a browser without scroll-driven animations
// (Firefox today), `overscroll=true` for the panel's `overscrollPadding`,
// `range=true` for swipe animations limited to the first snap point (the
// panel's up to it, the backdrop's from it). `async-owner` is the lab's shape: an `open` that stays
// true, under a page that drops the sheet later (100 ms, or `drop` ms). `stack` opens a second
// sheet from inside the first. The sheet stands in `#section`, which a test
// hides with `display: none` as the lab hides a mode's section.
//
// On the 800x600 page the bottom and top sheets are 300px tall and full width
// (the bottom one's top edge at y=300), the side sheets 300px wide (the right
// one's left edge at x=500), the centred one 300px square. The panel and
// backdrop run `@keyframes` along the swipe, and the panel a stack animation,
// none of which moves a box, so a test reads where the scroll put it.
// The sheet's first button is 100px tall.
import type { JSX } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';

import { Sheet } from '../../../src/sheet/index.ts';
import type { SheetPosition, SheetSwipeDirection } from '../../../src/sheet/utils/swipe.ts';
import { log, param } from './log.ts';

if (param('timeline') === 'none') {
  // A browser without scroll-driven animations: `animation-timeline: view()` is unsupported.
  const supports = CSS.supports.bind(CSS);
  CSS.supports = ((...args: [string] | [string, string]) =>
    (args.length === 1 ? args[0] : `${args[0]}: ${args[1]}`).includes('animation-timeline')
      ? false
      : supports(...(args as [string]))) as typeof CSS.supports;
}

const STYLES = `
  .backdrop { background: rgb(0 0 0 / 0.3); }
  .panel { background: #ddd; }
  .panel[data-position="bottom"], .panel[data-position="top"] { width: 100%; height: 300px; }
  .panel[data-position="left"], .panel[data-position="right"] { width: 300px; height: 100%; }
  .panel[data-position="center"] { width: 300px; height: 300px; }
  @media (max-width: 899px) { .panel.by-width { width: 100%; height: 300px; } }
  @media (min-width: 900px) { .panel.by-width { width: 300px; height: 100%; } }
  .content { display: flex; flex-direction: column; box-sizing: border-box; }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes rise { from { opacity: 0.5; } to { opacity: 1; } }
  @keyframes recede { to { filter: brightness(0.9); } }
`;

const POSITIONS: ReadonlySet<string> = new Set(['bottom', 'top', 'left', 'right', 'center']);
const DIRECTIONS: ReadonlySet<string> = new Set([
  'bottom',
  'top',
  'left',
  'right',
  'vertical',
  'horizontal',
]);

/** The `position` param's, or the lab's: `bottom` on a page under 900px wide, `right` from there. */
function positionParam(): () => SheetPosition {
  const value = param('position') ?? 'bottom';
  if (value === 'breakpoint') {
    const narrow = window.matchMedia('(max-width: 899px)');
    const [position, setPosition] = createSignal<SheetPosition>(
      narrow.matches ? 'bottom' : 'right',
    );
    // Told a task later, as the lab's window is (an Effect stream): the page's styles have
    // changed with the window by then, and a frame may have been drawn.
    narrow.addEventListener('change', () =>
      setTimeout(() => setPosition(narrow.matches ? 'bottom' : 'right')),
    );
    return position;
  }
  const fixed = (POSITIONS.has(value) ? value : 'bottom') as SheetPosition;
  return () => fixed;
}

function swipeParam(): SheetSwipeDirection | undefined {
  const value = param('swipe');
  return value && DIRECTIONS.has(value) ? (value as SheetSwipeDirection) : undefined;
}

function snapParam(): Array<number | string> | undefined {
  const value = param('snap');
  return value
    ? value.split(',').map((point) => (/^\d+$/.test(point) ? Number(point) : point))
    : undefined;
}

/** An owner's open state and the plain button that opens it. */
function ownerOpen(id: string) {
  const [open, setOpen] = createSignal(false);
  const Opener = (props: { children: JSX.Element }) => (
    <button type="button" id={id} onClick={() => setOpen(true)}>
      {props.children}
    </button>
  );
  return { open, setOpen, Opener };
}

/** The second sheet `stack` opens from inside the first. */
function InnerSheet(): JSX.Element {
  const owner = ownerOpen('open-inner');
  return (
    <>
      <owner.Opener>Open inner</owner.Opener>
      <Sheet.Root
        open={owner.open()}
        onOpenChange={(open, details) => {
          log(`inner ${open} ${details.reason}`);
          owner.setOpen(open);
        }}
      >
        <Sheet.Portal>
          <Sheet.Overlay id="inner-overlay">
            <Sheet.Backdrop id="inner-backdrop" class="backdrop" />
            <Sheet.Popup id="inner-panel" class="panel" swipeAnimation="rise">
              <Sheet.Content id="inner-popup" class="content">
                <Sheet.Title id="inner-title">Inner sheet</Sheet.Title>
                <Sheet.Close id="inner-close">Close inner</Sheet.Close>
              </Sheet.Content>
            </Sheet.Popup>
          </Sheet.Overlay>
        </Sheet.Portal>
      </Sheet.Root>
    </>
  );
}

function BasicSheet(): JSX.Element {
  const owner = ownerOpen('open');
  let first: HTMLElement | undefined;
  const initial = param('initial');
  const initialFocus =
    initial === 'first' ? () => first ?? true : initial === 'false' ? () => false : undefined;
  const position = positionParam();
  return (
    <div>
      <style>{STYLES}</style>
      <button type="button" id="outside">
        outside
      </button>
      <owner.Opener>Open</owner.Opener>
      {/* What holds the sheet: hidden with `display: none`, an inline sheet is hidden with it. */}
      <div id="section">
        <Sheet.Root
          open={owner.open()}
          position={position()}
          swipeDirection={swipeParam()}
          snapPoints={snapParam()}
          modal={param('modal') !== 'false'}
          disablePointerDismissal={param('dismissal') === 'disabled'}
          preventDismissal={param('prevent') === 'true'}
          onOpenChange={(open, details) => {
            log(`open ${open} ${details.reason}`);
            if (!open && param('owner') === 'cancel') {
              details.cancel();
              return;
            }
            owner.setOpen(open);
          }}
          onOpenChangeComplete={(open) => log(`complete ${open}`)}
        >
          <Sheet.Portal inline={param('portal') === 'inline'}>
            <Sheet.Overlay id="overlay">
              <Sheet.Backdrop
                id="backdrop"
                class="backdrop"
                swipeAnimation="fade"
                swipeAnimationRange={param('range') === 'true' ? { start: 0 } : undefined}
              />
              <Sheet.Popup
                id="panel"
                class={param('position') === 'breakpoint' ? 'panel by-width' : 'panel'}
                swipeAnimation="rise"
                swipeAnimationRange={param('range') === 'true' ? { end: 0 } : undefined}
                stackAnimation="recede"
                overscrollPadding={param('overscroll') === 'true'}
              >
                <Sheet.Content id="popup" class="content" initialFocus={initialFocus}>
                  <Sheet.Title id="title">Sheet</Sheet.Title>
                  <Show
                    when={param('body') === 'tall'}
                    fallback={<div id="body">Selectable text</div>}
                  >
                    <div id="body" style={{ height: '120px', 'overflow-y': 'auto' }}>
                      <div style={{ height: '600px' }}>Selectable text</div>
                    </div>
                  </Show>
                  <button
                    type="button"
                    id="first"
                    ref={(el) => (first = el)}
                    style={{ height: '100px' }}
                  >
                    first
                  </button>
                  <Show when={param('stack') === 'true'}>
                    <InnerSheet />
                  </Show>
                  <Sheet.Close id="close">Close</Sheet.Close>
                </Sheet.Content>
              </Sheet.Popup>
            </Sheet.Overlay>
          </Sheet.Portal>
        </Sheet.Root>
      </div>
    </div>
  );
}

/**
 * The lab's phone sheet: the sheet's `open` is always true and the page
 * shows or drops the whole sheet. A close request reaches the page, which
 * drops it a little later (as a `history.back()` lands on `popstate`).
 */
function AsyncOwnerSheet(): JSX.Element {
  const [shown, setShown] = createSignal(false);
  return (
    <div>
      <style>{STYLES}</style>
      <button type="button" id="open" onClick={() => setShown(true)}>
        Open
      </button>
      <Show when={shown()}>
        <Sheet.Root
          open
          modal={false}
          disablePointerDismissal
          onOpenChange={(open, details) => {
            log(`open ${open} ${details.reason}`);
            if (!open) {
              setTimeout(() => setShown(false), Number(param('drop') ?? 100));
            }
          }}
        >
          <Sheet.Portal inline>
            <Sheet.Overlay id="overlay">
              <Sheet.Popup id="panel" class="panel">
                <Sheet.Content id="popup" class="content">
                  <Sheet.Title id="title">Sheet</Sheet.Title>
                </Sheet.Content>
              </Sheet.Popup>
            </Sheet.Overlay>
          </Sheet.Portal>
        </Sheet.Root>
      </Show>
    </div>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  sheet: BasicSheet,
  'async-owner': AsyncOwnerSheet,
};
