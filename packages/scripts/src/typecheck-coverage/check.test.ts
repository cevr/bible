import { describe, expect, it } from 'bun:test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem } from 'effect';

import { check } from './check.js';

/** A package in a temp dir: a tsconfig whose wildcard reads `**\/*.ts`, and `files`. */
const fixture = (files: Record<string, string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(
      `${root}/tsconfig.json`,
      '{ "compilerOptions": { "noEmit": true, "skipLibCheck": true }, "include": ["**/*.ts"] }',
    );
    for (const [file, source] of Object.entries(files)) {
      const at = `${root}/${file}`;
      yield* fs.makeDirectory(at.slice(0, at.lastIndexOf('/')), { recursive: true });
      yield* fs.writeFileString(at, source);
    }
    return root;
  });

const verdict = (files: Record<string, string>) =>
  fixture(files).pipe(Effect.flatMap(check), Effect.flip, Effect.scoped);

describe('the coverage check over a package', () => {
  it("names a nested file that tsc's wildcard skips", () =>
    Effect.gen(function* () {
      // tsc's `**` skips dot-directories, so only a walk of every level finds it.
      const error = yield* verdict({
        'src/a.ts': 'export const a = 1;\n',
        'src/.hidden/x.ts': 'export const x = 1;\n',
      });
      expect(error._tag).toBe('Uncovered');
      expect(error._tag === 'Uncovered' && error.files).toEqual(['src/.hidden/x.ts']);
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it('refuses a declaration file in the program', () =>
    Effect.gen(function* () {
      const error = yield* verdict({
        'src/a.ts': 'export const a = 1;\n',
        'src/decl.d.ts': 'export declare const broken: string;\n',
      });
      expect(error._tag).toBe('Unchecked');
      expect(error._tag === 'Unchecked' && error.files).toEqual(['src/decl.d.ts']);
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));

  it("refuses a declaration file by the rule's wider form", () =>
    Effect.gen(function* () {
      const error = yield* verdict({
        'src/a.ts': 'export const a = 1;\n',
        'src/style.d.css.ts': 'export declare const broken: NotAType;\n',
      });
      expect(error._tag).toBe('Unchecked');
      expect(error._tag === 'Unchecked' && error.files).toEqual(['src/style.d.css.ts']);
    }).pipe(Effect.provide(BunServices.layer), Effect.runPromise));
});
