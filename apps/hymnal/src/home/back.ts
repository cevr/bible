/**
 * Android's Back in search mode. React Native asks each Back handler, the
 * newest first, until one says it handled the press; the stack's handler,
 * which pops the screen on top, is older than search's. So search's handler
 * acts only while the home screen is in focus: there it cancels the search
 * and says so; under a hymn opened from the results it leaves the press to
 * the stack, which pops the hymn back to the results.
 */
export const searchBack =
  ({ isFocused, cancel }: { readonly isFocused: () => boolean; readonly cancel: () => void }) =>
  (): boolean => {
    if (!isFocused()) return false;
    cancel();
    return true;
  };
