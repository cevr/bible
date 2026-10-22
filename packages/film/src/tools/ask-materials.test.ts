// The material an ask shows, found when the ask is made: a document and a
// video only when the review lists them (one the review does not list is
// refused; the ref's own shape is `core/ask.test.ts`'s), a film's script and
// a draft's by the beats their reader reads, a Board by its panels, a take
// by the studio's own read of the beat's attempts (the one named, else the
// take the timings name: one kept, or a staging take; a beat the film does
// not have is refused before a file is read). Each refusal names what is
// missing. A kept ask shows each file an image route serves as the copy it
// made of it, by its SHA-256 (its receipt), which a later rewrite of the file
// does not move: random asks, their set files rewritten at random between
// the make and the answer, serve at the answer the bytes they were made
// with. An answer is refused once a copy no longer holds its hash. A frame
// of a video, and a path no route serves, have none.

import { describe, expect, it } from 'effect-bun-test';
import { Boolean as Bool, Effect, Layer, Match, Option, Path, Schema } from 'effect';
import { type Ask, AskBlock, AskName, imagesIn, oneQuestion } from '../core/ask.ts';
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import { REVIEW_FILES, askShownUrl, labUrls } from '../core/api.ts';
import { ReviewFileUnknown } from '../core/refusals.ts';
import type { ReviewIndex } from '../core/review.ts';
import { TimingsJson } from '../core/schema.ts';
import { stagingVoice } from '../core/staging-voice.ts';
import type { ReadBeat, StudioReading } from '../core/studio.ts';
import { AskStore } from './ask-store.ts';
import { sha256Hex } from './digest.ts';
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

/** A still the set holds, served under the review's files route, and the set's other stills. */
const STILL = 'p5/rbf/still.png';
const STILLS = [STILL, 'p5/rbf/b.png', 'p5/rbf/c.png', 'p5/rbf/d.png'];

const refs = [
  ...index.folders.flatMap((f) => [...f.docs, ...f.videos].map((d) => d.ref)),
  ...STILLS,
];

/** A seeded draw in [0, 1) (mulberry32). */
const draws = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

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
    [`/out/${STILL}`, text('the still as the ask is made')],
  ]);

/** The asks over the lab in memory (its files `files`), their material read through the review above, the studio's real reads and the draft. */
const run = <A, E>(
  self: Effect.Effect<A, E, AskStore>,
  timed: Timed = 'attempt',
  files = seeded(timed),
) => {
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

  it.effect(
    "shows each image file as the copy it makes with the ask, by its SHA-256, which a later rewrite of the file does not move; a video's frame has none",
    () => {
      const files = seeded('attempt');
      const made = new Uint8Array(files.get(`/out/${STILL}`) ?? new Uint8Array());
      const frame = labUrls.review.frame({ query: { ref: 'p5/rbf/cut.mp4' } });
      const still = `${REVIEW_FILES}${STILL}`;
      const blocks = Schema.decodeSync(Schema.Array(AskBlock))([
        { kind: 'image', image: { src: still } },
        { kind: 'image', image: { src: frame } },
        {
          kind: 'choose',
          id: 'keep',
          label: 'Keep it?',
          options: [
            { value: 'yes', label: 'Yes', recommended: true, image: { src: still } },
            { value: 'no', label: 'No' },
          ],
        },
      ]);
      return run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          const record = yield* asks.make(asked(oneQuestion(blocks)));
          const copy = askShownUrl(record.id, `${sha256Hex(made)}.png`);
          expect(imagesIn(record.ask).map((image) => image.src)).toEqual([copy, frame, copy]);
          const receipt = { [copy]: sha256Hex(made) };
          expect(record.shown).toEqual(receipt);
          files.set(`/out/${STILL}`, text('the still rewritten after'));
          expect((yield* asks.read(record.id)).shown).toEqual(receipt);
          expect(files.get(yield* asks.shownFile(record.id, `${sha256Hex(made)}.png`))).toEqual(
            made,
          );
        }),
        'attempt',
        files,
      );
    },
  );

  it.effect(
    'serves each image of random asks as the bytes its receipt holds at the answer, its set files rewritten at random between the make and the answer',
    () => {
      const files = seeded('attempt');
      const next = draws(29);
      const fresh = () =>
        Uint8Array.from({ length: 1 + Math.floor(next() * 40) }, () => Math.floor(next() * 256));
      /** New bytes for set file `ref`: fresh ones, another file's, or its own again. */
      const rewrite = (ref: string) => {
        const roll = next();
        const other = STILLS[Math.floor(next() * STILLS.length)] ?? STILL;
        const bytes = Bool.match(roll < 0.5, {
          onTrue: fresh,
          onFalse: () =>
            new Uint8Array(
              files.get(
                `/out/${Bool.match(roll < 0.75, { onTrue: () => other, onFalse: () => ref })}`,
              ) ?? fresh(),
            ),
        });
        files.set(`/out/${ref}`, bytes);
      };
      const hashAt = (ref: string) => sha256Hex(files.get(`/out/${ref}`) ?? new Uint8Array());
      return run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          const seen = new Set<string>();
          for (let i = 0; i < 24; i += 1) {
            for (const ref of STILLS) rewrite(ref);
            const picked = STILLS.filter(() => next() < 0.6);
            const shownRefs = [...picked, ...picked.filter(() => next() < 0.3)];
            const refs = Bool.match(shownRefs.length === 0, {
              onTrue: () => [STILL],
              onFalse: () => shownRefs,
            });
            const atMake = refs.map(hashAt);
            const blocks = yield* Schema.decodeEffect(Schema.Array(AskBlock))([
              ...refs.map((ref) => ({
                kind: 'image' as const,
                image: { src: `${REVIEW_FILES}${ref}` },
              })),
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
            const record = yield* asks.make(asked(oneQuestion(blocks)));
            // Rewrites at random times between the make and the answer: none, before the page is read, after.
            const rounds = Math.floor(next() * 3);
            for (let r = 0; r < rounds; r += 1)
              for (const ref of STILLS.filter(() => next() < 0.5)) rewrite(ref);
            const page = yield* asks.read(record.id);
            for (const ref of STILLS.filter(() => next() < 0.5)) rewrite(ref);
            const answered = yield* asks.answerPage(record.id, [
              { step: AskName.make('ask'), values: { keep: 'yes' } },
            ]);
            if (refs.some((ref, j) => hashAt(ref) !== atMake[j])) seen.add('rewritten');
            if (new Set(atMake).size < atMake.length) seen.add('same bytes twice');
            const receipt = answered.shown ?? {};
            const srcs = imagesIn(page.ask).map((image) => image.src ?? '');
            // What the page serves at each image, at the answer, is what the ask was made with, and the receipt holds it.
            const served = yield* Effect.forEach(srcs, (src) =>
              Effect.map(asks.shownFile(record.id, src.split('/').at(-1) ?? ''), (copy) =>
                sha256Hex(files.get(copy) ?? new Uint8Array()),
              ),
            );
            expect([i, served]).toEqual([i, atMake]);
            expect([i, srcs.map((src) => receipt[src])]).toEqual([i, atMake]);
            // The bytes an approval may read from the receipt are those, and only those.
            expect([i, new Set(Object.values(receipt))]).toEqual([i, new Set(atMake)]);
          }
          expect([...seen].toSorted()).toEqual(['rewritten', 'same bytes twice']);
        }),
        'attempt',
        files,
      );
    },
  );

  it.effect(
    'refuses an answer once a copy its page shows no longer holds its hash, and takes it while the copy does',
    () => {
      const files = seeded('attempt');
      const made = new Uint8Array(files.get(`/out/${STILL}`) ?? new Uint8Array());
      return run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          const record = yield* asks.make(
            asked(about({ kind: 'image', image: { src: `${REVIEW_FILES}${STILL}` } })),
          );
          const copy = yield* asks.shownFile(record.id, `${sha256Hex(made)}.png`);
          const answer = [{ step: AskName.make('ask'), values: { keep: 'yes' } }];
          files.set(copy, text('the copy changed under the lab'));
          const refused = yield* Effect.flip(asks.answerPage(record.id, answer));
          expect(refused.message).toContain('holds no copy');
          files.delete(copy);
          expect((yield* Effect.flip(asks.answerPage(record.id, answer))).message).toContain(
            'holds no copy',
          );
          files.set(copy, made);
          expect((yield* asks.answerPage(record.id, answer)).answered).toHaveLength(1);
          const unknown = yield* Effect.flip(asks.shownFile(record.id, `${'0'.repeat(64)}.png`));
          expect(unknown._tag).toBe('ReviewFileUnknown');
        }),
        'attempt',
        files,
      );
    },
  );
});
