/* oxlint-disable effect/noGlobals -- Bun's loader takes each stand-in module as source text, so paths and words are written into it as JSON literals. */

/**
 * The app's tests run its screens under Bun, rendered to HTML as the web
 * build renders them, or mounted in a browser's document (happy-dom) where a
 * test presses and types. Three boundaries stand in, as the bundler and the
 * router would provide them:
 * - `react-native` is react-native-web, as on the web;
 * - `virtual:hymnal` is the same words the bundler plugin derives (`vite/words.ts`);
 * - `one` is `src/test/one.tsx`: a link opens its href in the app, a screen's options are dropped.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { plugin } from 'bun';

import { readWords } from '../../vite/words';

GlobalRegistrator.register({
  url: 'http://localhost/',
  // A link the app does not handle must stay unfollowed, as a test reads it.
  settings: { navigation: { disableMainFrameNavigation: true } },
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

plugin({
  name: 'hymnal-test-boundaries',
  setup(build) {
    const web = Bun.resolveSync('react-native-web', import.meta.dir);
    build.module('react-native', () => ({
      contents: `export * from ${JSON.stringify(web)};`,
      loader: 'js',
    }));
    const one = Bun.resolveSync('./one.tsx', import.meta.dir);
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
