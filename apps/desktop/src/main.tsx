import { ApplicationBootstrap } from '@bible/app/application';
import { hashHistory } from '@solidjs/router';
import { render } from '@solidjs/web';
import { Effect, Option } from 'effect';

import { startDesktopProcedureHost } from './procedure-client.js';
import { desktopCapabilities } from './platform-capabilities.js';
import '@bible/app/styles.css';

const root = Option.getOrElse(Option.fromNullOr(document.getElementById('root')), (): HTMLElement =>
  Effect.runSync(Effect.die('#root not found')),
);
render(
  () => (
    <ApplicationBootstrap
      history={hashHistory()}
      start={startDesktopProcedureHost}
      capabilities={desktopCapabilities}
    />
  ),
  root,
);
