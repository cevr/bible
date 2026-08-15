import { spawn, type ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import electronPath from 'electron/index.js';
import { Data, Effect, Option, Predicate, Result, Schema } from 'effect';
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

class ElectronProcessError extends Data.TaggedError('ElectronProcessError')<{
  readonly cause: unknown;
}> {}

export function electronDev(): Plugin {
  const root = path.resolve(import.meta.dirname, '..');
  const outdir = path.join(root, 'dist', 'main');

  // `electron/index.js` resolves to the executable path in a Node host; parse
  // that contract at the import boundary instead of narrowing with typeof.
  const electronExecutable = Schema.decodeOption(Schema.String)(electronPath);

  let ctx: Option.Option<esbuild.BuildContext> = Option.none();
  let child: Option.Option<ChildProcess> = Option.none();
  let viteServer: Option.Option<ViteDevServer> = Option.none();
  let stopping = false;

  // 3s after SIGTERM, escalate to SIGKILL. Electron usually exits on SIGTERM
  // within ~100ms, but a hung main process or a stuck devtools detach can
  // leave a zombie that blocks port 9333 and prevents respawn.
  const KILL_ESCALATION_MS = 3000;

  const failureMessage = (failure: ElectronProcessError): string => {
    if (failure.cause instanceof Error) return failure.cause.message;
    return String(failure.cause);
  };

  const attemptKill = (active: ChildProcess, signal?: NodeJS.Signals) =>
    Effect.try({
      try: () => active.kill(signal),
      catch: (cause) => new ElectronProcessError({ cause }),
    });

  const killElectron = Effect.callback<void>((resume) => {
    const current = child;
    if (Option.isNone(current) || Predicate.isNotNull(current.value.exitCode)) {
      child = Option.none();
      resume(Effect.void);
      return;
    }
    const c = current.value;
    let complete = false;
    const finish = (): void => {
      if (complete) return;
      complete = true;
      child = Option.none();
      resume(Effect.void);
    };
    c.removeAllListeners('exit');
    const escalate = setTimeout(() => {
      if (Predicate.isNotNull(c.exitCode)) return;
      console.warn(
        `[electron-dev] SIGTERM ignored after ${String(KILL_ESCALATION_MS)}ms — sending SIGKILL to pid ${String(c.pid ?? 0)}`,
      );
      const killed = Effect.runSync(Effect.result(attemptKill(c, 'SIGKILL')));
      if (Result.isFailure(killed)) {
        console.warn(`[electron-dev] SIGKILL failed: ${failureMessage(killed.failure)}`);
        // Resolve anyway so the dev loop doesn't deadlock. The next spawn
        // will likely fail loudly, which is the warning we want.
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
    if (Option.isNone(electronExecutable)) {
      console.warn('[electron-dev] FAILED TO SPAWN ELECTRON: executable path is unavailable');
      return false;
    }
    const executable = electronExecutable.value;
    const spawned = Effect.runSync(
      Effect.result(
        Effect.try({
          try: () =>
            spawn(executable, ['.', '--remote-debugging-port=9333'], {
              cwd: root,
              stdio: 'inherit',
              env: { ...process.env, NODE_ENV: 'development' },
            }),
          catch: (cause) => new ElectronProcessError({ cause }),
        }),
      ),
    );
    if (Result.isFailure(spawned)) {
      console.warn(`[electron-dev] FAILED TO SPAWN ELECTRON: ${failureMessage(spawned.failure)}`);
      console.warn('[electron-dev] dev server is running but no renderer is attached');
      child = Option.none();
      return false;
    }
    const activeChild = spawned.success;
    child = Option.some(activeChild);
    activeChild.once('error', (err) => {
      console.warn(`[electron-dev] electron process error: ${err.message}`);
    });
    activeChild.once('exit', (code) => {
      child = Option.none();
      // If Electron quits on its own (user closed the window, crash), tear
      // down the Vite server so `bun run dev` exits cleanly instead of
      // leaving the terminal hung on the renderer dev server.
      const server = viteServer;
      if (!stopping && Option.isSome(server)) {
        void server.value.close().then(() => process.exit(code ?? 0));
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
      viteServer = Option.some(server);

      await rm(outdir, { recursive: true, force: true });

      const buildContext = await esbuild.context({
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
      ctx = Option.some(buildContext);

      await buildContext.watch();

      const stop = async () => {
        if (stopping) return;
        stopping = true;
        await Effect.runPromise(killElectron);
        const active = ctx;
        if (Option.isSome(active)) await active.value.dispose();
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
