/**
 * `shippable`, the prod deploy's gate: it refuses a pending record and an
 * approval whose shown files, with its earlier approvals', do not hold every
 * still before it builds, each approval's ask saved beside the record; then
 * it builds the site and refuses each built image, found by its bytes, that
 * no approved still and no image outside the rule holds. One real build of a
 * copy of the app carries the forms the source reader missed (a template
 * `new URL`, an `import.meta.glob`, a `.jfif` import, a `.jxl` under
 * `public/`), each with bytes the owner never saw: exactly those are
 * refused, and every other image of the build passes. On stage `prod` it
 * runs; any other stage skips it. The stack runs it second, after the prod
 * state check (`scripts/prod-state.test.ts` holds that order).
 */
import { BunServices } from '@effect/platform-bun';
import { Stage } from 'alchemy/Stage';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';

import {
  Approved,
  Given,
  RECORD,
  ShipUnapproved,
  readRecord,
  savedAsk,
  shippable,
} from './approval.ts';
import { builtImages } from './build-walk.ts';
import { LabAsk } from './lab-asks.ts';
import { scratchApp } from './scratch-app.ts';
import { OUTSIDE } from './served.ts';
import { prodGate } from './shippable.ts';

const APP = `${import.meta.dir}/..`;
const ASK = 'a1b2c3d4e5f';
const EARLIER = 'b1c2d3e4f5a';
const FIELD = 'src/art/field-768.webp';

/** What a copy of the app needs to build, beside its record, a link to the app's `node_modules` and the repo's `tsconfig.json` its own extends. */
const COPIED = [
  'src',
  'public',
  'scripts',
  'package.json',
  'tsconfig.json',
  'turbo.json',
  'vite.config.ts',
];

const LabAskJson = Schema.fromJsonString(LabAsk, { space: 2 });
const ShownJson = Schema.fromJsonString(Schema.Record(Schema.String, Schema.String));

/** `given`'s ask saved at `root` (`savedAsk`), as the lab gives it answered approve: one step whose image blocks show its files, with their receipt. */
const savedFor = (root: string, given: Given) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { record, shown } = savedAsk(given.ask);
    const ask: LabAsk = {
      id: given.ask,
      ask: {
        steps: {
          ask: {
            blocks: Object.keys(given.shown).map((src) => ({ kind: 'image', image: { src } })),
          },
        },
      },
      shown: given.shown,
      state: { _tag: 'Answered', answers: given.answers },
      answered: [{ step: 'ask', values: { stills: 'approve' }, at: given.answered }],
    };
    yield* fs.makeDirectory(`${root}/kit/fixtures`, { recursive: true });
    yield* fs.writeFileString(`${root}/${record}`, yield* Schema.encodeEffect(LabAskJson)(ask));
    yield* fs.writeFileString(
      `${root}/${shown}`,
      yield* Schema.encodeEffect(ShownJson)(given.shown),
    );
  });

/** The record at `root` with its stills, the approval `of` gives for them, and the earlier approvals `before` gives, each approval's ask saved beside it. */
const recordWith = (
  root: string,
  of: (stills: Approved['stills']) => Approved['approval'],
  before: (stills: Approved['stills']) => Approved['earlier'] = () => [],
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { stills } = yield* readRecord(root);
    const record: Approved = { approval: of(stills), earlier: before(stills), stills };
    const json = yield* Schema.encodeEffect(Schema.fromJsonString(Approved, { space: 2 }))(record);
    yield* fs.writeFileString(`${root}/${RECORD}`, `${json}\n`);
    const given = [record.approval, ...record.earlier].filter(Schema.is(Given));
    yield* Effect.forEach(given, (approval) => savedFor(root, approval));
  });

/** The record at `root` pending on `ASK`, whatever the committed record's approval is. */
const pendingAt = (root: string) => recordWith(root, () => ({ status: 'pending', ask: ASK }));

/** An approval on `ask` whose shown files are `shown`. */
const givenOn = (ask: string, shown: Record<string, string>): Approved['earlier'][number] => ({
  status: 'approved',
  ask,
  lab: 'http://lab.test/',
  answered: '2026-10-22T09:00:00.000Z',
  answer: 'Approve them',
  answers: { stills: { kind: 'choose', value: 'approve', label: 'Approve them' } },
  shown,
});

/** The record at `root` turned approved on `ASK`, its shown files those `shows` gives for its stills, with an earlier approval on `EARLIER` of each set `before` gives. */
const approvedWith = (
  root: string,
  shows: (stills: Approved['stills']) => Record<string, string>,
  before: (stills: Approved['stills']) => ReadonlyArray<Record<string, string>> = () => [],
) =>
  recordWith(
    root,
    (stills) => givenOn(ASK, shows(stills)),
    (stills) => before(stills).map((shown) => givenOn(EARLIER, shown)),
  );

const shownAll = (stills: Approved['stills']) =>
  Object.fromEntries(Object.entries(stills).map(([still, hash]) => [`/files/${still}`, hash]));

/** The stills but the field at 768 shown, and the field at 768 alone. */
const shownBut = (stills: Approved['stills']) => {
  const { [FIELD]: _, ...rest } = stills;
  return shownAll(rest);
};
const shownField = (stills: Approved['stills']) => ({ [`/files/${FIELD}`]: stills[FIELD] ?? '' });

const tagOf = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.match({ onFailure: (error) => error._tag, onSuccess: () => 'shippable' }));

/** A seeded draw in [0, 1). */
const draws = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const tail = (next: () => number) => Array.from({ length: 96 }, () => Math.floor(next() * 256));
const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));

const test = it.effect.layer(BunServices.layer);

describe('kit:shippable', () => {
  test('refuses a pending record, and an approval whose shown files lack a still that no earlier approval showed byte for byte, before it builds', () =>
    Effect.gen(function* () {
      const root = yield* scratchApp(APP);
      yield* pendingAt(root);
      expect(yield* tagOf(shippable(root))).toBe('ShipPending');
      yield* approvedWith(root, shownBut);
      expect(yield* tagOf(shippable(root))).toBe('StillsNotShown');
      yield* approvedWith(root, shownBut, (stills) => [
        { [`/files/${FIELD}`]: `${(stills[FIELD] ?? '').slice(1)}0` },
      ]);
      expect(yield* tagOf(shippable(root))).toBe('StillsNotShown');
    }).pipe(Effect.scoped));

  test('runs on stage prod, refusing a pending record, and on no other stage', () =>
    Effect.gen(function* () {
      const root = yield* scratchApp(APP);
      yield* pendingAt(root);
      const skipped = yield* prodGate(root).pipe(Effect.provideService(Stage, 'agent-motion'));
      expect(skipped).toEqual(Option.none());
      expect(yield* tagOf(prodGate(root).pipe(Effect.provideService(Stage, 'prod')))).toBe(
        'ShipPending',
      );
    }).pipe(Effect.scoped));

  test('builds the site and refuses each built image no approved still holds: a template new URL, an import.meta.glob, a .jfif import, a .jxl under public/; every other image passes, one still approved by an earlier approval', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const repo = yield* fs.makeTempDirectoryScoped({ prefix: 'ftb-ship-' });
      const root = path.join(repo, 'apps', 'firsttheblade');
      yield* fs.makeDirectory(root, { recursive: true });
      yield* fs.copyFile(
        path.join(APP, '..', '..', 'tsconfig.json'),
        path.join(repo, 'tsconfig.json'),
      );
      yield* Effect.forEach(
        COPIED,
        (entry) => fs.copy(path.join(APP, entry), path.join(root, entry)),
        { concurrency: COPIED.length },
      );
      yield* fs.symlink(path.join(APP, 'node_modules'), path.join(root, 'node_modules'));
      yield* fs.makeDirectory(path.join(root, 'kit'));
      yield* fs.copyFile(path.join(APP, RECORD), path.join(root, RECORD));
      yield* approvedWith(root, shownBut, (stills) => [shownField(stills)]);
      const next = draws(59);
      const webp = Uint8Array.from([
        ...ascii('RIFF'),
        100,
        0,
        0,
        0,
        ...ascii('WEBPVP8 '),
        ...tail(next),
      ]);
      const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...tail(next)]);
      const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...tail(next)]);
      const jxl = Uint8Array.from([0xff, 0x0a, ...tail(next)]);
      yield* fs.makeDirectory(path.join(root, 'assets', 'glob'), { recursive: true });
      yield* fs.writeFile(path.join(root, 'assets', 'sky-template.webp'), webp);
      yield* fs.writeFile(path.join(root, 'assets', 'glob', 'sky-glob.webp'), png);
      yield* fs.writeFile(path.join(root, 'src', 'art', 'sky-768.jfif'), jpeg);
      yield* fs.writeFile(path.join(root, 'public', 'field-hero.jxl'), jxl);
      const scene = path.join(root, 'src', 'motion', 'scene.ts');
      yield* fs.writeFileString(
        scene,
        [
          yield* fs.readFileString(scene),
          'export const skyTemplate = new URL(`../../assets/sky-template.webp`, import.meta.url);',
          "export const skyGlob = import.meta.glob('../../assets/glob/*.webp', { eager: true, query: '?url', import: 'default' });",
          "import skyJfif from '../art/sky-768.jfif';",
          'export { skyJfif };',
          '',
        ].join('\n'),
      );
      const refusal = yield* shippable(root).pipe(
        Effect.flip,
        Effect.map((error) => Option.liftPredicate(error, Schema.is(ShipUnapproved))),
      );
      const images = Option.map(refusal, (found) =>
        found.images.map(({ image, format }) => `${image.replace(/-[\w-]{8}\./, '-#.')} ${format}`),
      );
      expect(images).toEqual(
        Option.some([
          'assets/sky-768-#.jfif jpeg',
          'assets/sky-glob-#.webp png',
          'assets/sky-template-#.webp webp',
          'field-hero.jxl jpeg xl',
        ]),
      );
      const { stills } = yield* readRecord(root);
      const built = yield* builtImages(path.join(root, 'dist'));
      expect(built.length).toBe(Object.keys(stills).length + OUTSIDE.length + 4);
    }).pipe(Effect.scoped));
});
