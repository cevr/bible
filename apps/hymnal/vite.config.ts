import { one } from 'one/vite';
import { defineConfig } from 'vite';

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
        app: {
          name: 'Hymnal',
          icon: { source: './public/app-icon.png', backgroundColor: '#000000' },
          splash: { source: './public/splash.png', backgroundColor: '#000000', width: 200 },
          ios: { bundleId: 'im.cvr.hymnal', deploymentTarget: '17.0' },
          // A recording plays on with the screen locked, under the lock
          // screen's and Control Center's controls (iOS `UIBackgroundModes`
          // audio; Android's media-playback service).
          audio: { background: true },
          android: { applicationId: 'im.cvr.hymnal' },
        },
      },
    }),
  ],
});
