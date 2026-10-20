/* oxlint-disable effect/noGlobals -- Bun's loader takes each stand-in module as source text, so paths and words are written into it as JSON literals. */

/**
 * The app's tests run its screens under Bun, rendered to HTML as the web
 * build renders them. Three boundaries stand in, as the bundler and the
 * router would provide them:
 * - `react-native` is react-native-web, as on the web;
 * - `virtual:hymnal` is the same words the bundler plugin derives (`vite/words.ts`);
 * - `one` is `src/test/one.tsx`: a link is an anchor, a screen's options are dropped.
 */

import { plugin } from 'bun';

import { readWords } from '../../vite/words';

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
