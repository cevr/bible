// Fixture for film/no-point-free-log: each line marked RED fires the rule, and
// nothing else does.
import { Array as Arr, Console, Effect, Option } from 'effect';
import { Console as C } from 'effect';
import * as E from 'effect/Effect';

const lines = ['one', 'two'];

export const printed = [
  Effect.forEach(lines, Console.log), // RED film/no-point-free-log
  Effect.forEach(lines, Effect.logInfo), // RED film/no-point-free-log
  lines.forEach(console.log), // RED film/no-point-free-log
  lines.map(Console.error), // RED film/no-point-free-log
  Arr.map(lines, Console.log), // RED film/no-point-free-log
  Effect.forEach(lines, (line) => Console.log(line)),
  lines.forEach((line) => console.log(line)),
  Effect.flatMap(Effect.succeed('one'), Console.log),
  Option.map(Option.some('one'), Console.log),
  Console.log(lines),
];

// Effect's loggers under another name are the same loggers.
export const renamed = [
  Effect.forEach(lines, C.log), // RED film/no-point-free-log
  E.forEach(lines, E.logInfo), // RED film/no-point-free-log
];

// A `console` or `Effect` of the file's own is not the host's or effect's.
export const own = (
  console: { readonly log: (line: string) => void },
  Effect: { readonly forEach: (xs: ReadonlyArray<string>, f: (x: string) => void) => void },
) => [lines.forEach(console.log), Effect.forEach(lines, Option.getOrThrow)];
