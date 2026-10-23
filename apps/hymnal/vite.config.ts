import { one } from 'one/vite';
import { defineConfig } from 'vite';

import { app } from './vite/app';
import { hymnal } from './vite/hymnal';
import { sdkRuntime } from './vite/sdkruntime';

export default defineConfig({
  plugins: [
    hymnal(),
    one({
      web: { defaultRenderMode: 'ssg' },
      build: { server: { unified: true } },
      native: {
        // The native bundle is its own rolldown build: it takes the words too.
        bundlerOptions: { plugins: [hymnal(), sdkRuntime()] },
        app,
      },
    }),
  ],
});
