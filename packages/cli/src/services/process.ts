import { Context, Effect, Layer } from 'effect';

export interface CliProcessService {
  readonly exitFailure: Effect.Effect<never>;
}

export class CliProcess extends Context.Service<CliProcess, CliProcessService>()(
  '@bible/cli/services/process/CliProcess',
) {}

export const CliProcessLive = Layer.succeed(CliProcess, {
  exitFailure: Effect.sync(() => process.exit(1)),
});
