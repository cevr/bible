/**
 * The browser entry: mount the page into the element `index.html` names,
 * under the atom registry the URL lives in. The tab's history is its
 * `Location`, with the browser's own scroll restoration off: `./scroll.ts`
 * restores positions once an entry's results are drawn.
 */

import { RegistryProvider } from '@bible/atom-solid';
import { layerBrowser } from '@bible/url-state';
import * as UrlAtom from '@bible/url-state/atom';
import { render } from '@solidjs/web';
import { Option } from 'effect';

import { App } from './app.js';
import './styles.css';

const root = Option.fromNullishOr(document.getElementById('root'));
if (Option.isSome(root))
  render(
    () => (
      <RegistryProvider
        initialValues={[[UrlAtom.layer, layerBrowser({ scrollRestoration: 'manual' })]]}
      >
        <App />
      </RegistryProvider>
    ),
    root.value,
  );
