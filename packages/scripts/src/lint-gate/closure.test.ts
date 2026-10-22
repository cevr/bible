import { describe, expect, it } from 'effect-bun-test';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Schema } from 'effect';

import { importClosure, pluginsOf } from './closure.js';
import { LintConfig } from './config.js';

/** The repository's two JS plugins, as `.oxlintrc.json` names them. */
const config = Schema.decodeSync(LintConfig)({
  jsPlugins: ['oxlint-plugin-effect/plugin', './packages/film/lint/plugin.ts'],
});

describe("the files the gate's lint keys", () => {
  it.effect.layer(BunServices.layer)(
    'follow each import a plugin makes, through `.js` names, and stop at node_modules',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: 'lint-closure-' });
        const write = (file: string, text: string) =>
          Effect.andThen(
            fs.makeDirectory(path.dirname(path.join(root, file)), { recursive: true }),
            fs.writeFileString(path.join(root, file), text),
          );
        yield* write('lint/plugin.ts', "import { rule } from './rule.js';\nexport default rule;\n");
        yield* write(
          'lint/rule.ts',
          "import { LIMIT } from '../src/limit.ts';\nexport const rule = LIMIT;\n",
        );
        yield* write('src/limit.ts', "import dep from 'dep';\nexport const LIMIT = dep;\n");
        yield* write('src/unused.ts', 'export const unused = 1;\n');
        yield* write('node_modules/dep/package.json', '{"name":"dep","main":"index.js"}');
        yield* write('node_modules/dep/index.js', 'export default 1;\n');
        const files = yield* importClosure(root, ['./lint/plugin.ts', 'dep']);
        expect(files).toEqual(['lint/plugin.ts', 'lint/rule.ts', 'src/limit.ts']);
      }).pipe(Effect.scoped),
  );

  it.effect.layer(BunServices.layer)(
    "hold the modules the film plugin's rules import from the film's sources",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const root = path.resolve(import.meta.dir, '..', '..', '..', '..');
        const files = yield* importClosure(root, pluginsOf(config));
        expect(files).toContain('packages/film/lint/framing-is-a-knob.ts');
        expect(files).toContain('packages/film/src/canvas/camera.ts');
        expect(files).toContain('packages/film/src/tools/scene-source.ts');
        expect(files.filter((file) => file.includes('node_modules'))).toEqual([]);
      }),
  );
});
