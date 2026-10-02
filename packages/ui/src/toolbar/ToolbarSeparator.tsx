// Upstream: packages/react/src/toolbar/separator/ToolbarSeparator.tsx
//
// A separator between toolbar items, perpendicular to the toolbar by default:
// a horizontal toolbar has vertical separators.
import type { JSX } from '@solidjs/web';

import { Separator, type SeparatorProps, type SeparatorState } from '../separator/Separator.tsx';
import { useToolbarRootContext } from './ToolbarRootContext.ts';

export type ToolbarSeparatorState = SeparatorState;

export interface ToolbarSeparatorProps extends SeparatorProps {}

export function ToolbarSeparator(props: ToolbarSeparatorProps): JSX.Element {
  const toolbar = useToolbarRootContext();
  return (
    <Separator
      orientation={toolbar.orientation === 'vertical' ? 'horizontal' : 'vertical'}
      {...props}
    />
  );
}
