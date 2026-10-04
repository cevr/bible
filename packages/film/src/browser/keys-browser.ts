// Key presses as the page's window hears them (`keys.ts`), from a Mac's
// keyboard when the browser's platform is Apple's (its command key is ⌘).

import { Keys } from './keys.ts';

/** Whether the browser runs on an Apple platform, whose command key is ⌘. */
const apple = ['Mac', 'iPhone', 'iPad', 'iPod'].some((name) => navigator.platform.startsWith(name));

/** The key presses on this page. */
export const keysLayer = Keys.layerOn(window, apple);
