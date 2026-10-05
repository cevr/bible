// The host of a page the lab renders on the server (`host.ts`): the
// request's URL as its address bar (`@bible/url-state`'s `layerServer`, read
// only, with no hash: a browser never sends it), frames on the server's own
// clock (`Frames.layerClock`, which no render waits on), and every other
// service a page's code may reach while it renders, inert. A server render
// answers one request and runs no handler and no effect, so nothing here is
// pressed, played, dragged or loaded: a call that would act is ignored and
// logged at Debug, as `layerServer` logs a write, and one that would answer
// something answers as the studio is designed for first, a phone held upright
// (`Viewport.layerPhone`). The client takes over each service from its live
// adapter (`host-browser.ts`) once the page is hydrated.

import { UrlState, layerServer } from '@bible/url-state';
import { Effect, Layer } from 'effect';
import { Clipboard, ClipboardRefused } from './clipboard.ts';
import { Frames } from './frames.ts';
import type { BrowserServices } from './host.ts';
import { Keys } from './keys.ts';
import { Media, PlayRefused, type Playable } from './media.ts';
import { PageLoad } from './page-load.ts';
import { Pointer } from './pointer.ts';
import { Viewport } from './viewport.ts';

/** Media a server render made: never measured, never ready; a play is refused, as no browser would play it. */
const unplayable: Playable = {
  time: () => 0,
  duration: () => Number.NaN,
  ready: () => false,
  playing: () => false,
  seeking: () => false,
  ended: () => false,
  seek: () => Effect.void,
  play: Effect.fail(new PlayRefused({ name: 'NotSupportedError' })),
  pause: Effect.void,
  mute: () => {},
  rate: () => {},
  on: () => {},
};

/** The clipboard a server render has: none, so a copy is refused in those words. */
const noClipboard: Layer.Layer<Clipboard> = Layer.succeed(
  Clipboard,
  Clipboard.of({
    copyLink: () =>
      Effect.fail(
        new ClipboardRefused({ reason: 'a page rendered on the server has no clipboard' }),
      ),
  }),
);

/** Loads a server render cannot make: each ignored, and logged. */
const noLoads: Layer.Layer<PageLoad> = Layer.succeed(
  PageLoad,
  PageLoad.of({
    reload: Effect.logDebug('page-load.server.reload.ignored'),
    open: (href) => Effect.logDebug(`page-load.server.open.ignored href=${href}`),
  }),
);

/** The host of a page rendered on the server for a request to `href`. */
export const ServerHost = {
  layer: (href: string): Layer.Layer<BrowserServices> =>
    Layer.mergeAll(
      noClipboard,
      Frames.layerClock,
      Keys.layerOn(new EventTarget()),
      Media.layerOver(() => unplayable),
      noLoads,
      Pointer.layerOn(new EventTarget()),
      Viewport.layerPhone,
      UrlState.layer.pipe(Layer.provideMerge(layerServer(href))),
    ),
};
