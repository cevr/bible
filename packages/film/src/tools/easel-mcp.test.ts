// The easel's tools on the lab's MCP, as a client calls them at `/mcp`: each
// listed, the reads read-only; a look answered as images after their lines,
// its view as the tool asks it (no captions; a crop a PNG at 1:1, a frame a
// JPEG), and refused in the film's words: another checkout's films
// (`LabElsewhere`, with how to reach a lab of its own), a film the lab lacks,
// the easel's refusal, stills too large for a model's request, arguments
// that do not decode; a check of the scenes named, drawn, a page at a time;
// a film's cue lines, `late` said, a scene it lacks refused; the journal
// noted and read back, its oldest entries counted with its file, an empty
// note and a scene the film lacks refused.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option, type Schema } from 'effect';
import { Base64 } from 'effect/encoding';
import { PagesBroken, type LookPost, type LookTaken } from '../core/easel.ts';
import { UnknownScene } from '../core/errors.ts';
import type { CheckLine } from '../core/schema.ts';
import { RenderCatalogue } from './catalogue.ts';
import { Easel } from './easel.ts';
import type { FreshFilmService } from './fresh-film.ts';
import { CuesRead } from './fresh-film.ts';
import { LabPage } from './lab-page.ts';
import { echoPages, freshFilm, labInMemory, labWithMcp, mcpSession, text } from './testing.ts';

/** The films folder the lab serves: the asker's, when it is the same checkout. */
const FILMS = '/films';

/**
 * How many bytes the easel draws each still of a scene with: `huge`'s one
 * still is past what one image of a model's request may be; five of
 * `heavy`'s, each under that, are past what one look may answer.
 */
const STILL_BYTES = new Map([
  ['roof', 3],
  ['huge', 3_750_001],
  ['heavy', 3_200_000],
]);

/** A still's file extension by its format. */
const EXTENSION: Readonly<Record<LookPost['view']['format'], string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

/** A look the easel was asked: the film, and what was posted. */
interface Asked {
  readonly film: string;
  readonly post: LookPost;
}

/**
 * An easel that draws each place of a look as a still of its scene's bytes,
 * written where the lab's own writes them, and keeps each look it was asked;
 * a scene `broken` is the pages' build failing.
 */
const easelDrawing = (files: Map<string, Uint8Array>, asked: Array<Asked>) =>
  Layer.succeed(
    Easel,
    Easel.of({
      serve: () => Effect.void,
      look: (film, post) =>
        Effect.suspend(() => {
          asked.push({ film, post });
          if (post.scene === 'broken')
            return Effect.fail(PagesBroken.make({ reason: 'scenes/broken.ts failed to build' }));
          const extension = EXTENSION[post.view.format];
          const looks = post.at.map((at, index) => {
            const file = `/out/${film}/look/${post.scene}/still${index}.${extension}`;
            files.set(file, new Uint8Array(STILL_BYTES.get(post.scene) ?? 1).fill(index + 1));
            return {
              file,
              scene: post.scene,
              at,
              frame: 90 + index,
              time: 3 + index,
              width: 400,
              height: 225,
            };
          });
          const taken: LookTaken = { build: 's.7', looks };
          return Effect.succeed(taken);
        }),
    }),
  );

/** The lab in memory over film `f` (scenes roof and gate), its easel `easelDrawing`, its fresh runs `fresh`. */
const labOver = (
  files: Map<string, Uint8Array>,
  asked: Array<Asked>,
  fresh: Partial<FreshFilmService> = {},
) => {
  const pages = Layer.merge(
    Layer.effect(LabPage, Effect.service(LabPage)).pipe(Layer.provide(echoPages)),
    easelDrawing(files, asked),
  );
  return RenderCatalogue.layer.pipe(
    Layer.provideMerge(labInMemory(files, pages, { film: freshFilm(fresh) })),
  );
};

/** Film `f`, a drawn film. */
const filmFiles = () =>
  new Map<string, Uint8Array>([['/films/f/scenes/index.ts', text('export {};\n')]]);

/** What a fresh `film read cues` of film `f` answers: its scenes, roof and gate, and one late cue. */
const cuesOfF = (_film: string, scene: Option.Option<string>) =>
  Option.match(
    Option.filter(scene, (id) => id !== 'roof' && id !== 'gate'),
    {
      onSome: (id) => Effect.fail(UnknownScene.make({ scene: id, known: ['roof', 'gate'] })),
      onNone: () =>
        Effect.succeed(
          CuesRead.make({
            lines: Option.match(scene, {
              onNone: () => ['roof start=0.00 dur=9.00 {see}@3.00', 'gate start=9.00 dur=4.00'],
              onSome: () => ['roof start=0.00 dur=9.00 {see}@3.00'],
            }),
            late: 1,
          }),
        ),
    },
  );

/** A tool's arguments, as a client sends them. */
type Args = Readonly<Record<string, Schema.Json>>;

/** A look's answer whole, as the client reads it: its content, and whether it is an error. */
const look = (call: (method: string, params: Schema.Json) => Effect.Effect<any>, args: Args) =>
  call('tools/call', { name: 'look', arguments: { films: FILMS, film: 'f', ...args } });

describe("the easel's tools on the MCP", () => {
  it.effect('are listed: look takes its arguments as JSON Schema; the reads are read-only', () => {
    const files = filmFiles();
    return Effect.gen(function* () {
      const { lab } = yield* labWithMcp;
      const { call } = yield* mcpSession(lab);
      const { tools } = yield* call('tools/list', {});
      const named = (name: string) => tools.find((tool: { name: string }) => tool.name === name);
      expect(named('look').inputSchema).toMatchObject({
        type: 'object',
        required: ['films', 'film', 'scene', 'at'],
        properties: { at: { type: 'array', minItems: 1, maxItems: 8 } },
      });
      expect(Object.keys(named('look').inputSchema.properties).toSorted()).toEqual(
        ['at', 'crop', 'film', 'films', 'mode', 'scene', 'size'].toSorted(),
      );
      expect(
        ['look', 'check', 'cues', 'journal', 'journal_note'].map(
          (name) => named(name).annotations?.readOnlyHint === true,
        ),
      ).toEqual([true, true, true, true, false]);
    }).pipe(Effect.scoped, Effect.provide(labOver(files, [])));
  });

  it.effect('a look answers each still as an image after its line, drawn as the tool asks', () => {
    const files = filmFiles();
    const asked: Array<Asked> = [];
    return Effect.gen(function* () {
      const { lab } = yield* labWithMcp;
      const { call } = yield* mcpSession(lab);
      const frames = yield* look(call, {
        scene: 'roof',
        at: ['mark:see', 'cue:lift@0.5'],
        mode: 'squint',
        size: 400,
      });
      expect(frames.isError).toBeUndefined();
      expect(frames.content.map((block: { type: string }) => block.type)).toEqual([
        'text',
        'image',
        'text',
        'image',
      ]);
      expect(frames.content[0].text).toBe(
        '/out/f/look/roof/still0.jpg scene=roof at=mark:see t=3.00 frame=90 size=400x225 build=s.7',
      );
      expect(frames.content[3]).toEqual({
        type: 'image',
        data: Base64.encode(new Uint8Array([2, 2, 2])),
        mimeType: 'image/jpeg',
      });
      // A crop reads a region at 1:1, as a PNG.
      const cropped = yield* look(call, { scene: 'roof', at: ['1'], crop: [10, 20, 110, 120] });
      expect(cropped.content[1].mimeType).toBe('image/png');
      expect(asked).toEqual([
        {
          film: 'f',
          post: {
            scene: 'roof',
            at: ['mark:see', 'cue:lift@0.5'],
            view: { size: 400, mode: 'squint', captions: false, format: 'image/jpeg' },
            from: FILMS,
          },
        },
        {
          film: 'f',
          post: {
            scene: 'roof',
            at: ['1'],
            view: { crop: [10, 20, 110, 120], mode: 'plain', captions: false, format: 'image/png' },
            from: FILMS,
          },
        },
      ]);
    }).pipe(Effect.scoped, Effect.provide(labOver(files, asked)));
  });

  it.effect("a look is refused in the film's words, and bad arguments as the call's", () => {
    const files = filmFiles();
    const asked: Array<Asked> = [];
    return Effect.gen(function* () {
      const { lab } = yield* labWithMcp;
      const { call } = yield* mcpSession(lab);
      const refused = (args: Args) =>
        Effect.map(look(call, args), (answer) => {
          expect(answer.isError).toBe(true);
          return String(answer.content[0].text);
        });
      // Another checkout's films: never answered with this lab's files.
      expect(yield* refused({ films: '/rift/films', scene: 'roof', at: ['1'] })).toBe(
        'LabElsewhere: this lab serves /films/f, not /rift/films/f: start a lab from your checkout (LAB_PORT=<port> bun cli.ts lab, in apps/animations) and call its MCP at http://127.0.0.1:<port>/mcp',
      );
      expect(yield* refused({ film: 'nope', scene: 'roof', at: ['1'] })).toMatch(/^FilmUnknown: /);
      expect(asked).toEqual([]);
      expect(yield* refused({ scene: 'broken', at: ['1'] })).toBe(
        "PagesBroken: the lab's pages do not build:\nscenes/broken.ts failed to build",
      );
      // Written, but more than a model's request takes: one still, or a look's all.
      expect(yield* refused({ scene: 'huge', at: ['1'] })).toBe(
        "LookTooLarge: the stills pass 3750000 bytes, more than a model's request takes: /out/f/look/huge/still0.jpg (3750001 bytes). They are written; look again with a smaller size, a smaller crop or fewer places",
      );
      expect(yield* refused({ scene: 'heavy', at: ['1', '2', '3', '4', '5'] })).toContain(
        'LookTooLarge: the stills pass 15000000 bytes',
      );
      // Arguments that do not decode are the call's error: the easel is not asked.
      const before = asked.length;
      const undecoded: ReadonlyArray<Args> = [
        { scene: 'roof', at: [] },
        { scene: 'roof', at: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] },
        { scene: 'roof', at: ['1'], size: 4_000 },
        { scene: 'Roof', at: ['1'] },
      ];
      for (const args of undecoded) expect(yield* refused(args)).toContain('-32602');
      expect(asked).toHaveLength(before);
    }).pipe(Effect.scoped, Effect.provide(labOver(files, asked)));
  });

  it.effect('a check draws the scenes named, its findings a page at a time', () => {
    const files = filmFiles();
    const checked: Array<readonly [string, string, ReadonlyArray<string>]> = [];
    const findings: ReadonlyArray<CheckLine> = Array.from({ length: 30 }, (_, index) => ({
      level: 'error',
      tag: `Finding${index}`,
      message: 'm'.repeat(370),
      address: { part: { _tag: 'Scenes', ids: ['roof'] }, time: index },
    }));
    const check: FreshFilmService['check'] = (film, leg, scenes = []) =>
      Effect.sync(() => {
        checked.push([film, leg, scenes]);
        return findings;
      });
    return Effect.gen(function* () {
      const { lab } = yield* labWithMcp;
      const { tool } = yield* mcpSession(lab);
      const first = yield* tool('check', { films: FILMS, film: 'f', scenes: ['roof', 'gate'] });
      expect([first.errors, first.warnings, first.from]).toEqual([30, 0, 0]);
      expect(first.findings[0]).toEqual({
        level: 'error',
        tag: 'Finding0',
        where: 'scenes:roof',
        time: 0,
        message: 'm'.repeat(370),
      });
      expect(first.next.from).toBe(first.findings.length);
      const rest = yield* tool('check', { films: FILMS, film: 'f', ...first.next });
      expect(rest.restarted).toBeUndefined();
      expect(rest.findings[0].tag).toBe(`Finding${first.findings.length}`);
      expect(first.findings.length + rest.findings.length).toBe(30);
      expect(checked).toEqual([
        ['f', 'draw', ['roof', 'gate']],
        ['f', 'draw', []],
      ]);
    }).pipe(Effect.scoped, Effect.provide(labOver(files, [], { check })));
  });

  it.effect(
    "cues answers the film's lines, one scene's when named, and refuses a scene it lacks",
    () => {
      const files = filmFiles();
      return Effect.gen(function* () {
        const { lab } = yield* labWithMcp;
        const { tool } = yield* mcpSession(lab);
        expect(yield* tool('cues', { films: FILMS, film: 'f' })).toEqual({
          from: 1,
          column: 1,
          total: 2,
          lines: ['roof start=0.00 dur=9.00 {see}@3.00', 'gate start=9.00 dur=4.00'],
          late: '1 cue(s) end after their scene',
        });
        expect((yield* tool('cues', { films: FILMS, film: 'f', scene: 'roof' })).lines).toEqual([
          'roof start=0.00 dur=9.00 {see}@3.00',
        ]);
        expect((yield* tool('cues', { films: FILMS, film: 'f', scene: 'nope' })).refused).toBe(
          'UnknownScene: the film has no scene "nope"; its scenes are roof, gate',
        );
      }).pipe(Effect.scoped, Effect.provide(labOver(files, [], { cues: cuesOfF })));
    },
  );

  it.effect(
    'the journal: a note read back, the oldest counted with its file; empty words and a scene the film lacks refused',
    () => {
      const files = filmFiles();
      return Effect.gen(function* () {
        const { lab } = yield* labWithMcp;
        const { tool } = yield* mcpSession(lab);
        const noted = yield* tool('journal_note', {
          films: FILMS,
          film: 'f',
          scene: 'roof',
          text: 'the roof line reads at squint',
        });
        expect(noted).toEqual({
          file: '/films/f/journal.md',
          at: '1970-01-01T00:00:00Z',
          scene: 'roof',
        });
        expect(yield* tool('journal', { films: FILMS, film: 'f', scene: 'roof' })).toEqual({
          file: '/films/f/journal.md',
          lines: ['1970-01-01T00:00:00Z scene=roof the roof line reads at squint'],
        });
        expect((yield* tool('journal_note', { films: FILMS, film: 'f', text: '  ' })).refused).toBe(
          'JournalEmpty: a journal note needs words: what was seen, heard or measured',
        );
        for (const asked of [
          tool('journal_note', { films: FILMS, film: 'f', scene: 'nope', text: 'x' }),
          tool('journal', { films: FILMS, film: 'f', scene: 'nope' }),
        ])
          expect((yield* asked).refused).toMatch(/^UnknownScene: the film has no scene "nope"/);
        // Many long entries: the newest that fit, the rest counted.
        for (let n = 0; n < 24; n += 1)
          yield* tool('journal_note', { films: FILMS, film: 'f', text: `${n} ${'w'.repeat(500)}` });
        const read = yield* tool('journal', { films: FILMS, film: 'f', last: 30 });
        expect(read.lines.at(-1)).toMatch(/^1970-01-01T00:00:00Z scene=film 23 w+$/);
        expect(read.lines.length).toBeLessThan(25);
        expect(read.earlier).toBe(
          `${25 - read.lines.length} earlier entries not shown: /films/f/journal.md holds them all`,
        );
      }).pipe(Effect.scoped, Effect.provide(labOver(files, [], { cues: cuesOfF })));
    },
  );
});
