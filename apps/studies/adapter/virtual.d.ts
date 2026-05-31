/*
 * Ambient types for the build-time virtual modules the bun adapter relies on.
 * `virtual:studies-adapter:config` is provided by the Vite plugin in ./index.ts.
 * `astro/app/entrypoint` ships JS without a .d.ts mapping, so we declare its shape.
 */

declare module 'virtual:studies-adapter:config' {
  import type { AdapterConfig } from './index.ts';
  const config: AdapterConfig;
  export default config;
}

declare module 'astro/app/entrypoint' {
  import type { App } from 'astro/app';
  export function createApp(options?: { streaming?: boolean }): App;
}
