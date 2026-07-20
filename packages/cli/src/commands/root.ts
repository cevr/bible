import { Command } from 'effect/unstable/cli';
import { Console, Effect, References } from 'effect';

import { concordance, verse } from './bible.js';
import { egwWithSubcommands } from './egw.js';
import { exportOutput } from './export.js';
import { handbook } from './handbook.js';
import { hymns } from './hymns.js';
import { init } from './init.js';
import { messages } from './messages.js';
import { notes } from './notes.js';
import { readings } from './readings.js';
import { sabbathSchool } from './sabbath-school.js';
import { slides } from './slides.js';
import { studies } from './studies.js';
import { sync } from './sync.js';
import { cliOptions, CliOptions } from '../services/cli-options.js';
import { CliProcessLive } from '../services/process.js';

const rootHelp = `Bible study tools

Usage: bible <command> [options]

Commands:
  verse             Read or search Bible text
  concordance       Search Strong's concordance entries
  egw               Read or search Ellen G. White writings
  studies           Generate and manage studies
  sabbath-school    Generate Sabbath School outlines
  messages          Generate sermon messages
  readings          Manage reading material
  slides            Build presentation decks
  handbook          Generate handbook studies
  hymns             Search hymns
  notes             Export and organize Apple Notes
  export            Export generated output
  init              Initialize local data
  sync              Synchronize local data

Run 'bible <command> --help' for command-specific help.`;

/** The single production graph for non-interactive CLI commands. */
export const rootCommand = Command.make('bible', cliOptions, () => Console.log(rootHelp)).pipe(
  Command.withSubcommands([
    concordance,
    verse,
    egwWithSubcommands,
    slides,
    handbook,
    hymns,
    messages,
    notes,
    sabbathSchool,
    studies,
    readings,
    exportOutput,
    init,
    sync,
  ]),
  Command.provideSync(CliOptions, (input) => {
    let verbose = false;
    if ('verbose' in input) verbose = input.verbose;
    return { verbose };
  }),
  Command.provideEffect(References.MinimumLogLevel, (input) => {
    let level: 'Debug' | 'Info' = 'Info';
    if ('verbose' in input && input.verbose) level = 'Debug';
    return Effect.succeed(level);
  }),
  Command.provide(() => CliProcessLive),
);
