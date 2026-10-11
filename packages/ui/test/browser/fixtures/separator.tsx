// Fixtures for the separator: one of each orientation, and one left to its default.
import type { JSX } from '@solidjs/web';

import { Separator } from '../../../src/separator/index.ts';

function Separators(): JSX.Element {
  return (
    <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', padding: '40px' }}>
      <span>left</span>
      <Separator id="vertical" orientation="vertical" />
      <span>right</span>
      <Separator id="horizontal" orientation="horizontal" />
      <Separator id="default" />
    </div>
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  separators: () => <Separators />,
};
