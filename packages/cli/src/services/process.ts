import { Context, Effect, Layer } from 'effect';

export interface CliProcessService {
  readonly exitFailure: Effect.Effect<never>;
  /** The running process id — what the search daemon reports over its status
   *  procedure, and the one process fact no Effect service already carries. */
  readonly pid: number;
}

export class CliProcess extends Context.Service<CliProcess, CliProcessService>()(
  '@bible/cli/services/process/CliProcess',
) {}

export const CliProcessLive = Layer.succeed(
  CliProcess,
  CliProcess.of({
    exitFailure: Effect.sync(() => process.exit(1)),
    pid: process.pid,
  }),
);
