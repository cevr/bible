// The film's composition root is built once (`film-services.ts`): the
// services every `film` command and the lab run with, the lab's pages, and
// the lab's start. Its deletion test: delete it, and each of its consumers
// would build the graph again, as the CLI and the studio harness did before,
// and drifted (the harness's pages lacked the assets, the CLI's source had
// stamps the harness's had not). So no module but the root builds these
// layers, and its consumers are named: the CLI (`runFilmCli`) and the app's
// studio harness, which drives the same lab over a copy of a film with a
// fake ElevenLabs. A test's own graph (`testing.ts`, `fixtures/`, a
// `*.test.ts`) is a fake's, not the app's, and is not swept.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';

const repo = `${import.meta.dir}/../../../..`;

/** The root. */
const ROOT = 'packages/film/src/tools/film-services.ts';

/** The framework's source, recursively; the app's entries, its own top-level modules. */
const SWEPT = [
  { dir: 'packages/film/src', recursive: true },
  { dir: 'apps/animations', recursive: false },
] as const;

/** What a test builds its own graph in: a fake's, not the app's. */
const TESTS = /(^|\/)(node_modules|fixtures)\/|\.test\.tsx?$|(^|\/)testing\.ts$/;
const SOURCE = /\.tsx?$/;

/** A comment line, which may name a layer freely. */
const COMMENT = /^\s*(\/\/|\/?\*).*$/;

/** A layer of the root's built (not a type's `typeof X.layer`). */
const BUILT =
  /(?<!typeof )\b(FilmRepo|NotesStore|FreshFilm|SceneWriter|SceneHead|SceneSources|SourceWriter|RenderCatalogue|Choices|StudioReadings|Takes|Narrator|Composer|Mixer|SoundLibrary|PrivateStore|Stamps|LabPage|Easel)\.layer\b|\bReview\.layerConfig\b/;

/** The root's services asked for. */
const CONSUMES = /\bfilmServices\(/;

/** Each swept source's `path:line` whose code (comments aside) matches `pattern`. */
const linesMatching = (pattern: RegExp) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const found = yield* Effect.forEach(SWEPT, ({ dir, recursive }) =>
      Effect.gen(function* () {
        const files = yield* fs.readDirectory(`${repo}/${dir}`, { recursive });
        const sources = files.filter((file) => SOURCE.test(file) && !TESTS.test(file));
        const lines = yield* Effect.forEach(sources, (file) =>
          Effect.map(fs.readFileString(`${repo}/${dir}/${file}`), (text) =>
            text
              .split('\n')
              .map((line, index) => ({ code: line.replace(COMMENT, ''), at: index + 1 }))
              .filter(({ code }) => pattern.test(code))
              .map(({ at }) => `${dir}/${file}:${at}`),
          ),
        );
        return lines.flat();
      }),
    );
    return found.flat();
  });

/** The files among `lines` (`path:line`), each once, in order. */
const filesOf = (lines: ReadonlyArray<string>) =>
  [...new Set(lines.map((line) => line.slice(0, line.lastIndexOf(':'))))].toSorted();

describe("the film's composition root", () => {
  it.effect('no module but the root builds its layers', () =>
    Effect.gen(function* () {
      const built = yield* linesMatching(BUILT);
      expect(built.filter((line) => !line.startsWith(`${ROOT}:`))).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );

  it.effect('its consumers are the CLI and the studio harness', () =>
    Effect.gen(function* () {
      expect(filesOf(yield* linesMatching(CONSUMES))).toEqual([
        'apps/animations/studio-harness.ts',
        'packages/film/src/tools/cli.ts',
      ]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
