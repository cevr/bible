// The critique over a match's files on disk, its counsel a stub
// (`Counsel.layerTest`): one run answers every figure at a place, the
// packet quotes the house rules and lists each figure's crops and flagged
// rows, the findings land beside the match's table, the same inputs are
// answered from the kept answer without asking again, and a counsel that
// fails or answers no json block is a skip, said in the file, never a
// failure.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Context, Effect, FileSystem, Layer, Path } from 'effect';
import { CounselFailed } from '../core/judge.ts';
import type { MatchTaken } from '../core/match.ts';
import { Counsel } from './counsel.ts';
import { Critic } from './critique.ts';

const RULES = '# Rules\n\n## The look\n\nOne silhouette outline; hair has no ink of its own.\n';

/** A match of two figures written under a temp folder's `out/f/match/s/`, with a rule file beside it. */
const written = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped();
  const dir = path.join(root, 'out', 'f', 'match', 's');
  yield* fs.makeDirectory(dir, { recursive: true });
  const rules = path.join(root, 'rules.md');
  yield* fs.writeFileString(rules, RULES);
  const figure = (name: string, rows: MatchTaken['figures'][number]['rows']) =>
    Effect.gen(function* () {
      const stem = path.join(dir, `${name}.t0001.00.bb.1`);
      yield* fs.writeFile(`${stem}.concept.png`, new Uint8Array([1, name.length]));
      yield* fs.writeFile(`${stem}.scene.png`, new Uint8Array([2, name.length]));
      return {
        figure: name,
        key: `f/${name}`,
        concept: { image: { set: 'c', file: 'images/c.png' }, box: [0, 0, 10, 10] as const },
        rows,
        side: `${stem}.png`,
        table: `${stem}.md`,
        crops: { concept: `${stem}.concept.png`, scene: `${stem}.scene.png` },
      };
    });
  const taken: MatchTaken = {
    build: 'b.1',
    scene: 's',
    at: 'mark:rain',
    frame: 30,
    time: 1,
    figures: [
      yield* figure('farmer', [
        {
          name: 'head: roll (the eye line)',
          unit: 'degrees',
          concept: -12,
          scene: 1,
          diff: 13,
          flagged: true,
        },
      ]),
      yield* figure('christ', []),
    ],
    unmatched: [],
  };
  return { taken, rules, dir };
});

const ANSWER = [
  'The farmer is drawn front and level; his concept turns three-quarter and tilts up.',
  '',
  '```json',
  '{"findings": [{"figure": "farmer", "aspect": "head angle", "what": "front and level, the concept three-quarter and tilted up"}]}',
  '```',
].join('\n');

const critiqued = (counsel: Layer.Layer<Counsel, never, FileSystem.FileSystem | Path.Path>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { taken, rules } = yield* written;
    const critic = Critic.layer([{ file: rules, heading: '## The look' }]).pipe(
      Layer.provide(counsel),
    );
    const built = yield* Layer.build(critic);
    const run = Context.get(built, Critic).critique(taken);
    const first = yield* run;
    const second = yield* run;
    const file = yield* fs.readFileString(first.figures[0]?.file ?? '');
    return { first, second, file };
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

describe('the critique', () => {
  it.effect(
    'asks once for every figure, quotes the rules and the flagged rows, and keeps the answer',
    () =>
      Effect.gen(function* () {
        const asked: Array<string> = [];
        const { first, second, file } = yield* critiqued(Counsel.layerTest(() => ANSWER, asked));
        expect(asked.length).toBe(1);
        expect(asked[0]).toContain('One silhouette outline; hair has no ink of its own.');
        expect(asked[0]).toContain('`farmer-concept.png`');
        expect(asked[0]).toContain('`christ-scene.png`');
        expect(asked[0]).toContain('head: roll (the eye line)');
        expect(first.figures.map((f) => [f.figure, f.findings.length])).toEqual([
          ['farmer', 1],
          ['christ', 0],
        ]);
        expect({ first: first.cached, second: second.cached }).toEqual({
          first: false,
          second: true,
        });
        expect(file).toContain('**head angle**: front and level');
      }),
  );

  it.effect('fails open: an answer with no json block is a skip, said in the file', () =>
    Effect.gen(function* () {
      const { first, file } = yield* critiqued(Counsel.layerTest(() => 'They match.'));
      expect(first.skipped).toContain('no ```json block');
      expect(first.figures.every((f) => f.findings.length === 0)).toBe(true);
      expect(file).toContain('Skipped:');
    }),
  );

  it.effect('fails open: a counsel that fails is a skip, and nothing is kept', () =>
    Effect.gen(function* () {
      const failing = Layer.succeed(
        Counsel,
        Counsel.of({ ask: () => Effect.fail(CounselFailed.make({ reason: 'no claude on PATH' })) }),
      );
      const { first, second } = yield* critiqued(failing);
      expect(first.skipped).toContain('no claude on PATH');
      expect(second.cached).toBe(false);
    }),
  );
});
