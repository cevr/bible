import type { ParentProps } from 'solid-js';

import type { CacheRuntime } from '../cache/index.js';
import type { AppCapabilities } from '../platform/index.js';
import type { ProcedureClient } from '../procedure/index.js';
import { ReadingDataProvider } from '../runtime/index.js';
import { CapabilitiesProvider } from './capabilities-context.js';
import { ReadingShell } from './reading-shell.js';

export interface ReadingApplicationProps extends ParentProps {
  readonly procedures: ProcedureClient;
  readonly capabilities?: AppCapabilities;
  readonly runtime?: CacheRuntime<never>;
}

export const ReadingApplication = (props: ReadingApplicationProps) => (
  <CapabilitiesProvider value={props.capabilities}>
    <ReadingDataProvider procedures={props.procedures} runtime={props.runtime}>
      <ReadingShell>{props.children}</ReadingShell>
    </ReadingDataProvider>
  </CapabilitiesProvider>
);
