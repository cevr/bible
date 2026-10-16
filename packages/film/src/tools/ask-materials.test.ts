// The material an ask shows, found when the ask is made: a document and a
// video only when the review lists them (one the review does not list is
// refused; the ref's own shape is `core/ask.test.ts`'s), a film's script and
// a draft's by the beats their reader reads, a Board by its panels, a take
// by the studio's own read of the beat's attempts (the one named, else the
// take the timings name: one kept, or a staging take; a beat the film does
// not have is refused before a file is read). Each refusal names what is
// missing.

import { describe, expect, it } from 'effect-bun-test';
import { Boolean as Bool, Effect, Layer, Match, Option, Path, Schema } from 'effect';
import { type Ask, AskBlock, oneQuestion } from '../core/ask.ts';
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import { ReviewFileUnknown } from '../core/refusals.ts';
import type { ReviewIndex } from '../core/review.ts';
import { TimingsJson } from '../core/schema.ts';
import { stagingVoice } from '../core/staging-voice.ts';
import type { ReadBeat, StudioReading } from '../core/studio.ts';
import { AskStore } from './ask-store.ts';
import { FilmFolder } from './film-repo.ts';
import { Review } from './review.ts';
import { SeriesDrafts } from './series-drafts.ts';
import { StudioReadings } from './studio.ts';
import { Attempt, Takes } from './takes.ts';
import {
  echoPages,
  emptyCalls,
  fakeElevenLabs,
  fakeMedia,
  freshFilm,
  labInMemory,
  memoryFileSystem,
  noRenders,
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
  panels: [
    { id: 'cold.judge', beat: BoardName.make('cold'), at: BoardName.make('judge'), tries: [] },
  ],
  approvals: [],
};

const listed = (ref: string, name: string) => ({ ref, name, size: 10, mtime: 1 });

/** The review's one set: its notes in Markdown and its cut. */
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
      docs: [listed('p5/rbf/notes.md', 'notes.md')],
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

const attempt: Attempt = {
  beat: 'cold',
  file: 'cold.abc.flac',
  take: { hash: 'h', file: 'cold.abc.flac', duration: 2, words: [], source: 'recorded' },
  heard: 'A judge sat.',
  wer: 0,
  at: 1,
};

/** A beat's attempts as the studio keeps them on disk. */
const ledger = (attempts: ReadonlyArray<Attempt>) =>
  text(
    Schema.encodeSync(Schema.fromJsonString(Schema.Struct({ attempts: Schema.Array(Attempt) })))({
      attempts,
    }),
  );

const beat = (id: string, said: string): ReadBeat => ({
  id,
  text: said,
  script: said,
  lines: [{ name: 'lead', voiceId: stagingVoice.voices[0].voiceId, text: said }],
  delivery: [],
});

/** Film `f` as the studio reads it: one beat, `cold`. */
const reading: StudioReading = {
  voice: stagingVoice,
  heardAs: {},
  beats: [beat('cold', 'A judge sat.')],
  sheet: [],
};

/** The take cold's timings name: an attempt kept, a staging take (none of its attempts), or none. */
type Timed = 'attempt' | 'staging' | 'none';

/** A staging take of cold's, in `narration/` and none of its attempts. */
const staging = {
  hash: 'h',
  file: 'cold.0cbdb0cac54f.flac',
  duration: 2,
  words: [],
  source: 'elevenlabs',
} as const;

/**
 * The lab's files: film `f`, its Board, its timings (cold's take as `timed`
 * says), cold's attempts, a series draft; and, outside `f`, another
 * folder's ledger that holds an attempt of the same name, which a beat that
 * climbs out of `f`'s attempts would read.
 */
const seeded = (timed: Timed) =>
  new Map<string, Uint8Array>([
    ['/films/f/scenes/index.ts', text('export {};\n')],
    ['/films/f/board.json', text(Schema.encodeSync(BoardFileJson)(board))],
    [
      '/films/f/narration/timings.json',
      text(
        Schema.encodeSync(TimingsJson)({
          voice: 'v',
          scenes: Match.value(timed).pipe(
            Match.when('attempt', () => ({ cold: attempt.take })),
            Match.when('staging', () => ({ cold: staging })),
            Match.when('none', () => ({})),
            Match.exhaustive,
          ),
        }),
      ),
    ],
    ['/films/f/narration/attempts/cold/attempts.json', ledger([attempt])],
    ['/films/g/narration/attempts/cold/attempts.json', ledger([attempt])],
    ['/series/talks/scripts/01-grace.md', text(TALK)],
  ]);

/** The asks over the lab in memory, their material read through the review above, the studio's real reads and the draft. */
const run = <A, E>(self: Effect.Effect<A, E, AskStore>, timed: Timed = 'attempt') => {
  const files = seeded(timed);
  const drafts = SeriesDrafts.layer(Option.some('/series')).pipe(
    Layer.provide([storeLayer(files), memoryFileSystem(files), Path.layer]),
  );
  const film = freshFilm({
    script: () => Effect.succeed([{ id: 'cold', say: 'A judge sat.', cite: [] }]),
    reading: () => Effect.succeed(reading),
  });
  const studio = Layer.mergeAll(
    StudioReadings.layer.pipe(Layer.provide([film, FilmFolder.layer('/films')])),
    Takes.layer.pipe(Layer.provide([fakeElevenLabs(files, emptyCalls()), fakeMedia(files)])),
  ).pipe(Layer.orDie);
  return self.pipe(
    Effect.provide(
      labInMemory(files, echoPages, {
        film,
        asking: Layer.mergeAll(review, studio, drafts),
      }),
    ),
  );
};

/** One step showing `material`, then a choice about it. */
const about = (material: AskBlock): Ask =>
  oneQuestion(
    Schema.decodeSync(Schema.Array(AskBlock))([
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
    ]),
  );

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
          { kind: 'document', ref: 'p5/rbf/notes.md' },
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
        expect(yield* refusal({ kind: 'document', ref: 'p5/rbf/other.md' })).toContain(
          'no document p5/rbf/other.md is listed by the review',
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
          'f has no beat warm',
        );
        expect(
          yield* refusal({ kind: 'audio', film: 'f', beat: 'cold', attempt: 'cold.zzz.flac' }),
        ).toContain('f cold has no take cold.zzz.flac');
      }),
    ),
  );

  it.effect(
    "refuses a take's beat that climbs out of the film's attempts, before reading there",
    () =>
      run(
        Effect.gen(function* () {
          expect(
            yield* refusal({
              kind: 'audio',
              film: 'f',
              beat: '../../../g/narration/attempts/cold',
              attempt: 'cold.abc.flac',
            }),
          ).toContain('f has no beat ../../../g/narration/attempts/cold');
        }),
      ),
  );

  it.effect('keeps a take the timings name when it is a staging take, none of the attempts', () =>
    run(
      Effect.gen(function* () {
        expect(yield* refusal({ kind: 'audio', film: 'f', beat: 'cold' })).toBe('');
      }),
      'staging',
    ),
  );

  it.effect('refuses a take when the timings name none and none is named', () =>
    run(
      Effect.gen(function* () {
        expect(yield* refusal({ kind: 'audio', film: 'f', beat: 'cold' })).toContain(
          'f cold has no take: name an attempt',
        );
      }),
      'none',
    ),
  );
});
