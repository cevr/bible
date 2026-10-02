// Every fixture the browser tests open, by name.
import type { JSX } from '@solidjs/web';

import { floating } from './floating.tsx';
import { foundations } from './foundations.tsx';

export const fixtures: Record<string, () => JSX.Element> = {
  ...foundations,
  ...floating,
};
