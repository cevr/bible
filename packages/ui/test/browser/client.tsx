// The browser tests' page script: mounts the fixture the URL names, by
// hydrating the server's markup when the page holds it (`data-served`, see
// `server.ts`), else by rendering it.
import { hydrate, render } from '@solidjs/web';

import { fixtures } from './fixtures/index.ts';
import { param } from './fixtures/log.ts';

const root = document.getElementById('root');
const name = param('fixture') ?? '';
const fixture = fixtures[name];
if (root && fixture) {
  if (root.hasAttribute('data-served')) {
    // The markup as served, for the harness's `servedOf`.
    (window as unknown as { __served: string }).__served = root.innerHTML;
    hydrate(fixture, root);
  } else {
    render(fixture, root);
  }
  root.setAttribute('data-mounted', '');
} else {
  console.error(`no fixture named "${name}"`);
}
