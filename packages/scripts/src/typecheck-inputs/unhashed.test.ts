import { describe, expect, test } from 'bun:test';

import { type TypecheckTask, unhashed } from './unhashed.js';

const task = (
  taskId: string,
  inputs: ReadonlyArray<string>,
  dependencies: ReadonlyArray<string> = [],
): readonly [string, TypecheckTask] => [taskId, { taskId, dependencies, inputs: new Set(inputs) }];

describe('unhashed', () => {
  test('names a file tsc reads that the task does not hash', () => {
    // The 2026-09 gap: apps/animations hashed src/** only, and tsc read server.ts.
    const tasks = new Map([
      task('app#typecheck', ['apps/app/src/main.ts', 'apps/app/tsconfig.json']),
    ]);
    const program = ['apps/app/src/main.ts', 'apps/app/server.ts'];
    expect(unhashed('app#typecheck', program, tasks)).toEqual(['apps/app/server.ts']);
  });

  test('counts the inputs of the tasks it depends on, transitively', () => {
    const tasks = new Map([
      task('app#typecheck', ['apps/app/src/main.ts'], ['film#typecheck']),
      task('film#typecheck', ['packages/film/src/film.ts'], ['core#typecheck']),
      task('core#typecheck', ['packages/core/src/index.ts']),
    ]);
    const program = [
      'apps/app/src/main.ts',
      'packages/film/src/film.ts',
      'packages/core/src/index.ts',
    ];
    expect(unhashed('app#typecheck', program, tasks)).toEqual([]);
  });

  test('does not count a workspace the task does not depend on', () => {
    // A path alias can reach a workspace the package.json never names.
    const tasks = new Map([
      task('app#typecheck', ['apps/app/src/main.ts']),
      task('core#typecheck', ['packages/core/src/index.ts']),
    ]);
    const program = ['apps/app/src/main.ts', 'packages/core/src/index.ts'];
    expect(unhashed('app#typecheck', program, tasks)).toEqual(['packages/core/src/index.ts']);
  });
});
