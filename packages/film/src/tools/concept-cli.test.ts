// `film concept brief` reads the app's own house block wherever it runs,
// and names a sheet's layout once: a turnaround's by its pronoun, a poses or
// heads sheet's by its file and its kind, or a member's by its record.
// `film concept measure` holds a heads sheet's heights on the level heads it
// is told of. Over a member's record both read its sizes: its own heads, its
// hair, and a smaller figure at its share of the grown height.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  Cause,
  Console,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Queue,
  Schema,
} from 'effect';
import { Command } from 'effect/cli';
import { CastSheetJson } from '../core/cast-record.ts';
import { drawFigure, drawSheet, PLAIN } from '../core/fixtures/figure.ts';
import { scaleRaster } from '../core/raster.ts';
import { Segment } from '../core/segment.ts';
import { concept } from './concept-cli.ts';
import { ContentStore } from './content-store.ts';
import { FilmFolder } from './film-repo.ts';
import { encodePng } from './png.ts';
import { memoryFileSystem, printingTo, text } from './testing.ts';

const HOUSE = { text: '/app/docs/ref/house-look.txt', image: '/app/docs/ref/house-look.png' };

/** The house block as the app keeps it. */
const houseBlock = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(
    new URL('../../../../apps/animations/docs/ref/house-look.txt', import.meta.url).pathname,
  );
}).pipe(Effect.provide(BunServices.layer));

/** A memory store holding the app's house block, a look, references, a layout and a heads sheet; nothing under the shell's folder; no films. */
const over = () =>
  Layer.mergeAll(ContentStore.layer, FilmFolder.layer('/films')).pipe(Layer.provideMerge(files()));

const files = () =>
  Layer.mergeAll(
    BunServices.layer,
    Layer.unwrap(
      Effect.map(houseBlock, (house) =>
        memoryFileSystem(
          new Map<string, Uint8Array>([
            [HOUSE.text, text(house)],
            ['/m/look.md', text('He wears a cream robe.')],
            ['/m/refs.md', text('Image 1 is the house look.')],
            ['/m/poses.md', text('Draw Him twice: standing, then seated.')],
            ['/m/heads.png', HEADS],
            ['/films/f/talk.ts', text('')],
            [`${KID}/cast-sheet.json`, text(Schema.encodeSync(CastSheetJson)(KID_RECORD))],
            [`${KID}/look.md`, text('She wears a cream robe; her head is bare.')],
            ['/m/kid.png', KID_SHEET],
          ]),
        ),
      ),
    ),
    Path.layer,
  );

/** `film concept …args`: its exit and what it printed. */
const run = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const lines = yield* Queue.unbounded<string>();
    const exit = yield* Command.runWith(concept(HOUSE, []), { version: '0' })(args).pipe(
      Effect.provideService(Console.Console, printingTo(lines)),
      Effect.exit,
    );
    return { exit, printed: (yield* Queue.clear(lines)).join('\n') };
  });

/** The tag of the typed failure a run ended on, `none` when it succeeded. */
const failureTag = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => 'none',
    onFailure: (cause) =>
      Option.match(Cause.findErrorOption(cause), {
        onNone: () => 'defect',
        onSome: (e) => String(Option.getOrElse(Option.fromUndefinedOr(Object(e)._tag), () => '')),
      }),
  });

/** Three front busts: two level, the third bowed (shorter on the page, its eyes lower). */
const HEADS = encodePng(
  drawSheet(
    [{}, {}, { ry: 56, eyeBelow: 22 }].map((nod) =>
      drawFigure({
        ...PLAIN,
        robeShade: [60, 78, 150],
        eyeShift: 0,
        handless: true,
        feet: false,
        robeDepth: 120,
        longHair: true,
        ...nod,
      }),
    ),
  ),
);

const LOOK = ['--look', '/m/look.md', '--references', '/m/refs.md'];

/** A member of its own design in film f: 2.6 of her heads, no hair, her pose sheet's second figure a child. */
const KID = '/films/f/cast/kid/cast-sheet';
const KID_RECORD = {
  member: Segment.make('kid'),
  scope: 'film' as const,
  who: 'her',
  refs: [],
  hair: 'none' as const,
  heads: 2.6,
  sheets: {
    poses: {
      anchor: 1,
      layout: 'Standing, facing the viewer; her child beside her, facing the viewer.',
      slots: ['front' as const, 'front' as const],
      standing: [1, 2],
      figures: [{ view: 2, height: 0.75, heads: 2.2 }],
      tries: [],
    },
  },
};

/** Her pose sheet drawn as the record names it: she stands about 2.66 of her heads (386 px), the child 2.2 of its own at 0.75 of her height. */
const KID_SHEET = (() => {
  const figure = {
    ...PLAIN,
    robeShade: [60, 78, 150] as const,
    arm: 'sleeve' as const,
    eyeShift: 0,
  };
  return encodePng(
    drawSheet([
      drawFigure({ ...figure, robeDepth: 220 }),
      scaleRaster(drawFigure({ ...figure, robeDepth: 154 }), (0.75 * 386) / 320),
    ]),
  );
})();

describe('film concept brief', () => {
  it.effect("reads the app's house block, not one under the shell's folder", () =>
    Effect.gen(function* () {
      const { exit, printed } = yield* run(['brief', '--turnaround', 'Him', ...LOOK]);
      expect(failureTag(exit)).toBe('none');
      expect(printed).toStartWith('A character model sheet');
    }).pipe(Effect.provide(over())),
  );

  it.effect('briefs a pose sheet from its layout file and its kind', () =>
    Effect.gen(function* () {
      const { exit, printed } = yield* run([
        'brief',
        '--layout',
        '/m/poses.md',
        '--kind',
        'poses',
        ...LOOK,
      ]);
      expect(failureTag(exit)).toBe('none');
      expect(printed).toContain('each pose takes the height its pose gives it');
    }).pipe(Effect.provide(over())),
  );

  it.effect('refuses a layout with no kind', () =>
    Effect.gen(function* () {
      const { exit } = yield* run(['brief', '--layout', '/m/poses.md', ...LOOK]);
      expect(failureTag(exit)).toBe('LayoutUnset');
    }).pipe(Effect.provide(over())),
  );
});

describe('film concept measure', () => {
  const HEADS_ARGS = [
    'measure',
    '/m/heads.png',
    '--kind',
    'heads',
    '--count',
    '3',
    '--anchor',
    '1',
    '--out',
    '/m/out',
  ];

  it.effect(
    "holds a bowed head's height when no view is named level, and not when the level ones are",
    () =>
      Effect.gen(function* () {
        const all = yield* run(HEADS_ARGS);
        expect(failureTag(all.exit)).toBe('none');
        expect(all.printed).toContain('head view=3,1');
        const level = yield* run([...HEADS_ARGS, '--level', '1', '--level', '2']);
        expect(failureTag(level.exit)).toBe('none');
        expect(level.printed).toContain('flags=0');
      }).pipe(Effect.provide(over())),
  );
});

describe("film concept brief and measure over a member's record", () => {
  it.effect(
    "brief the prompt the member's record paints from: its smaller figure, and no hair",
    () =>
      Effect.gen(function* () {
        const { exit, printed } = yield* run(['brief', '--member', 'f/kid', '--kind', 'poses']);
        expect(failureTag(exit)).toBe('none');
        expect(printed).toStartWith('A character model sheet');
        expect(printed).toContain('Figure 2 is the same figure smaller: three quarters of');
        expect(printed).not.toContain('The hair and the beard are one brown');
        const twice = yield* run(['brief', '--member', 'f/kid', '--kind', 'poses', ...LOOK]);
        expect(failureTag(twice.exit)).toBe('LayoutUnset');
      }).pipe(Effect.provide(over())),
  );

  it.effect(
    "measure the smaller figure at the record's share and heads, where the canon's flags it",
    () =>
      Effect.gen(function* () {
        const out = ['--out', '/m/out'];
        const record = yield* run([
          'measure',
          '/m/kid.png',
          '--kind',
          'poses',
          '--member',
          'f/kid',
          ...out,
        ]);
        expect(failureTag(record.exit)).toBe('none');
        expect(record.printed).not.toMatch(/^ *(height|head) view=/m);
        const canon = yield* run([
          'measure',
          '/m/kid.png',
          '--kind',
          'poses',
          '--count',
          '2',
          '--anchor',
          '1',
          '--standing',
          '1',
          '--standing',
          '2',
          ...out,
        ]);
        expect(canon.printed).toMatch(/^ *height view=2,1/m);
        expect(canon.printed).toMatch(/^ *head view=2,1/m);
        const both = yield* run([
          'measure',
          '/m/kid.png',
          '--kind',
          'poses',
          '--member',
          'f/kid',
          '--count',
          '2',
        ]);
        expect(failureTag(both.exit)).toBe('SheetUnset');
        const unnamed = yield* run(['measure', '/m/kid.png', '--kind', 'poses', '--member', 'kid']);
        expect(failureTag(unnamed.exit)).toBe('MemberUnnamed');
      }).pipe(Effect.provide(over())),
  );
});

describe('film concept cast', () => {
  it.effect('refuses a count of tries under one before it draws', () =>
    Effect.gen(function* () {
      const tags = yield* Effect.forEach(['0', '-2'], (n) =>
        Effect.map(
          run(['cast', 'f', 'christ', '--kind', 'turnaround', '--tries', n, '--dry-run']),
          ({ exit }) => failureTag(exit),
        ),
      );
      // The flag's schema refuses the value, and the CLI shows the command's help with why.
      expect(tags).toEqual(['ShowHelp', 'ShowHelp']);
    }).pipe(Effect.provide(over())),
  );
});
