// Upstream: packages/react/src/direction-provider/DirectionProvider.tsx
//
// Sets the text direction for the parts inside it. The value is read live:
// a part reads `useDirection()` when it handles a key.
import type { JSX } from '@solidjs/web';

import { DirectionContext, type TextDirection } from './DirectionContext.ts';

export interface DirectionProviderProps {
  children?: JSX.Element;
  /** The reading direction of the text. @default 'ltr' */
  direction?: TextDirection | undefined;
}

export function DirectionProvider(props: DirectionProviderProps): JSX.Element {
  const value = {
    get direction(): TextDirection {
      return props.direction ?? 'ltr';
    },
  };
  return <DirectionContext value={value}>{props.children}</DirectionContext>;
}
