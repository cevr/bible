// A workspace's `test` script runs its tests at their full strength: no flag
// of `bun test` in it runs a test less or gives it more time, so no suite
// fits the ten-second budget (`budget.ts`) by weakening. The tests' own
// skips, retries and timeouts are oxlint's (`film/tests-keep-their-strength`);
// a script is not a source oxlint reads, so its flags are read here:
// `strength.test.ts` holds every workspace's `test` script of the repo to it
// in the gate, and `test:budget` measures no workspace whose script weakens.
//
// Refused, in each `bun test` command of the script (a script may chain
// several with `&&`, `||` or `;`): `--timeout` over bun's 5 s default (or
// one that is not a number), `--retry`, `--only` and `-t` /
// `--test-name-pattern`.

import { Option } from 'effect';

/** bun's own timeout for a test that names none, in milliseconds. */
const BUN_DEFAULT_MS = 5_000;

/** The flags that run a test less, by their long and short spellings. */
const WEAKENING = new Map([
  ['--retry', 'retries a failing test until it passes'],
  ['--only', 'runs only the tests marked .only'],
  ['--test-name-pattern', 'runs only the tests whose names match'],
  ['-t', 'runs only the tests whose names match'],
]);

/** The words of each `bun test` command in a script. */
const bunTests = (script: string): ReadonlyArray<ReadonlyArray<string>> =>
  script
    .split(/&&|\|\||;/)
    .map((command) => command.trim().split(/\s+/))
    .filter((words) => words[0] === 'bun' && words.includes('test'))
    .map((words) => words.slice(words.indexOf('test') + 1));

/** A flag's name and its value: `--timeout=20000`, or `--timeout 20000` (the next word). */
const flagAt = (words: ReadonlyArray<string>, at: number) => {
  const word = words[at] ?? '';
  const [name = '', inline] = word.split(/=(.*)/s);
  return { name, value: inline ?? words[at + 1] ?? '' };
};

/** What weakens the tests in a workspace's `test` script, a line each: none when it runs them at full strength. */
export const weakeningFlags = (script: string): ReadonlyArray<string> =>
  bunTests(script).flatMap((words) =>
    words.flatMap((word, at) => {
      if (!word.startsWith('-')) return [];
      const { name, value } = flagAt(words, at);
      if (name === '--timeout') {
        const ms = Number(value);
        if (Number.isFinite(ms) && ms <= BUN_DEFAULT_MS) return [];
        return [
          `--timeout ${value} gives every test more than bun's 5 s: make the slow tests fast, and give a test that spawns its own spawn budget`,
        ];
      }
      return Option.toArray(
        Option.map(
          Option.fromUndefinedOr(WEAKENING.get(name)),
          (why) => `${name} ${why}: run every test, every time`,
        ),
      );
    }),
  );
