import { bucket, defineRailway, preserve, project, service, volume } from 'railway/iac';

export default defineRailway(() => {
  const egwSearchVolume = volume('egw-search-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'us-east4-eqdc4a',
    sizeMB: 50000,
  });
  const egwCelld = bucket('egw-celld', { region: 'iad' });
  const egwSearch = service('egw-search', {
    build: {
      buildCommand:
        'bunx turbo prune @bible/egw-search && cp tsconfig.json out/tsconfig.json && cd out && bun install && bun run --filter @bible/egw-search build',
      buildEnvironment: 'V3',
      builder: 'DOCKERFILE',
      dockerfilePath: 'Dockerfile',
    },
    start: 'cd out && bun apps/egw-search/server/main.ts',
    healthcheck: '/health',
    healthcheckTimeout: 300,
    replicas: { 'us-east4-eqdc4a': 1 },
    domains: [{ domain: 'egw.cvr.im', port: 3101 }],
    volumeMounts: { '/data': egwSearchVolume },
    env: {
      ALCHEMY_RPC_TOKEN: preserve(),
      BIBLE_CORPUS_DIR: preserve(),
      BIBLE_MODEL_CACHE: preserve(),
      EGW_CLIENT_ID: preserve(),
      EGW_CLIENT_SECRET: preserve(),
      EGW_TOKEN_FILE: preserve(),
      PORT: preserve(),
      RAILPACK_INSTALL_CMD: preserve(),
    },
  });

  return project('bible-studies', {
    resources: [egwSearch, egwSearchVolume, egwCelld],
  });
});
