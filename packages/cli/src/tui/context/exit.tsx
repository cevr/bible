import { createContext, useContext, type ParentProps } from 'solid-js';

type ExitHandler = () => void;

const ExitContext = createContext<ExitHandler>();

interface ExitProviderProps {
  onExit: ExitHandler;
}

export function ExitProvider(props: ParentProps<ExitProviderProps>) {
  return <ExitContext.Provider value={props.onExit}>{props.children}</ExitContext.Provider>;
}

export function useExit(): ExitHandler {
  const ctx = useContext(ExitContext);
  if (!ctx) {
    throw new Error('useExit must be used within an ExitProvider');
  }
  return ctx;
}
