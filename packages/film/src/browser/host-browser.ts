// The host's live adapters, merged: the one layer each page's root builds
// its host from (`host.ts`). Each service's own live adapter is its
// `*-browser.ts` beside it; the address bar's is `@bible/url-state`'s
// (`layerBrowser`, the only module that touches `history` and `location`),
// with `UrlState` over it. A page whose media does more than the page's own
// (the review's compares on WebCodecs panes, `panesMediaLayer`) builds
// its host `withMedia` that layer, over the host's frames and viewport, so
// no other page loads what it needs. A page's footage is read from the proxy
// (the lab's, the phone's copy); the render page's from the mezzanine it
// conforms from (`BrowserHost.render`).

import { UrlState, layerBrowser } from '@bible/url-state';
import { Layer } from 'effect';
import { type FootageCopy, footageHref } from '../core/footage.ts';
import type { BrowserServices } from './host.ts';
import type { Frames } from './frames.ts';
import type { Media } from './media.ts';
import type { Viewport } from './viewport.ts';
import { clipboardLayer } from './clipboard-browser.ts';
import { FootageDecoders, footageLayer } from './footage-browser.ts';
import { framesLayer } from './frames-browser.ts';
import { highlightsLayer } from './highlights-browser.ts';
import { keysLayer } from './keys-browser.ts';
import { mediaLayer } from './media-browser.ts';
import { pageLoadLayer } from './page-load-browser.ts';
import { pointerLayer } from './pointer-browser.ts';
import { viewportLayer } from './viewport-browser.ts';

/** The address bar, with `UrlState` over it. */
const addressLayer = UrlState.layer.pipe(Layer.provideMerge(layerBrowser()));

/** The page's host over the browser's own APIs, its media `media`, its footage read from `copy`. */
const hostWith = (
  media: Layer.Layer<Media, never, Frames | Viewport>,
  copy: FootageCopy = 'proxy',
): Layer.Layer<BrowserServices> =>
  Layer.mergeAll(
    clipboardLayer,
    footageLayer((source) => footageHref(source, copy)).pipe(Layer.provide(FootageDecoders.layer)),
    framesLayer,
    highlightsLayer,
    keysLayer,
    media.pipe(Layer.provide(Layer.merge(framesLayer, viewportLayer))),
    pageLoadLayer,
    pointerLayer,
    viewportLayer,
    addressLayer,
  );

/** The page's host over the browser's own APIs. */
export const BrowserHost = {
  layer: hostWith(mediaLayer),
  /** The render page's host: its footage read from the mezzanine, which the render conforms from. */
  render: hostWith(mediaLayer, 'mezzanine'),
  /** The host with `media` for the page's own (`media-browser.ts` `panesMediaLayer`). */
  withMedia: (media: Layer.Layer<Media, never, Frames | Viewport>) => hostWith(media),
};
