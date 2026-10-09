// The client half of the SSR proof: the same App hydrated over the server's
// markup, its `Location` the browser's, seeded as an app's root seeds it.
import { layerBrowser } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { hydrate } from '@solidjs/web';
import { Option } from 'effect';

import { RegistryProvider } from '../../src/registry-context.ts';
import { App } from './App.tsx';

Option.map(Option.fromNullishOr(document.getElementById('root')), (root) =>
  hydrate(
    () => (
      <RegistryProvider initialValues={[[UrlAtom.layer, layerBrowser()]]}>
        <App />
      </RegistryProvider>
    ),
    root,
  ),
);
