// Upstream: packages/react/src/tooltip/provider/TooltipProvider.tsx,
// packages/react/src/tooltip/provider/TooltipProviderContext.ts
//
// Shares a delay among the tooltips inside it. Once one is showing, the
// next one opens at once (and the first closes), until `timeout` after the
// last one closed. `delay` is the open delay a trigger without its own uses;
// `closeDelay` is handled by the delay group.
import type { JSX } from '@solidjs/web';
import { createContext, useContext } from 'solid-js';

import { FloatingDelayGroup } from '../../floating-ui-solid/FloatingDelayGroup.tsx';

const TooltipProviderContext = createContext<{ delay: number | undefined }>({ delay: undefined });

/** The provider's open delay, if a provider sets one. */
export function useTooltipProviderDelay(): () => number | undefined {
  const value = useContext(TooltipProviderContext);
  return () => value.delay;
}

export interface TooltipProviderState {}

export interface TooltipProviderProps {
  children?: JSX.Element;
  /** How long the pointer rests on a trigger before its tooltip opens, in ms. */
  delay?: number | undefined;
  /** How long before a tooltip closes, in ms. */
  closeDelay?: number | undefined;
  /** Another tooltip opens at once if the last one closed within this time, in ms. @default 400 */
  timeout?: number | undefined;
}

export function TooltipProvider(props: TooltipProviderProps): JSX.Element {
  const value = {
    get delay() {
      return props.delay;
    },
  };
  return (
    <TooltipProviderContext value={value}>
      <FloatingDelayGroup
        delay={{ open: props.delay, close: props.closeDelay }}
        timeoutMs={props.timeout ?? 400}
      >
        {props.children}
      </FloatingDelayGroup>
    </TooltipProviderContext>
  );
}
