import { describe, expect, test } from 'bun:test';

import { conflictedPaths, fileLines, lostEdits } from './audit.js';

const doc = (...lines: ReadonlyArray<string>) => lines.join('\n');

// Pass 7, merge 8fdce7ef: main (^1) had landed p7-media's edit of the film
// skill; the conflict was resolved to p7-films' (^2) file.
const BASE = doc('# Film', '- `bun run doctor` checks ffmpeg and chromium.', '- Keep takes.');
const MAIN = doc(
  '# Film',
  '- `bun run doctor` checks chromium; media needs no ffmpeg.',
  '- Keep takes.',
);
const FILMS = doc(
  '# Film',
  '- `bun run doctor` checks ffmpeg and chromium.',
  '- Keep takes.',
  '- A grip changes over time.',
);

describe('merge audit', () => {
  test("a conflict resolved to one side's file names every edit of the other side it lost", () => {
    const lost = lostEdits({ base: BASE, first: MAIN, second: FILMS, merged: FILMS });
    expect(fileLines('SKILL.md', lost)).toEqual([
      'merge-audit SKILL.md dropped ^1: "- `bun run doctor` checks chromium;"',
      'merge-audit SKILL.md dropped ^1: "media needs no ffmpeg."',
      'merge-audit SKILL.md restored ^1: "- `bun run doctor` checks ffmpeg and chromium."',
    ]);
  });

  test("a resolution that keeps both sides' edits says so", () => {
    const merged = doc(
      '# Film',
      '- `bun run doctor` checks chromium; media needs no ffmpeg.',
      '- Keep takes.',
      '- A grip changes over time.',
    );
    const lost = lostEdits({ base: BASE, first: MAIN, second: FILMS, merged });
    expect(fileLines('SKILL.md', lost)).toEqual(["merge-audit SKILL.md keeps both parents' edits"]);
  });

  test('a short, common line (a brace, a fence) says nothing', () => {
    const lost = lostEdits({ base: 'x', first: '}\n```', second: 'x', merged: 'x' });
    expect(lost.first.dropped).toEqual([]);
  });

  test('the conflicted paths are read from merge-tree, each once', () => {
    expect(
      conflictedPaths(
        [
          '9b956c1b0801c2784b9d60c91b8d0fe6ebbaa98e',
          '100644 deb63d37d51cd09a6dae4a1ce87ec317bdbcaf32 1\t.claude/skills/film/SKILL.md',
          '100644 d209ae5337e05f3b825f071be09b1846bf7d4e6c 2\t.claude/skills/film/SKILL.md',
          '100644 bee387485e43ff96ab4ab2303d0f341bc27eb609 1\tapps/animations/README.md',
          '',
          'Auto-merging apps/animations/README.md',
        ].join('\n'),
      ),
    ).toEqual(['.claude/skills/film/SKILL.md', 'apps/animations/README.md']);
  });
});
