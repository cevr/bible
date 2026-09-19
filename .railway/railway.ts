import { defineRailway, github, preserve, project, service, volume } from 'railway/iac';

export default defineRailway(() => {
  const egwSearchVolume = volume('egw-search-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: 'us-east4-eqdc4a',
    sizeMB: 50000,
  });
  const studies = service('studies', {
    source: github('cevr/bible', { checkSuites: false, rootDirectory: '/' }),
    build: 'echo dist/ is prebuilt and committed',
    start: 'bun run packages/web/src/server.ts',
    replicas: { 'us-east4-eqdc4a': 1 },
    deploy: { limitOverride: { containers: { cpu: 6, memoryBytes: 4000000000 } } },
    domains: ['studies.cvr.im'],
    env: { SKIP_ELECTRON_REBUILD: preserve() },
  });
  const egwSearch = service('egw-search', {
    // `turbo prune` first: the deploy context is the whole monorepo, and this
    // service needs exactly two workspaces of it (@bible/core and the app).
    // Pruning writes out/ with a matching bun.lock, so the install resolves the
    // same versions as locally while skipping the other nine packages.
    //
    // Unlike `studies` — a dependency-free static server shipping a prebuilt
    // dist/ — this app has real dependencies (@bible/core, native SQLite, the
    // ONNX embedder), so it must install and build on the host.
    build: [
      'bunx turbo prune @bible/egw-search',
      // `turbo prune` copies each workspace's own tsconfig but not the root
      // one they `extends`, so vite's transform fails with "Tsconfig not
      // found" without this.
      'cp tsconfig.json out/tsconfig.json',
      'cd out && bun install',
      'bun run --filter @bible/egw-search build',
    ].join(' && '),
    // The corpus is not in the image; it is on the volume at /data, which
    // BIBLE_CORPUS_DIR points at.
    start: 'cd out && bun apps/egw-search/server/main.ts',
    replicas: { 'us-east4-eqdc4a': 1 },
    domains: [{ domain: 'egw.cvr.im', port: 3101 }],
    volumeMounts: { '/data': egwSearchVolume },
    env: { BIBLE_CORPUS_DIR: preserve(), PORT: preserve() },
  });

  return project('bible-studies', {
    resources: [studies, egwSearch, egwSearchVolume],
  });
});
