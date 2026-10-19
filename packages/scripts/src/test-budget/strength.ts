// A workspace's `test` script runs its tests at their full strength: no flag
// of `bun test` in it runs a test less or gives it more time, so no suite
// fits the ten-second budget (`budget.ts`) by weakening. The tests' own
// skips, retries and timeouts are oxlint's (`film/tests-keep-their-strength`);
// a script is not a source oxlint reads, so its flags are read here:
// `strength.test.ts` holds every workspace's `test` script of the repo to it
// in the gate, and `test:budget` measures no workspace whose script weakens.
//
// Refused, in each `bun test` command of the script (a script may chain
// several with `&&`, `||` or `;`, and set variables before one, bare or
// through `env`): `--timeout` over bun's 5 s default, of 0 or under (which
// sets none), or one that is not a number, `--retry`, `--only` and `-t` /
// `--test-name-pattern` (`-t` with its value attached too, `-tfast`).

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

/** A word that sets a variable for the command after it: `CI=1`. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** A command's words from its program on: the variables it sets, bare or through `env`, gone. */
const programOf = (words: ReadonlyArray<string>) => {
  const at = words.findIndex((word) => word !== 'env' && !ASSIGNMENT.test(word));
  if (at < 0) return [];
  return words.slice(at);
};

/** The words of each `bun test` command in a script, after `test`. */
const bunTests = (script: string): ReadonlyArray<ReadonlyArray<string>> =>
  script
    .split(/&&|\|\||;/)
    .map((command) => programOf(command.trim().split(/\s+/)))
    .filter((words) => words[0] === 'bun' && words.includes('test'))
    .map((words) => words.slice(words.indexOf('test') + 1));

/**
 * A flag's name and its value: `--timeout=20000`, or `--timeout 20000` (the
 * next word); a short flag's value may be attached (`-tfast`).
 */
const flagAt = (words: ReadonlyArray<string>, at: number) => {
  const word = words[at] ?? '';
  if (/^-[^-]./.test(word)) return { name: word.slice(0, 2), value: word.slice(2) };
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
        if (Number.isFinite(ms) && ms > 0 && ms <= BUN_DEFAULT_MS) return [];
        return [
          `--timeout ${value} gives every test more than bun's 5 s (0 sets none): make the slow tests fast, and give a test that spawns its own spawn budget`,
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
