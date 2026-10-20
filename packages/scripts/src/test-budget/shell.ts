// A package script as the shell reads it: its commands, each its words with
// their quotes and escapes gone, from its program on. The test budget's
// strength check (`strength.ts`) reads the flags of each `bun test` command
// in it, and the reach check (`reach.ts`) the files each one runs.

import { Predicate } from 'effect';

/** A word that sets a variable for the command after it: `CI=1`. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** A command's words from its program on: the variables it sets, bare or through `env`, gone. */
const programOf = (words: ReadonlyArray<string>) => {
  const at = words.findIndex((word) => word !== 'env' && !ASSIGNMENT.test(word));
  if (at < 0) return [];
  return words.slice(at);
};

/**
 * A script as the shell reads it, a token at a time: a separator between
 * commands (`&&`, `||`, `;`, `&`, `|` or a line's end), or a word, a run of
 * bare characters, escaped characters (`\|`) and quoted strings; a
 * separator or a space escaped or inside quotes is the word's.
 */
const TOKEN = /(&&|\|\||[;&|\n])|((?:\\[\s\S]|[^\s'";&|\\]+|'[^']*'|"(?:[^"\\]|\\[\s\S])*")+)/g;

/** A word that is a backslash before a line's end alone: the shell joins the lines, and reads no word there. */
const JOIN = /^(?:\\\n)+$/;

/**
 * A word as its command reads it: its quotes and escapes gone. A backslash
 * before a line's end joins the lines, bare or in double quotes; in double
 * quotes a backslash escapes only `$`, `` ` ``, `"` and `\`; in single quotes
 * nothing is escaped.
 */
const unquoted = (word: string) =>
  word.replace(/'([^']*)'|"((?:[^"\\]|\\[\s\S])*)"|\\([\s\S])/g, (_, single, double, bare) => {
    if (Predicate.isString(single)) return single;
    if (Predicate.isString(double))
      return double.replace(/\\\n/g, '').replace(/\\([$`"\\])/g, '$1');
    if (bare === '\n') return '';
    return String(bare);
  });

/** A word's bare characters: its quoted strings and escaped characters gone. */
const bareOf = (word: string) => word.replace(/'[^']*'|"(?:[^"\\]|\\[\s\S])*"|\\[\s\S]/g, '');

/**
 * A bare character the shell expands a word by: a glob (`*`, `?`, `[`),
 * which it turns into the names of the files it matches, a brace (`{a,b}`),
 * which it turns into more words, or a tilde, which it turns into a home.
 */
const EXPANDS = /[*?[\]{}~]/;

/**
 * A script as the shell reads it: its commands, each its words, and the
 * separators between them, in order, and whether a word holds a bare
 * character the shell expands it by (`EXPANDS`). A word that opens with a
 * bare `#` starts a comment: the shell reads nothing more of its line,
 * separators in it included.
 */
const readOf = (script: string) => {
  const commands: Array<Array<string>> = [[]];
  const separators: Array<string> = [];
  let comment = false;
  let expands = false;
  for (const [, separator, word = ''] of script.matchAll(TOKEN)) {
    if (separator === '\n') comment = false;
    if (comment) continue;
    if (separator) {
      separators.push(separator);
      commands.push([]);
    } else if (word.startsWith('#')) comment = true;
    else if (!JOIN.test(word)) {
      expands ||= EXPANDS.test(bareOf(word));
      commands[commands.length - 1]?.push(unquoted(word));
    }
  }
  return { commands, separators, expands };
};

/** A script's commands, each its words from its program on: the variables it sets, bare or through `env`, gone. */
export const commandsOf = (script: string): ReadonlyArray<ReadonlyArray<string>> =>
  readOf(script).commands.map(programOf);

/**
 * The shell's own commands that change what the commands after them run
 * with (their variables, their options, their folder, the program a name
 * runs), or whether they run at all (`exit`, `return`).
 */
const SHELL_CHANGES = new Set([
  'exit',
  'return',
  'logout',
  'break',
  'continue',
  'export',
  'readonly',
  'declare',
  'typeset',
  'local',
  'set',
  'unset',
  'shopt',
  'setopt',
  'alias',
  'unalias',
  'hash',
  'enable',
  'builtin',
  'command',
  'eval',
  'exec',
  'source',
  '.',
  'trap',
  'umask',
  'ulimit',
  'read',
  'getopts',
  'let',
  'shift',
  'cd',
  'pushd',
  'popd',
  'kill',
]);

/**
 * Whether a command of a script sets a variable, bare or through `env`
 * (`CI=1 bun test`, `env BUN_OPTIONS=-t bun test`), or is one of the shell's
 * own that changes what later commands run with, or ends the script
 * (`SHELL_CHANGES`: `export BUN_OPTIONS=-t`, `exit 0`): a variable such as
 * `BUN_OPTIONS` or `NODE_OPTIONS` hands a program flags its words do not
 * show, and `exit 0 && bun test` passes with no test run. A script that
 * holds a `$` or a backtick anywhere changes them too: an expansion
 * (`bun test src $EXTRA`) may hand a program words its text does not show.
 * So does a word the shell expands (`EXPANDS`: `bun test --conditions
 * ./src/*.test.ts` hands bun one file as a condition's value), and a `<` or
 * `>` anywhere: a redirection (`bun test src > report.log`) takes its words
 * from the command.
 */
export const changesShell = (script: string) => {
  const read = readOf(script);
  return (
    /[$`<>]/.test(script) ||
    read.expands ||
    read.commands.some((words) => {
      const program = words[0] ?? '';
      return program === 'env' || ASSIGNMENT.test(program) || SHELL_CHANGES.has(program);
    })
  );
};

/**
 * Whether a script's commands are joined by `&&` alone: each runs only when
 * the one before it passed, so every command runs or the script fails. One
 * joined by `||`, `;`, `&`, `|` or a line's end may skip a command, or pass
 * when it fails.
 */
export const andChained = (script: string) =>
  readOf(script).separators.every((separator) => separator === '&&');

/** The words of each `bun test` command in a script, after `test`. */
export const bunTests = (script: string): ReadonlyArray<ReadonlyArray<string>> =>
  commandsOf(script)
    .filter((words) => words[0] === 'bun' && words.includes('test'))
    .map((words) => words.slice(words.indexOf('test') + 1));
