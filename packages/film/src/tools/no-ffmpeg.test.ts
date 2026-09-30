// The film's media runs in-process (mediabunny, and FFmpeg's libraries
// through NodeAV), never the ffmpeg CLI: no source in the film package or the
// animations app names `ffmpeg` or `ffprobe` as a string, the only way to
// start either as a process.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';

const repo = `${import.meta.dir}/../../../..`;

/** Source roots, and the directories under them that hold no code the films run. */
const ROOTS = ['packages/film/src', 'apps/animations'];
const SKIPPED = /(^|\/)(node_modules|plans|dist|out)\//;
const SOURCE = /\.tsx?$/;

/** A string that is the name of a CLI and nothing more: `'ffmpeg'`, `"ffprobe"`, `` `ffmpeg` ``. */
const COMMAND = /(['"`])(ffmpeg|ffprobe)\1/;

/** A comment line, which may name the CLI freely. */
const COMMENT = /^\s*(\/\/|\/?\*).*$/;

/** Every `file:line` under `root` naming a CLI as a string. */
const commandsIn = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const files = yield* fs.readDirectory(`${repo}/${root}`, { recursive: true });
    const sources = files.filter((file) => SOURCE.test(file) && !SKIPPED.test(file));
    const found = yield* Effect.forEach(sources, (file) =>
      fs.readFileString(`${repo}/${root}/${file}`).pipe(
        Effect.map((text) =>
          text
            .split('\n')
            .map((line, index) => ({ code: line.replace(COMMENT, ''), at: index + 1 }))
            .filter(({ code }) => COMMAND.test(code))
            .map(({ at }) => `${root}/${file}:${at}`),
        ),
      ),
    );
    return found.flat();
  });

describe('no ffmpeg CLI', () => {
  it.effect.layer(BunServices.layer)(
    'no film source names ffmpeg or ffprobe as a command',
    () =>
      Effect.gen(function* () {
        const found = yield* Effect.forEach(ROOTS, commandsIn);
        expect(found.flat()).toEqual([]);
      }),
    30_000,
  );
});
