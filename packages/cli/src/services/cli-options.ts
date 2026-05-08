import { Flag } from 'effect/unstable/cli';
import { Context } from 'effect';

export interface CliOptionsService {
  readonly verbose: boolean;
}

export class CliOptions extends Context.Service<CliOptions, CliOptionsService>()(
  '@bible/cli/services/cli-options/CliOptions',
) {}

export const verbose = Flag.boolean('verbose').pipe(
  Flag.withAlias('v'),
  Flag.withDescription('Enable verbose logging'),
);

export const cliOptions = {
  verbose,
};
