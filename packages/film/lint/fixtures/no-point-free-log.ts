// Fixture for film/no-point-free-log: each line marked RED fires the rule, and
// nothing else does.
import { Array as Arr, Console, Effect, Option } from 'effect';

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
