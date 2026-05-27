import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outdir = path.join(root, 'dist', 'main');

await rm(outdir, { recursive: true, force: true });

await build({
  entryPoints: [path.join(root, 'electron', 'main.ts'), path.join(root, 'electron', 'preload.ts')],
  outdir,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // better-sqlite3 ships a native .node binding; can't be bundled. esbuild
  // would also try to inline the prebuilt-install fallback paths and produce
  // a broken bundle. Keep it as an extern so the require() resolves at runtime
  // against the node_modules copy electron-builder ships.
  external: ['electron', 'better-sqlite3'],
  sourcemap: true,
  logLevel: 'info',
});
