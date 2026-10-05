// The host's live adapters, merged: the one layer each page's root builds
// its host from (`host.ts`). Each service's own live adapter is its
// `*-browser.ts` beside it; the address bar's is `@bible/url-state`'s
// (`layerBrowser`, the only module that touches `history` and `location`),
// with `UrlState` over it.

import { UrlState, layerBrowser } from '@bible/url-state';
import { Layer } from 'effect';
import type { BrowserServices } from './host.ts';
import { clipboardLayer } from './clipboard-browser.ts';
import { framesLayer } from './frames-browser.ts';
import { keysLayer } from './keys-browser.ts';
import { mediaLayer } from './media-browser.ts';
import { pageLoadLayer } from './page-load-browser.ts';
import { pointerLayer } from './pointer-browser.ts';
import { viewportLayer } from './viewport-browser.ts';

/** The page's host over the browser's own APIs. */
export const BrowserHost = {
  layer: Layer.mergeAll(
    clipboardLayer,
    framesLayer,
    keysLayer,
    mediaLayer,
    pageLoadLayer,
    pointerLayer,
    viewportLayer,
    UrlState.layer.pipe(Layer.provideMerge(layerBrowser())),
  ) satisfies Layer.Layer<BrowserServices>,
};
