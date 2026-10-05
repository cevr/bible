// A cleanup that undoes what only the browser does: an element a ref set let
// go (`setPopupElement(null)`), a value an effect wrote put back. The
// server's render sets no ref and runs no effect, so it runs none of these
// as it disposes the page: a write there is a signal written while the
// server renders (Solid's `SERVER_WRITE`), which nothing reads again.
import { isServer } from '@solidjs/web';
import { onCleanup } from 'solid-js';

/** Run `undo` when the owning component unmounts, in the browser only. */
export const onClientCleanup = (undo: () => void): void => {
  if (!isServer) onCleanup(undo);
};
