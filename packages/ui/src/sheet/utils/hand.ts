// The window's touches, heard once for every sheet: a finger that went down on a sheet is
// followed on the window (its moves and its lift go to the element it went down on, even once
// that has left the sheet), and each sheet mounted adds a hand to the one subscription rather
// than listeners of its own.

/** What a sheet hears of the window's touches. */
interface Hand {
  /** A finger moved. */
  readonly move: (event: TouchEvent) => void;
  /** A finger lifted, or the browser took the touch (`touchcancel`). */
  readonly lift: (event: TouchEvent) => void;
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

/**
 * Tells `hand` of the window's touch moves and lifts until the answer is called: the window's
 * listeners are added with the first hand and removed with the last.
 */
export function followTouches(hand: Hand): () => void {
  if (hands.size === 0) {
    window.addEventListener('touchmove', onMove, heard);
    window.addEventListener('touchend', onLift, heard);
    window.addEventListener('touchcancel', onLift, heard);
  }
  hands.add(hand);
  return () => {
    if (!hands.delete(hand) || hands.size > 0) {
      return;
    }
    window.removeEventListener('touchmove', onMove, heard);
    window.removeEventListener('touchend', onLift, heard);
    window.removeEventListener('touchcancel', onLift, heard);
  };
}
