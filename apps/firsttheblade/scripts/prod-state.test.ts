/**
 * The prod state check over small made-up state folders: a missing or empty
 * folder is refused; a folder that records the live Worker, D1 and queue
 * passes; and each of the three, missing, unreadable, of another type or
 * recording another resource's name (a second D1 made by a deploy that had
 * no state), is refused by name, with what it records when it records
 * another. The stack's gate reads the `.alchemy` folder Alchemy runs with, on
 * stage `prod` only, and the stack runs it before anything else.
 */
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { AlchemyContext } from 'alchemy/AlchemyContext';
import { Stage } from 'alchemy/Stage';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import { type ESTree, parseSync } from 'vite';

import { checkProdState, prodStateGate } from './prod-state.ts';

const STATE = '.alchemy/state/firsttheblade/prod';

/** The live resources, as the state names them. */
const RESOURCES = [
  {
    file: 'Site.json',
    label: 'the Site Worker',
    resourceType: 'Cloudflare.Worker',
    field: 'workerName',
    name: 'firsttheblade',
  },
  {
    file: 'Mail.json',
    label: 'the Mail D1',
    resourceType: 'Cloudflare.D1Database',
    field: 'databaseName',
    name: 'firsttheblade-Mail-prod-kbdnjw67amvppcia',
  },
  {
    file: 'FilmQueue.json',
    label: 'the FilmQueue queue',
    resourceType: 'Cloudflare.Queues.Queue',
    field: 'queueName',
    name: 'firsttheblade-filmqueue-prod-ybriolxcgdeqcqtq',
  },
] as const;

/** A resource's state file as a deploy writes it (made up but for the names), its `attr` given as JSON members. */
const resource = (resourceType: string, attr: string) =>
  `{"status":"created","logicalId":"Made","resourceType":"${resourceType}","attr":{${attr}},"removalPolicy":"destroy"}`;

const named = (field: string, name: string) => `"${field}":"${name}","madeUpId":"0000"`;

/** Every live resource's file, and one the check does not read. */
const LIVE: ReadonlyArray<readonly [string, string]> = [
  ...RESOURCES.map(
    ({ file, resourceType, field, name }) =>
      [file, resource(resourceType, named(field, name))] as const,
  ),
  ['Zone.json', resource('Cloudflare.Zone', '"name":"example.com"')],
];

/** A fresh app folder whose prod state folder holds `files`, or with no state folder when none. */
const appWith = Effect.fn('test.appWith')(function* (
  files: Option.Option<ReadonlyArray<readonly [string, string]>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const app = yield* fs.makeTempDirectoryScoped({ prefix: 'prod-state-' });
  if (Option.isNone(files)) return app;
  const dir = path.join(app, STATE);
  yield* fs.makeDirectory(dir, { recursive: true });
  yield* Effect.forEach(files.value, ([file, text]) =>
    fs.writeFileString(path.join(dir, file), text),
  );
  return app;
});

/** The check's answer for `app`: `pass`, or the line it refuses with. */
const answer = (app: string) =>
  checkProdState(`${app}/.alchemy`).pipe(
    Effect.match({ onSuccess: () => 'pass', onFailure: (error) => error.message }),
  );

const Scripts = Schema.fromJsonString(
  Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) }),
);

/** The names `program` imports from `source`, as the module binds them. */
const importedFrom = (program: ESTree.Program, source: string) =>
  program.body.flatMap((statement) => {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== source) return [];
    return statement.specifiers.map((specifier) => specifier.local.name);
  });

/**
 * The first `count` statements of the stack's generator (the third argument
 * of `export default Alchemy.Stack(…)`, an `Effect.gen`), each as its text in
 * `source`.
 */
const firstStatements = (program: ESTree.Program, source: string, count: number) =>
  program.body.flatMap((statement) => {
    if (statement.type !== 'ExportDefaultDeclaration') return [];
    const stack = statement.declaration;
    if (stack.type !== 'CallExpression') return [];
    const gen = stack.arguments[2];
    if (gen?.type !== 'CallExpression') return [];
    const body = gen.arguments[0];
    if (body?.type !== 'FunctionExpression') return [];
    return Option.toArray(Option.fromNullOr(body.body)).flatMap(({ body: statements }) =>
      statements.slice(0, count).map((node) => source.slice(node.start, node.end)),
    );
  });

const test = it.effect.layer(BunServices.layer);

describe('the prod state check', () => {
  test('refuses a checkout with no prod state folder, or an empty one, and says what to do', () =>
    Effect.scoped(
      Effect.gen(function* () {
        for (const files of [Option.none(), Option.some([])]) {
          const app = yield* appWith(files);
          const line = yield* answer(app);
          expect(line).toContain(`no prod Alchemy state at ${app}/${STATE}`);
          expect(line).toContain(`Copy the main checkout's apps/firsttheblade/${STATE}`);
          expect(line).not.toContain('\n');
        }
      }),
    ));

  test('passes a state that records the live Worker, D1 and queue', () =>
    Effect.scoped(
      Effect.gen(function* () {
        expect(yield* answer(yield* appWith(Option.some(LIVE)))).toBe('pass');
      }),
    ));

  test('refuses a state that lacks any one live resource, or holds it unreadable, of another type or under another name', () =>
    Effect.scoped(
      Effect.gen(function* () {
        for (const { file, label, resourceType, field, name } of RESOURCES) {
          const rest = LIVE.filter(([other]) => other !== file);
          const unread = `${file} is missing or unreadable`;
          const replaced = (found: string, expected: string) =>
            `${file} records ${found}, not ${expected}; if it was replaced on purpose, change LIVE in apps/firsttheblade/scripts/prod-state.ts`;
          const broken = [
            [rest, unread],
            [[...rest, [file, ''] as const], unread],
            [[...rest, [file, '{"resourceType":'] as const], unread],
            [
              [...rest, [file, resource('Cloudflare.KVNamespace', named(field, name))] as const],
              replaced('a Cloudflare.KVNamespace', `a ${resourceType}`),
            ],
            [
              [
                ...rest,
                [
                  file,
                  resource(resourceType, named(field, 'firsttheblade-Mail-prod-vcjs7e535fd4wypd')),
                ] as const,
              ],
              replaced('firsttheblade-Mail-prod-vcjs7e535fd4wypd', name),
            ],
            [
              [...rest, [file, resource(resourceType, '')] as const],
              replaced(`no string ${field}`, name),
            ],
            [
              [...rest, [file, resource(resourceType, `"${field}":42`)] as const],
              replaced(`no string ${field}`, name),
            ],
          ] as const;
          for (const [files, detail] of broken) {
            const line = yield* answer(yield* appWith(Option.some(files)));
            expect([file, line]).toEqual([
              file,
              expect.stringContaining(`does not record ${label} (${detail})`),
            ]);
            for (const other of RESOURCES.filter((each) => each.file !== file)) {
              expect([file, line]).toEqual([file, expect.not.stringContaining(other.label)]);
            }
          }
        }
      }),
    ));

  test("the stack's gate checks the state Alchemy reads on stage prod, and nothing on another stage", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const gate = (app: string, stage: string) =>
          prodStateGate().pipe(
            Effect.provideService(Stage, stage),
            Effect.provideService(AlchemyContext, {
              dotAlchemy: `${app}/.alchemy`,
              dev: false,
              adopt: false,
            }),
            Effect.match({ onSuccess: () => 'pass', onFailure: (error) => error.message }),
          );
        const bare = yield* appWith(Option.none());
        const live = yield* appWith(Option.some(LIVE));
        expect(yield* gate(bare, 'prod')).toContain(`no prod Alchemy state at ${bare}/${STATE}`);
        expect(yield* gate(live, 'prod')).toBe('pass');
        expect(yield* gate(bare, 'agent-mailtest')).toBe('pass');
      }),
    ));

  test("the stack's body starts with the prod state gate, then the stills gate", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const app = path.dirname(import.meta.dir);
      const source = yield* fs.readFileString(path.join(app, 'alchemy.run.ts'));
      const { program } = parseSync('alchemy.run.ts', source);
      const state = importedFrom(program, './scripts/prod-state.ts');
      const stills = importedFrom(program, './kit/shippable.ts');
      expect([state.length, stills.length]).toEqual([1, 1]);
      expect(firstStatements(program, source, 2)).toEqual([
        `yield* ${state[0]}().pipe(Effect.orDie);`,
        `yield* ${stills[0]}(import.meta.dir).pipe(Effect.orDie);`,
      ]);
      const { scripts } = yield* Schema.decodeEffect(Scripts)(
        yield* fs.readFileString(path.join(app, 'package.json')),
      );
      expect(scripts['plan']).toBe('alchemy plan alchemy.run.ts --stage prod');
      expect(scripts['deploy']).toEndWith('&& alchemy deploy alchemy.run.ts --stage prod');
    }));
});
