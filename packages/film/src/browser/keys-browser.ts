// Key presses as the page's window hears them (`keys.ts`), from a Mac's
// keyboard when the browser's platform is Apple's (its command key is ⌘).

import { applePlatform, Keys } from './keys.ts';

/** The key presses on this page. */
export const keysLayer = Keys.layerOn(window, applePlatform(navigator.platform));
