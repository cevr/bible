#!/usr/bin/env bun
// The doc lines a branch's review reads: every line of the docs the docs test
// reads (the film README and skills, NORTH_STAR, PRIOR_ARTS, CLAUDE.md, the
// packages' and apps' READMEs, the design language) that names a file the
// branch changed, read by the docs test's own anchor reader
// (`fixtures/doc-anchors.ts` `docLines`). A sentence's claim about a file goes stale
// when the file changes and no name in it does, so the docs test stays
// green; the reviewer reads these lines instead.
//
//   bun run doc-lines <base>     # the files of <base>...HEAD, the docs as they stand
//
// Prints `doc-lines <doc>:<line> <file>[, <file>]: <the line>` for each, then
// `doc-lines <base>..HEAD files=<n> lines=<n>`. A unit's review request
// carries its output.

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Path } from 'effect';
import { Argument, Command } from 'effect/cli';
import * as ChildProcess from 'effect/process/ChildProcess';
import { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import { docLines, readAllDocs } from './doc-anchors.ts';

/** How much of a line the report shows. */
const SHOWN = 160;

const docLinesOf = Effect.fn('docLines.run')(function* (base: string) {
  const path = yield* Path.Path;
  const root = path.join(import.meta.dir, '..', '..', '..', '..');
  const spawner = yield* ChildProcessSpawner;
  const out = yield* spawner.string(
    ChildProcess.make('git', ['diff', '--name-only', `${base}...HEAD`], {
      cwd: root,
      forceKillAfter: '5 seconds',
    }),
  );
  const changed = new Set(out.split('\n').filter((file) => file !== ''));
  const lines = yield* docLines(yield* readAllDocs(root), changed);
  for (const { doc, line, files, text } of lines) {
    const shown = `${text.slice(0, SHOWN)}${'…'.repeat(Number(text.length > SHOWN))}`;
    yield* Console.log(`doc-lines ${doc}:${line} ${files.join(', ')}: ${shown}`);
  }
  yield* Console.log(`doc-lines ${base}..HEAD files=${changed.size} lines=${lines.length}`);
});

const command = Command.make('doc-lines', { base: Argument.String('base') }, ({ base }) =>
  docLinesOf(base),
).pipe(Command.withDescription('Name every doc line that names a file the branch changed'));

Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
