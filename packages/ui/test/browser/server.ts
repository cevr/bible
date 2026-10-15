// The browser tests' server render, for a test file whose harness hydrates
// (`harness(…, { hydrate: true })`): the fixture a page names, rendered by
// Solid's server build into the markup the page hydrates, with the script
// hydration needs for its head. Its fixtures run in the test's process, so
// they read no browser global (nor the URL's params) while rendering.
import { generateHydrationScript, renderToString } from '@solidjs/web';

import { fixtures } from './fixtures/index.ts';

/** The fixture `name`'s markup and the head it needs; none for an unknown name. */
export const render = (name: string): { head: string; html: string } | undefined => {
  const fixture = fixtures[name];
  if (fixture === undefined) {
    return undefined;
  }
  return { head: generateHydrationScript(), html: renderToString(fixture) };
};
