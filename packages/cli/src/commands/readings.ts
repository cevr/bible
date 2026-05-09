import { Command } from 'effect/unstable/cli';

import { ReadingsConfig } from '~/src/lib/content/configs';
import {
  makeDeleteCommand,
  makeListCommand,
  makeExportCommand,
  makeSyncCommand,
} from '~/src/lib/content/commands';

export const readings = Command.make('readings').pipe(
  Command.withSubcommands([
    makeSyncCommand(ReadingsConfig),
    makeListCommand(ReadingsConfig),
    makeExportCommand(ReadingsConfig),
    makeDeleteCommand(ReadingsConfig),
  ]),
);
