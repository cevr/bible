/**
 * The native app's manifest, which One's prebuild reads (`vite.config.ts`
 * passes it as `native.app`). It lives here so a unit test reads it without
 * loading `one/vite`. The icons are drawn by `bun run icon`
 * (`scripts/icon.ts`) from `assets/icon/wheat.svg`.
 */
import type { NativeAppManifest } from 'one/native';

import { wada167 } from '../src/theme';

export const app = {
  name: 'Hymnal',
  icon: {
    source: './assets/icon/ios-light.png',
    backgroundColor: wada167.ecru,
    dark: { source: './assets/icon/ios-dark.png', backgroundColor: wada167.vandarPoelsBlue },
    tinted: { source: './assets/icon/ios-tinted.png', backgroundColor: '#000000' },
  },
  splash: { source: './public/splash.png', backgroundColor: '#000000', width: 200 },
  ios: { bundleId: 'im.cvr.hymnal', deploymentTarget: '17.0' },
  // A recording plays on with the screen locked, under the lock
  // screen's and Control Center's controls (iOS `UIBackgroundModes`
  // audio; Android's media-playback service).
  audio: { background: true },
  android: {
    applicationId: 'im.cvr.hymnal',
    adaptiveIcon: {
      foreground: './assets/icon/android-foreground.png',
      backgroundColor: wada167.ecru,
      monochrome: './assets/icon/android-monochrome.png',
    },
  },
} satisfies NativeAppManifest;
