import type { ParentProps } from 'solid-js';
import { createContext, useContext } from 'solid-js';

import type { AppCapabilities } from '../platform/index.js';

const CapabilitiesContext = createContext<AppCapabilities>({});

export interface CapabilitiesProviderProps extends ParentProps {
  readonly value?: AppCapabilities;
}

export const CapabilitiesProvider = (props: CapabilitiesProviderProps) => (
  <CapabilitiesContext value={props.value ?? {}}>{props.children}</CapabilitiesContext>
);

export const useCapabilities = (): AppCapabilities => useContext(CapabilitiesContext);
