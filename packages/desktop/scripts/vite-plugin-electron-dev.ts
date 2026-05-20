import { spawn, type ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import electronPath from 'electron';
import * as esbuild from 'esbuild';
import type { Plugin, ViteDevServer } from 'vite';

// Vite plugin that owns the Electron dev loop:
//  - esbuild watch over electron/main.ts + electron/preload.ts → dist/main/*.cjs
//  - spawns Electron after the Vite dev server is listening (so the renderer
//    URL is reachable from the get-go)
//  - kills + respawns Electron on every successful rebuild. Preload is only
//    injected at BrowserWindow creation, so a full restart is the only way
//    to pick up preload edges. Cheap enough that we don't bother distinguishing
//    main- vs preload-only changes.
//
// Renderer HMR is untouched — Vite still owns the renderer process; this
// plugin only manages the Node side of Electron.

export function electronDev(): Plugin {
  const root = path.resolve(import.meta.dirname, '..');
  const outdir = path.join(root, 'dist', 'main');

  let ctx: esbuild.BuildContext | undefined;
  let child: ChildProcess | undefined;
  let viteServer: ViteDevServer | undefined;
  let stopping = false;

  const killElectron = () =>
    new Promise<void>((resolve) => {
      if (!child || child.exitCode !== null) {
        child = undefined;
        resolve();
        return;
      }
      child.removeAllListeners('exit');
      child.once('exit', () => {
        child = undefined;
        resolve();
      });
      child.kill();
    });

  const spawnElectron = () => {
    child = spawn(electronPath as unknown as string, ['.'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' },
    });
    child.once('exit', (code) => {
      child = undefined;
      // If Electron quits on its own (user closed the window, crash), tear
      // down the Vite server so `bun run dev` exits cleanly instead of
      // leaving the terminal hung on the renderer dev server.
      if (!stopping && viteServer) {
        void viteServer.close().then(() => process.exit(code ?? 0));
      }
    });
  };

  const restartElectron = async () => {
    await killElectron();
    if (stopping) return;
    spawnElectron();
  };

  return {
    name: 'electron-dev',
    apply: 'serve',

    async configureServer(server) {
      viteServer = server;

      await rm(outdir, { recursive: true, force: true });

      ctx = await esbuild.context({
        entryPoints: [
          path.join(root, 'electron', 'main.ts'),
          path.join(root, 'electron', 'preload.ts'),
        ],
        outdir,
        outExtension: { '.js': '.cjs' },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        external: ['electron', 'better-sqlite3'],
        sourcemap: true,
        logLevel: 'info',
        plugins: [
          {
            name: 'electron-dev-restart',
            setup(build) {
              let first = true;
              build.onEnd((result) => {
                if (result.errors.length > 0) return;
                if (first) {
                  first = false;
                  // Wait for the renderer URL to be ready before the first
                  // spawn so Electron doesn't race the dev server.
                  server.httpServer?.once('listening', () => spawnElectron());
                  if (server.httpServer?.listening) spawnElectron();
                  return;
                }
                void restartElectron();
              });
            },
          },
        ],
      });

      await ctx.watch();

      const stop = async () => {
        if (stopping) return;
        stopping = true;
        await killElectron();
        await ctx?.dispose();
      };

      server.httpServer?.once('close', () => {
        void stop();
      });
      process.once('SIGINT', () => {
        void stop().then(() => process.exit(0));
      });
      process.once('SIGTERM', () => {
        void stop().then(() => process.exit(0));
      });
    },
  };
}
