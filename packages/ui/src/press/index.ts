// Not in upstream: one owner per press (`utils/press.ts`). A consumer's drag
// reads the long press's threshold, starts where the long press gives way,
// and claims the press as it starts, so the context menu's long press never
// opens under it, nor a drag starts under an open menu. Kept apart from
// `context-menu` so a drag loads no component.
export { LONG_PRESS_DELAY, LONG_PRESS_MOVE_THRESHOLD, claimPress } from '../utils/press.ts';
