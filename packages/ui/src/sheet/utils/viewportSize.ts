// Upstream: react-aria 3.53.1, packages/react-aria/src/utils/useViewportSize.ts.
// Copyright 2020 Adobe, Apache-2.0 (`../LICENSE`); ported to Solid 2 and changed:
// the size is unknown (`undefined`) until the browser measures it, rather than
// 0 × 0 on the server; iOS's early resize on an input's blur (which waits on
// React Aria's keyboard tracking) is left out, so the size follows the visual
// viewport's own resize when the keyboard closes.
//
// The visual viewport's size, without the scrollbar and unaffected by pinch
// zoom: its height shrinks while a software keyboard covers the page.
import { isServer } from '@solidjs/web';
import { type Accessor, createSignal, onSettled } from 'solid-js';

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

function measure(): ViewportSize {
  const visual = window.visualViewport;
  const html = document.documentElement;
  return visual
    ? {
        // The visual viewport may include the scrollbar gutter: the narrower of the two excludes it.
        width: Math.min(visual.width * visual.scale, html.clientWidth),
        height: visual.height * visual.scale,
      }
    : { width: html.clientWidth, height: html.clientHeight };
}

/**
 * The visual viewport's size, followed while the owner lives: `undefined`
 * until the browser has mounted the owner (so a hydrated page starts as the
 * server rendered it), and on the server.
 */
export function useViewportSize(): Accessor<ViewportSize | undefined> {
  const [size, setSize] = createSignal<ViewportSize | undefined>(undefined, {
    ownedWrite: true,
    equals: (a, b) => a?.width === b?.width && a?.height === b?.height,
  });
  if (isServer) {
    return size;
  }
  const visual = window.visualViewport;
  const target: EventTarget = visual ?? window;
  const onResize = () => {
    // A pinch-zoomed page keeps the size it had.
    if (visual && visual.scale > 1) {
      return;
    }
    setSize(measure());
  };
  onSettled(() => {
    setSize(measure());
    target.addEventListener('resize', onResize);
    return () => target.removeEventListener('resize', onResize);
  });
  return size;
}
