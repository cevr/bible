// Not in upstream: one owner per press (`utils/press.ts`). A consumer's drag
// reads the long press's threshold, starts where the long press gives way,
// and claims the press as it starts, so the context menu's long press never
// opens under it, nor a drag starts under an open menu; and asks who held the
// press at its lift (`liftHeldByOther`), so an open menu's press never
// completes the drag either. Kept apart from
// `context-menu` so a drag loads no component.
export {
  LONG_PRESS_DELAY,
  LONG_PRESS_MOVE_THRESHOLD,
  claimPress,
  liftHeldByOther,
} from '../utils/press.ts';
