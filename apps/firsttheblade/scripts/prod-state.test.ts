/**
 * The prod state check over small made-up state folders: a missing or empty
 * folder is refused; a folder that records the live Worker, D1 and queue
 * passes; and each of the three, missing, unreadable, of another type or
 * recording another resource's name (a second D1 made by a deploy that had
 * no state), is refused by name.
 */
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path } from 'effect';

import { checkProdState } from './prod-state.ts';

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
  checkProdState(app).pipe(
    Effect.match({ onSuccess: () => 'pass', onFailure: (error) => error.message }),
  );

const test = it.effect.layer(BunServices.layer);

describe('the prod state check', () => {
  test('refuses a checkout with no prod state folder, or an empty one, and says what to do', () =>
    Effect.scoped(
      Effect.gen(function* () {
        for (const files of [Option.none(), Option.some([])]) {
          const line = yield* answer(yield* appWith(files));
          expect(line).toContain(`no prod Alchemy state at ${STATE}`);
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
          const broken = [
            rest,
            [...rest, [file, ''] as const],
            [...rest, [file, '{"resourceType":'] as const],
            [...rest, [file, resource('Cloudflare.KVNamespace', named(field, name))] as const],
            [
              ...rest,
              [
                file,
                resource(resourceType, named(field, 'firsttheblade-Mail-prod-vcjs7e535fd4wypd')),
              ] as const,
            ],
            [...rest, [file, resource(resourceType, '')] as const],
          ];
          for (const files of broken) {
            const line = yield* answer(yield* appWith(Option.some(files)));
            expect([file, line]).toEqual([
              file,
              expect.stringContaining(`does not record ${label}`),
            ]);
            for (const other of RESOURCES.filter((each) => each.file !== file)) {
              expect([file, line]).toEqual([file, expect.not.stringContaining(other.label)]);
            }
          }
        }
      }),
    ));
});
