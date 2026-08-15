import { ApplicationBootstrap } from '@bible/app/application';
import { Router } from '@solidjs/router';
import { render } from '@solidjs/web';
import { Effect } from 'effect';

import { getDatabaseWorker } from './workers/database-worker.js';
import { webCapabilities } from './platform-capabilities.js';
import { startWebProcedureHost } from './workers/procedure-client.js';
import '@bible/app/styles.css';

const root = (() => {
  const element = document.getElementById('root');
  if (element === null) return Effect.runSync(Effect.die('#root not found'));
  return element;
})();
render(
  () => (
    <ApplicationBootstrap
      router={Router}
      start={() => startWebProcedureHost(getDatabaseWorker())}
      capabilities={webCapabilities}
    />
  ),
  root,
);
