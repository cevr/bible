// The server half of the SSR proof: one registry per render, its `Location`
// the request's URL, which never carries a hash.
import { layerServer } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { generateHydrationScript, renderToString } from '@solidjs/web';

import { RegistryProvider } from '../../src/registry-context.ts';
import { App } from './App.tsx';

/** The App's markup for a request to `href`. */
export const render = (href: string): string =>
  renderToString(() => (
    <RegistryProvider initialValues={[[UrlAtom.layer, layerServer(href)]]}>
      <App />
    </RegistryProvider>
  ));

/** The whole page: the App's markup, the hydration script, the client entry. */
export const page = (href: string): string =>
  [
    '<!doctype html><html><head><meta charset="utf-8">',
    generateHydrationScript(),
    '<script type="module" src="/client.js"></script></head>',
    `<body><div id="root">${render(href)}</div></body></html>`,
  ].join('');
