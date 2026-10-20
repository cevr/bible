import { one } from 'one/vite';
import { defineConfig } from 'vite';

import { hymnal } from './vite/hymnal';

export default defineConfig({
  plugins: [
    hymnal(),
    one({
      web: { defaultRenderMode: 'ssg' },
      build: { server: { unified: true } },
      native: {
        // The native bundle is its own rolldown build: it takes the words too.
        bundlerOptions: { plugins: [hymnal()] },
        app: {
          name: 'Hymnal',
          icon: { source: './public/app-icon.png', backgroundColor: '#000000' },
          splash: { source: './public/splash.png', backgroundColor: '#000000', width: 200 },
          ios: { bundleId: 'im.cvr.hymnal', deploymentTarget: '17.0' },
          android: { applicationId: 'im.cvr.hymnal' },
        },
      },
    }),
  ],
});
