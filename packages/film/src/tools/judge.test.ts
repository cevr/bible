// The judge over a synthetic film on disk, its counsel a stub (`Counsel.layerTest`)
// and its look route a fake that writes each still as its level's name: a
// look's levels are drawn as wedges at the same moments, shuffled under
// labels the key alone resolves, the packet names none of them and quotes
// only the rules that bear on the beat, and the stub's answer comes back as
// a verdict in real names. A render set's variants are cut from their videos.
// A sound choice, two choices unnamed, or one version alone, is refused.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { ConfigProvider, Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { sceneAddress } from '../core/address.ts';
import type { Render } from '../core/catalogue.ts';
import type { LookPost, LookTaken } from '../core/easel.ts';
import { JudgeKeyJson, type JudgeRule } from '../core/judge.ts';
import { RenderCatalogue } from './catalogue.ts';
import { ContentStore } from './content-store.ts';
import { Counsel } from './counsel.ts';
import { FilmRepo, type FilmName } from './film-repo.ts';
import { judge } from './judge.ts';
import { reviewMedia } from './testing.ts';

const film = 'sample' as FilmName;

/** Where the test's film lives: its temp folder, its films, its rule file and its out folder. */
class Here extends Context.Service<
  Here,
  { readonly root: string; readonly rules: string; readonly out: string }
>()('test/judge/Here') {}

/**
 * The sample film copied to a temp folder, with a palette whose look has
 * `options`, and a rule file; the judge's services over it, its counsel
 * answering `answer`, every prompt in `asked`, every media call in `calls`.
 */
const judging = (
  options: string,
  answer: (prompt: string) => string,
  asked: Array<string> = [],
  calls: Array<string> = [],
) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const films = path.join(root, 'films');
      yield* fs.copy(path.join(import.meta.dir, 'fixtures', 'films'), films);
      yield* fs.writeFileString(
        path.join(films, 'sample', 'palette.ts'),
        `export const looks = { ground: { options: ${options}, play: 'dusk' } };\n`,
      );
      const rules = path.join(root, 'RULES.md');
      yield* fs.writeFileString(
        rules,
        '# Rules\n\n## The look\n\nkeep the ground warm\n\n## Human scale\n\nfaces at a third\n',
      );
      const out = path.join(root, 'out');
      return Layer.mergeAll(
        FilmRepo.layer(films),
        RenderCatalogue.layer,
        Counsel.layerTest(answer, asked),
        reviewMedia(calls),
        Layer.succeed(Here, Here.of({ root, rules, out })),
      ).pipe(
        Layer.provide(ContentStore.layer),
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: out }))),
      );
    }),
  ).pipe(Layer.provideMerge(BunServices.layer));

/** A look route that writes each still as its level's name, under `root`. */
const fakeTake = (root: string) => (post: LookPost) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const level = Object.values(post.levels ?? {}).join('+') || 'played';
    const looks = yield* Effect.forEach(post.at, (at, i) =>
      Effect.gen(function* () {
        const file = path.join(root, `look-${level}-${i}.jpg`);
        yield* fs.writeFileString(file, level);
        return { file, scene: post.scene, at, frame: i, time: i, width: 1280, height: 720 };
      }),
    );
    return { build: 'b', looks } satisfies LookTaken;
  }).pipe(Effect.orDie);

/** A counsel that ranks the labels in reverse, with a section each. */
const reversed = (prompt: string) => {
  const labels = [...prompt.matchAll(/^### ([A-H])$/gm)].map((m) => m[1] ?? '');
  return [
    `RANKING: ${labels.toReversed().join(' > ')}`,
    '',
    ...labels.flatMap((l) => [
      `### ${l}`,
      `- Decided by: ${l}-01.jpg against RULES.md § The look`,
      '',
    ]),
  ].join('\n');
};

const decodeKey = Schema.decodeSync(JudgeKeyJson);

/** The judge of scene `open` at `point`, quoting `rules` (the look's alone, unless given). */
const judgeOpen = (point: Option.Option<string>, rules?: (file: string) => Array<JudgeRule>) =>
  Effect.gen(function* () {
    const here = yield* Here;
    return yield* judge({
      film,
      scene: 'open',
      point,
      captions: false,
      rules: Option.match(Option.fromUndefinedOr(rules), {
        onNone: () => [{ file: here.rules, heading: '## The look', registers: [] }],
        onSome: (of) => of(here.rules),
      }),
      take: fakeTake(here.root),
    });
  });

/** The key a judge wrote. */
const keyOf = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return decodeKey(yield* fs.readFileString(path.join(dir, 'key.json')));
  });

describe('film judge', () => {
  const asked: Array<string> = [];
  it.effect(
    "a look's levels: shuffled under labels only the key resolves, judged, and unblinded",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { out, rules } = yield* Here;
        const judged = yield* judgeOpen(Option.some('look:ground'), (file) => [
          { file, heading: '## The look', registers: [] },
          { file, heading: '## Human scale', registers: ['STORY'] },
        ]);

        expect(judged.dir.startsWith(path.join(out, 'sample', 'judge', 'open-'))).toBe(true);
        const key = yield* keyOf(judged.dir);
        expect(key.point).toBe('look:ground');
        expect(key.versions.map((v) => v.version).toSorted()).toEqual(['dusk', 'noon']);
        expect(key.versions.find((v) => v.picked)?.version).toBe('dusk');
        // Each label's stills are its version's, as the key says.
        for (const v of key.versions)
          expect(
            yield* fs.readFileString(path.join(judged.dir, 'stills', `${v.label}-01.jpg`)),
          ).toBe(v.version);

        // The packet: the beat and the one rule that bears on an IDEA beat; no version named.
        const packet = yield* fs.readFileString(judged.packet);
        expect(asked).toEqual([packet]);
        expect(packet).toContain('IDEA: a page, and a question on it.');
        expect(packet).toContain('keep the ground warm');
        expect(packet).not.toContain('faces at a third');
        expect(packet).toContain(`From \`${rules}\``);
        for (const word of ['dusk', 'noon', 'key.json']) expect(packet).not.toContain(word);

        // The stub ranked the labels in reverse: the verdict says so in names.
        const [first, second] = key.versions;
        expect(judged.ranking).toEqual({
          _tag: 'Ranked',
          tiers: [[second?.label ?? ''], [first?.label ?? '']],
        });
        const verdict = yield* fs.readFileString(judged.verdict);
        expect(verdict).toContain(`**Ranking:** ${second?.version} > ${first?.version}`);
        expect(verdict).toContain(`### ${first?.version} (${first?.label})`);
        expect(verdict).toContain(judged.counsel);
      }).pipe(Effect.scoped, Effect.provide(judging('{ dusk: 0, noon: 0.5 }', reversed, asked))),
  );

  const calls: Array<string> = [];
  it.effect(
    "a render set's variants: each one's frames cut from its own video; unnamed beside the look, both are named",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { out } = yield* Here;
        const project = path.join(out, 'sample');
        yield* fs.makeDirectory(path.join(project, 'scenes', 'open'), { recursive: true });
        const render = (variant: string): Render => ({
          address: sceneAddress('open'),
          variant,
          kind: 'video',
          settings: { scale: 1, captions: false },
          stamp: { commit: Option.none(), key: `k-${variant}` },
          span: Option.none(),
          files: {
            clip: Option.some(`scenes/open/${variant}.mp4`),
            share: Option.none(),
            captions: Option.none(),
            chapters: Option.none(),
            images: [],
          },
          sound: Option.none(),
          at: 1,
        });
        const catalogue = yield* RenderCatalogue;
        for (const variant of ['main', 'ink']) {
          yield* fs.writeFileString(
            path.join(project, 'scenes', 'open', `${variant}.mp4`),
            variant,
          );
          yield* catalogue.record({ name: 'sample', out: project }, render(variant));
        }
        const judged = yield* judgeOpen(Option.some('render:scenes:open'));
        const key = yield* keyOf(judged.dir);
        expect(key.versions.map((v) => v.version).toSorted()).toEqual(['ink', 'main']);
        for (const v of key.versions)
          expect(
            yield* fs.readFileString(path.join(judged.dir, 'stills', `${v.label}-01.jpg`)),
          ).toBe(v.version);
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.every((call) => call.startsWith('still '))).toBe(true);
        // The look's two levels and the render set's two variants: unnamed, it names both.
        expect(yield* Effect.flip(judgeOpen(Option.none()))).toMatchObject({
          _tag: 'JudgePointAmbiguous',
          points: ['look:ground', 'render:scenes:open'],
        });
      }).pipe(
        Effect.scoped,
        Effect.provide(judging('{ dusk: 0, noon: 0.5 }', reversed, [], calls)),
      ),
  );

  it.effect('a sound choice, a look the film lacks, and one version alone are refused', () =>
    Effect.gen(function* () {
      const tagOf = (point: Option.Option<string>) =>
        Effect.map(Effect.flip(judgeOpen(point)), (error) => error._tag);
      expect(yield* tagOf(Option.some('score'))).toBe('JudgePointUnjudged');
      expect(yield* tagOf(Option.some('look:sky'))).toBe('JudgePointUnjudged');
      // A look of one level and no renders: nothing to compare.
      expect(yield* tagOf(Option.none())).toBe('JudgeNothingToCompare');
      expect(yield* tagOf(Option.some('look:ground'))).toBe('JudgeNothingToCompare');
      expect(yield* tagOf(Option.some('render:scenes:open'))).toBe('JudgeNothingToCompare');
    }).pipe(Effect.scoped, Effect.provide(judging('{ dusk: 0 }', reversed))),
  );
});
