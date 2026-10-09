// The footage library (`footage.ts`) over an in-memory disk, with its media
// and its speech-to-text faked: no camera file is decoded and nothing is
// paid for. An original is kept once by its bytes and never overwritten;
// what the render cannot conform is refused before anything is kept; each
// copy is made only when its recipe is not the one it was made by; a take is
// heard once, and a second hearing is a second file; push and pull keep the
// originals in the private store, read back by their hashes.

import {
  Cause,
  ConfigProvider,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import {
  FOOTAGE_RECIPES,
  type FootageCopy,
  type FootageProbe,
  FootageLockJson,
  FootageTranscriptJson,
  recipeKey,
} from '../core/footage.ts';
import { ContentStore } from './content-store.ts';
import { FootageHdr, FootageNameTaken, FootageOriginalMissing, FootageSilent } from './errors.ts';
import { FootageLibrary } from './footage.ts';
import { folderStore } from './media-store.ts';
import { PrivateStore } from './private-store.ts';
import {
  type ElevenLabsCalls,
  emptyCalls,
  fakeElevenLabs,
  fakeFootageMedia,
  fakeMedia,
  memoryFileSystem,
  memoryLocks,
  text,
} from './testing.ts';

const DIR = '/app/footage';
const OUT = '/app/out';
const STORE = '/store';

/** A phone's take as the fake probe reads it: 1080×1920 at 30, AAC sound. */
const TAKE_PROBE: FootageProbe = {
  container: 'MP4',
  duration: 12,
  picture: {
    codec: 'hevc',
    width: 1080,
    height: 1920,
    rotation: 0,
    fps: 30,
    variable: false,
    start: 0,
  },
  sound: { codec: 'aac', rate: 48_000, channels: 1 },
};

/**
 * What the fake probe reads of a file by its words: `hdr` makes it HDR,
 * `silent` leaves it no sound, anything else is a phone's take.
 */
const probeOf = (said: string) => {
  const silent = said.includes('silent');
  const { sound: _sound, ...withoutSound } = TAKE_PROBE;
  return {
    probe: [TAKE_PROBE, withoutSound][Number(silent)] ?? TAKE_PROBE,
    hdr: said.includes('hdr'),
  };
};

/** The library's world: one disk, its media faked, a folder for its private store. */
const world = (
  files: Map<string, Uint8Array>,
  calls: ElevenLabsCalls,
  made: Array<FootageCopy>,
) => {
  const Disk = Layer.mergeAll(memoryFileSystem(files, new Set()), Path.layer);
  const Faked = fakeFootageMedia(files, probeOf, made);
  const Private = Layer.effect(
    PrivateStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      return PrivateStore.of({ store: Effect.succeed(folderStore(fs, path, STORE)) });
    }),
  );
  return FootageLibrary.layer(DIR).pipe(
    Layer.provide([
      ContentStore.layer.pipe(Layer.provide(memoryLocks)),
      fakeMedia(files),
      Faked,
      fakeElevenLabs(files, calls),
      Private,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: OUT })),
    ]),
    Layer.provideMerge(Disk),
  );
};

/** A take named `name`, with no terms. */
const asTake = (name: string) => ({
  name,
  kind: 'take' as const,
  licence: Option.none(),
  credit: Option.none(),
  source: Option.none(),
  tags: [],
});

/** The failure `exit` ended with, if it failed. */
const failureOf = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.match(exit, {
    onSuccess: () => Option.none<E>(),
    onFailure: (cause) => Cause.findErrorOption(cause),
  });

/** The lock as it was written. */
const lockIn = (files: Map<string, Uint8Array>) =>
  Schema.decodeEffect(FootageLockJson)(
    new TextDecoder().decode(files.get(`${DIR}/library.lock.json`)),
  );

describe('the footage library', () => {
  it.effect(
    'keeps an original once by its bytes: the same bytes again answer their name; another name for them is that one',
    () => {
      const files = new Map([['/in/take.mov', text('a phone take')]]);
      return Effect.gen(function* () {
        const library = yield* FootageLibrary;
        const first = yield* library.importFile('/in/take.mov', asTake('why-the-law'));
        expect(first.fresh).toBe(true);
        const again = yield* library.importFile('/in/take.mov', asTake('another-name'));
        expect([again.name, again.fresh]).toEqual(['why-the-law', false]);
        const lock = yield* lockIn(files);
        expect(Object.keys(lock.footage)).toEqual(['why-the-law']);
        const sha12 = first.entry.sha256.slice(0, 12);
        expect(files.get(`${DIR}/files/why-the-law/${sha12}.mov`)).toEqual(text('a phone take'));
        expect(lock.footage['why-the-law']?.probe).toEqual(TAKE_PROBE);
      }).pipe(Effect.provide(world(files, emptyCalls(), [])));
    },
  );

  it.effect('never gives a name to other bytes: a second recording is a second name', () => {
    const files = new Map([
      ['/in/one.mov', text('one take')],
      ['/in/two.mov', text('two take')],
    ]);
    return Effect.gen(function* () {
      const library = yield* FootageLibrary;
      yield* library.importFile('/in/one.mov', asTake('why'));
      const refused = failureOf(
        yield* Effect.exit(library.importFile('/in/two.mov', asTake('why'))),
      );
      expect(Option.map(refused, (e) => e._tag)).toEqual(Option.some('FootageNameTaken'));
      expect(Option.getOrThrow(refused)).toBeInstanceOf(FootageNameTaken);
      expect(Object.keys((yield* lockIn(files)).footage)).toEqual(['why']);
    }).pipe(Effect.provide(world(files, emptyCalls(), [])));
  });

  it.effect(
    'refuses HDR, naming the setting, and a take with no sound, keeping nothing of either',
    () => {
      const files = new Map([
        ['/in/hdr.mov', text('an hdr take')],
        ['/in/mute.mov', text('a silent take')],
      ]);
      return Effect.gen(function* () {
        const library = yield* FootageLibrary;
        const hdr = failureOf(yield* Effect.exit(library.importFile('/in/hdr.mov', asTake('a'))));
        expect(Option.getOrThrow(hdr)).toBeInstanceOf(FootageHdr);
        expect(String(Option.getOrThrow(hdr).message)).toContain('HDR Video off');
        const mute = failureOf(yield* Effect.exit(library.importFile('/in/mute.mov', asTake('b'))));
        expect(Option.getOrThrow(mute)).toBeInstanceOf(FootageSilent);
        expect([...files.keys()].filter((f) => f.startsWith(DIR))).toEqual([]);
      }).pipe(Effect.provide(world(files, emptyCalls(), [])));
    },
  );

  it.effect(
    "makes each copy and the voice once, hears a take once, and makes again only what a recipe's change makes stale",
    () => {
      const files = new Map([['/in/take.mov', text('a phone take')]]);
      const calls = emptyCalls();
      const made: Array<FootageCopy> = [];
      return Effect.gen(function* () {
        const library = yield* FootageLibrary;
        const { entry } = yield* library.importFile('/in/take.mov', asTake('why'));
        const first = yield* library.make('why', { hearAgain: false });
        expect(first.made).toEqual(['mezzanine', 'proxy', 'voice', 'transcript']);
        const sha12 = entry.sha256.slice(0, 12);
        expect(first.transcript).toEqual(Option.some(`why.${sha12}.json`));
        const heard = yield* Schema.decodeEffect(FootageTranscriptJson)(
          new TextDecoder().decode(files.get(`${DIR}/transcripts/why.${sha12}.json`)),
        );
        expect(heard.source).toBe(`why/${sha12}`);
        expect(heard.words.length).toBeGreaterThan(0);
        expect(heard.envelope.length).toBeGreaterThan(0);
        expect((yield* lockIn(files)).footage['why']?.transcript).toBe(`why.${sha12}.json`);
        // Nothing stale: nothing made, nothing heard.
        const second = yield* library.make('why', { hearAgain: false });
        expect(second.made).toEqual([]);
        expect(calls.stt.length).toBe(1);
        // The proxy's recipe changed since it was made: the proxy alone is made again.
        const stamp = `${OUT}/footage/why/${sha12}/stamp.json`;
        files.set(
          stamp,
          text(
            new TextDecoder()
              .decode(files.get(stamp))
              .replace(recipeKey(FOOTAGE_RECIPES.proxy), 'long=640 crf=30 key=2 fps=30'),
          ),
        );
        expect((yield* library.make('why', { hearAgain: false })).made).toEqual(['proxy']);
        expect(made).toEqual(['mezzanine', 'proxy', 'proxy']);
      }).pipe(Effect.provide(world(files, calls, made)));
    },
  );

  it.effect('a second hearing is a second file, which the lock then names; the first stays', () => {
    const files = new Map([['/in/take.mov', text('a phone take')]]);
    const calls = emptyCalls();
    return Effect.gen(function* () {
      const library = yield* FootageLibrary;
      const { entry } = yield* library.importFile('/in/take.mov', asTake('why'));
      const sha12 = entry.sha256.slice(0, 12);
      yield* library.make('why', { hearAgain: false });
      const again = yield* library.make('why', { hearAgain: true });
      expect(again.transcript).toEqual(Option.some(`why.${sha12}.2.json`));
      expect(files.has(`${DIR}/transcripts/why.${sha12}.json`)).toBe(true);
      expect((yield* lockIn(files)).footage['why']?.transcript).toBe(`why.${sha12}.2.json`);
      expect(calls.stt.length).toBe(2);
    }).pipe(Effect.provide(world(files, calls, [])));
  });

  it.effect(
    'pushes each original to the private store once, and pulls one this machine lacks, read back by its hash',
    () => {
      const files = new Map([['/in/take.mov', text('a phone take')]]);
      return Effect.gen(function* () {
        const library = yield* FootageLibrary;
        const { entry } = yield* library.importFile('/in/take.mov', asTake('why'));
        const key = `footage/why/${entry.sha256.slice(0, 12)}.mov`;
        expect((yield* library.push).map((s) => [s.key, s.did])).toEqual([[key, 'sent']]);
        expect((yield* library.push).map((s) => s.did)).toEqual(['had']);
        expect(files.get(`${STORE}/${key}`)).toEqual(text('a phone take'));
        // This machine loses the original: make says to pull it, and pull brings it back.
        const original = `${DIR}/files/why/${entry.sha256.slice(0, 12)}.mov`;
        files.delete(original);
        const missing = failureOf(yield* Effect.exit(library.make('why', { hearAgain: false })));
        expect(Option.getOrThrow(missing)).toBeInstanceOf(FootageOriginalMissing);
        expect((yield* library.pull).map((s) => s.did)).toEqual(['pulled']);
        expect(files.get(original)).toEqual(text('a phone take'));
        expect((yield* library.pull).map((s) => s.did)).toEqual(['had']);
      }).pipe(Effect.provide(world(files, emptyCalls(), [])));
    },
  );
});
