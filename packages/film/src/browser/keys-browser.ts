// Key presses as the page's window hears them (`keys.ts`).

import { Keys } from './keys.ts';

/** The key presses on this page. */
export const keysLayer = Keys.layerOn(window);
