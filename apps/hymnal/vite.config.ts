import { one } from 'one/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    one({
      web: { defaultRenderMode: 'ssg' },
      build: { server: { unified: true } },
      native: {
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
