import { spawn, type ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import electronPath from 'electron/index.js';
import { Effect, Result } from 'effect';
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

  // 3s after SIGTERM, escalate to SIGKILL. Electron usually exits on SIGTERM
  // within ~100ms, but a hung main process or a stuck devtools detach can
  // leave a zombie that blocks port 9333 and prevents respawn.
  const KILL_ESCALATION_MS = 3000;

  const failureMessage = (cause: unknown): string => {
    if (cause instanceof Error) return cause.message;
    return String(cause);
  };

  const attemptKill = (active: ChildProcess, signal?: NodeJS.Signals) =>
    Effect.try({
      try: () => active.kill(signal),
      catch: (cause) => cause,
    });

  const killElectron = Effect.callback<void>((resume) => {
    const c = child;
    if (!c || c.exitCode !== null) {
      child = undefined;
      resume(Effect.void);
      return;
    }
    let complete = false;
    const finish = (): void => {
      if (complete) return;
      complete = true;
      child = undefined;
      resume(Effect.void);
    };
    c.removeAllListeners('exit');
    const escalate = setTimeout(() => {
      if (c.exitCode !== null) return;
      console.warn(
        `[electron-dev] SIGTERM ignored after ${String(KILL_ESCALATION_MS)}ms — sending SIGKILL to pid ${String(c.pid ?? 0)}`,
      );
      const killed = Effect.runSync(Effect.result(attemptKill(c, 'SIGKILL')));
      if (Result.isFailure(killed)) {
        console.warn(`[electron-dev] SIGKILL failed: ${failureMessage(killed.failure)}`);
        // Resolve anyway so the dev loop doesn't deadlock. The next spawn
        // will likely fail loudly, which is the warning we want.
        child = undefined;
        finish();
      }
    }, KILL_ESCALATION_MS);
    c.once('exit', () => {
      clearTimeout(escalate);
      finish();
    });
    const terminated = Effect.runSync(Effect.result(attemptKill(c)));
    if (Result.isFailure(terminated)) {
      clearTimeout(escalate);
      console.warn(
        `[electron-dev] SIGTERM failed: ${failureMessage(terminated.failure)} — trying SIGKILL`,
      );
      const killed = Effect.runSync(Effect.result(attemptKill(c, 'SIGKILL')));
      if (Result.isFailure(killed)) {
        console.warn(`[electron-dev] SIGKILL failed: ${failureMessage(killed.failure)}`);
        finish();
      }
    }
    return Effect.sync(() => {
      clearTimeout(escalate);
      c.removeAllListeners('exit');
    });
  });

  const spawnElectron = (): boolean => {
    if (typeof electronPath !== 'string') {
      console.warn('[electron-dev] FAILED TO SPAWN ELECTRON: executable path is unavailable');
      return false;
    }
    const spawned = Effect.runSync(
      Effect.result(
        Effect.try({
          try: () =>
            spawn(electronPath, ['.', '--remote-debugging-port=9333'], {
              cwd: root,
              stdio: 'inherit',
              env: { ...process.env, NODE_ENV: 'development' },
            }),
          catch: (cause) => cause,
        }),
      ),
    );
    if (Result.isFailure(spawned)) {
      console.warn(`[electron-dev] FAILED TO SPAWN ELECTRON: ${failureMessage(spawned.failure)}`);
      console.warn('[electron-dev] dev server is running but no renderer is attached');
      child = undefined;
      return false;
    }
    const activeChild = spawned.success;
    child = activeChild;
    activeChild.once('error', (err) => {
      console.warn(`[electron-dev] electron process error: ${err.message}`);
    });
    activeChild.once('exit', (code) => {
      child = undefined;
      // If Electron quits on its own (user closed the window, crash), tear
      // down the Vite server so `bun run dev` exits cleanly instead of
      // leaving the terminal hung on the renderer dev server.
      if (!stopping && viteServer) {
        void viteServer.close().then(() => process.exit(code ?? 0));
      }
    });
    return true;
  };

  const restartElectron = async () => {
    await Effect.runPromise(killElectron);
    if (stopping) return;
    const spawned = spawnElectron();
    if (!spawned) {
      console.warn(
        '[electron-dev] BUILD SUCCEEDED BUT RESTART DID NOT FIRE — fix the spawn error above and re-save to retry',
      );
    }
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
        loader: { '.sql': 'text' },
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
                  const trySpawn = (): void => {
                    const spawned = spawnElectron();
                    if (!spawned) {
                      console.warn(
                        '[electron-dev] FIRST BUILD SUCCEEDED BUT INITIAL SPAWN FAILED — see error above',
                      );
                    }
                  };
                  server.httpServer?.once('listening', trySpawn);
                  if (server.httpServer?.listening) trySpawn();
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
        await Effect.runPromise(killElectron);
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
