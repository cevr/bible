// The Choices service at its own boundary, over fakes: a film in memory, its
// takes made by the real Takes (fake media and transcriber), its writes and
// their Undo by the real SourceWriter (oxfmt leaves a text as it is), and the
// fresh process answered in this one, as `film options` would over the same
// files. No network, no ffmpeg, no film CLI.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, type FileSystem, Layer, Option, Path, Schema } from 'effect';
import { pointIdOf } from '../core/point.ts';
import { withSay } from '../core/choice.ts';
import { hashText, voiceKey } from '../core/narration.ts';
import { type Timed, type Timings, TimingsJson } from '../core/schema.ts';
import { RenderCatalogue } from './catalogue.ts';
import { voicePoints } from './choice-points.ts';
import { Choices } from './choices.ts';
import { ContentStore } from './content-store.ts';
import { FilmFolder, FilmName, FilmRepo } from './film-repo.ts';
import { OptionsKept } from './fresh-film.ts';
import { NO_SCORES } from './media-store.ts';
import { voicedOf } from './narrator.ts';
import { Review } from './review.ts';
import { SourceWriter } from './source-writer.ts';
import { Takes } from './takes.ts';
import {
  emptyCalls,
  fakeElevenLabs,
  fakeMedia,
  formatAsIs,
  freshFilm,
  memoryFileSystem,
  storeLayer,
  testFilm,
  testVoice,
  text,
} from './testing.ts';

const scenes: ReadonlyArray<Timed> = [{ id: 'a', say: 'Hello {wave} world.' }];

/** `a` staged by ElevenLabs. */
const staged: Timings = {
  voice: voiceKey(testVoice),
  scenes: {
    a: {
      hash: hashText('Hello world.'),
      file: 'a.mp3',
      duration: 1,
      words: [],
      source: 'elevenlabs',
    },
  },
};

const film = testFilm(scenes, staged);
const F = Schema.decodeSync(FilmName)('test');
const NARRATION = film.paths.narration;
const TIMINGS = film.paths.timings.file;

const unreviewed = (op: string) => () => Effect.die(`the review is not called here (${op})`);

const setup = () => {
  const files = new Map<string, Uint8Array>([
    [TIMINGS, text(Schema.encodeSync(TimingsJson)(staged))],
    [`${NARRATION}/a.mp3`, text('Hello world.')],
    // Two readings of the line: other audio, the same words heard.
    ['/rec/a1.wav', text('Hello world.')],
    ['/rec/a2.wav', text('Hello world, again.')],
  ]);
  const base = Layer.mergeAll(
    memoryFileSystem(files),
    Path.layer,
    fakeElevenLabs(files, emptyCalls(), { recorded: new Map([['a', 'Hello world.']]) }),
    fakeMedia(files),
    formatAsIs,
  );
  const repo = Layer.effect(
    FilmRepo,
    Effect.gen(function* () {
      const store = yield* ContentStore;
      return FilmRepo.of({
        load: () => Effect.map(store.read(film.paths.timings), (timings) => ({ ...film, timings })),
        script: () => Effect.succeedNone,
        scores: Effect.succeed(NO_SCORES),
      });
    }),
  );
  const folder = Layer.succeed(
    FilmFolder,
    FilmFolder.of({
      paths: () => film.paths,
      names: Effect.succeed([film.paths.name]),
      sounds: Option.none(),
      stamp: () => Effect.succeed(1),
    }),
  );
  const review = Layer.succeed(
    Review,
    Review.of({
      roots: [],
      index: unreviewed('index'),
      pictures: unreviewed('pictures'),
      renderVideo: unreviewed('renderVideo'),
      resolve: unreviewed('resolve'),
      duration: unreviewed('duration'),
      frame: unreviewed('frame'),
      phone: unreviewed('phone'),
      derive: unreviewed('derive'),
    }),
  );
  // The fresh process, run here over the same files: `film options list` and `keep-voice`.
  const fresh = Layer.unwrap(
    Effect.map(
      Effect.context<FilmRepo | Takes | ContentStore | FileSystem.FileSystem | Path.Path>(),
      (context) =>
        freshFilm({
          choices: () =>
            Effect.gen(function* () {
              const loaded = yield* (yield* FilmRepo).load(F);
              const attempts = yield* (yield* Takes).attempts(loaded.paths, 'a');
              return voicePoints(loaded, [
                { beat: 'a', hash: hashText('Hello world.'), attempts },
              ]).map((draft) => withSay(Option.none(), draft));
            }).pipe(Effect.provideContext(context), Effect.orDie),
          keepVoice: (_, beat, file) =>
            Effect.gen(function* () {
              const voiced = yield* Effect.fromResult(voicedOf(yield* (yield* FilmRepo).load(F)));
              yield* (yield* Takes).keepAttempt(voiced, beat, file, { acceptMismatch: false });
              return OptionsKept.make({ mixed: true });
            }).pipe(Effect.provideContext(context), Effect.orDie),
        }),
    ),
  );
  const layer = Choices.layer.pipe(
    Layer.provideMerge(fresh),
    Layer.provideMerge(
      Layer.mergeAll(Takes.layer, SourceWriter.layer, RenderCatalogue.layer, review),
    ),
    Layer.provideMerge(Layer.mergeAll(repo, folder)),
    Layer.provideMerge(storeLayer(files)),
    Layer.provideMerge(base),
  );
  return { files, layer };
};

/** The film's timings as they are stored now. */
const timings = ContentStore.use((store) => store.read(film.paths.timings));

/** `file` imported as beat `a`'s take, outside the lab (as `takes import` would): its take's file. */
const imported = (file: string) =>
  Effect.gen(function* () {
    const loaded = yield* (yield* FilmRepo).load(F);
    const voiced = yield* Effect.orDie(Effect.fromResult(voicedOf(loaded)));
    return (yield* (yield* Takes).importBeat(voiced, 'a', file, { acceptMismatch: false })).take
      .file;
  });

describe('Choices: a voice picked', () => {
  it.effect('Undo and Redo of a kept voice each name a take whose file is in narration', () => {
    const { files, layer } = setup();
    return Effect.gen(function* () {
      const first = yield* imported('/rec/a1.wav');
      const second = yield* imported('/rec/a2.wav');
      expect(second).not.toBe(first);
      expect((yield* timings).scenes['a']?.file).toBe(second);
      const before = files.get(TIMINGS);
      // The owner goes back to the first reading in the Choices view.
      const point = pointIdOf({ _tag: 'Voice', beat: 'a' });
      const picked = yield* (yield* Choices).pick(F, { point, variant: first, verb: 'pick' });
      expect(Option.isSome(picked.change)).toBe(true);
      expect((yield* timings).scenes['a']?.file).toBe(first);
      expect(takesIn(files)).toEqual([first]);
      const writer = yield* SourceWriter;
      // Undo: the timings name the second reading again, and its file is there to play.
      yield* writer.undo(F);
      expect((yield* timings).scenes['a']?.file).toBe(second);
      expect(files.has(`${NARRATION}/${second}`)).toBe(true);
      expect(files.get(TIMINGS)).toEqual(before);
      // narration/ holds just the take the timings name, as git had it; the other stays an attempt.
      expect(takesIn(files)).toEqual([second]);
      expect(files.has(`${NARRATION}/attempts/a/${first}`)).toBe(true);
      // Redo: the first reading again, its file there too.
      yield* writer.redo(F);
      expect((yield* timings).scenes['a']?.file).toBe(first);
      expect(takesIn(files)).toEqual([first]);
    }).pipe(Effect.provide(layer));
  });

  it.effect('an Undo whose take is nowhere is refused, and the timings stay', () => {
    const { files, layer } = setup();
    return Effect.gen(function* () {
      const first = yield* imported('/rec/a1.wav');
      const second = yield* imported('/rec/a2.wav');
      const point = pointIdOf({ _tag: 'Voice', beat: 'a' });
      yield* (yield* Choices).pick(F, { point, variant: first, verb: 'pick' });
      const after = files.get(TIMINGS);
      // The second reading's attempt is gone from this machine (a cleared folder).
      files.delete(`${NARRATION}/attempts/a/${second}`);
      const refused = yield* Effect.flip((yield* SourceWriter).undo(F));
      expect(refused._tag).toBe('UndoUnavailable');
      expect(refused.message).toContain(second);
      expect(files.get(TIMINGS)).toEqual(after);
      expect(takesIn(files)).toEqual([first]);
    }).pipe(Effect.provide(layer));
  });
});

/** The take files in `narration/` itself (not its attempts), by name. */
const takesIn = (files: ReadonlyMap<string, Uint8Array>) =>
  [...files.keys()]
    .filter((f) => f.startsWith(`${NARRATION}/a.`))
    .map((f) => f.slice(NARRATION.length + 1));
