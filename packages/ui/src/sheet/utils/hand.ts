// The window's touches and resizes, heard once for every sheet: a finger that went down on a
// sheet is followed on the window (its moves and its lift go to the element it went down on,
// even once that has left the sheet), a resize of the window or of its visual viewport changes
// every sheet's layout, and each sheet mounted adds a hand to the one subscription rather than
// listeners of its own.

/** What a sheet hears of the window. */
interface Hand {
  /** A finger moved. */
  readonly move: (event: TouchEvent) => void;
  /** A finger lifted, or the browser took the touch (`touchcancel`). */
  readonly lift: (event: TouchEvent) => void;
  /**
   * The window or its visual viewport resized: heard in the frame that lays it out, before that
   * frame's `scroll` events, even when it was changed back before the frame (a one-frame flicker
   * no ResizeObserver reports, whose clamp of a container's scroll is still a `scroll` event).
   */
  readonly resize: () => void;
}

const hands = new Set<Hand>();
const heard = { passive: true, capture: true } as const;

const onMove = (event: TouchEvent) => {
  for (const hand of hands) {
    hand.move(event);
  }
};
const onLift = (event: TouchEvent) => {
  for (const hand of hands) {
    hand.lift(event);
  }
};
const onResize = () => {
  for (const hand of hands) {
    hand.resize();
  }
};

/**
 * Tells `hand` of the window's touch moves and lifts and its resizes until the answer is called:
 * the window's listeners are added with the first hand and removed with the last.
 */
export function followWindow(hand: Hand): () => void {
  if (hands.size === 0) {
    window.addEventListener('touchmove', onMove, heard);
    window.addEventListener('touchend', onLift, heard);
    window.addEventListener('touchcancel', onLift, heard);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
  }
  hands.add(hand);
  return () => {
    if (!hands.delete(hand) || hands.size > 0) {
      return;
    }
    window.removeEventListener('touchmove', onMove, heard);
    window.removeEventListener('touchend', onLift, heard);
    window.removeEventListener('touchcancel', onLift, heard);
    window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
  };
}
