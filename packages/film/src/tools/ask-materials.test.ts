// The material an ask shows, found when the ask is made: a document and a
// video only when the review lists them (a ref that climbs out of its root
// or names another host never decodes; one the review does not list is
// refused), a film's script and a draft's by the beats their reader reads,
// a Board by its panels, a take by the beat's attempts (the one named, or
// the one kept). Each refusal names what is missing.

import { describe, expect, it } from 'effect-bun-test';
import { Boolean as Bool, Effect, Exit, Layer, Option, Path, Schema } from 'effect';
import { Ask, type AskBlock, oneQuestion } from '../core/ask.ts';
import { type BoardFile, BoardFileJson } from '../core/board.ts';
import { ReviewFileUnknown } from '../core/refusals.ts';
import type { ReviewIndex } from '../core/review.ts';
import { TimingsJson } from '../core/schema.ts';
import { AskStore } from './ask-store.ts';
import { Review } from './review.ts';
import { SeriesDrafts } from './series-drafts.ts';
import { Takes } from './takes.ts';
import {
  echoPages,
  freshFilm,
  labInMemory,
  memoryFileSystem,
  noRenders,
  noStudio,
  storeLayer,
  text,
} from './testing.ts';

const TALK = [
  '# By Grace: script',
  '',
  '| #        | Say                   | Picture |',
  '| -------- | --------------------- | ------- |',
  '| 1 · Hook | By {*}grace. {/} Now. | A card. |',
  '',
].join('\n');

const board: BoardFile = {
  film: 'f',
  panels: [{ id: 'cold.judge', beat: 'cold', at: 'judge', tries: [] }],
  approvals: [],
};

const listed = (ref: string, name: string) => ({ ref, name, size: 10, mtime: 1 });

/** The review's one set: its script in Markdown and its cut. */
const index: ReviewIndex = {
  folders: [
    {
      ref: 'p5/rbf',
      title: Option.none(),
      blurb: Option.none(),
      mtime: 1,
      sets: [],
      videos: [{ ...listed('p5/rbf/cut.mp4', 'cut.mp4'), phone: 'none' }],
      images: [],
      docs: [listed('p5/rbf/script.md', 'script.md')],
    },
  ],
};

const refs = index.folders.flatMap((f) => [...f.docs, ...f.videos].map((d) => d.ref));

/** The review over that index: a ref it lists is its file; any other is unknown. */
const review = Layer.effect(
  Review,
  Effect.map(Effect.service(Review), (none) =>
    Review.of({
      ...none,
      index: () => Effect.succeed(index),
      resolve: (ref) =>
        Bool.match(refs.includes(ref), {
          onTrue: () => Effect.succeed(`/out/${ref}`),
          onFalse: () => Effect.fail(ReviewFileUnknown.make({ ref })),
        }),
    }),
  ),
).pipe(Layer.provide(noRenders));

const attempt = {
  beat: 'cold',
  file: 'cold.abc.flac',
  take: { hash: 'h', file: 'cold.abc.flac', duration: 2, words: [], source: 'recorded' as const },
  heard: 'A judge sat.',
  wer: 0,
  at: 1,
};

/** The takes: beat `cold` has one attempt, every other beat none. */
const takes = Layer.effect(
  Takes,
  Effect.map(Effect.service(Takes), (none) =>
    Takes.of({
      ...none,
      attempts: (_film, beat) =>
        Effect.succeed(Bool.match(beat === 'cold', { onTrue: () => [attempt], onFalse: () => [] })),
    }),
  ),
).pipe(Layer.provide(noStudio));

/** The lab's files: film `f`, its Board, its timings (cold's take kept, when `kept`), a series draft. */
const seeded = (kept: boolean) =>
  new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    ['/films/f/board.json', text(Schema.encodeSync(BoardFileJson)(board))],
    [
      '/films/f/narration/timings.json',
      text(
        Schema.encodeSync(TimingsJson)({
          voice: 'v',
          scenes: Bool.match(kept, { onTrue: () => ({ cold: attempt.take }), onFalse: () => ({}) }),
        }),
      ),
    ],
    ['/series/talks/scripts/01-grace.md', text(TALK)],
  ]);

/** The asks over the lab in memory, their material read through the fakes above and the draft. */
const run = <A, E>(self: Effect.Effect<A, E, AskStore>, kept = true) => {
  const files = seeded(kept);
  const drafts = SeriesDrafts.layer(Option.some('/series')).pipe(
    Layer.provide([storeLayer(files), memoryFileSystem(files), Path.layer]),
  );
  return self.pipe(
    Effect.provide(
      labInMemory(files, echoPages, {
        film: freshFilm({
          script: () => Effect.succeed([{ id: 'cold', say: 'A judge sat.', cite: [] }]),
        }),
        asking: Layer.mergeAll(review, takes, drafts),
      }),
    ),
  );
};

/** One step showing `material`, then a choice about it. */
const about = (material: AskBlock): Ask =>
  oneQuestion([
    material,
    {
      kind: 'choose',
      id: 'keep',
      label: 'Keep it?',
      options: [
        { value: 'yes', label: 'Yes', recommended: true },
        { value: 'no', label: 'No' },
      ],
    },
  ]);

const asked = (ask: Ask) => ({ title: 'Read it', why: 'the cut waits', by: 'agent', ask });

/** Why an ask showing `material` is refused, or none when it is kept. */
const refusal = (material: AskBlock) =>
  Effect.flatMap(Effect.service(AskStore), (asks) =>
    asks.make(asked(about(material))).pipe(
      Effect.map(() => ''),
      Effect.catchTag('AskInvalid', (e) => Effect.succeed(e.message)),
    ),
  );

describe('the material an ask shows', () => {
  it.effect('keeps an ask whose material its views can show', () =>
    run(
      Effect.gen(function* () {
        const shown: ReadonlyArray<AskBlock> = [
          { kind: 'document', ref: 'p5/rbf/script.md' },
          { kind: 'video', ref: 'p5/rbf/cut.mp4', at: 4 },
          { kind: 'script', film: 'f', beats: ['cold'] },
          { kind: 'script', series: 'talks', draft: '01-grace', beats: ['1'] },
          { kind: 'board', film: 'f', panels: ['cold.judge'] },
          { kind: 'audio', film: 'f', beat: 'cold' },
          { kind: 'audio', film: 'f', beat: 'cold', attempt: 'cold.abc.flac' },
        ];
        expect(yield* Effect.forEach(shown, refusal)).toEqual(shown.map(() => ''));
      }),
    ),
  );

  it.effect('refuses an ask whose material is not there, naming it', () =>
    run(
      Effect.gen(function* () {
        expect(yield* refusal({ kind: 'document', ref: 'p5/rbf/notes.md' })).toContain(
          'no document p5/rbf/notes.md is listed by the review',
        );
        expect(yield* refusal({ kind: 'video', ref: 'p5/rbf/other.mp4' })).toContain(
          'no video p5/rbf/other.mp4 is listed by the review',
        );
        expect(yield* refusal({ kind: 'script', film: 'f', beats: ['warm'] })).toContain(
          'the script of f has no beat warm',
        );
        expect(yield* refusal({ kind: 'script', film: 'g' })).toContain('the lab has no film g');
        expect(yield* refusal({ kind: 'script', series: 'talks', draft: '02-none' })).toContain(
          'draft talks/02-none cannot be read',
        );
        expect(yield* refusal({ kind: 'board', film: 'f', panels: ['cold.door'] })).toContain(
          'the Board of f has no panel cold.door',
        );
        expect(yield* refusal({ kind: 'audio', film: 'f', beat: 'warm' })).toContain(
          'f warm has no kept take',
        );
        expect(
          yield* refusal({ kind: 'audio', film: 'f', beat: 'cold', attempt: 'cold.zzz.flac' }),
        ).toContain('f cold has no take cold.zzz.flac');
      }),
    ),
  );

  it.effect('refuses a take when none is kept and none is named', () =>
    run(
      Effect.gen(function* () {
        expect(yield* refusal({ kind: 'audio', film: 'f', beat: 'cold' })).toContain(
          'f cold has no kept take: name an attempt',
        );
      }),
      false,
    ),
  );

  it.effect('never decodes a ref that climbs out of its root or names another host', () =>
    Effect.sync(() => {
      const decodes = (ref: string) =>
        Exit.isSuccess(
          Schema.decodeExit(Ask)({
            start: 's',
            steps: {
              s: { blocks: [{ kind: 'document', ref }], next: [{ to: 'e' }] },
              e: { end: true },
            },
          }),
        );
      expect(decodes('p5/rbf/script.md')).toBe(true);
      for (const ref of [
        'p5/../secret.md',
        '../p5/script.md',
        '/etc/passwd.md',
        'p5/./script.md',
        'https://evil.example/a.md',
        'p5\\..\\a.md',
        'p5//a.md',
      ])
        expect(decodes(ref)).toBe(false);
    }),
  );
});
