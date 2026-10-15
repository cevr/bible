// The server half of the parity case: `Parity` rendered by Solid's server
// build, with what it reported while rendering (a ref callback or an
// `onElement` setup run on the server would show here).
import { renderToString } from '@solidjs/web';

import { Parity } from './mix-parity.tsx';

export const render = (): { html: string; reported: Array<string> } => {
  const reported: Array<string> = [];
  const html = renderToString(() => <Parity report={(line) => reported.push(line)} />);
  return { html, reported };
};
