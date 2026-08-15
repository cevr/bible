import { ApplicationBootstrap } from '@bible/app/application';
import { HashRouter } from '@solidjs/router';
import { render } from '@solidjs/web';
import { Effect } from 'effect';

import { startDesktopProcedureHost } from './procedure-client.js';
import { desktopCapabilities } from './platform-capabilities.js';
import '@bible/app/styles.css';

const root = (() => {
  const element = document.getElementById('root');
  if (element === null) return Effect.runSync(Effect.die('#root not found'));
  return element;
})();
render(
  () => (
    <ApplicationBootstrap
      router={HashRouter}
      start={startDesktopProcedureHost}
      capabilities={desktopCapabilities}
    />
  ),
  root,
);
