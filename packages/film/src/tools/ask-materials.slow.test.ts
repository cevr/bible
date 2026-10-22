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
import { Boolean as Bool, Effect, Layer, Match, Option, Path, Result, Schema } from 'effect';
import {
  type Ask,
  AskBlock,
  type AskImage,
  AskName,
  type AskRecord,
  Ask as AskSchema,
  imagesIn,
  oneQuestion,
} from '../core/ask.ts';
import { type BoardFile, BoardFileJson, BoardName } from '../core/board.ts';
import { REVIEW_FILES, askShownUrl, boardFileUrl, labUrls, stillUrl } from '../core/api.ts';
import { ReviewFileUnknown } from '../core/refusals.ts';
import { Segment } from '../core/segment.ts';
import type { ReviewIndex } from '../core/review.ts';
import { TimingsJson } from '../core/schema.ts';
import { stagingVoice } from '../core/staging-voice.ts';
import type { ReadBeat, StudioReading } from '../core/studio.ts';
import { AskStore } from './ask-store.ts';
import { sha256Hex } from './digest.ts';
import { FilmFolder } from './film-repo.ts';
import { labHandler } from './lab.ts';
import { CACHE } from './review-file.ts';
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
  type LabFetch,
  labInMemory,
  mcpBound,
  memoryFileSystem,
  NOTES_LAB,
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

/** A try of panel cold.judge, its file `cold.judge.<n>.png`. */
const tried = (n: number) => ({
  n,
  file: Segment.make(`cold.judge.${n}.png`),
  sha256: `s${n}`,
  made: 'import' as const,
  refs: [],
  at: '2026-10-14T00:00:00.000Z',
});

const board: BoardFile = {
  film: 'f',
  panels: [
    {
      id: 'cold.judge',
      beat: BoardName.make('cold'),
      at: BoardName.make('judge'),
      tries: [tried(1), tried(2), tried(3), tried(9)],
    },
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
  'p5/rbf/gone.png',
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
const run = <A, E, R>(
  self: Effect.Effect<A, E, R>,
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
    Effect.scoped,
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

/** The board's tries with a file, and one it names whose file is missing. */
const TRIES = [1, 2, 3] as const;
const MISSING_TRY = 9;
/** The notes' stills with a file. */
const NOTE_STILLS = ['n1.png', 'n2.png'] as const;
/** A set file the review lists whose file is not there. */
const GONE = 'p5/rbf/gone.png';

/**
 * A file an ask's image may show, of each kind the receipt rule copies:
 * where the lab keeps it, the image as an agent names it, and the src its
 * route serves.
 */
interface Source {
  readonly kind: 'set' | 'try' | 'still';
  readonly file: string;
  readonly image: typeof AskImage.Encoded;
  readonly src: string;
}

const setSource = (ref: string): Source => ({
  kind: 'set',
  file: `/out/${ref}`,
  image: { src: `${REVIEW_FILES}${ref}` },
  src: `${REVIEW_FILES}${ref}`,
});
const trySource = (n: number): Source => ({
  kind: 'try',
  file: `/films/f/board/cold.judge.${n}.png`,
  image: { board: { film: 'f', panel: 'cold.judge', try: n } },
  src: boardFileUrl('f', `cold.judge.${n}.png`),
});
const stillSource = (name: string): Source => ({
  kind: 'still',
  file: `${NOTES_LAB}/f/stills/${name}`,
  image: { src: stillUrl('f', name) },
  src: stillUrl('f', name),
});
const setSources = STILLS.map(setSource);
const trySources = TRIES.map(trySource);
const stillSources = NOTE_STILLS.map(stillSource);
/** One source of each kind whose file is not there as the ask is made. */
const missingSources = [setSource(GONE), trySource(MISSING_TRY), stillSource('n9.png')];

/** An image a page shows: a source's file, or a video's frame. */
type Shown = { readonly _tag: 'File'; readonly source: Source } | { readonly _tag: 'Frame' };
const shownKind = (shown: Shown): string =>
  Match.value(shown).pipe(
    Match.tag('Frame', () => 'frame'),
    Match.tag('File', ({ source }) => source.kind),
    Match.exhaustive,
  );
const sourcesOf = (shown: Shown): ReadonlyArray<Source> =>
  Match.value(shown).pipe(
    Match.tag('Frame', () => []),
    Match.tag('File', ({ source }) => [source]),
    Match.exhaustive,
  );

/** Where a step's images go (an image block, or an option each), and whether it shows a board block and a video. */
interface Layout {
  readonly inOption: ReadonlyArray<boolean>;
  readonly board: boolean;
  readonly video: boolean;
}

/**
 * An ask drawn at random: each step's images and their layout, and its
 * fault: none, a source whose file is missing, or one whose copy fails
 * (`poisoned`).
 */
interface Drawn {
  readonly pages: ReadonlyArray<ReadonlyArray<Shown>>;
  readonly layouts: ReadonlyArray<Layout>;
  readonly fault: Option.Option<Source>;
  readonly poisoned: Option.Option<Source>;
}

/** What a drawn ask shows, by kind: each image's, where it is placed, its live blocks and its steps. */
const kindsOf = ({ pages, layouts }: Drawn): ReadonlyArray<string> => [
  ...pages.flat().map(shownKind),
  ...layouts.flatMap((layout) => [
    ...problemsIf(layout.board, 'board block'),
    ...problemsIf(layout.video, 'video block'),
    ...problemsIf(
      layout.inOption.some((x) => x),
      'on an option',
    ),
    ...problemsIf(
      layout.inOption.some((x) => !x),
      'in an image block',
    ),
  ]),
  `${pages.length} steps`,
];
const problemsIf = (holds: boolean, kind: string): ReadonlyArray<string> =>
  Bool.match(holds, { onTrue: () => [kind], onFalse: () => [] });

/** An ask kept, the steps it has and the receipt it was made with. */
interface Made {
  readonly record: AskRecord;
  readonly steps: number;
  readonly receipt: Readonly<Record<string, string>>;
}

/**
 * An ask of `pages.length` steps, `s0` on to `done`: step `s` shows
 * `pages[s]`, each as `imageOf` names it, in an image block or on an option
 * of its own as `layouts[s]` says, a board block and a video when it says,
 * then asks `k<s>`, `yes` recommended.
 */
const askOver = (
  { pages, layouts }: Pick<Drawn, 'pages' | 'layouts'>,
  imageOf: (shown: Shown) => typeof AskImage.Encoded,
): Ask =>
  Schema.decodeSync(AskSchema)({
    start: 's0',
    steps: Object.fromEntries([
      ...pages.map((shown, s) => {
        const at = layouts[s] ?? { inOption: [], board: false, video: false };
        const placed = shown.map((one, j) => ({ image: imageOf(one), option: at.inOption[j] }));
        return [
          `s${s}`,
          {
            blocks: [
              ...placed
                .filter(({ option }) => option !== true)
                .map(({ image }) => ({ kind: 'image', image })),
              ...Bool.match(at.board, {
                onTrue: () => [{ kind: 'board', film: 'f', panels: ['cold.judge'] }],
                onFalse: () => [],
              }),
              ...Bool.match(at.video, {
                onTrue: () => [{ kind: 'video', ref: 'p5/rbf/cut.mp4', at: 1 + s }],
                onFalse: () => [],
              }),
              {
                kind: 'choose',
                id: `k${s}`,
                label: 'Keep it?',
                options: [
                  { value: 'yes', label: 'Yes', recommended: true },
                  { value: 'no', label: 'No' },
                  ...placed
                    .filter(({ option }) => option === true)
                    .map(({ image }, j) => ({ value: `o${j}`, label: `Option ${j}`, image })),
                ],
              },
            ],
            next: [
              {
                to: Bool.match(s === pages.length - 1, {
                  onTrue: () => 'done',
                  onFalse: () => `s${s + 1}`,
                }),
              },
            ],
          },
        ];
      }),
      ['done', { end: true, text: 'Thank you.' }],
    ]),
  });

/** The board and video blocks of `ask`, which show live. */
const liveBlocks = (ask: Ask) =>
  Object.values(ask.steps)
    .filter((step) => 'blocks' in step)
    .flatMap((step) => step.blocks.filter((b) => b.kind === 'board' || b.kind === 'video'));

/** The lab's files, with a copy that fails for each file in `poisoned`: the file is there, but reads as none. */
class Poisoned extends Map<string, Uint8Array> {
  readonly poisoned = new Set<string>();
  override get(key: string) {
    return Option.getOrUndefined(
      Option.filter(Option.fromUndefinedOr(super.get(key)), () => !this.poisoned.has(key)),
    );
  }
}

/** What the lab answers a GET of `src` with: its status, cache policy, type and bytes' SHA-256. */
const fetched = (lab: LabFetch, src: string) =>
  Effect.gen(function* () {
    const res = yield* Effect.promise(() =>
      lab(new Request(`http://127.0.0.1:4401${src}`), mcpBound),
    );
    const bytes = new Uint8Array(yield* Effect.promise(() => res.arrayBuffer()));
    return {
      status: res.status,
      cache: res.headers.get('cache-control') ?? '',
      type: res.headers.get('content-type') ?? '',
      hash: sha256Hex(bytes),
    };
  });

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
          expect((yield* asks.shownFile(record.id, `${sha256Hex(made)}.png`)).bytes).toEqual(made);
        }),
        'attempt',
        files,
      );
    },
  );

  it.effect(
    "serves each image of random asks only as the copy its receipt holds, over the receipt rule's whole domain: set files, board tries and note stills, in image blocks and options, on pages of one to three steps and asks sharing a page, their files rewritten at random; a frame, a board block and a video block show live; a file missing or failing to copy refuses the make, naming its src",
    () => {
      const files = new Poisoned(seeded('attempt'));
      for (const n of TRIES) files.set(`/films/f/board/cold.judge.${n}.png`, text(`try ${n}`));
      for (const name of NOTE_STILLS) files.set(`${NOTES_LAB}/f/stills/${name}`, text(name));
      for (const ref of STILLS) files.set(`/out/${ref}`, text(`set file ${ref}`));
      const next = draws(29);
      const pick = <T>(all: ReadonlyArray<T>): T => all[Math.floor(next() * all.length)] as T;
      const fresh = () =>
        Uint8Array.from({ length: 1 + Math.floor(next() * 40) }, () => Math.floor(next() * 256));
      const sources = [...setSources, ...trySources, ...stillSources];
      const hashOf = (file: string) => sha256Hex(files.get(file) ?? new Uint8Array());
      /** New bytes for `source`'s file: fresh ones, another source's, or its own again. */
      const rewrite = (source: Source) => {
        const roll = next();
        const from = Bool.match(roll < 0.75, {
          onTrue: () => pick(sources).file,
          onFalse: () => source.file,
        });
        const bytes = Bool.match(roll < 0.5, {
          onTrue: fresh,
          onFalse: () => new Uint8Array(files.get(from) ?? fresh()),
        });
        files.set(source.file, bytes);
      };
      /** Rewrites at a random time: some files, or none. */
      const rewriteSome = () => {
        if (next() < 0.4) return;
        for (const source of sources.filter(() => next() < 0.4)) rewrite(source);
      };
      const frame = labUrls.review.frame({ query: { ref: 'p5/rbf/cut.mp4' } });
      // The faults in turn, each a random source of its kind: a missing file of each kind, a failing copy of each.
      const faults = [
        ...missingSources.map((source) => [source]),
        setSources,
        trySources,
        stillSources,
      ];
      let faulted = 0;
      const draw = (): Drawn => {
        const fault = Bool.match(next() < 0.35, {
          onTrue: () => {
            faulted += 1;
            return Option.some(pick(faults[faulted % faults.length] ?? sources));
          },
          onFalse: () => Option.none<Source>(),
        });
        const steps = 1 + Math.floor(next() * 3);
        const pages = Array.from({ length: steps }, (_, s) => [
          ...Array.from({ length: Math.floor(next() * 4) }, (): Shown =>
            Bool.match(next() < 0.12, {
              onTrue: () => ({ _tag: 'Frame' }),
              onFalse: () => ({ _tag: 'File', source: pick(sources) }),
            }),
          ),
          ...Option.match(
            Option.filter(fault, () => s === steps - 1),
            {
              onNone: (): ReadonlyArray<Shown> => [],
              onSome: (source): ReadonlyArray<Shown> => [{ _tag: 'File', source }],
            },
          ),
        ]);
        return {
          pages,
          layouts: pages.map((shown) => ({
            inOption: shown.map(() => next() < 0.4),
            board: next() < 0.3,
            video: next() < 0.3,
          })),
          fault,
          poisoned: Option.filter(fault, (source) => sources.includes(source)),
        };
      };
      return run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          const lab = yield* labHandler();
          const seen = new Set<string>();
          /** Ask `drawn` made: refused naming its fault, else kept as the oracle says. */
          const makeOf = (i: number, drawn: Drawn) =>
            Effect.gen(function* () {
              const ask = askOver(drawn, (shown) =>
                Match.value(shown).pipe(
                  Match.tag('Frame', () => ({ src: frame })),
                  Match.tag('File', ({ source }) => source.image),
                  Match.exhaustive,
                ),
              );
              const atMake = new Map(sources.map((source) => [source.src, hashOf(source.file)]));
              Option.map(drawn.poisoned, (source) => files.poisoned.add(source.file));
              const before = (yield* asks.list).length;
              const result = yield* Effect.result(asks.make(asked(ask)));
              files.poisoned.clear();
              if (Option.isSome(drawn.fault)) {
                // Refused, naming the src, and no ask kept.
                const message = Result.match(result, {
                  onFailure: (e) => `${e._tag}: ${e.message}`,
                  onSuccess: () => 'kept',
                });
                const how = Bool.match(Option.isSome(drawn.poisoned), {
                  onTrue: () => 'copy failed',
                  onFalse: () => 'missing',
                });
                // Each fault is the rule's refusal, naming the src and what went wrong with it:
                // a file gone is not served or does not copy, by where its route reads it.
                const why = Bool.match(how === 'missing', {
                  onTrue: () =>
                    /: (the lab serves no file there now|its file did not copy as the ask was made)/,
                  onFalse: () => /: its file did not copy as the ask was made/,
                });
                expect([i, how, message]).toEqual([i, how, expect.stringMatching(/^AskRefused: /)]);
                expect(message).toContain(`image ${drawn.fault.value.src}: `);
                expect(message.split(`image ${drawn.fault.value.src}`)[1]).toMatch(why);
                expect((yield* asks.list).length).toBe(before);
                seen.add(`${how}: ${drawn.fault.value.kind}`);
                return Option.none<Made>();
              }
              const record = Result.getOrThrow(result);
              // The page the oracle expects: each file-served image its copy, by the bytes at the make.
              const copyOf = (source: Source) =>
                askShownUrl(record.id, `${atMake.get(source.src) ?? ''}.png`);
              const expected = askOver(drawn, (shown) =>
                Match.value(shown).pipe(
                  Match.tag('Frame', () => ({ src: frame })),
                  Match.tag('File', ({ source }) => ({ src: copyOf(source) })),
                  Match.exhaustive,
                ),
              );
              expect([i, imagesIn(record.ask).map((image) => image.src)]).toEqual([
                i,
                imagesIn(expected).map((image) => image.src),
              ]);
              expect([i, liveBlocks(record.ask)]).toEqual([i, liveBlocks(ask)]);
              const fileShown = [...new Set(drawn.pages.flat().flatMap(sourcesOf))];
              expect([i, record.shown]).toEqual([
                i,
                Object.fromEntries(
                  fileShown.map((source) => [copyOf(source), atMake.get(source.src) ?? '']),
                ),
              ]);
              for (const kind of kindsOf(drawn)) seen.add(kind);
              if (new Set(fileShown.map((s) => atMake.get(s.src))).size < fileShown.length)
                seen.add('two files of the same bytes, one copy');
              return Option.some({
                record,
                steps: drawn.pages.length,
                receipt: record.shown ?? {},
              });
            });
          /** Ask `made` answered: what it serves at each copy, through the store and the lab's route, is what it was made with. */
          const answerOf = (i: number, { record, steps, receipt }: Made) =>
            Effect.gen(function* () {
              rewriteSome();
              const answered = yield* asks.answerPage(
                record.id,
                Array.from({ length: steps }, (_, s) => ({
                  step: AskName.make(`s${s}`),
                  values: { [`k${s}`]: 'yes' },
                })),
              );
              expect([i, answered.answered.length, answered.shown]).toEqual([i, steps, receipt]);
              rewriteSome();
              for (const [src, hash] of Object.entries(receipt)) {
                const copy = yield* asks.shownFile(record.id, src.split('/').at(-1) ?? '');
                expect([i, src, sha256Hex(copy.bytes)]).toEqual([i, src, hash]);
                expect([i, src, yield* fetched(lab, src)]).toEqual([
                  i,
                  src,
                  { status: 200, cache: CACHE.hashed, type: 'image/png', hash },
                ]);
                if (!sources.some((source) => hashOf(source.file) === hash)) seen.add('rewritten');
              }
            });
          for (let i = 0; i < 28; i += 1) {
            rewriteSome();
            const made: Array<Made> = [];
            for (let a = 1 + Math.floor(next() * 2); a > 0; a -= 1) {
              made.push(...Option.toArray(yield* makeOf(i, draw())));
              rewriteSome();
            }
            if (made.length === 2) {
              const page = yield* asks.page(made[0]?.record.id ?? '');
              expect(page.asks.map((x) => x.id)).toEqual(made.map((m) => m.record.id));
              seen.add('asks sharing a page');
            }
            for (const each of made) yield* answerOf(i, each);
          }
          expect([...seen].toSorted()).toEqual(
            [
              '1 steps',
              '2 steps',
              '3 steps',
              'asks sharing a page',
              'board block',
              'copy failed: set',
              'copy failed: still',
              'copy failed: try',
              'frame',
              'in an image block',
              'missing: set',
              'missing: still',
              'missing: try',
              'on an option',
              'rewritten',
              'set',
              'still',
              'try',
              'two files of the same bytes, one copy',
              'video block',
            ].toSorted(),
          );
        }),
        'attempt',
        files,
      );
    },
  );

  it.effect(
    "shows a kept ask's copy again in an ask made from its machine, as the same copy under its own route, and refuses the make, naming the src, once the copy no longer holds its hash or is no copy that ask holds",
    () => {
      const files = seeded('attempt');
      const made = new Uint8Array(files.get(`/out/${STILL}`) ?? new Uint8Array());
      const name = `${sha256Hex(made)}.png`;
      const copy = `${NOTES_LAB}/asks/shown/${name}`;
      return run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          const lab = yield* labHandler();
          const first = yield* asks.make(
            asked(about({ kind: 'image', image: { src: `${REVIEW_FILES}${STILL}` } })),
          );
          const shown = askShownUrl(first.id, name);
          expect(imagesIn(first.ask).map((image) => image.src)).toEqual([shown]);
          const again = yield* asks.make(asked(first.ask));
          const reshown = askShownUrl(again.id, name);
          expect([again.id === first.id, imagesIn(again.ask).map((image) => image.src)]).toEqual([
            false,
            [reshown],
          ]);
          expect(again.shown).toEqual({ [reshown]: sha256Hex(made) });
          expect(yield* fetched(lab, reshown)).toEqual({
            status: 200,
            cache: CACHE.hashed,
            type: 'image/png',
            hash: sha256Hex(made),
          });
          const before = (yield* asks.list).length;
          /** Why an ask showing `src` is refused: its tag and message. */
          const refused = (src: string) =>
            Effect.map(
              Effect.flip(asks.make(asked(about({ kind: 'image', image: { src } })))),
              (e) => `${e._tag}: ${e.message}`,
            );
          const unknownAsk = askShownUrl('a0000000000', name);
          const notInReceipt = askShownUrl(first.id, `${'0'.repeat(64)}.png`);
          files.set(copy, text('the copy changed under the lab'));
          for (const src of [shown, unknownAsk, notInReceipt]) {
            const message = yield* refused(src);
            expect([src, message]).toEqual([src, expect.stringMatching(/^AskRefused: /)]);
            expect(message).toContain(`image ${src}: it is no copy ask`);
          }
          expect((yield* asks.list).length).toBe(before);
        }),
        'attempt',
        files,
      );
    },
  );

  it.effect(
    'refuses an answer, and serves no bytes, once a copy its page shows no longer holds its hash, and takes and serves it while the copy does',
    () => {
      const files = seeded('attempt');
      const made = new Uint8Array(files.get(`/out/${STILL}`) ?? new Uint8Array());
      const name = `${sha256Hex(made)}.png`;
      return run(
        Effect.gen(function* () {
          const asks = yield* AskStore;
          const lab = yield* labHandler();
          const record = yield* asks.make(
            asked(about({ kind: 'image', image: { src: `${REVIEW_FILES}${STILL}` } })),
          );
          const copy = `${NOTES_LAB}/asks/shown/${name}`;
          expect(files.get(copy)).toEqual(made);
          const src = askShownUrl(record.id, name);
          const get = fetched(lab, src);
          const answer = [{ step: AskName.make('ask'), values: { keep: 'yes' } }];
          files.set(copy, text('the copy changed under the lab'));
          const refused = yield* Effect.flip(asks.answerPage(record.id, answer));
          expect(refused.message).toContain('holds no copy');
          expect((yield* Effect.flip(asks.shownFile(record.id, name)))._tag).toBe('AskRefused');
          const changed = yield* get;
          expect(changed.status).toBe(409);
          expect(changed.cache).not.toContain('immutable');
          files.delete(copy);
          expect((yield* Effect.flip(asks.answerPage(record.id, answer))).message).toContain(
            'holds no copy',
          );
          expect((yield* get).status).toBe(404);
          files.set(copy, made);
          expect((yield* asks.answerPage(record.id, answer)).answered).toHaveLength(1);
          expect(yield* get).toEqual({
            status: 200,
            cache: CACHE.hashed,
            type: 'image/png',
            hash: sha256Hex(made),
          });
          const unknown = yield* Effect.flip(asks.shownFile(record.id, `${'0'.repeat(64)}.png`));
          expect(unknown._tag).toBe('ReviewFileUnknown');
        }),
        'attempt',
        files,
      );
    },
  );
});
