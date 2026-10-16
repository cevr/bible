// The doc lines a review reads (`docLines`): each line writing an anchor
// that names a changed file, read from the doc's bases (a link from its own
// folder), and no line whose anchors name only unchanged files.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { type Doc, docLines } from './doc-anchors.ts';

const readme: Doc = {
  path: 'packages/film/README.md',
  bases: ['', 'packages/film', 'packages/film/src'],
  whole: false,
  text: [
    '# Film',
    '',
    'A review is read by `tools/review.ts` `Review.read`, and the lab',
    'serves it (`lab/api.ts`).',
    '',
    'The craft lives in [CRAFT](../../CRAFT.md#5).',
    '',
    '```sh',
    '# the reader: `tools/review.ts`',
    '```',
    '',
    'It once read `tools/review.ts` at `abc1234`.',
    '',
    '| `cgwire/kitsu` | `tools/review.ts` |',
  ].join('\n'),
};

describe('doc lines', () => {
  it.effect.layer(BunServices.layer)(
    "names each line whose anchor names a changed file, read from its bases; never a receipt, another repo's row, or a line naming only unchanged files",
    () =>
      Effect.gen(function* () {
        const lines = yield* docLines(
          [readme],
          new Set(['packages/film/src/tools/review.ts', 'CRAFT.md']),
        );
        expect(lines.map(({ line, files }) => [line, files])).toEqual([
          [3, ['packages/film/src/tools/review.ts']],
          [6, ['CRAFT.md']],
          [9, ['packages/film/src/tools/review.ts']],
        ]);
        expect(lines[0]?.text).toBe(
          'A review is read by `tools/review.ts` `Review.read`, and the lab',
        );
        // Nothing changed that the doc names: no line.
        expect(yield* docLines([readme], new Set(['packages/film/src/core/api.ts']))).toEqual([]);
      }),
  );
});
