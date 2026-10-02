// The browser tests' page script: mounts the fixture the URL names.
import { render } from '@solidjs/web';

import { fixtures } from './fixtures/index.ts';
import { param } from './fixtures/log.ts';

const root = document.getElementById('root');
const name = param('fixture') ?? '';
const fixture = fixtures[name];
if (root && fixture) {
  render(fixture, root);
  root.setAttribute('data-mounted', '');
} else {
  console.error(`no fixture named "${name}"`);
}
