// Upstream: packages/react/src/number-field/utils/getViewportRect.ts
//
// The bounds the scrub area's virtual cursor wraps within, as edge
// coordinates: the scrub area padded by half the teleport distance when one
// is set, else the visual viewport (or the layout viewport without one).
import { ownerWindow } from '../../utils/dom.ts';

export interface ViewportRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function getViewportRect(
  teleportDistance: number | undefined,
  scrubAreaEl: HTMLElement,
): ViewportRect {
  const win = ownerWindow(scrubAreaEl);

  if (teleportDistance != null) {
    const rect = scrubAreaEl.getBoundingClientRect();
    return {
      left: rect.left - teleportDistance / 2,
      top: rect.top - teleportDistance / 2,
      right: rect.right + teleportDistance / 2,
      bottom: rect.bottom + teleportDistance / 2,
    };
  }

  const vV = win.visualViewport;
  if (vV) {
    return {
      left: vV.offsetLeft,
      top: vV.offsetTop,
      right: vV.offsetLeft + vV.width,
      bottom: vV.offsetTop + vV.height,
    };
  }

  return {
    left: 0,
    top: 0,
    right: win.document.documentElement.clientWidth,
    bottom: win.document.documentElement.clientHeight,
  };
}
