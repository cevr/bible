/** A hand scroll on iOS and Android: the native scroll's drag, which a scroll the follow asks for never fires. */
export const handOf = (drag: () => void) => ({ onScrollBeginDrag: drag });
