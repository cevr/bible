/* oxlint-disable effect/noGlobals, effect/noAsyncFunction -- the browser test's server, a host boundary: Bun's loader takes each stand-in module as source text, and the app is imported once its boundaries are in place. */

/**
 * The browser test's server render: each page is the app's HTML rendered
 * here, with no window (react-native-web measures a window 0 high, as on
 * One's server and in its static build), and its styles, as the app's root
 * layout writes them (`app/_layout.tsx`). The page's script then hydrates
 * it (`page.tsx`). The boundaries are the bundler's, as `src/test/setup.ts`
 * sets them for the other tests.
 */

import { plugin } from 'bun';
import { renderToString } from 'react-dom/server';

import { readWords } from '../../vite/words';

plugin({
  name: 'hymnal-server-boundaries',
  setup(build) {
    const web = Bun.resolveSync('react-native-web', import.meta.dir);
    build.module('react-native', () => ({
      contents: `export * from ${JSON.stringify(web)};`,
      loader: 'js',
    }));
    const one = Bun.resolveSync('../../src/test/one.tsx', import.meta.dir);
    build.module('one', () => ({
      contents: `export * from ${JSON.stringify(one)};`,
      loader: 'js',
    }));
    build.module('virtual:hymnal', () => ({
      contents: `export default ${JSON.stringify(readWords())};`,
      loader: 'js',
    }));
  },
});

const { App } = await import('./app');
const { AppRegistry } = await import('react-native');
const { webColors } = await import('~/color');

AppRegistry.registerComponent('styles', () => () => <></>);

/** The page the app's server answers at `path`; its script is at `/page.js`. */
export const render = (path: string): string => {
  const body = renderToString(<App path={path} />);
  // @ts-expect-error react-native-web's own API, as `app/_layout.tsx` calls it
  const styles: string = renderToString(AppRegistry.getApplication('styles', {}).getStyleElement());
  return [
    '<!doctype html><html lang="en-US"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<style>${webColors}\n#root { display: flex; flex-direction: column; flex: 1; min-height: 0; }</style>`,
    styles,
    `</head><body><div id="root">${body}</div>`,
    '<script type="module" src="/page.js"></script></body></html>',
  ].join('');
};
