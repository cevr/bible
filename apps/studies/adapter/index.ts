import type { AstroAdapter, AstroIntegration } from 'astro';

/*
 * In-house Astro 6 SSR adapter for Bun.
 *
 * Why in-house: studies is a hybrid site (prerendered pages + a single on-demand
 * grading endpoint). @astrojs/node@latest requires running node, and the repo is
 * bun-first; an off-the-shelf bun adapter would put a community package on the
 * critical path. The Astro adapter contract is small, so we own a minimal one.
 * See docs/adr/0002.
 *
 * Uses the Astro 6 `entrypointResolution: 'auto'` contract: the server entrypoint
 * (server.ts) gets its SSR app from `createApp()` (manifest injected by Astro via
 * a virtual module at build time) and gets build-time paths from our own virtual
 * config module, which the Vite plugin below provides. No `createExports`/`args`
 * (the deprecated Astro 5 explicit shape).
 *
 * We omit `previewEntrypoint`: `astro preview` resolves it via `require.resolve`
 * from the project root, which can't load a TS module. Instead `bun run start`
 * boots the built server directly (adapter/run.ts), which is also how it runs in
 * production. `astro preview` reports "not supported", which is fine.
 */

const NAME = '@bible/studies/adapter';
const CONFIG_ID = 'virtual:studies-adapter:config';
const RESOLVED_CONFIG_ID = '\0' + CONFIG_ID;

export interface Options {
  /** Hostname to bind. `true` => 0.0.0.0, `false`/undefined => localhost. Env HOST overrides. */
  readonly host?: string | boolean;
  /** Port to bind. Env PORT overrides. Defaults to Astro's configured server port. */
  readonly port?: number;
}

/** Build-time paths + bind config the server entrypoint imports from the virtual module. */
export interface AdapterConfig {
  /** Directory name for hashed assets within the client dir (config.build.assets). */
  readonly assets: string;
  /** file:// URL of the built client (static) output dir (config.build.client). */
  readonly client: string;
  /** Hostname to bind (resolved from options or Astro config). */
  readonly host: string | boolean;
  /** Port to bind (resolved from options or Astro config). */
  readonly port: number;
}

function getAdapter(): AstroAdapter {
  return {
    name: NAME,
    serverEntrypoint: new URL('./server.ts', import.meta.url).href,
    entrypointResolution: 'auto',
    supportedAstroFeatures: {
      serverOutput: 'stable',
      hybridOutput: 'stable',
      staticOutput: 'stable',
      sharpImageService: 'stable',
      envGetSecret: 'stable',
      i18nDomains: 'unsupported',
    },
  };
}

export default function bunAdapter(options: Options = {}): AstroIntegration {
  return {
    name: NAME,
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        const cfg: AdapterConfig = {
          assets: config.build.assets,
          client: config.build.client.href,
          host: options.host ?? config.server.host,
          port: options.port ?? config.server.port,
        };
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'studies-adapter:config',
                resolveId(id) {
                  if (id === CONFIG_ID) return RESOLVED_CONFIG_ID;
                  return null;
                },
                load(id) {
                  if (id === RESOLVED_CONFIG_ID) {
                    return `export default ${JSON.stringify(cfg)};`;
                  }
                  return null;
                },
              },
            ],
          },
        });
      },
      'astro:config:done': ({ setAdapter }) => {
        setAdapter(getAdapter());
      },
    },
  };
}
