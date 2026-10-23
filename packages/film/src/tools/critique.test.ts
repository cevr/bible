// The critique over a match's files on disk, its counsel a stub
// (`Counsel.layerTest`): one run answers every figure at a place, the
// packet quotes the house rules and lists each figure's crops and flagged
// rows, the findings land beside the match's table, the same inputs are
// answered from the kept answer without asking again, each finding is read
// on its own (a figure named in another case kept, one that does not read
// rejected and said), and a counsel that fails, dies or answers no json
// block is a skip, said in the file, never a failure. A rule section its
// file lacks fails the critic's build.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Cause, Context, Effect, Exit, FileSystem, Layer, Option, Path } from 'effect';
import { type CritiqueStaging, UNSTAGED, critiquePacket } from '../core/critique.ts';
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
    marks: { rain: 0.5 },
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
        {
          name: 'hair/beard: parted',
          unit: 'rule',
          flagged: true,
          note: 'concept parted (edge 0.146, step 0.021), scene merged (edge 0.063, step 0.000)',
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

const critiqued = (
  counsel: Layer.Layer<Counsel, never, FileSystem.FileSystem | Path.Path>,
  staging: CritiqueStaging = UNSTAGED,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { taken, rules } = yield* written;
    const critic = Critic.layer([{ file: rules, heading: '## The look' }]).pipe(
      Layer.provide(counsel),
    );
    const built = yield* Layer.build(critic);
    const run = Context.get(built, Critic).critique(taken, staging);
    const first = yield* run;
    const second = yield* run;
    const file = yield* fs.readFileString(first.figures[0]?.file ?? '');
    return { first, second, file };
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer));

const MIXED = [
  'Three findings.',
  '```json',
  '{"findings": [',
  '{"figure": "Farmer", "aspect": "face", "what": "the face longer, flat at the chin"},',
  '{"figure": "farmer", "aspect": "artifacts", "what": "a seam"},',
  '{"figure": "judge", "aspect": "pose", "what": "the hand low"}',
  ']}',
  '```',
].join('\n');

describe("the critique's packet", () => {
  it.effect(
    'calls a hand floating free of the body a finding: the house hand ends an arm in its sleeve',
    () =>
      Effect.sync(() =>
        expect(critiquePacket('scene', 's at 1', [], [], UNSTAGED)).toContain(
          '- **pose**: where each hand is (raised or low, which one), the lean, the gesture. The house hand is a circle at the end of an arm in its sleeve: a hand floating free of the body, with no sleeve to it, is a finding.',
        ),
      ),
  );
});

describe("a scene's staging in the packet", () => {
  const staged = critiquePacket('scene', 's at 1', [], [], {
    panel: Option.some({ id: 'sower.scatter', image: '/films/f/board/sower.scatter.2.jpg' }),
    picture: Option.some('The sower, in his robe, holds the seed out over the field.'),
  });
  it.effect(
    "names the Board panel's image beside the packet and the script's picture, design held to the concept and state to them",
    () =>
      Effect.sync(() => {
        expect(staged).toContain('- The Board panel shown here (sower.scatter): `board.jpg`.');
        expect(staged).toContain(
          "- The script's picture of this beat: The sower, in his robe, holds the seed out over the field.",
        );
        expect(staged).toContain(
          "its state (what it wears, what it holds, what it does) to the Board panel and the script's picture",
        );
        expect(staged).toContain(
          'a robe, a held thing or a gesture this place stages that the concept lacks is not a finding',
        );
      }),
  );
  it.effect('says nothing of staging where nothing is staged', () =>
    Effect.sync(() =>
      expect(critiquePacket('scene', 's at 1', [], [], UNSTAGED)).not.toContain(
        'Where the scene stages them',
      ),
    ),
  );
});

describe("a cast sheet's packet", () => {
  const packet = critiquePacket(
    'sheet',
    "christ's poses sheet, try 1",
    [
      {
        figure: 'view-3',
        concept: 'view-3-concept.png',
        scene: 'view-3-sheet.png',
        flagged: [],
        layout: Option.some("turned three-quarters toward the viewer's left, His head bowed"),
        boundary: Option.none(),
      },
    ],
    [],
    UNSTAGED,
  );
  it.effect("holds each view's angle and gesture to what its layout asks, not to the concept", () =>
    Effect.sync(() => {
      expect(packet).toContain(
        "- What the layout asks of it: turned three-quarters toward the viewer's left, His head bowed",
      );
      expect(packet).toContain(
        "an angle is a finding only where the view differs from its layout's words",
      );
      expect(packet).toContain(
        'a raised hand, a bow or a lean the layout asks for is never a finding',
      );
      expect(packet).not.toContain('a different angle is a finding');
    }),
  );
});

describe('the critique', () => {
  it.effect("a heading its rule file lacks fails the critic's build, as the judge's does", () =>
    Effect.gen(function* () {
      const { rules } = yield* written;
      const built = yield* Layer.build(
        Critic.layer([{ file: rules, heading: '## 12. The look' }]).pipe(
          Layer.provide(Counsel.layerTest(() => ANSWER)),
        ),
      ).pipe(Effect.exit);
      expect(
        Exit.match(built, { onFailure: (cause) => Cause.pretty(cause), onSuccess: () => 'built' }),
      ).toContain('the critique quotes "## 12. The look"');
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'reads each finding on its own: another case is kept on its figure, the rest rejected and said',
    () =>
      Effect.gen(function* () {
        const { first, file } = yield* critiqued(Counsel.layerTest(() => MIXED));
        expect(first.figures.map((f) => [f.figure, f.findings.map((x) => x.what)])).toEqual([
          ['farmer', ['the face longer, flat at the chin']],
          ['christ', []],
        ]);
        expect(first.rejected).toHaveLength(2);
        expect(first.rejected[1]).toBe(
          'finding 3 names judge, no figure asked about (farmer, christ)',
        );
        expect(file).toContain('Rejected from the answer:');
      }),
  );

  it.effect('fails open: a counsel that dies is a skip, said', () =>
    Effect.gen(function* () {
      const dying = Layer.succeed(Counsel, Counsel.of({ ask: () => Effect.die('boom') }));
      const { first } = yield* critiqued(dying);
      expect(first.skipped).toContain('the critique died');
    }),
  );

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
        expect(asked[0]).toContain(
          '- Where the hair meets the beard, as measured: concept parted (edge 0.146, step 0.021), scene merged (edge 0.063, step 0.000).',
        );
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

  it.effect(
    "shows the counsel the staged panel's image beside the packet, and asks again once the panel's image changes",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { taken, rules, dir } = yield* written;
        const image = path.join(dir, 'sower.scatter.1.png');
        yield* fs.writeFile(image, new Uint8Array([9]));
        const beside: Array<boolean> = [];
        const asked: Array<string> = [];
        const answering = Counsel.layerTest(() => ANSWER, asked);
        const looking = Layer.effect(
          Counsel,
          Effect.map(Effect.service(Counsel), (inner) =>
            Counsel.of({
              ask: (prompt, kept) =>
                fs.exists(path.join(path.dirname(prompt), 'board.png')).pipe(
                  Effect.orDie,
                  Effect.tap((there) => Effect.sync(() => beside.push(there))),
                  Effect.andThen(inner.ask(prompt, kept)),
                ),
            }),
          ),
        ).pipe(Layer.provide(answering));
        const built = yield* Layer.build(
          Critic.layer([{ file: rules, heading: '## The look' }]).pipe(Layer.provide(looking)),
        );
        const staging: CritiqueStaging = {
          panel: Option.some({ id: 'sower.scatter', image }),
          picture: Option.some('The sower holds the seed.'),
        };
        const run = Context.get(built, Critic).critique(taken, staging);
        const first = yield* run;
        yield* fs.writeFile(image, new Uint8Array([10]));
        const second = yield* run;
        expect(beside).toEqual([true, true]);
        expect(asked[0]).toContain('- The Board panel shown here (sower.scatter): `board.png`.');
        expect(asked[0]).toContain(
          "- The script's picture of this beat: The sower holds the seed.",
        );
        expect([first.cached, second.cached]).toEqual([false, false]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
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

describe("a cast sheet's critique", () => {
  it.effect(
    'asks of each view as a sheet the rigs are traced from, the hair and the beard named, its findings beside the try',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { rules, dir } = yield* written;
        const view = path.join(dir, 'turnaround-2.view-2');
        yield* fs.writeFile(`${view}.concept.png`, new Uint8Array([3]));
        yield* fs.writeFile(`${view}.sheet.png`, new Uint8Array([4]));
        const asked: Array<string> = [];
        const answer = [
          '```json',
          '{"findings": [{"figure": "view-2", "aspect": "face", "what": "the beard runs into the hair at the cheek"}]}',
          '```',
        ].join('\n');
        const built = yield* Layer.build(
          Critic.layer([{ file: rules, heading: '## The look' }]).pipe(
            Layer.provide(Counsel.layerTest(() => answer, asked)),
          ),
        );
        const taken = yield* Context.get(built, Critic).critiqueSheet({
          place: 'christ turnaround try 2',
          kept: path.join(dir, 'critique'),
          views: [
            {
              figure: 'view-2',
              concept: `${view}.concept.png`,
              sheet: `${view}.sheet.png`,
              flagged: ['hairBeard view=2'],
              file: `${view}.critique.md`,
              layout: Option.some("turned three-quarters toward the viewer's left"),
            },
          ],
        });
        expect(asked[0]).toContain('one view of a cast sheet (christ turnaround try 2)');
        expect(asked[0]).toContain('- The sheet: `view-2-sheet.png`');
        expect(asked[0]).toContain(
          "- What the layout asks of it: turned three-quarters toward the viewer's left",
        );
        expect(asked[0]).toContain('where the hair meets the beard');
        expect(taken.figures[0]?.findings.map((f) => f.what)).toEqual([
          'the beard runs into the hair at the cheek',
        ]);
        expect(yield* fs.readFileString(`${view}.critique.md`)).toContain('**face**');
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
