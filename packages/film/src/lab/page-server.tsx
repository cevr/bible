// A page's render on the server, for its server entry (`*.server.tsx`,
// `core/page-render.ts`): Solid's `renderToStream` of the page's components,
// the same ones its browser entry hydrates, inside the page's root
// (`PAGE_ROOT`). The head holds Solid's hydration script (the values the
// render serializes are read by it), the page's styles and the UI face's
// latin subset (`FACE_HEAD`), so the first paint is styled, and set in the
// studio's face once it lands, before any script runs. A failure that fails
// the render is the sink's; one a boundary shows is the page's own.

import { type JSX, generateHydrationScript, renderToStream } from '@solidjs/web';
import { Effect, Exit, Layer, Scope } from 'effect';
import { onCleanup } from 'solid-js';
import { PAGE_ROOT, PAGE_STYLE, type PageRender, type PageRequest } from '../core/page-render.ts';
import type { Host } from '../browser/host.ts';
import { ServerHost } from '../browser/host-server.ts';
import { FACE_HEAD } from '../player/face.ts';

/**
 * `app` over a host of the page's URL (`host-server.ts`: the URL asked, no
 * window), which lives as long as the render does.
 */
export const ServerHosted = (props: {
  readonly url: string;
  readonly app: (host: Host) => JSX.Element;
}) => {
  const scope = Scope.makeUnsafe();
  onCleanup(() => {
    Effect.runFork(Scope.close(scope, Exit.void));
  });
  return props.app(Effect.runSync(Layer.buildWithScope(ServerHost.layer(props.url), scope)));
};

/** A page as its server entry renders it. */
interface ServedPage {
  /** The class the page's body carries. */
  readonly bodyClass: string;
  /** The class of the page's root, where its components mount. */
  readonly rootClass: string;
  /** The page's styles, in its head before its markup. */
  readonly style: string;
  /** The page's components for `request`: never reading the browser's globals. */
  readonly app: (request: PageRequest) => JSX.Element;
}

/** `page` as the lab renders it on the server. */
export const pageRender = (page: ServedPage): PageRender => ({
  bodyClass: page.bodyClass,
  render: (request, sink) => {
    const heads: Array<string> = [];
    let opened = false;
    // The head and the root's opening tag, once: before the render's first piece.
    const open = () => {
      if (opened) return;
      opened = true;
      sink.head(
        `${FACE_HEAD}${generateHydrationScript()}<style ${PAGE_STYLE}>${page.style}</style>${heads.join('')}`,
      );
      sink.write(`<div class="${page.rootClass}" ${PAGE_ROOT}>`);
    };
    renderToStream(() => page.app(request), {
      signal: request.signal,
      onHead: (html) => {
        heads.push(html);
      },
      onError: (error, context) => {
        if (context.handling === 'failed') sink.fail(String(error));
      },
    }).pipe({
      write: (html) => {
        open();
        sink.write(html);
      },
      end: () => {
        open();
        sink.write('</div>');
        sink.end();
      },
    });
  },
});
