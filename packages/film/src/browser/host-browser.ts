// The host's live adapters, merged: the one layer each page's root builds
// its host from (`host.ts`). Each service's own live adapter is its
// `*-browser.ts` beside it.

import { Layer } from 'effect';
import type { BrowserServices } from './host.ts';
import { framesLayer } from './frames-browser.ts';
import { keysLayer } from './keys-browser.ts';
import { pointerLayer } from './pointer-browser.ts';

/** The page's host over the browser's own APIs. */
export const BrowserHost = {
  layer: Layer.mergeAll(
    framesLayer,
    keysLayer,
    pointerLayer,
  ) satisfies Layer.Layer<BrowserServices>,
};
