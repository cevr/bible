/** Keynote slide deck CLI commands. */

import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { slidesBuild } from './slides/build.js';
import { slidesInsert } from './slides/insert.js';
import { slidesInterleave } from './slides/interleave.js';
import { slidesList } from './slides/list.js';
import { slidesMove } from './slides/move.js';
import { slidesSwap } from './slides/swap.js';

export { slidesBuild, slidesInsert, slidesInterleave, slidesList, slidesMove, slidesSwap };

export const slides = Command.make('slides', {}, () =>
  Effect.gen(function* () {
    yield* Console.log('Usage: bible slides <build|swap|list> [options]');
    yield* Console.log('');
    yield* Console.log(
      '  build      <beat-sheet.json> --out <deck.key> [--theme] [--master] [--open]',
    );
    yield* Console.log('  swap       <deck> <caption> <image> [--image-dir <dir>]');
    yield* Console.log('  list       <deck> [--json]');
    yield* Console.log(
      '  interleave <deck> <verses.json> [--master]   insert text-only verse slides',
    );
    yield* Console.log('  insert     <deck> <after> <image> [--caption] [--note] [--image-dir]');
    yield* Console.log('  move       <deck> <caption> <anchor> [--before]   reorder a slide');
  }),
).pipe(
  Command.withSubcommands([
    slidesBuild,
    slidesSwap,
    slidesList,
    slidesInterleave,
    slidesInsert,
    slidesMove,
  ]),
);
