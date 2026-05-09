import { Command } from 'effect/unstable/cli';

import { StudiesConfig } from '~/src/lib/content/configs';
import {
  makeDeleteCommand,
  makeListCommand,
  makeExportCommand,
  makeSyncCommand,
} from '~/src/lib/content/commands';

export const studies = Command.make('studies').pipe(
  Command.withSubcommands([
    makeSyncCommand(StudiesConfig),
    makeListCommand(StudiesConfig),
    makeExportCommand(StudiesConfig),
    makeDeleteCommand(StudiesConfig),
  ]),
);
