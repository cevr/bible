import { Flag } from 'effect/cli';
import { Context } from 'effect';

interface CliOptionsService {
  readonly verbose: boolean;
}

export class CliOptions extends Context.Service<CliOptions, CliOptionsService>()(
  '@bible/cli/services/cli-options/CliOptions',
) {}

const verbose = Flag.Boolean('verbose').pipe(
  Flag.withDescription('Enable verbose logging'),
  Flag.withDefault(false),
);

export const cliOptions = {
  verbose,
};
