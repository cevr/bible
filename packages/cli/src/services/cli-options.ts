import { Flag } from 'effect/unstable/cli';
import { ServiceMap } from 'effect';

export interface CliOptionsService {
  readonly verbose: boolean;
}

export class CliOptions extends ServiceMap.Service<CliOptions, CliOptionsService>()(
  '@bible/cli/services/cli-options/CliOptions',
) {}

export const verbose = Flag.boolean('verbose').pipe(
  Flag.withAlias('v'),
  Flag.withDescription('Enable verbose logging'),
);

export const cliOptions = {
  verbose,
};
