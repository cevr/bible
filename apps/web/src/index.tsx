import { ApplicationBootstrap } from '@bible/app/application';
import { browserHistory } from '@solidjs/router';
import { render } from '@solidjs/web';
import { Effect, Option } from 'effect';

import { getDatabaseWorker } from './workers/database-worker.js';
import { webCapabilities } from './platform-capabilities.js';
import { startWebProcedureHost } from './workers/procedure-client.js';
import '@bible/app/styles.css';

const root = Option.getOrElse(Option.fromNullOr(document.getElementById('root')), () =>
  Effect.runSync(Effect.die('#root not found')),
);
render(
  () => (
    <ApplicationBootstrap
      history={browserHistory()}
      start={() => startWebProcedureHost(getDatabaseWorker())}
      capabilities={webCapabilities}
    />
  ),
  root,
);
