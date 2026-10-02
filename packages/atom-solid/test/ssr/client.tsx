// The client half of the SSR proof: the same App hydrated over the server's
// markup, its `Location` the browser's (the binding's default layer).
import { hydrate } from '@solidjs/web';
import { Option } from 'effect';

import { RegistryProvider } from '../../src/registry-context.ts';
import { App } from './App.tsx';

Option.map(Option.fromNullishOr(document.getElementById('root')), (root) =>
  hydrate(
    () => (
      <RegistryProvider>
        <App />
      </RegistryProvider>
    ),
    root,
  ),
);
