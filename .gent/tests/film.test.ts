// The film extension over a synthetic checkout: a temp folder with the
// `easel` fixture film, a `cli.ts` that runs this checkout's film CLI over
// it, and a fake lab on a loopback port. No real film is read, checked or
// looked at, and no model is called: turns run on gent's scripted model.
//
// `bun run test:gent` runs this file under gent's test preload.

import { describe, expect, it } from 'effect-bun-test';
import {
  Context,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
  type Scope,
  Stream,
} from 'effect';
import { BunServices } from '@effect/platform-bun';
import * as Prompt from 'effect/ai/Prompt';
import type { ChildProcessSpawner } from 'effect/process/ChildProcessSpawner';
import {
  AgentName,
  ExtensionContext,
  ModelId,
  type ToolResultFailure,
} from '@gent/core/extensions/api';
import {
  type CompactionRequest,
  ModelContextBudget,
  ModelContextCompactor,
} from '@gent/core/extensions/branch-tools';
import { BunPlatformLive } from '@gent/core/host';
// gent's own window marker constructor: no entry exports it, so the test reads
// it from the linked checkout's source, the module the runtime builds markers with.
import { windowMarkerMessage } from '../node_modules/@gent/core/src/runtime/model-context.ts';
import {
  BranchId,
  dateFromMillis,
  Message,
  MessageId,
  SessionId,
  ToolCallId,
} from '@gent/core/protocol';
import {
  ConfigService,
  createRpcHarness,
  freePort,
  LanguageModelLayers,
  makeTempDirectoryScoped,
  RuntimeEnvironment,
  runToolWithCtx,
  type SequenceStep,
  testLeafContext,
  testToolContext,
  testTurnExtension,
  textStep,
  toolCallStep,
  turnRequestText,
} from '@gent/core/test-utils';
import FilmExtension, {
  checkReport,
  cuesReport,
  FILM_TOOL_IDS,
  FilmCheck,
  FilmCues,
  FilmEdit,
  FilmJournal,
  FilmLook,
  FilmRead,
  FilmWrite,
  PAINTER,
  painterCompactor,
  refusalOf,
} from '../extensions/film.ts';

/** A string as a JavaScript string literal, for the temp checkout's `cli.ts`. */
const quote = Schema.encodeSync(Schema.fromJsonString(Schema.String));

/** This checkout: its film CLI and its modules serve every temp checkout. */
const REPO = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

// ── fixtures ────────────────────────────────────────────────────────────────

const be32 = (value: number) => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

/** A PNG whose header names `width` x `height`: what gent's image store reads. */
const pngBytes = (width: number, height: number) =>
  Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...be32(13),
    ...Array.from('IHDR', (char) => char.charCodeAt(0)),
    ...be32(width),
    ...be32(height),
    8,
    6,
    0,
    0,
    0,
    ...Array.from({ length: 32 }, (_, index) => index),
  ]);

/**
 * A temp checkout: `apps/animations/cli.ts` runs this repo's film CLI over the
 * temp films folder and asks the lab at `labUrl`, the fixture film `easel`
 * sits in it, and the film skill folder holds one rules file.
 */
const checkout = Effect.fn('test.checkout')(function* (labUrl: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.realPath(yield* makeTempDirectoryScoped('film-gent-checkout-'));
  const app = path.join(root, 'apps', 'animations');
  yield* fs.makeDirectory(path.join(app, 'src', 'films'), { recursive: true });
  yield* fs.symlink(
    path.join(REPO, 'apps', 'animations', 'node_modules'),
    path.join(app, 'node_modules'),
  );
  yield* fs.writeFileString(
    path.join(app, 'cli.ts'),
    [
      `import { appCli } from ${quote(path.join(REPO, 'apps', 'animations', 'cli.ts'))};`,
      `process.env.FILM_LAB_URL = ${quote(labUrl)};`,
      `appCli(\`\${import.meta.dir}/src/films\`, ${quote(path.join(REPO, 'apps', 'animations', 'sounds'))}, import.meta.path);`,
      '',
    ].join('\n'),
  );
  yield* fs.copy(
    path.join(import.meta.dir, 'fixtures', 'easel'),
    path.join(app, 'src', 'films', 'easel'),
  );
  const skill = path.join(root, '.claude', 'skills', 'film');
  yield* fs.makeDirectory(skill, { recursive: true });
  yield* fs.writeFileString(
    path.join(skill, 'SKILL.md'),
    '# Film\n\nStep 4: draw from the corpus.\n',
  );
  return root;
});

/** The fake lab's stills folder and URL; it answers a look by the scene asked. */
interface FakeLab {
  readonly url: string;
  readonly stills: string;
}

/**
 * A lab on a loopback port that answers `POST /api/films/<film>/looks` as the
 * real route does: `roof` with one 1x1 still per place, `huge` with a still
 * too large for gent's image store, `missing` UnknownScene (404), `broken`
 * PagesBroken (422), `invalid` LookInvalid (400).
 */
const fakeLab = Effect.fn('test.fakeLab')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stills = yield* makeTempDirectoryScoped('film-gent-stills-');
  yield* fs.writeFile(path.join(stills, 'small.png'), pngBytes(1, 1));
  yield* fs.writeFile(path.join(stills, 'huge.png'), pngBytes(3000, 10));
  const answer = (body: { readonly scene: string; readonly at: ReadonlyArray<string> }) => {
    const refuse = (
      status: number,
      refusal: Readonly<Record<string, string | ReadonlyArray<string>>>,
    ) => Response.json(refusal, { status });
    if (body.scene === 'missing')
      return refuse(404, { _tag: 'UnknownScene', scene: 'missing', known: ['roof', 'gate'] });
    if (body.scene === 'broken')
      return refuse(422, { _tag: 'PagesBroken', reason: 'scenes/broken.ts failed to build' });
    if (body.scene === 'invalid')
      return refuse(400, { _tag: 'LookInvalid', reason: 'a crop wider than the canvas' });
    const file = path.join(
      stills,
      Option.match(
        Option.liftPredicate(body.scene, (scene) => scene === 'huge'),
        {
          onSome: () => 'huge.png',
          onNone: () => 'small.png',
        },
      ),
    );
    return Response.json({
      build: 's.7',
      looks: body.at.map((at, index) => ({
        file,
        scene: body.scene,
        at,
        frame: index * 30,
        time: index,
        width: 1,
        height: 1,
      })),
    });
  };
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      // oxlint-disable-next-line effect/noGlobals -- the fake lab is the test's own server on a loopback port
      Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: (request) =>
          request.json().then((body: { scene: string; at: ReadonlyArray<string> }) => answer(body)),
      }),
    ),
    (running) => Effect.promise(() => running.stop(true)),
  );
  const lab: FakeLab = { url: `http://127.0.0.1:${server.port}/`, stills };
  return lab;
});

/** A temp checkout over a running fake lab, and a tool context in it. */
const world = Effect.fn('test.world')(function* () {
  const lab = yield* fakeLab();
  const root = yield* checkout(lab.url);
  const home = yield* makeTempDirectoryScoped('film-gent-home-');
  return { root, home, lab, ctx: testToolContext({ cwd: root, home }) };
});

const filmFolder = (root: string) => `${root}/apps/animations/src/films/easel`;

const live = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | ChildProcessSpawner | Scope.Scope
  >,
) => effect.pipe(Effect.scoped, Effect.provide(BunServices.layer), Effect.timeout('25 seconds'));

/** The JSON text a result is sent to the model as: gent spills one over 8,000 characters. */
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json));

/** Any value as the JSON text the model would be sent. */
const encodeAny = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** A failed film tool's result as the model reads it: the failure's tag and its fields. */
const ModelFailure = Schema.Struct({
  _tag: Schema.String,
  tool: Schema.optionalKey(Schema.String),
  tag: Schema.optionalKey(Schema.String),
  text: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.String),
  file: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
});

/**
 * The failure a film tool sends the model: a `ToolResultFailure`, whose
 * result fits gent's budget, decoded to its fields.
 */
const failure = (effect: Effect.Effect<unknown, ToolResultFailure>) =>
  Effect.flip(effect).pipe(
    Effect.flatMap((error) => {
      expect(error._tag).toBe('ToolResultFailure');
      expect(encodeJson(error.result).length).toBeLessThan(8_000);
      return Schema.decodeUnknownEffect(ModelFailure)(error.result);
    }),
  );

// ── the guard ───────────────────────────────────────────────────────────────

describe('the film folder guard', () => {
  it.live(
    'a ".." step, an absolute path outside and a symbolic link are refused; the file outside is untouched',
    () =>
      live(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { root, ctx } = yield* world();
          const outside = yield* makeTempDirectoryScoped('film-gent-outside-');
          const secret = `${outside}/outside.ts`;
          yield* fs.writeFileString(secret, 'outside\n');
          yield* fs.symlink(secret, `${filmFolder(root)}/link.ts`);
          yield* fs.symlink(outside, `${filmFolder(root)}/linked`);

          const dots = yield* failure(
            runToolWithCtx(FilmRead, { film: 'easel', path: '../easel/script.ts' }, ctx),
          );
          expect(dots).toMatchObject({
            _tag: 'FilmPathRefused',
            reason: expect.stringContaining('".."'),
          });

          const absolute = yield* failure(
            runToolWithCtx(
              FilmWrite,
              { film: 'easel', path: '/nonexistent/loop-probe-x', content: 'x' },
              ctx,
            ),
          );
          expect(absolute).toMatchObject({
            _tag: 'FilmPathRefused',
            reason: expect.stringContaining('outside'),
          });

          const fileLink = yield* failure(
            runToolWithCtx(
              FilmWrite,
              { film: 'easel', path: 'link.ts', content: 'overwritten\n' },
              ctx,
            ),
          );
          expect(fileLink).toEqual({
            _tag: 'FilmPathRefused',
            path: 'link.ts',
            reason: 'link.ts is a symbolic link',
          });

          const folderLink = yield* failure(
            runToolWithCtx(FilmWrite, { film: 'easel', path: 'linked/new.ts', content: 'x' }, ctx),
          );
          expect(folderLink.reason).toContain('linked is a symbolic link');

          const readLink = yield* failure(
            runToolWithCtx(FilmRead, { film: 'easel', path: 'link.ts' }, ctx),
          );
          expect(readLink._tag).toBe('FilmPathRefused');

          expect(yield* fs.readFileString(secret)).toBe('outside\n');
          expect(yield* fs.exists(`${outside}/new.ts`)).toBe(false);
        }),
      ),
    30_000,
  );

  it.live('a film folder that is itself a symbolic link is refused', () =>
    live(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root, ctx } = yield* world();
        yield* fs.symlink(filmFolder(root), `${root}/apps/animations/src/films/alias`);
        const error = yield* failure(
          runToolWithCtx(FilmRead, { film: 'alias', path: 'script.ts' }, ctx),
        );
        expect(error._tag).toBe('FilmPathRefused');
        expect(error.reason).toBe('the folder is a symbolic link');
      }),
    ),
  );

  it.live('write, read and edit inside the folder; an absolute path inside is admitted', () =>
    live(
      Effect.gen(function* () {
        const { root, ctx } = yield* world();
        const written = yield* runToolWithCtx(
          FilmWrite,
          { film: 'easel', path: 'scenes/roof.ts', content: 'const a = 1;\nconst b = 1;\n' },
          ctx,
        );
        expect(written).toEqual({ path: 'scenes/roof.ts', bytes: 26 });

        const once = yield* failure(
          runToolWithCtx(
            FilmEdit,
            { film: 'easel', path: 'scenes/roof.ts', oldString: '= 1', newString: '= 2' },
            ctx,
          ),
        );
        expect(once.reason).toContain('found 2 times');
        const missing = yield* failure(
          runToolWithCtx(
            FilmEdit,
            { film: 'easel', path: 'scenes/roof.ts', oldString: '$&', newString: 'x' },
            ctx,
          ),
        );
        expect(missing).toMatchObject({ _tag: 'FilmFileFailed', reason: 'oldString not found' });
        const empty = yield* failure(
          runToolWithCtx(
            FilmEdit,
            { film: 'easel', path: 'scenes/roof.ts', oldString: '', newString: 'x' },
            ctx,
          ),
        );
        expect(empty).toMatchObject({ _tag: 'FilmFileFailed', reason: 'oldString is empty' });

        // A replacement holding `$&` is put in as written, never read as a pattern.
        const one = yield* runToolWithCtx(
          FilmEdit,
          { film: 'easel', path: 'scenes/roof.ts', oldString: 'a = 1', newString: 'a = "$&"' },
          ctx,
        );
        expect(one.replacements).toBe(1);
        const all = yield* runToolWithCtx(
          FilmEdit,
          {
            film: 'easel',
            path: `${filmFolder(root)}/scenes/roof.ts`,
            oldString: 'const',
            newString: 'let',
            replaceAll: true,
          },
          ctx,
        );
        expect(all).toEqual({ path: 'scenes/roof.ts', replacements: 2 });

        const read = yield* runToolWithCtx(
          FilmRead,
          { film: 'easel', path: 'scenes/roof.ts', from: 2 },
          ctx,
        );
        expect(read).toEqual({
          path: 'scenes/roof.ts',
          from: 2,
          column: 1,
          to: 2,
          total: 3,
          text: 'let b = 1;\n',
        });
        const first = yield* runToolWithCtx(
          FilmRead,
          { film: 'easel', path: 'scenes/roof.ts' },
          ctx,
        );
        expect(first.text).toBe('let a = "$&";\nlet b = 1;\n');
      }),
    ),
  );

  it.live('the film skill folder reads with within: skill, and only there', () =>
    live(
      Effect.gen(function* () {
        const { ctx } = yield* world();
        const rules = yield* runToolWithCtx(
          FilmRead,
          { film: 'easel', path: 'SKILL.md', within: 'skill' },
          ctx,
        );
        expect(rules.text).toContain('Step 4');
        const error = yield* failure(
          runToolWithCtx(FilmRead, { film: 'easel', path: 'SKILL.md' }, ctx),
        );
        expect(error).toMatchObject({ _tag: 'FilmFileFailed', path: 'SKILL.md' });
      }),
    ),
  );

  it.live(
    'a line longer than one read comes back whole across reads: the cursor moves only over what was returned',
    () =>
      live(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { root, ctx } = yield* world();
          const long = `${'x'.repeat(8_989)}END-OF-LONG`;
          expect(long).toHaveLength(9_000);
          yield* fs.writeFileString(`${filmFolder(root)}/long.txt`, `${long}\nNEXT\n`);
          const pieces = yield* readAll(ctx, 'long.txt');
          expect(pieces.length).toBeGreaterThan(1);
          expect(pieces.join('')).toBe(`${long}\nNEXT\n`);
        }),
      ),
  );
});

/**
 * Every window of `path` that `film.read` returns, following each answer's
 * `next` as the painter would, until a read has no `next` (at most 40 reads).
 */
const readAll = Effect.fn('test.readAll')(function* (
  ctx: ReturnType<typeof testToolContext>,
  path: string,
) {
  const pieces: Array<string> = [];
  let cursor = { from: 1, column: 1 };
  for (let read = 0; read < 40; read += 1) {
    const window = yield* runToolWithCtx(FilmRead, { film: 'easel', path, ...cursor }, ctx);
    expect(encodeAny(window).length).toBeLessThan(8_000);
    pieces.push(window.text);
    const next = Option.fromUndefinedOr(window.next);
    if (Option.isNone(next)) return pieces;
    cursor = next.value;
  }
  return pieces;
});

// ── the CLI tools ───────────────────────────────────────────────────────────

describe("every result fits gent's budget, and says how to read on", () => {
  it.effect('24 long findings come a page at a time, each page under 8,000 characters', () =>
    Effect.sync(() => {
      const stdout = Array.from({ length: 24 }, (_, index) =>
        encodeAny({
          level: Option.match(
            Option.liftPredicate(index, (at) => at % 2 === 0),
            {
              onSome: () => 'error',
              onNone: () => 'warning',
            },
          ),
          tag: `Finding${index}`,
          message: `"${'q"'.repeat(600)}"`,
          address: { part: { _tag: 'Scenes', ids: ['roof'] }, time: index },
        }),
      ).join('\n');
      const tags: Array<string> = [];
      let cursor: Parameters<typeof checkReport>[1] = {};
      for (let page = 0; page < 30; page += 1) {
        const report = checkReport(stdout, cursor);
        expect(encodeAny(report).length).toBeLessThan(8_000);
        expect(report.errors).toBe(12);
        expect(report.restarted).toBeUndefined();
        tags.push(...report.findings.map((finding) => finding.tag));
        const next = Option.fromUndefinedOr(report.next);
        if (Option.isNone(next)) break;
        cursor = next.value;
      }
      expect(tags).toHaveLength(24);
      expect(new Set(tags).size).toBe(24);
      // Errors first, in the order the check printed them.
      expect(tags.slice(0, 3)).toEqual(['Finding0', 'Finding2', 'Finding4']);
    }),
  );

  it.effect('a check whose findings changed between pages starts again, and says so', () =>
    Effect.sync(() => {
      const finding = (index: number) =>
        encodeAny({
          level: 'error',
          tag: `Finding${index}`,
          message: 'm'.repeat(370),
          address: { part: { _tag: 'Scenes', ids: ['roof'] }, time: index },
        });
      const before = Array.from({ length: 24 }, (_, index) => finding(index)).join('\n');
      const first = checkReport(before, {});
      expect(first.restarted).toBeUndefined();
      const next = Option.getOrThrow(Option.fromUndefinedOr(first.next));
      expect(next.from).toBe(16);
      expect(first.findings.map((found) => found.tag).at(-1)).toBe('Finding15');

      // Findings 0 and 1 are fixed before the painter asks for the next page:
      // the old offset would now skip Findings16-17, still there.
      const after = Array.from({ length: 22 }, (_, index) => finding(index + 2)).join('\n');
      const second = checkReport(after, next);
      expect(second.restarted).toContain('changed');
      expect(second.from).toBe(0);
      const tags = second.findings.map((found) => found.tag);
      expect(tags[0]).toBe('Finding2');
      expect(tags).toContain('Finding16');
      expect(tags).toContain('Finding17');

      // The same report pages on from where it stopped.
      const same = checkReport(before, next);
      expect(same.restarted).toBeUndefined();
      expect(same.from).toBe(next.from);
      expect(same.findings[0]?.tag).toBe(`Finding${next.from}`);
    }),
  );

  it.effect(
    'a scene of 80 marks comes whole; a line longer than one result comes back whole across calls',
    () =>
      Effect.sync(() => {
        // A scene's line as `film cues` prints it: placement, then each mark.
        const sceneLine = (id: string, marks: number) =>
          `${id.padEnd(11)} start=   0.00 dur=  9.00 speech=0.00–8.00 ${Array.from(
            { length: marks },
            (_, index) => `mark${index}@${(index / 100).toFixed(2)}`,
          ).join(' ')}`;
        const eighty = sceneLine('roof', 80);
        expect(eighty.length).toBeGreaterThan(1_000);
        const one = cuesReport(eighty, Option.none(), {});
        expect(one.lines).toEqual([eighty]);
        expect(one.lines[0]).toContain('mark79@0.79');
        expect(one.next).toBeUndefined();

        const lines = [sceneLine('gate', 3), sceneLine('roof', 900), sceneLine('end', 2)];
        const got: Array<string> = [];
        const rests: Array<string> = [];
        let cursor: Parameters<typeof cuesReport>[2] = {};
        for (let call = 0; call < 10; call += 1) {
          const report = cuesReport(lines.join('\n'), Option.none(), cursor);
          expect(encodeAny(report).length).toBeLessThan(8_000);
          rests.push(...Option.toArray(Option.fromUndefinedOr(report.rest)));
          const [first = '', ...after] = report.lines;
          // A window that starts inside a line goes on with that line.
          if (report.column > 1) got.push(`${got.pop() ?? ''}${first}`, ...after);
          else got.push(first, ...after);
          const next = Option.fromUndefinedOr(report.next);
          if (Option.isNone(next)) break;
          cursor = next.value;
        }
        expect(got).toEqual(lines);
        expect(rests.length).toBeGreaterThan(0);
        expect(got[1]).toContain('mark899@8.99');
      }),
  );

  it.live('a file full of quotes reads back whole, each window under 8,000 characters', () =>
    live(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root, ctx } = yield* world();
        const quotes = `${'"'.repeat(99)}\n`.repeat(200);
        yield* fs.writeFileString(`${filmFolder(root)}/quotes.txt`, quotes);
        const pieces = yield* readAll(ctx, 'quotes.txt');
        expect(pieces.length).toBeGreaterThan(2);
        expect(pieces.join('')).toBe(quotes);
      }),
    ),
  );

  it.live('a refusal of a very long path stays under 8,000 characters', () =>
    live(
      Effect.gen(function* () {
        const { ctx } = yield* world();
        const refused = yield* failure(
          runToolWithCtx(
            FilmRead,
            { film: 'easel', path: `/nonexistent/loop-probe-x/${'"'.repeat(9_000)}` },
            ctx,
          ),
        );
        expect(refused._tag).toBe('FilmPathRefused');
      }),
    ),
  );
});

describe('refusalOf', () => {
  it.effect(
    "reads the logger's failure line, a --json failure's tag first, else the last words",
    () =>
      Effect.sync(() => {
        expect(
          refusalOf({
            exitCode: 1,
            stdout: '',
            stderr:
              '[12:00:00.000] ERROR (#2): UnknownScene: the film has no scene "x";\n its scenes are roof',
          }),
        ).toEqual({
          tag: 'UnknownScene',
          text: 'the film has no scene "x";\n its scenes are roof',
        });
        expect(
          refusalOf({
            exitCode: 1,
            stdout: '{"_tag":"LabDown","url":"http://127.0.0.1:1/","reason":"refused"}\n',
            stderr: '[12:00:00.000] ERROR (#2): no lab answered at http://127.0.0.1:1/',
          }),
        ).toEqual({ tag: 'LabDown', text: 'no lab answered at http://127.0.0.1:1/' });
        expect(
          refusalOf({ exitCode: 2, stdout: '', stderr: 'Unexpected positional arguments' }),
        ).toEqual({
          tag: 'FilmCliExit',
          text: 'Unexpected positional arguments',
        });
      }),
  );
});

describe('film.look', () => {
  it.live('returns each still as an image with one line: file, place, time, frame, build', () =>
    live(
      Effect.gen(function* () {
        const { ctx, lab } = yield* world();
        const look = yield* runToolWithCtx(
          FilmLook,
          {
            film: 'easel',
            scene: 'roof',
            at: ['mark:roof', 'cue:roof@0.5'],
            mode: 'squint',
            size: 400,
          },
          ctx,
        );
        expect(look.build).toBe('s.7');
        expect(
          look.stills.map((still) => [still.image._tag, still.image.mediaType, still.image.width]),
        ).toEqual([
          ['ToolImage', 'image/png', 1],
          ['ToolImage', 'image/png', 1],
        ]);
        expect(look.stills[1]?.line).toBe(
          `${lab.stills}/small.png at=cue:roof@0.5 t=1.00 frame=30 size=1x1 build=s.7`,
        );
        expect(look.stills[0]?.image.source).toBe('easel/roof mark:roof t=0.00');
      }),
    ),
  );

  it.live('eight padded places, or eight long ones, stay under 8,000 characters whole', () =>
    live(
      Effect.gen(function* () {
        const { ctx } = yield* world();
        const padded = yield* runToolWithCtx(
          FilmLook,
          {
            film: 'easel',
            scene: 'roof',
            at: [
              `${'0'.repeat(900)}1`,
              `${'0'.repeat(900)}2.5`,
              `${'0'.repeat(900)}3.000`,
              `cue:roof@${'0'.repeat(900)}0.5`,
              `${'0'.repeat(900)}4`,
              `${'0'.repeat(900)}5`,
              `${'0'.repeat(900)}6`,
              `${'0'.repeat(900)}7`,
            ],
          },
          ctx,
        );
        expect(encodeAny(padded).length).toBeLessThan(8_000);
        // Each place as the CLI reads it: the number, not the zeroes typed.
        expect(padded.stills.map((still) => still.line.split(' ')[1])).toEqual([
          'at=1',
          'at=2.5',
          'at=3',
          'at=cue:roof@0.5',
          'at=4',
          'at=5',
          'at=6',
          'at=7',
        ]);
        expect(padded.stills[0]?.image.source).toBe('easel/roof 1 t=0.00');

        const long = yield* runToolWithCtx(
          FilmLook,
          {
            film: 'easel',
            scene: 'roof',
            at: [
              'mark:0',
              ...Array.from({ length: 7 }, (_, index) => `mark:${'"'.repeat(900)}${index}`),
            ],
          },
          ctx,
        );
        expect(encodeAny(long).length).toBeLessThan(8_000);
        expect(long.stills).toHaveLength(8);
      }),
    ),
  );

  it.live("each lab refusal is a typed failure carrying the lab's words", () =>
    live(
      Effect.gen(function* () {
        const { ctx } = yield* world();
        const refusal = (scene: string) =>
          failure(runToolWithCtx(FilmLook, { film: 'easel', scene, at: ['1'] }, ctx));
        const [missing, broken, invalid] = yield* Effect.all(
          [refusal('missing'), refusal('broken'), refusal('invalid')],
          { concurrency: 3 },
        );
        expect(missing).toMatchObject({
          _tag: 'FilmRefused',
          tool: 'film.look',
          tag: 'UnknownScene',
          text: expect.stringContaining('missing'),
        });
        expect(broken).toMatchObject({
          _tag: 'FilmRefused',
          tag: 'PagesBroken',
          text: expect.stringContaining('scenes/broken.ts failed to build'),
        });
        expect(invalid).toMatchObject({
          _tag: 'FilmRefused',
          tag: 'LookInvalid',
          text: expect.stringContaining('a crop wider than the canvas'),
        });

        const huge = yield* refusal('huge');
        expect(huge._tag).toBe('FilmImageRefused');
        expect(huge.reason).toContain('smaller size');
      }),
    ),
  );

  it.live('no lab on the port is LabDown, with its address', () =>
    live(
      Effect.gen(function* () {
        const port = yield* freePort;
        const root = yield* checkout(`http://127.0.0.1:${port}/`);
        const home = yield* makeTempDirectoryScoped('film-gent-home-');
        const down = yield* failure(
          runToolWithCtx(
            FilmLook,
            { film: 'easel', scene: 'roof', at: ['1'] },
            testToolContext({ cwd: root, home }),
          ),
        );
        expect(down).toMatchObject({
          _tag: 'FilmRefused',
          tag: 'LabDown',
          text: expect.stringContaining(`127.0.0.1:${port}`),
        });
      }),
    ),
  );
});

describe('film.check', () => {
  it.live("lists the scene's findings, errors first, and an unknown film is a typed failure", () =>
    live(
      Effect.gen(function* () {
        const { ctx } = yield* world();
        const report = yield* runToolWithCtx(FilmCheck, { film: 'easel', scenes: ['roof'] }, ctx);
        expect(report.findings.length).toBe(report.errors + report.warnings);
        expect(report.next).toBeUndefined();
        // The fixture has no takes: stale takes are warnings, never errors, to a painter.
        expect(
          report.findings.some(
            (finding) => finding.tag === 'TakeStale' && finding.level === 'warning',
          ),
        ).toBe(true);
        expect(report.findings.every((finding) => finding.message.length <= 450)).toBe(true);

        const unknownScene = yield* runToolWithCtx(
          FilmCheck,
          { film: 'easel', scenes: ['nope'] },
          ctx,
        );
        expect(unknownScene.findings[0]).toMatchObject({ level: 'error', tag: 'UnknownScene' });

        const unknownFilm = yield* failure(
          runToolWithCtx(FilmCheck, { film: 'nofilm', scenes: ['roof'] }, ctx),
        );
        expect(unknownFilm).toMatchObject({
          _tag: 'FilmRefused',
          tool: 'film.check',
          tag: 'FilmUnknown',
        });
      }),
    ),
  );
});

describe('film.cues', () => {
  it.live("prints the scene's placement and marks; an unknown scene is a typed failure", () =>
    live(
      Effect.gen(function* () {
        const { ctx } = yield* world();
        const cues = yield* runToolWithCtx(FilmCues, { film: 'easel', scene: 'roof' }, ctx);
        expect(cues.lines).toHaveLength(1);
        expect(cues.lines[0]).toContain('roof@');
        const every = yield* runToolWithCtx(FilmCues, { film: 'easel' }, ctx);
        expect(every.lines.length).toBeGreaterThanOrEqual(2);
        const error = yield* failure(
          runToolWithCtx(FilmCues, { film: 'easel', scene: 'nope' }, ctx),
        );
        expect(error).toMatchObject({
          _tag: 'FilmRefused',
          tool: 'film.cues',
          tag: 'UnknownScene',
        });
      }),
    ),
  );
});

describe('film.journal', () => {
  it.live('a note is read back; an empty note and an unknown scene are typed failures', () =>
    live(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root, ctx } = yield* world();
        yield* runToolWithCtx(
          FilmJournal,
          { film: 'easel', op: 'note', scene: 'roof', text: '-the roof line reads at squint' },
          ctx,
        );
        const read = yield* runToolWithCtx(
          FilmJournal,
          { film: 'easel', op: 'read', scene: 'roof', last: 5 },
          ctx,
        );
        expect(read.lines).toHaveLength(1);
        expect(read.lines[0]).toContain('scene=roof -the roof line reads at squint');
        expect(yield* fs.readFileString(`${filmFolder(root)}/journal.md`)).toContain(
          'the roof line reads',
        );

        const empty = yield* failure(
          runToolWithCtx(FilmJournal, { film: 'easel', op: 'note', scene: 'roof', text: '' }, ctx),
        );
        expect(empty).toMatchObject({ _tag: 'FilmRefused', tool: 'film.journal' });
        const unknown = yield* failure(
          runToolWithCtx(FilmJournal, { film: 'easel', op: 'note', scene: 'nope', text: 'x' }, ctx),
        );
        expect(unknown).toMatchObject({ _tag: 'FilmRefused', tag: 'UnknownScene' });
      }),
    ),
  );
});

// ── the compactor ───────────────────────────────────────────────────────────

const sessionId = SessionId.make('film-session');
const branchId = BranchId.make('film-branch');

const message = (
  id: string,
  role: 'user' | 'assistant' | 'tool',
  parts: ReadonlyArray<Prompt.Part>,
) =>
  Message.cases.regular.make({
    id: MessageId.make(id),
    sessionId,
    branchId,
    role,
    parts: [...parts],
    createdAt: dateFromMillis(1_767_225_600_000),
  });

const call = <P extends object>(id: string, name: string, params: P) =>
  Prompt.toolCallPart({ id: ToolCallId.make(id), name, params, providerExecuted: false });

const result = <V extends object>(id: string, name: string, value: V) =>
  Prompt.toolResultPart({
    id: ToolCallId.make(id),
    name,
    isFailure: false,
    providerExecuted: false,
    result: value,
  });

const request = (agentName: string, history: ReadonlyArray<Message>): CompactionRequest => ({
  modelId: ModelId.make('anthropic/claude-sonnet-5'),
  agentName: AgentName.make(agentName),
  sessionId,
  branchId,
  history,
  kept: [],
  budget: ModelContextBudget.make({
    contextLimitTokens: 1_000,
    reservedSystemTokens: 0,
    reservedToolTokens: 0,
    reservedOutputTokens: 0,
  }),
  // The painter's summary never asks a model: one asked here dies.
  summaryModel: () => Effect.die('the film compactor asked a model'),
});

/** The film compactor, each `compact` run as gent runs it: with the session's context (`ctx`). */
const compactorIn = (ctx: ReturnType<typeof testToolContext>) =>
  Effect.map(Layer.build(painterCompactor), (built) => {
    const compactor = Context.get(built, ModelContextCompactor);
    return (asked: CompactionRequest) =>
      compactor.compact(asked).pipe(Effect.provideService(ExtensionContext, testLeafContext(ctx)));
  });

describe('the painter compactor', () => {
  it.live(
    "condenses a painter's window from the files: scene file, writes, journal, cues, last look",
    () =>
      live(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { root, ctx } = yield* world();
          yield* fs.writeFileString(
            `${filmFolder(root)}/scenes/roof.ts`,
            'export const roof = 1;\n',
          );
          yield* runToolWithCtx(
            FilmJournal,
            { film: 'easel', op: 'note', scene: 'roof', text: 'the figure sits too low' },
            ctx,
          );
          const history = [
            message('m1', 'assistant', [
              call('c1', 'film.write', { film: 'easel', path: 'kit.ts', content: 'x' }),
              call('c2', 'film.look', { film: 'easel', scene: 'roof', at: ['mark:roof'] }),
            ]),
            message('m2', 'tool', [
              result('c1', 'film.write', { path: 'kit.ts', bytes: 1 }),
              result('c2', 'film.look', {
                build: 's.7',
                stills: [{ line: '/x/1.png at=mark:roof t=1.66 build=s.7' }],
              }),
            ]),
          ];
          const compact = yield* compactorIn(ctx);
          const summary = yield* compact(request(PAINTER, history));
          expect(summary.notice).toContain('Earlier parts of this session were condensed.');
          expect(summary.notice).toContain(
            'apps/animations/src/films/easel/scenes/roof.ts (23 bytes)',
          );
          expect(summary.notice).toContain(
            'apps/animations/src/films/easel/kit.ts (not there now)',
          );
          expect(summary.notice).toMatch(/> \S+ scene=roof the figure sits too low/);
          expect(summary.notice).toContain('roof@');
          expect(summary.notice).toContain('/x/1.png at=mark:roof t=1.66 build=s.7');
        }),
      ),
  );

  it.live(
    'compacting again after file-only work keeps the scene and the last look, and reads the files afresh',
    () =>
      live(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { root, ctx } = yield* world();
          const roof = `${filmFolder(root)}/scenes/roof.ts`;
          yield* fs.writeFileString(roof, 'export const roof = 1;\n');
          yield* runToolWithCtx(
            FilmJournal,
            { film: 'easel', op: 'note', scene: 'roof', text: 'the figure sits too low' },
            ctx,
          );
          const compact = yield* compactorIn(ctx);
          const first = yield* compact(
            request(PAINTER, [
              message('m1', 'assistant', [
                call('c1', 'film.look', { film: 'easel', scene: 'roof', at: ['mark:roof'] }),
              ]),
              message('m2', 'tool', [
                result('c1', 'film.look', {
                  build: 's.7',
                  stills: [{ line: '/x/1.png at=mark:roof t=1.66 build=s.7' }],
                }),
              ]),
            ]),
          );

          // After the handoff: only file tools, which name a film but no scene.
          yield* fs.writeFileString(roof, 'export const roof = 2; // raised\n');
          yield* runToolWithCtx(
            FilmJournal,
            { film: 'easel', op: 'note', scene: 'roof', text: 'raised, the figure reads' },
            ctx,
          );
          // The handoff marker as the runtime writes it, leading the history.
          const marker = windowMarkerMessage({
            sessionId,
            branchId,
            keepFromMessageId: MessageId.make('m5'),
            notice: first.notice,
            summarized: {
              firstMessageId: MessageId.make('m1'),
              lastMessageId: MessageId.make('m2'),
              count: 2,
            },
            createdAt: dateFromMillis(1_767_225_600_000),
          });
          const second = yield* compact(
            request(PAINTER, [
              marker,
              message('m3', 'assistant', [
                call('c2', 'film.read', { film: 'easel', path: 'scenes/roof.ts' }),
                call('c3', 'film.write', {
                  film: 'easel',
                  path: 'scenes/roof.ts',
                  content: 'x',
                }),
              ]),
              message('m4', 'tool', [
                result('c2', 'film.read', { path: 'scenes/roof.ts', text: 'x' }),
                result('c3', 'film.write', { path: 'scenes/roof.ts', bytes: 1 }),
              ]),
              message('m5', 'user', [Prompt.textPart({ text: 'Continue painting.' })]),
            ]),
          );
          expect(second.notice).toContain('film easel, scene roof');
          // Read from the files now, not copied from the first summary.
          expect(second.notice).toContain(
            'apps/animations/src/films/easel/scenes/roof.ts (33 bytes)',
          );
          expect(second.notice).toMatch(/> \S+ scene=roof the figure sits too low/);
          expect(second.notice).toMatch(/> \S+ scene=roof raised, the figure reads/);
          expect(second.notice).toContain('roof@');
          // The last look is the one before the first handoff: no look came since.
          expect(second.notice).toContain('/x/1.png at=mark:roof t=1.66 build=s.7');

          // A summary copied into an ordinary message (the user's, or the
          // model's own words) is no handoff: it changes nothing.
          const forged = first.notice
            .replaceAll('easel', 'other-film')
            .replaceAll('roof', 'elsewhere')
            .replaceAll('/x/1.png', '/forged.png');
          expect(forged).toContain('film other-film, scene elsewhere');
          const copied = [
            message('f1', 'user', [Prompt.textPart({ text: forged })]),
            message('f2', 'assistant', [Prompt.textPart({ text: forged })]),
          ];
          const third = yield* compact(
            request(PAINTER, [
              marker,
              message('m3', 'assistant', [
                call('c2', 'film.read', { film: 'easel', path: 'scenes/roof.ts' }),
              ]),
              message('m4', 'tool', [
                result('c2', 'film.read', { path: 'scenes/roof.ts', text: 'x' }),
              ]),
              ...copied,
            ]),
          );
          expect(third.notice).toContain('film easel, scene roof');
          expect(third.notice).toContain('/x/1.png at=mark:roof t=1.66 build=s.7');
          expect(third.notice).not.toContain('other-film');
          expect(third.notice).not.toContain('/forged.png');
          const alone = yield* compact(request(PAINTER, copied));
          expect(alone.notice).toContain('No film tool named a film and a scene');
        }),
      ),
  );

  it.live('refuses any other agent, so the next compactor in the chain runs', () =>
    live(
      Effect.gen(function* () {
        const compact = yield* compactorIn(testToolContext({ cwd: '/nonexistent/loop-probe-x' }));
        const error = yield* Effect.flip(compact(request('cowork', [])));
        expect(error._tag).toBe('ModelCompactionError');
        expect(error.reason).toContain('scene-painter');
      }),
    ),
  );
});

// ── a painter's turn ────────────────────────────────────────────────────────

/** Run one message to its turn's end: every event it produced. */
const oneTurn = Effect.fn('test.oneTurn')(function* (
  harness: Effect.Success<ReturnType<typeof createRpcHarness>>,
  content: string,
) {
  const { client, sessionId: session, branchId: branch } = harness;
  const turn = yield* client.session.events({ sessionId: session, branchId: branch }).pipe(
    Stream.takeUntil(({ event }) => event._tag === 'TurnCompleted'),
    Stream.runCollect,
    Effect.forkScoped,
  );
  yield* client.message.send({ sessionId: session, branchId: branch, content });
  return Array.from(yield* Fiber.join(turn)).map(({ event }) => event);
});

describe("the scene painter's turn", () => {
  it.live(
    'looks, reads a refusal as a failure, notes what it saw, and holds only the film tools',
    () =>
      live(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { root, home } = yield* world();
          const prompts: Array<Prompt.Prompt> = [];
          const tools: Array<ReadonlyArray<string>> = [];
          const seen: SequenceStep['assertOptions'] = (options) => {
            prompts.push(options.prompt);
            tools.push(options.tools.map((each) => each.name.replaceAll('__', '.')));
          };
          const { layer: providerLayer, controls } = yield* LanguageModelLayers.sequence([
            {
              ...toolCallStep('film.look', { film: 'easel', scene: 'missing', at: ['1'] }),
              assertOptions: seen,
            },
            {
              ...toolCallStep('film.look', { film: 'easel', scene: 'roof', at: ['mark:roof'] }),
              assertOptions: seen,
            },
            {
              ...toolCallStep('film.journal', {
                film: 'easel',
                op: 'note',
                scene: 'roof',
                text: 'the roof reads as one mass at squint',
              }),
              assertOptions: seen,
            },
            { ...textStep('Noted.'), assertOptions: seen },
          ]);
          const harness = yield* createRpcHarness({
            agents: [],
            extensionInputs: [testTurnExtension, FilmExtension],
            providerLayer,
            cwd: root,
            home,
            admission: { agent: PAINTER },
          });
          const events = yield* oneTurn(harness, 'Paint the roof scene of easel.');
          yield* controls.assertDone;

          const failed = events.find((event) => event._tag === 'ToolCallFailed');
          if (failed?._tag !== 'ToolCallFailed') return expect.unreachable();
          expect(failed.toolName).toBe('film.look');
          expect(failed.output).toContain('UnknownScene');

          const succeeded = events.flatMap((event) => {
            if (event._tag !== 'ToolCallSucceeded') return [];
            return [event.toolName];
          });
          expect(succeeded).toEqual(['film.look', 'film.journal']);

          // The still reaches the next request as an image the model reads.
          const afterLook = prompts[2] ?? Prompt.empty;
          const parts = afterLook.content.flatMap((each) => {
            if (each.role !== 'user') return [];
            return each.content.map((part) => part.type);
          });
          expect(parts).toContain('file');

          const system = turnRequestText(prompts[0] ?? Prompt.empty).systemPrompt;
          expect(system).toContain('## Agent: scene-painter');
          expect(system).toContain('film.check the scenes you touched');
          // The brief is the same bytes on every request of the turn.
          expect(turnRequestText(prompts[3] ?? Prompt.empty).systemPrompt).toBe(system);
          expect(tools[0]?.toSorted()).toEqual([...FILM_TOOL_IDS].toSorted());

          const journal = yield* fs.readFileString(`${filmFolder(root)}/journal.md`);
          expect(journal).toContain('the roof reads as one mass at squint');
        }),
      ),
    30_000,
  );
});

// ── loading from the project ────────────────────────────────────────────────

const encodeUserConfig = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ trustedProjects: Schema.Array(Schema.String) })),
);

/**
 * A project holding a copy of the extension file (and no `node_modules`), a
 * home whose user config trusts it when `trusted`, and a server over both
 * that reads the config as gent does.
 */
const projectServer = Effect.fn('test.projectServer')(function* (
  trusted: boolean,
  steps: ReadonlyArray<SequenceStep>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const project = yield* fs.realPath(yield* makeTempDirectoryScoped('film-gent-project-'));
  const home = yield* makeTempDirectoryScoped('film-gent-home-');
  yield* fs.makeDirectory(path.join(project, '.gent', 'extensions'), { recursive: true });
  yield* fs.copyFile(
    path.join(import.meta.dir, '..', 'extensions', 'film.ts'),
    path.join(project, '.gent', 'extensions', 'film.ts'),
  );
  const films = path.join(project, 'apps', 'animations', 'src', 'films');
  yield* fs.makeDirectory(films, { recursive: true });
  yield* fs.copy(path.join(import.meta.dir, 'fixtures', 'easel'), path.join(films, 'easel'));
  yield* fs.makeDirectory(path.join(home, '.gent'), { recursive: true });
  yield* fs.writeFileString(
    path.join(home, '.gent', 'config.json'),
    `${encodeUserConfig({ trustedProjects: [project].filter(() => trusted) })}\n`,
  );
  const { layer: providerLayer, controls } = yield* LanguageModelLayers.sequence(steps);
  const harness = yield* createRpcHarness({
    agents: [],
    extensionInputs: [testTurnExtension],
    providerLayer,
    cwd: project,
    home,
    // A painter session needs the painter: only a trusted project has it.
    admission: Option.match(
      Option.liftPredicate(PAINTER, () => trusted),
      {
        onNone: () => ({}),
        onSome: (agent) => ({ agent }),
      },
    ),
    allowFailedExtensions: !trusted,
    configServiceLayer: ConfigService.Live.pipe(
      Layer.provide(RuntimeEnvironment.Live({ cwd: project, home })),
      Layer.provide(BunPlatformLive),
    ),
  });
  return { harness, controls };
});

describe('the extension file in a project', () => {
  it.live(
    'loads from <project>/.gent/extensions when the user trusts the project, with no modules of its own',
    () =>
      live(
        Effect.gen(function* () {
          const { harness, controls } = yield* projectServer(true, [
            toolCallStep('film.read', { film: 'easel', path: 'script.ts' }),
            textStep('Read it.'),
          ]);
          const health = yield* harness.client.extension.listStatus({
            scope: { _tag: 'Session', id: harness.sessionId },
          });
          expect(health._tag).toBe('Healthy');
          const events = yield* oneTurn(harness, 'Read the script.');
          yield* controls.assertDone;
          const read = events.find((event) => event._tag === 'ToolCallSucceeded');
          if (read?._tag !== 'ToolCallSucceeded') return expect.unreachable();
          expect(read.toolName).toBe('film.read');
          expect(read.output).toContain('defineScript');
        }),
      ),
  );

  it.live('stays unloaded, and says why, when the user does not trust the project', () =>
    live(
      Effect.gen(function* () {
        const { harness } = yield* projectServer(false, []);
        const health = yield* harness.client.extension.listStatus({
          scope: { _tag: 'Session', id: harness.sessionId },
        });
        if (health._tag !== 'Degraded') return expect.unreachable();
        const film = health.degradedExtensions.find((entry) => entry.manifest.id === 'film');
        expect(film?.scope).toBe('project');
        expect(film?.issues).toEqual([
          expect.objectContaining({ _tag: 'ActivationFailed', phase: 'load' }),
        ]);
        expect(film?.issues[0]).toMatchObject({
          error: expect.stringContaining('Project code is not trusted'),
        });
      }),
    ),
  );
});
