import { Argument, Command } from 'effect/unstable/cli';
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
import { parseReaderReference } from '../lib/parse-reader-reference.js';
import { cliOptions, CliOptions } from '../services/cli-options.js';
import { InteractiveReader, InvalidReaderReference } from '../services/interactive-reader.js';

const reference = Argument.string('reference').pipe(Argument.variadic());

export const open = Command.make('open', { reference }, ({ reference }) =>
  Effect.gen(function* () {
    const reader = yield* InteractiveReader;
    const input = reference.join(' ').trim();

    if (input.length === 0) {
      return yield* reader.open({ _tag: 'bible' });
    }

    const parsed = parseReaderReference(input);
    if (parsed === undefined) {
      yield* Console.error(`Could not parse Bible reference: "${input}"`);
      yield* Console.error('Examples: john 3:16, gen 1:1, 1 cor 13, psalms');
      return yield* new InvalidReaderReference({ reader: 'bible', input });
    }

    yield* reader.open({ _tag: 'bible', reference: parsed });
  }),
);

/** The single production command graph, including interactive reader routes. */
export const rootCommand = Command.make('bible', cliOptions, () =>
  Effect.gen(function* () {
    const reader = yield* InteractiveReader;
    yield* reader.open({ _tag: 'bible' });
  }),
).pipe(
  Command.withSubcommands([
    open,
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
  Command.provideSync(CliOptions, (input) => ({
    verbose: 'verbose' in input ? input.verbose : false,
  })),
  Command.provideEffect(References.MinimumLogLevel, (input) =>
    Effect.succeed<'Debug' | 'Info'>('verbose' in input && input.verbose ? 'Debug' : 'Info'),
  ),
);
