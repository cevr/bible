// The film's media runs in-process (mediabunny, and FFmpeg's libraries
// through NodeAV), never the ffmpeg CLI: no source in the film package or the
// animations app names `ffmpeg` or `ffprobe` as a word inside a string (the
// bare name, a command line, a path, a template), the only way to start
// either as a process. And no doc tells an agent the tools use it:
// every clause of the READMEs and the film skill that names the CLI (`ffmpeg`,
// `ffprobe`, "the ffmpeg CLI") says it is not used.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem } from 'effect';

const repo = `${import.meta.dir}/../../../..`;

/** Source roots, and the directories under them that hold no code the films run. */
const ROOTS = ['packages/film/src', 'apps/animations'];
const SKIPPED = /(^|\/)(node_modules|plans|dist|out)\//;

/** This file, whose doc fixtures quote the CLI's name as the stale docs did. */
const SELF = 'packages/film/src/tools/no-ffmpeg.test.ts';
const SOURCE = /\.tsx?$/;

/**
 * A string that names a CLI as a word, in any form a command takes: `'ffmpeg'`,
 * `'ffmpeg -i in.mp4'`, `"/usr/bin/ffprobe"`, `` `ffmpeg ${args}` ``.
 */
const COMMAND = /(['"`])[^'"`]*\b(ffmpeg|ffprobe)\b/;

/** A comment line, which may name the CLI freely. */
const COMMENT = /^\s*(\/\/|\/?\*).*$/;

/** Every `file:line` under `root` naming a CLI as a string. */
const commandsIn = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const files = yield* fs.readDirectory(`${repo}/${root}`, { recursive: true });
    const sources = files.filter(
      (file) => SOURCE.test(file) && !SKIPPED.test(file) && `${root}/${file}` !== SELF,
    );
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

/** The docs an agent reads before touching the film's media. */
const DOCS = [
  'packages/film/README.md',
  'apps/animations/README.md',
  '.claude/skills/film/SKILL.md',
  '.claude/skills/film/CRAFT.md',
];

/** The CLI named: `ffmpeg`, `ffprobe`, or "the ffmpeg CLI". */
const NAMES_CLI = /`(ffmpeg|ffprobe)`|ffmpeg CLI/;

/** A clause that says the CLI is not used. */
const REFUSES = /\b(never|no|not|nothing|fails|refuses)\b/i;

/**
 * The clauses of `text` that name the CLI and do not refuse it: a paragraph
 * read as one line (Markdown wraps), cut at each sentence, `;` and table cell.
 */
const cliUsesIn = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replaceAll('\n', ' '))
    .flatMap((paragraph) => paragraph.split(/\.\s|;\s|\s\|\s/))
    .filter((clause) => NAMES_CLI.test(clause) && !REFUSES.test(clause));

describe('no ffmpeg CLI', () => {
  it.effect('a command naming the CLI in any form is found, a comment is not', () =>
    Effect.sync(() => {
      const named = (code: string) => COMMAND.test(code.replace(COMMENT, ''));
      expect(
        [
          "spawn('ffmpeg', ['-i', input])",
          "ChildProcess.make('ffmpeg -i in.mp4 out.webm')",
          'Bun.spawn(["/usr/bin/ffprobe", file])',
          'const cmd = `ffmpeg -y ${args.join(" ")}`',
        ].map(named),
      ).toEqual([true, true, true, true]);
      expect(
        [
          "// spawn('ffmpeg', …) is refused",
          "import { Media } from './media.ts'",
          "throwIfError(ret, 'FFmpegError')",
        ].map(named),
      ).toEqual([false, false, false]);
    }),
  );

  it.effect('a doc clause that names the CLI as a tool the film uses is found', () =>
    Effect.sync(() => {
      // SKILL.md step 0 and the tools row of packages/film/README.md, as a merge restored them.
      const stale = [
        "0. **Tools.** `bun run doctor` says whether headless Chromium, the logged-in `elevenlabs` CLI and `ffmpeg` (x264 for a software render's share copy; takes load and encode in-process) are there, and how to fix each that is not.",
        "| `@bible/film/tools` | Media (mediabunny, joining a film; the ffmpeg CLI for a software share copy, and the review's stills and phone copies), Narrator |",
      ];
      expect(stale.map((text) => cliUsesIn(text).length)).toEqual([1, 1]);
      expect(
        cliUsesIn('x264 runs in-process; never the ffmpeg CLI. Nothing needs an `ffmpeg`.'),
      ).toEqual([]);
    }),
  );

  it.effect.layer(BunServices.layer)('no doc says the film uses the ffmpeg CLI', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const found = yield* Effect.forEach(DOCS, (doc) =>
        Effect.map(fs.readFileString(`${repo}/${doc}`), (text) =>
          cliUsesIn(text).map((clause) => `${doc}: ${clause.trim().slice(0, 160)}`),
        ),
      );
      expect(found.flat()).toEqual([]);
    }),
  );

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
