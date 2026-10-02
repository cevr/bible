// Drags as the page's window hears them (`pointer.ts`).

import { Pointer } from './pointer.ts';

/** The drags of the presses on this page. */
export const pointerLayer = Pointer.layerOn(window);
