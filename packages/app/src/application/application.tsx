import type { ParentProps } from 'solid-js';

import type { ProcedureClient } from '../cache/index.js';
import type { AppCapabilities } from '../platform/index.js';
import { ReadingDataProvider } from '../runtime/index.js';
import { CapabilitiesProvider } from './capabilities-context.js';
import { ReadingShell } from './reading-shell.js';

export interface ReadingApplicationProps extends ParentProps {
  readonly procedures: ProcedureClient;
  readonly capabilities?: AppCapabilities;
}

export const ReadingApplication = (props: ReadingApplicationProps) => (
  <CapabilitiesProvider value={props.capabilities}>
    <ReadingDataProvider procedures={props.procedures}>
      <ReadingShell>{props.children}</ReadingShell>
    </ReadingDataProvider>
  </CapabilitiesProvider>
);
