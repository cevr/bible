// The judge over a synthetic film on disk, its counsel a stub (`Counsel.layerTest`)
// and its look route a fake that writes each still as its level's name: a
// look's levels are drawn as wedges at the same moments, shuffled under
// labels the key alone resolves, the packet names none of them and quotes
// only the rules that bear on the beat, and the stub's answer comes back as
// a verdict in real names. A render set's variants are cut from their videos.
// A sound choice, two choices unnamed, or one version alone, is refused.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  Config,
  ConfigProvider,
  Context,
  Deferred,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Ref,
  Schema,
} from 'effect';
import { sceneAddress } from '../core/address.ts';
import type { Render } from '../core/catalogue.ts';
import type { LookPost, LookTaken } from '../core/easel.ts';
import { JudgeKeyJson, type JudgeRule } from '../core/judge.ts';
import { RenderCatalogue } from './catalogue.ts';
import { ContentStore } from './content-store.ts';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { Counsel, type SandboxedRun } from './counsel.ts';
import { FilmRepo, type FilmName } from './film-repo.ts';
import { judge } from './judge.ts';
import { collect } from './process.ts';
import { sandboxArgs } from './sandbox.ts';
import { reviewMedia } from './testing.ts';

const film = 'sample' as FilmName;

/** Where the test's film lives: its temp folder, its films, its rule file and its out folder. */
class Here extends Context.Service<
  Here,
  { readonly root: string; readonly rules: string; readonly out: string }
>()('test/judge/Here') {}

/**
 * What the counsel could read as it was asked: the prompt's folder, every
 * file in it by name (`names`, below the folder) and the words of each that
 * is no image (`texts`).
 */
interface Seen {
  readonly folder: string;
  readonly names: ReadonlyArray<string>;
  readonly texts: ReadonlyArray<string>;
}

/** `inner`, but noting first what the counsel could read (`Seen`) in `seen`, the film's folder at `root`. */
const reading = (root: string, seen: Array<Seen>) =>
  Layer.effect(
    Counsel,
    Effect.gen(function* () {
      const inner = yield* Counsel;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      return Counsel.of({
        ask: (prompt, dir) =>
          Effect.gen(function* () {
            const folder = path.dirname(prompt);
            const names = yield* fs.readDirectory(folder, { recursive: true });
            const texts = yield* Effect.forEach(
              names.filter((name) => !name.endsWith('.jpg')),
              (name) =>
                fs.readFileString(path.join(folder, name)).pipe(Effect.orElseSucceed(() => '')),
            );
            seen.push({ folder, names, texts });
          }).pipe(Effect.orDie, Effect.andThen(inner.ask(prompt, dir))),
      });
    }),
  );

/**
 * The sample film copied to a temp folder, with a palette whose look has
 * `options`, and a rule file; the judge's services over it, its counsel
 * answering `answer`, every prompt in `asked`, every media call in `calls`,
 * what the counsel could read in `seen`; or `counsel`, when given, in its place.
 */
const judging = (
  options: string,
  answer: (prompt: string) => string,
  asked: Array<string> = [],
  calls: Array<string> = [],
  seen: Array<Seen> = [],
  counsel?: Layer.Layer<
    Counsel,
    never,
    ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path
  >,
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
        Option.getOrElse(Option.fromUndefinedOr(counsel), () =>
          reading(root, seen).pipe(Layer.provide(Counsel.layerTest(answer, asked))),
        ),
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

/**
 * A counsel's run, in the sandbox, that answers no preference and writes
 * what it could reach: whether it read the packet, each still it found
 * beside it, and each of the paths it is given, `SEEN` or `ABSENT`. The
 * packet's and the answer's folders are the sandbox's (`PACKET` and
 * `ANSWER` name others, for a run outside it).
 */
const PROBE = [
  'P=${PACKET:-/judge/packet} A=${ANSWER:-/judge/answer}',
  'mkdir -p "$A/run"',
  '{',
  '  echo "RANKING: no preference"',
  '  echo',
  '  if head -c 1 "$P/packet.md" >/dev/null 2>&1; then echo "READ packet.md"; fi',
  '  for still in "$P"/stills/*; do echo "STILL ${still##*/}"; done',
  '  for p in "$@"; do',
  '    if ls -a "$p" >/dev/null 2>&1; then echo "SEEN $p"; else echo "ABSENT $p"; fi',
  '  done',
  '} > "$A/run/codex.md"',
].join('\n');

/** The probe, run in the counsel's sandbox, given each of `paths` to try. */
const probing = (paths: Ref.Ref<ReadonlyArray<string>>) =>
  Counsel.sandboxed(
    Effect.map(Ref.get(paths), (tried): SandboxedRun => ({
      mounts: [],
      env: { PATH: '/usr/bin:/bin' },
      command: () => ['/usr/bin/sh', '-c', PROBE, 'probe', ...tried],
    })),
  );

/** Whether bwrap can make a sandbox here: a runner may forbid an unprivileged user its namespaces. */
const sandboxHere = Effect.scoped(
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fs = yield* FileSystem.FileSystem;
    const answer = yield* fs.makeTempDirectoryScoped();
    const argv = sandboxArgs({ packet: answer, answer, mounts: [], env: {} }, ['/usr/bin/true']);
    return yield* collect(spawner, ChildProcess.make('bwrap', [...argv])).pipe(
      Effect.map((done) => done.exitCode === 0),
    );
  }),
).pipe(Effect.orElseSucceed(() => false));

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
        // Kept as the counsel read it. It says nothing of where anything lives: each still by
        // its path beside the packet, each rule's file by its name alone.
        const packet = yield* fs.readFileString(judged.packet);
        expect(asked).toEqual([packet]);
        expect(packet).toContain('| stills/A-01.jpg |');
        expect(yield* fs.exists(path.join(path.dirname(judged.packet), 'stills', 'A-01.jpg'))).toBe(
          true,
        );
        expect(packet).toContain('IDEA: a page, and a question on it.');
        expect(packet).toContain('keep the ground warm');
        expect(packet).not.toContain('faces at a third');
        expect(packet).toContain('From `RULES.md`');
        expect(rules.startsWith('/')).toBe(true);
        for (const word of ['dusk', 'noon', 'key.json', path.dirname(rules), out, '/tmp/'])
          expect(packet).not.toContain(word);

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

  const seen: Array<Seen> = [];
  it.effect(
    'the counsel reads a folder of the packet and the stills alone: no key, no version named',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { out, root } = yield* Here;
        const judged = yield* judgeOpen(Option.some('look:ground'));
        expect(seen).toHaveLength(1);
        const [asked = { folder: root, names: [], texts: [] }] = seen;
        expect(asked.names.toSorted()).toEqual([
          'packet.md',
          'stills',
          'stills/A-01.jpg',
          'stills/B-01.jpg',
        ]);
        // Its own folder, away from the film's and the judge's earlier runs.
        expect(asked.folder.startsWith(root)).toBe(false);
        for (const name of asked.names)
          for (const word of ['key', 'dusk', 'noon'])
            expect([name, word, name.includes(word)]).toEqual([name, word, false]);
        for (const text of asked.texts)
          for (const word of ['dusk', 'noon']) expect(text).not.toContain(word);
        // The key is written once the counsel has answered, beside the verdict, with the stills.
        expect((yield* keyOf(judged.dir)).versions).toHaveLength(2);
        expect(yield* fs.readDirectory(path.join(judged.dir, 'stills'))).toHaveLength(2);
        expect(judged.dir.startsWith(path.join(out, 'sample', 'judge'))).toBe(true);
        // The folder the counsel read is gone.
        expect(yield* fs.exists(asked.folder)).toBe(false);
      }).pipe(
        Effect.scoped,
        Effect.provide(judging('{ dusk: 0, noon: 0.5 }', reversed, [], [], seen)),
      ),
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

  it.effect('two judges in the same second keep a folder each', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // The test clock stands still: both runs share their stamp to the second.
      const one = yield* judgeOpen(Option.some('look:ground'));
      const two = yield* judgeOpen(Option.some('look:ground'));
      expect(two.dir).not.toBe(one.dir);
      for (const run of [one, two]) {
        expect((yield* keyOf(run.dir)).point).toBe('look:ground');
        expect(yield* fs.exists(run.verdict)).toBe(true);
        expect(yield* fs.readDirectory(path.join(run.dir, 'stills'))).toHaveLength(2);
      }
    }).pipe(Effect.scoped, Effect.provide(judging('{ dusk: 0, noon: 0.5 }', reversed))),
  );

  it.effect(
    "two judges drawing the same look at once each copy the lab's stills, and leave them",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const here = yield* Here;
        const wrote = yield* Deferred.make<boolean>();
        const release = yield* Deferred.make<boolean>();
        const judgeWith = (
          take: (
            post: LookPost,
          ) => Effect.Effect<LookTaken, never, FileSystem.FileSystem | Path.Path>,
        ) =>
          judge({
            film,
            scene: 'open',
            point: Option.some('look:ground'),
            captions: false,
            rules: [{ file: here.rules, heading: '## The look', registers: [] }],
            take,
          });
        // The second judge's look is written, and answered once the first judge is done: the
        // lab answers the same request with the same file to both.
        const late = yield* Effect.forkChild(
          judgeWith((post) =>
            Effect.gen(function* () {
              const taken = yield* fakeTake(here.root)(post);
              yield* Deferred.succeed(wrote, true);
              yield* Deferred.await(release);
              return taken;
            }),
          ),
        );
        yield* Deferred.await(wrote);
        const first = yield* judgeWith(fakeTake(here.root));
        yield* Deferred.succeed(release, true);
        const second = yield* Fiber.join(late);
        for (const run of [first, second]) expect((yield* keyOf(run.dir)).versions).toHaveLength(2);
        // The lab's own stills stay where the lab wrote them.
        expect(
          (yield* fs.readDirectory(here.root))
            .filter((name) => name.startsWith('look-'))
            .toSorted(),
        ).toEqual(['look-dusk-0.jpg', 'look-noon-0.jpg']);
      }).pipe(Effect.scoped, Effect.provide(judging('{ dusk: 0, noon: 0.5 }', reversed))),
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

  const tried = Ref.makeUnsafe<ReadonlyArray<string>>([]);
  it.live(
    "the counsel's sandbox reads the packet and its stills, and finds no earlier run, no repo and no cache",
    () =>
      Effect.gen(function* () {
        if (!(yield* sandboxHere)) {
          yield* Effect.logWarning('judge.test.sandbox skipped: bwrap cannot make a sandbox here');
          return;
        }
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const here = yield* Here;
        const home = yield* Config.String('HOME');
        const earlier = yield* judgeOpen(Option.some('look:ground'));
        expect(yield* fs.exists(path.join(earlier.dir, 'key.json'))).toBe(true);
        const repo = path.resolve(import.meta.dir, '..', '..', '..', '..');
        const hidden = [
          earlier.dir,
          path.join(earlier.dir, 'key.json'),
          path.join(here.root, 'films', 'sample'),
          here.out,
          here.root,
          repo,
          path.join(repo, 'packages', 'film', 'README.md'),
          path.join(home, '.cache', 'film-harness'),
          home,
          '/workspaces',
        ];
        yield* Ref.set(tried, hidden);
        const judged = yield* judgeOpen(Option.some('look:ground'));
        const reached = (yield* fs.readFileString(judged.counsel)).split('\n');
        expect(reached).toContain('READ packet.md');
        expect(reached.filter((line) => line.startsWith('STILL '))).toEqual([
          'STILL A-01.jpg',
          'STILL B-01.jpg',
        ]);
        expect(reached.filter((line) => line.startsWith('SEEN '))).toEqual([]);
        expect(reached.filter((line) => line.startsWith('ABSENT '))).toHaveLength(hidden.length);
        // Its answer, written in the sandbox, is copied into the run's folder and read as a verdict.
        expect(judged.counsel.startsWith(path.join(judged.dir, 'counsel'))).toBe(true);
        expect(judged.ranking).toEqual({ _tag: 'NoPreference' });
      }).pipe(
        Effect.scoped,
        Effect.provide(judging('{ dusk: 0, noon: 0.5 }', reversed, [], [], [], probing(tried))),
      ),
  );
});
