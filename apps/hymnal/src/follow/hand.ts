/**
 * A hand scroll on the hymn's scroll, for the web: react-native-web never
 * calls `onScrollBeginDrag`, so a wheel or a touch moving on the page starts
 * the hand pause. A scroll the follow asks for fires neither. On iOS and
 * Android the native scroll's drag does it (`hand.native.ts`).
 */
export const handOf = (drag: () => void) => ({ onWheel: drag, onTouchMove: drag });
