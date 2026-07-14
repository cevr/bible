import { Console, Effect } from 'effect';
import { Argument, Command } from 'effect/unstable/cli';

import { parseEgwLocation } from '../../lib/parse-egw-location.js';
import { InteractiveReader, InvalidReaderReference } from '../../services/interactive-reader.js';

const query = Argument.string('query').pipe(Argument.variadic());

export const egwOpen = Command.make('open', { query }, (args) =>
  Effect.gen(function* () {
    const reader = yield* InteractiveReader;
    const queryStr = args.query.join(' ').trim();

    if (queryStr.length === 0) {
      return yield* reader.open({ _tag: 'egw' });
    }

    const location = parseEgwLocation(queryStr);
    if (location === undefined) {
      yield* Console.error(`Could not parse EGW reference: "${queryStr}"`);
      yield* Console.error('Examples: PP 351.1, DA 1, GC 100');
      return yield* new InvalidReaderReference({ reader: 'egw', input: queryStr });
    }

    yield* reader.open({ _tag: 'egw', location });
  }),
);
