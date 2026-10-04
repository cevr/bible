// Not in upstream: one owner per press. A finger's press may become a long
// press (a context menu's trigger) or a drag (a consumer's, such as the film
// lab's `Pointer.drag`); whichever claims the press's pointer first has it
// until that pointer lifts or is cancelled, and every other claim on it is
// refused. The long press claims as its delay ends, a drag as it starts
// moving, so a drag that started is no long press, and a long press that
// opened its menu is no drag. Pure state over the page's pointer ids. The
// long press's delay and move threshold live here too, so a drag can start
// where the long press gives way without loading the context menu.

/** How long a touch is held before the menu opens, and the mouseup grace after a right click. */
export const LONG_PRESS_DELAY = 500;
/** How far a held touch may move, in px, before the long press is cancelled. */
export const LONG_PRESS_MOVE_THRESHOLD = 10;

/** Who holds each pointer's press now, by pointer id. */
const owners = new Map<number, symbol>();

/** A press is let go once its pointer lifts or the browser takes it. */
const letGo = (event: Event) => {
  if ('pointerId' in event && typeof event.pointerId === 'number') {
    owners.delete(event.pointerId);
  }
};

/** The pages already heard for lifts. */
const heard = new WeakSet<EventTarget>();

/** Hear `page`'s lifts once, from its first claim on (a page with no claims hears nothing). */
function hear(page: EventTarget) {
  if (heard.has(page)) {
    return;
  }
  heard.add(page);
  page.addEventListener('pointerup', letGo, true);
  page.addEventListener('pointercancel', letGo, true);
}

/**
 * Claim pointer `pointerId`'s press for `by`: true when `by` holds it now (it
 * was free, or `by` held it already), false when another holds it. `page` is
 * where the pointer's lift is heard (its document, or the window), so the
 * press is let go then.
 */
export function claimPress(pointerId: number, by: symbol, page: EventTarget): boolean {
  hear(page);
  const owner = owners.get(pointerId);
  if (owner === undefined) {
    owners.set(pointerId, by);
    return true;
  }
  return owner === by;
}

/** Whether someone other than `by` holds pointer `pointerId`'s press. */
export function pressHeldByOther(pointerId: number, by: symbol): boolean {
  const owner = owners.get(pointerId);
  return owner !== undefined && owner !== by;
}
