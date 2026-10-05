// The film extension over a synthetic checkout: a temp folder with the
// `easel` fixture film, a `cli.ts` that runs this checkout's film CLI over
// it, and a fake lab on a loopback port. No real film is read, checked or
// looked at, and no model is called: turns run on gent's scripted model.
//
// `bun run test:gent` runs this file under gent's test preload.

import { deflateSync } from 'node:zlib';
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
  AgentDefinition,
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
import { BuiltinExtensions } from '@gent/extensions';
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
  multiToolCallStep,
  RuntimeEnvironment,
  runToolWithCtx,
  type SequenceStep,
  testAgent,
  testLeafContext,
  testToolContext,
  testTurnExtension,
  textStep,
  toolCallStep,
  turnRequestText,
  windowMarkerMessage,
} from '@gent/core/test-utils';
import FilmExtension, {
  checkReport,
  cuesReport,
  FilmCheck,
  FilmCues,
  FilmJournal,
  FilmLook,
  PAINTER,
  painterCompactor,
  painterPaths,
  refusalOf,
  scenePainter,
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

/** A PNG of `width` x `height`, mid grey. */
const pngBytes = (width: number, height: number) => {
  // A real one, so gent's codec decodes and scales it: 8-bit grey, rows unfiltered.
  const chunk = (type: string, data: Uint8Array) => {
    const body = Uint8Array.from([...Array.from(type, (char) => char.charCodeAt(0)), ...data]);
    return [...be32(data.length), ...body, ...be32(Bun.hash.crc32(body))];
  };
  const rows = new Uint8Array((width + 1) * height).fill(128);
  for (let row = 0; row < height; row += 1) rows[row * (width + 1)] = 0;
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', Uint8Array.from([...be32(width), ...be32(height), 8, 0, 0, 0, 0])),
    ...chunk('IDAT', deflateSync(rows)),
    ...chunk('IEND', new Uint8Array()),
  ]);
};

/**
 * A temp checkout: `apps/animations/cli.ts` runs this repo's film CLI over the
 * temp films folder and asks the lab at `labUrl`, and the fixture film
 * `easel` sits in it.
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
 * gent's image store scales down, `garbled` with bytes no decoder reads,
 * `missing` UnknownScene (404), `broken`
 * PagesBroken (422), `invalid` LookInvalid (400).
 */
const fakeLab = Effect.fn('test.fakeLab')(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const stills = yield* makeTempDirectoryScoped('film-gent-stills-');
  yield* fs.writeFile(path.join(stills, 'small.png'), pngBytes(1, 1));
  yield* fs.writeFile(path.join(stills, 'huge.png'), pngBytes(3000, 10));
  yield* fs.writeFileString(path.join(stills, 'garbled.png'), 'not a picture');
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
        Option.liftPredicate(body.scene, (scene) => scene === 'huge' || scene === 'garbled'),
        {
          onSome: (scene) => `${scene}.png`,
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

        // A still past gent's limits comes back scaled, its first size kept to map back by.
        const huge = yield* runToolWithCtx(
          FilmLook,
          { film: 'easel', scene: 'huge', at: ['1'] },
          ctx,
        );
        expect(huge.stills[0]?.image).toMatchObject({ width: 2000, originalWidth: 3000 });

        // Only a still no decoder reads is refused.
        const garbled = yield* refusal('garbled');
        expect(garbled._tag).toBe('FilmImageRefused');
        expect(garbled.reason).toContain('unreadable');
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
              call('c1', 'write', { path: 'apps/animations/src/films/easel/kit.ts', content: 'x' }),
              call('c2', 'film.look', { film: 'easel', scene: 'roof', at: ['mark:roof'] }),
            ]),
            message('m2', 'tool', [
              result('c1', 'write', { path: `${filmFolder(root)}/kit.ts`, bytesWritten: 1 }),
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

          // After the handoff: only gent's file tools, which name no scene.
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
                call('c2', 'read', { path: 'apps/animations/src/films/easel/scenes/roof.ts' }),
                call('c3', 'edit', {
                  path: `${filmFolder(root)}/scenes/roof.ts`,
                  oldString: '1',
                  newString: '2',
                }),
              ]),
              message('m4', 'tool', [
                result('c2', 'read', { path: `${filmFolder(root)}/scenes/roof.ts`, content: 'x' }),
                result('c3', 'edit', {
                  path: `${filmFolder(root)}/scenes/roof.ts`,
                  replacements: 1,
                }),
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
                call('c2', 'read', { path: 'apps/animations/src/films/easel/scenes/roof.ts' }),
              ]),
              message('m4', 'tool', [
                result('c2', 'read', { path: `${filmFolder(root)}/scenes/roof.ts`, content: 'x' }),
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

  it.live("counts a write by the file its output names, and only a file in a film's folder", () =>
    live(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { root, ctx } = yield* world();
        yield* fs.writeFileString(`${filmFolder(root)}/kit.ts`, 'export const kit = 1;\n');
        const films = `${root}/apps/animations/src/films`;
        // Each write's params name a film file; what counts is the output.
        const wrote = (id: string, name: string, path: string, failed = false) => [
          call(id, name, { path: 'apps/animations/src/films/easel/kit.ts', content: 'x' }),
          Prompt.toolResultPart({
            id: ToolCallId.make(id),
            name,
            isFailure: failed,
            providerExecuted: false,
            result: { path, bytesWritten: 1 },
          }),
        ];
        const compact = yield* compactorIn(ctx);
        const summary = yield* compact(
          request(PAINTER, [
            message('m1', 'assistant', [
              call('c0', 'film.cues', { film: 'easel', scene: 'roof' }),
              ...wrote('c1', 'write', `${root}/apps/animations/src/outside.ts`),
              ...wrote('c2', 'edit', `${films}/loose.ts`),
              ...wrote('c3', 'write', `${films}-elsewhere/easel/kit.ts`),
              ...wrote('c4', 'write', `${filmFolder(root)}/kit.ts`, true),
              ...wrote('c5', 'film.write', `${filmFolder(root)}/kit.ts`),
            ]),
          ]),
        );
        expect(summary.notice).toContain('## Files written\n(none)');

        const counted = yield* compact(
          request(PAINTER, [
            message('m1', 'assistant', [
              call('c0', 'film.cues', { film: 'easel', scene: 'roof' }),
              ...wrote('c1', 'edit', `${filmFolder(root)}/kit.ts`),
            ]),
          ]),
        );
        expect(counted.notice).toContain(
          '## Files written\napps/animations/src/films/easel/kit.ts (22 bytes)',
        );
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
/** gent's shipped file tools (read, grep, write, edit), selected by id: the tools the painter's `paths` confine. */
const FS_TOOLS = BuiltinExtensions.filter(
  (extension) => extension.manifest.id === '@gent/fs-tools',
);

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
            extensionInputs: [testTurnExtension, ...FS_TOOLS, FilmExtension],
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
          // gent's file tools and the film's own, and nothing else: not
          // film.paint (the definition's whole list is checked below).
          expect(tools[0]?.toSorted()).toEqual([
            'edit',
            'film.check',
            'film.cues',
            'film.journal',
            'film.look',
            'grep',
            'read',
            'write',
          ]);

          const journal = yield* fs.readFileString(`${filmFolder(root)}/journal.md`);
          expect(journal).toContain('the roof reads as one mass at squint');
        }),
      ),
    30_000,
  );

  it.live(
    "a run started on one film (film.paint's paths) reads and writes that film and nothing else",
    () =>
      live(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const { root, home } = yield* world();
          const films = 'apps/animations/src/films';
          const { layer: providerLayer, controls } = yield* LanguageModelLayers.sequence([
            multiToolCallStep(
              // Its film: each succeeds.
              { toolName: 'read', input: { path: `${films}/easel/script.ts` } },
              {
                toolName: 'write',
                input: { path: `${films}/easel/scenes/sketch.ts`, content: 'x' },
              },
              // Another film, and the app outside the films: each is refused.
              { toolName: 'write', input: { path: `${films}/other/scene.ts`, content: 'x' } },
              { toolName: 'read', input: { path: 'apps/animations/cli.ts' } },
            ),
            textStep('done'),
          ]);
          const harness = yield* createRpcHarness({
            agents: [],
            extensionInputs: [testTurnExtension, ...FS_TOOLS, FilmExtension],
            providerLayer,
            cwd: root,
            home,
            admission: { agent: PAINTER, runSpec: { overrides: { paths: painterPaths('easel') } } },
          });
          const events = yield* oneTurn(harness, 'Paint a sketch of easel.');
          yield* controls.assertDone;

          const succeeded = events.flatMap((event) => {
            if (event._tag !== 'ToolCallSucceeded') return [];
            return [event.toolName];
          });
          const failed = events.flatMap((event) => {
            if (event._tag !== 'ToolCallFailed') return [];
            return [event.toolName];
          });
          expect(succeeded.toSorted()).toEqual(['read', 'write']);
          expect(failed.toSorted()).toEqual(['read', 'write']);
          expect(yield* fs.exists(`${filmFolder(root)}/scenes/sketch.ts`)).toBe(true);
          expect(yield* fs.exists(`${root}/${films}/other`)).toBe(false);
        }),
      ),
    30_000,
  );
});

// ── the painter's definition and film.paint ─────────────────────────────────

const decodeAgent = Schema.decodeUnknownSync(AgentDefinition);
const encodeAgent = Schema.encodeSync(AgentDefinition);

describe("the scene painter's definition", () => {
  it.effect(
    "decodes through gent's AgentDefinition: exactly its eight tools, no bash, and the two paths",
    () =>
      Effect.sync(() => {
        const decoded = decodeAgent(encodeAgent(scenePainter));
        expect(decoded.tools).toEqual([
          'read',
          'grep',
          'write',
          'edit',
          'film.cues',
          'film.look',
          'film.journal',
          'film.check',
        ]);
        expect(decoded.paths).toEqual([
          { path: 'apps/animations/src/films', access: 'write' },
          { path: '.claude/skills/film', access: 'read' },
        ]);
        for (const held of decoded.tools ?? []) expect(decoded.admitsTool(held)).toBe(true);
        for (const out of ['bash', 'cell', 'film.paint', 'film.read', 'delegate.start'])
          expect(decoded.admitsTool(out)).toBe(false);
      }),
  );

  it.effect("painterPaths holds one run to its film's folder, and the film skill to read", () =>
    Effect.sync(() => {
      expect(painterPaths('easel')).toEqual([
        { path: 'apps/animations/src/films/easel', access: 'write' },
        { path: '.claude/skills/film', access: 'read' },
      ]);
      // A run override decodes as the definition's own paths do.
      const run = decodeAgent(
        encodeAgent(AgentDefinition.make({ name: PAINTER, paths: painterPaths('easel') })),
      );
      expect(run.paths).toEqual(painterPaths('easel'));
    }),
  );
});

/** What film.paint answered: the painter's session and branch. */
const PaintAnswer = Schema.fromJsonString(
  Schema.Struct({ sessionId: SessionId, branchId: BranchId, follow: Schema.String }),
);
const decodePaintAnswer = Schema.decodeUnknownSync(PaintAnswer);

describe('film.paint', () => {
  it.live(
    'starts a child session admitted as the painter, its paths the film alone, with the scene as its task',
    () =>
      live(
        Effect.gen(function* () {
          const { root, home } = yield* world();
          // The parent's closing reply and the painter's one reply may come in
          // either order: each step records what it was asked.
          const asked: Array<{ readonly system: string; readonly tools: ReadonlyArray<string> }> =
            [];
          const users: Array<string> = [];
          const seen: SequenceStep['assertOptions'] = (options) => {
            const text = turnRequestText(options.prompt);
            asked.push({
              system: text.systemPrompt,
              tools: options.tools.map((each) => each.name.replaceAll('__', '.')),
            });
            users.push(
              options.prompt.content
                .flatMap((each) => {
                  if (each.role !== 'user') return [];
                  return each.content.flatMap((part) => {
                    if (part.type !== 'text') return [];
                    return [part.text];
                  });
                })
                .join('\n'),
            );
          };
          const { layer: providerLayer, controls } = yield* LanguageModelLayers.sequence([
            toolCallStep('film.paint', {
              film: 'easel',
              scene: 'roof',
              brief: 'Raise the figure.',
            }),
            { ...textStep('Done.'), assertOptions: seen },
            { ...textStep('Done.'), assertOptions: seen },
          ]);
          const harness = yield* createRpcHarness({
            agents: [testAgent],
            extensionInputs: [testTurnExtension, FilmExtension],
            providerLayer,
            cwd: root,
            home,
          });
          const events = yield* oneTurn(harness, 'Paint the roof scene of easel.');
          const started = events.find((event) => event._tag === 'ToolCallSucceeded');
          if (started?._tag !== 'ToolCallSucceeded') return expect.unreachable();
          expect(started.toolName).toBe('film.paint');
          const answer = decodePaintAnswer(started.resultJson ?? '');
          expect(answer.follow).toContain(answer.sessionId);

          // The painter's turn runs to its end on the scripted model.
          yield* harness.client.session
            .events({ sessionId: answer.sessionId, branchId: answer.branchId })
            .pipe(
              Stream.takeUntil(({ event }) => event._tag === 'TurnCompleted'),
              Stream.runDrain,
            );
          yield* controls.assertDone;

          const child = (yield* harness.client.session.list()).find(
            (session) => session.id === answer.sessionId,
          );
          expect(child?.parentSessionId).toBe(harness.sessionId);
          expect(child?.admission?.agent).toBe(PAINTER);
          expect(child?.admission?.runSpec?.overrides?.paths).toEqual(painterPaths('easel'));

          const painter = asked.findIndex((each) =>
            each.system.includes('## Agent: scene-painter'),
          );
          expect(painter).toBeGreaterThanOrEqual(0);
          expect(asked[painter]?.tools.toSorted()).toEqual([
            'film.check',
            'film.cues',
            'film.journal',
            'film.look',
          ]);
          expect(users[painter]).toContain(
            'Paint the scene roof of the film easel (apps/animations/src/films/easel/scenes/roof.ts).',
          );
          expect(users[painter]).toContain('Raise the figure.');
        }),
      ),
    30_000,
  );

  it.live(
    'an unknown film or scene is refused before any session is made',
    () =>
      live(
        Effect.gen(function* () {
          const { root, home } = yield* world();
          const { layer: providerLayer, controls } = yield* LanguageModelLayers.sequence([
            toolCallStep('film.paint', { film: 'nofilm', scene: 'roof' }),
            toolCallStep('film.paint', { film: 'easel', scene: 'nope' }),
            textStep('Refused.'),
          ]);
          const harness = yield* createRpcHarness({
            agents: [testAgent],
            extensionInputs: [testTurnExtension, FilmExtension],
            providerLayer,
            cwd: root,
            home,
          });
          const events = yield* oneTurn(harness, 'Paint.');
          yield* controls.assertDone;
          const failed = events.flatMap((event) => {
            if (event._tag !== 'ToolCallFailed') return [];
            return [event.output ?? ''];
          });
          expect(failed).toHaveLength(2);
          expect(failed[0]).toContain('FilmUnknown');
          expect(failed[1]).toContain('UnknownScene');
          const sessions = yield* harness.client.session.list();
          expect(sessions.map((session) => session.id)).toEqual([harness.sessionId]);
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
 * A checkout holding a copy of the extension file (and no `node_modules` of
 * its own), a home whose user config trusts it when `trusted`, and a server
 * over both that reads the config as gent does.
 */
const projectServer = Effect.fn('test.projectServer')(function* (
  trusted: boolean,
  steps: ReadonlyArray<SequenceStep>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  // No look is taken: the lab's address is never asked.
  const project = yield* checkout('http://127.0.0.1:9/');
  const home = yield* makeTempDirectoryScoped('film-gent-home-');
  yield* fs.makeDirectory(path.join(project, '.gent', 'extensions'), { recursive: true });
  yield* fs.copyFile(
    path.join(import.meta.dir, '..', 'extensions', 'film.ts'),
    path.join(project, '.gent', 'extensions', 'film.ts'),
  );
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
            toolCallStep('film.cues', { film: 'easel', scene: 'roof' }),
            textStep('Read them.'),
          ]);
          const health = yield* harness.client.extension.listStatus({
            scope: { _tag: 'Session', id: harness.sessionId },
          });
          expect(health._tag).toBe('Healthy');
          const events = yield* oneTurn(harness, 'Read the cues.');
          yield* controls.assertDone;
          const cues = events.find((event) => event._tag === 'ToolCallSucceeded');
          if (cues?._tag !== 'ToolCallSucceeded') return expect.unreachable();
          expect(cues.toolName).toBe('film.cues');
          expect(cues.output).toContain('roof@');
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
