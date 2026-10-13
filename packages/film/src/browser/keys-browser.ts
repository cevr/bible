// Key presses as the page's window hears them (`keys.ts`), from a Mac's
// keyboard when the browser is on an Apple device (`appleAgent`: its command
// key is ⌘), as the server that rendered the page read it.

import { appleAgent, Keys } from './keys.ts';

/** The key presses on this page. */
export const keysLayer = Keys.layerOn(window, appleAgent(navigator.userAgent));
