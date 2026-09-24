import { Cause, Exit, Runtime } from 'effect';

/**
 * The process exit code for the server's end. A stop the host asks for is a
 * clean exit.
 *
 * `BunRuntime.runMain` interrupts the server on SIGTERM, and Effect's
 * default teardown gives an interrupted program exit code 130. Railway
 * reads 130 as a crash. Its ON_FAILURE policy then restarts the container it
 * has just stopped for a new deployment. The restarted container takes the
 * `/data` volume back, and the new deployment fails with no log line after
 * the mount. A stop is exit 0 here, and every other exit keeps the default.
 */
export const teardown: Runtime.Teardown = (exit, onExit) => {
  if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) {
    return onExit(0);
  }
  return Runtime.defaultTeardown(exit, onExit);
};
