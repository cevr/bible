import * as BunServices from '@effect/platform-bun/BunServices';
import { Glob } from 'bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { weakeningFlags } from './strength.ts';

const Root = Schema.fromJsonString(Schema.Struct({ workspaces: Schema.Array(Schema.String) }));
const Manifest = Schema.fromJsonString(
  Schema.Struct({
    scripts: Schema.optionalKey(Schema.Struct({ test: Schema.optionalKey(Schema.String) })),
  }),
);

describe("a workspace's test script", () => {
  it.effect('a flag that raises the timeout, retries, or runs fewer tests is refused', () =>
    Effect.sync(() => {
      expect(weakeningFlags('bun test --parallel --timeout 20000 src')).toHaveLength(1);
      expect(weakeningFlags('bun test --timeout=20000 src')).toHaveLength(1);
      expect(weakeningFlags('bun test --timeout SLOW')).toHaveLength(1);
      expect(weakeningFlags('bun test --retry=3 src')).toHaveLength(1);
      expect(weakeningFlags('bun test --only')).toHaveLength(1);
      expect(weakeningFlags("bun test -t 'fast'")).toHaveLength(1);
      expect(weakeningFlags('bun test src && bun test --timeout 9000 lib')).toHaveLength(1);
      expect(weakeningFlags('bun --conditions=browser test --test-name-pattern x')).toHaveLength(1);
    }),
  );

  it.effect("bun's own default, a tighter limit, and other commands pass", () =>
    Effect.sync(() => {
      expect(weakeningFlags('bun test --parallel --no-isolate --timings=t.json src lint')).toEqual(
        [],
      );
      expect(weakeningFlags('bun test --timeout 5000 src')).toEqual([]);
      expect(weakeningFlags('bun test --timeout=1000')).toEqual([]);
      expect(weakeningFlags('turbo run test')).toEqual([]);
      expect(weakeningFlags('./scripts/workspace.sh test')).toEqual([]);
      expect(weakeningFlags('playwright test --timeout 60000')).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)(
    'every workspace of the repo runs its tests at full strength',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = path.join(import.meta.dir, '..', '..', '..', '..');
        const { workspaces } = yield* Schema.decodeEffect(Root)(
          yield* fs.readFileString(path.join(root, 'package.json')),
        );
        const manifests = workspaces.flatMap((pattern) => [
          ...new Glob(`${pattern}/package.json`).scanSync({ cwd: root }),
        ]);
        expect(manifests.length).toBeGreaterThan(5);
        const weak = yield* Effect.forEach(manifests, (manifest) =>
          Effect.map(
            Effect.flatMap(
              fs.readFileString(path.join(root, manifest)),
              Schema.decodeEffect(Manifest),
            ),
            ({ scripts }) =>
              weakeningFlags(Option.getOrElse(Option.fromUndefinedOr(scripts?.test), () => '')).map(
                (why) => `${manifest}: ${why}`,
              ),
          ),
        );
        expect(weak.flat()).toEqual([]);
      }),
  );
});
