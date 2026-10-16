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
  Deferred,
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
import { ElevenLabs } from './elevenlabs.ts';
import { FootageHdr, FootageNameTaken, FootageOriginalMissing, FootageSilent } from './errors.ts';
import { FootageLibrary } from './footage.ts';
import {
  type ElevenLabsCalls,
  emptyCalls,
  fakeElevenLabs,
  fakeFootageMedia,
  fakeMedia,
  memoryFileSystem,
  memoryLocks,
  privateFolder,
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

/**
 * A disk that lets every other fiber run before each step it takes: two
 * runs at once interleave at every read and write, as two processes would.
 */
const sharedDisk = (files: Map<string, Uint8Array>) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (fs) =>
      FileSystem.FileSystem.of({
        ...fs,
        exists: (file) => Effect.andThen(Effect.yieldNow, fs.exists(file)),
        writeFile: (file, bytes, options) =>
          Effect.andThen(Effect.yieldNow, fs.writeFile(file, bytes, options)),
        rename: (from, to) => Effect.andThen(Effect.yieldNow, fs.rename(from, to)),
      }),
    ),
  ).pipe(Layer.provide(memoryFileSystem(files, new Set())));

/**
 * The fake hearing, each held until `together` are under way: that many
 * `make`s hear at once, and land their transcripts at once.
 */
const hearingTogether = (
  files: Map<string, Uint8Array>,
  calls: ElevenLabsCalls,
  together: number,
) =>
  Layer.effect(
    ElevenLabs,
    Effect.gen(function* () {
      const fake = yield* ElevenLabs;
      const all = yield* Deferred.make<void>();
      const under = { count: 0 };
      return ElevenLabs.of({
        ...fake,
        stt: (file) =>
          Effect.gen(function* () {
            under.count += 1;
            if (under.count === together) yield* Deferred.done(all, Exit.void);
            yield* Deferred.await(all);
            return yield* fake.stt(file);
          }),
      });
    }),
  ).pipe(Layer.provide(fakeElevenLabs(files, calls)));

/** The library's world: one disk, its media faked, a folder for its private store. */
const world = (
  files: Map<string, Uint8Array>,
  calls: ElevenLabsCalls,
  made: Array<FootageCopy>,
  options: {
    readonly disk?: Layer.Layer<FileSystem.FileSystem>;
    readonly hearing?: Layer.Layer<ElevenLabs>;
  } = {},
) => {
  const Disk = Layer.mergeAll(
    Option.getOrElse(Option.fromUndefinedOr(options.disk), () =>
      memoryFileSystem(files, new Set()),
    ),
    Path.layer,
  );
  const Hearing = Option.getOrElse(Option.fromUndefinedOr(options.hearing), () =>
    fakeElevenLabs(files, calls),
  );
  const Faked = fakeFootageMedia(files, probeOf, made);
  const Private = privateFolder(STORE);
  return FootageLibrary.layer(DIR).pipe(
    Layer.provide([
      ContentStore.layer.pipe(Layer.provide(memoryLocks)),
      fakeMedia(files),
      Faked,
      Hearing,
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

  it.effect('two hearings at once keep two files: neither is renamed over the other', () => {
    const files = new Map([['/in/take.mov', text('a phone take')]]);
    const calls = emptyCalls();
    return Effect.gen(function* () {
      const library = yield* FootageLibrary;
      const { entry } = yield* library.importFile('/in/take.mov', asTake('why'));
      const sha12 = entry.sha256.slice(0, 12);
      const both = yield* Effect.all(
        [library.make('why', { hearAgain: true }), library.make('why', { hearAgain: true })],
        { concurrency: 2 },
      );
      const heard = both.map((made) => Option.getOrThrow(made.transcript)).toSorted();
      expect(heard).toEqual([`why.${sha12}.2.json`, `why.${sha12}.json`]);
      expect(
        [...files.keys()].filter((file) => file.startsWith(`${DIR}/transcripts/`)).toSorted(),
      ).toEqual([`${DIR}/transcripts/why.${sha12}.2.json`, `${DIR}/transcripts/why.${sha12}.json`]);
      const named = (yield* lockIn(files)).footage['why']?.transcript;
      expect(heard.filter((file) => file === named).length).toBe(1);
      expect(calls.stt.length).toBe(2);
    }).pipe(
      Effect.provide(
        world(files, calls, [], {
          disk: sharedDisk(files),
          hearing: hearingTogether(files, calls, 2),
        }),
      ),
    );
  });

  it.effect(
    'a hearing that lands after another named a transcript keeps its file, and the lock keeps the first',
    () => {
      const files = new Map([['/in/take.mov', text('a phone take')]]);
      const calls = emptyCalls();
      return Effect.gen(function* () {
        const library = yield* FootageLibrary;
        const { entry } = yield* library.importFile('/in/take.mov', asTake('why'));
        const sha12 = entry.sha256.slice(0, 12);
        const both = yield* Effect.all(
          [library.make('why', { hearAgain: false }), library.make('why', { hearAgain: false })],
          { concurrency: 2 },
        );
        const named = Option.fromUndefinedOr((yield* lockIn(files)).footage['why']?.transcript);
        expect(both.map((made) => made.transcript)).toEqual([named, named]);
        expect(Option.isSome(named)).toBe(true);
        expect(files.has(`${DIR}/transcripts/why.${sha12}.json`)).toBe(true);
        expect(files.has(`${DIR}/transcripts/why.${sha12}.2.json`)).toBe(true);
      }).pipe(
        Effect.provide(
          world(files, calls, [], {
            disk: sharedDisk(files),
            hearing: hearingTogether(files, calls, 2),
          }),
        ),
      );
    },
  );

  it.effect(
    'refuses a name that is not a footage name before anything is written: no separator, no capital, no dot first',
    () => {
      const files = new Map([['/in/take.mov', text('a phone take')]]);
      return Effect.gen(function* () {
        const library = yield* FootageLibrary;
        for (const name of ['../x', '../../evil', 'Why-The-Law', 'a/b', '.hidden', '']) {
          const refused = failureOf(
            yield* Effect.exit(library.importFile('/in/take.mov', asTake(name))),
          );
          expect(Option.map(refused, (e) => e._tag)).toEqual(Option.some('FootageNameInvalid'));
        }
        expect([...files.keys()].filter((f) => f !== '/in/take.mov')).toEqual([]);
      }).pipe(Effect.provide(world(files, emptyCalls(), [])));
    },
  );

  it.effect(
    'a lock naming footage, or a transcript, by a name that is not one, or giving an original a hash or an extension that is not one, neither reads nor writes',
    () =>
      Effect.gen(function* () {
        const entry = {
          kind: 'take' as const,
          sha256: 'a'.repeat(64),
          bytes: 1,
          ext: '.mov',
          probe: TAKE_PROBE,
        };
        const locks = [
          ...['../../evil', 'Why-The-Law'].map((name) => ({ [name]: entry })),
          ...['../../evil.json', 'why/x.json', 'why.aaaaaaaaaaaa.txt'].map((transcript) => ({
            why: { ...entry, transcript },
          })),
          // Every other field a path is made of: the hash (the copies' folder, the original's name) and the extension.
          ...['../../../../../../evil', 'A'.repeat(64), 'a'.repeat(63), `${'a'.repeat(64)}/x`].map(
            (sha256) => ({ why: { ...entry, sha256 } }),
          ),
          ...[
            '/../../../../evil.mov',
            '/../../../transcripts/why.aaaaaaaaaaaa.json',
            'mov',
            '.MOV',
            '.m/v',
            '.',
          ].map((ext) => ({ why: { ...entry, ext } })),
        ];
        for (const footage of locks) {
          const lock = { version: 1 as const, footage };
          const wrote = yield* Effect.exit(Schema.encodeEffect(FootageLockJson)(lock));
          expect([footage, Exit.isFailure(wrote)]).toEqual([footage, true]);
          const written = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Json))(lock);
          const read = yield* Effect.exit(Schema.decodeEffect(FootageLockJson)(written));
          expect([footage, Exit.isFailure(read)]).toEqual([footage, true]);
        }
        const fine = {
          version: 1 as const,
          footage: {
            'why-the-law.2': { ...entry, transcript: 'why-the-law.2.aaaaaaaaaaaa.2.json' },
            // An original imported with no extension keeps none.
            bare: { ...entry, sha256: '0123456789abcdef'.repeat(4), ext: '' },
          },
        };
        const text = yield* Schema.encodeEffect(FootageLockJson)(fine);
        expect(yield* Schema.decodeEffect(FootageLockJson)(text)).toEqual(fine);
      }),
  );

  /** A lock entry as a hand might edit it, before anything checks it. */
  const handEdited = {
    kind: 'take',
    sha256: 'a'.repeat(64),
    bytes: 12,
    ext: '.mov',
    probe: TAKE_PROBE,
  };
  for (const [what, why] of [
    ['a hash that is a path', { ...handEdited, sha256: '../../../../../../evil' }],
    ['an extension that is a path', { ...handEdited, ext: '/../../../../evil.mov' }],
    // Pulled there, an original would be written over a committed transcript.
    [
      "an extension that is a transcript's path",
      { ...handEdited, ext: '/../../../transcripts/why.aaaaaaaaaaaa.json' },
    ],
  ] as const) {
    it.effect(
      `make and pull refuse a lock, edited by hand, giving an original ${what}, and write nothing`,
      () => {
        const lock = new TextEncoder().encode(
          Schema.encodeSync(Schema.fromJsonString(Schema.Json))({ version: 1, footage: { why } }),
        );
        const files = new Map([
          [`${DIR}/library.lock.json`, lock],
          [`${DIR}/transcripts/why.aaaaaaaaaaaa.json`, text('{"words":[]}')],
          // The store holds bytes at every key the crafted lock could name.
          [`${STORE}/footage/why/../../../../../../evil.mov`, text('a phone take')],
          [`${STORE}/footage/why/aaaaaaaaaaaa/../../../../evil.mov`, text('a phone take')],
          [
            `${STORE}/footage/why/aaaaaaaaaaaa/../../../transcripts/why.aaaaaaaaaaaa.json`,
            text('a phone take'),
          ],
        ]);
        const before = new Map(files);
        const said = (
          failure: Option.Option<{ readonly _tag: string; readonly message: string }>,
        ) =>
          Option.map(failure, (e) => [
            e._tag,
            e.message.startsWith(`${DIR}/library.lock.json is invalid`),
          ]);
        return Effect.gen(function* () {
          const library = yield* FootageLibrary;
          expect([
            said(failureOf(yield* Effect.exit(library.make('why', { hearAgain: false })))),
            said(failureOf(yield* Effect.exit(library.pull))),
          ]).toEqual([Option.some(['FileInvalid', true]), Option.some(['FileInvalid', true])]);
          expect(files).toEqual(before);
        }).pipe(Effect.provide(world(files, emptyCalls(), ['mezzanine', 'proxy'])));
      },
    );
  }

  it.effect(
    'refuses a file whose extension the library cannot keep, before anything is written',
    () => {
      const files = new Map([
        ['/in/take.m_v', text('a phone take')],
        ['/in/take.MOV', text('another phone take')],
      ]);
      return Effect.gen(function* () {
        const library = yield* FootageLibrary;
        const refused = failureOf(
          yield* Effect.exit(library.importFile('/in/take.m_v', asTake('why'))),
        );
        expect(Option.map(refused, (e) => [e._tag, e.message])).toEqual(
          Option.some([
            'FootageExtInvalid',
            '/in/take.m_v ends ".m_v", which is no extension the library keeps (a dot, then lower-case letters and digits); rename it and import it again',
          ]),
        );
        expect([...files.keys()].toSorted()).toEqual(['/in/take.MOV', '/in/take.m_v']);
        // A capital is lowered, as the library keeps it.
        const { entry } = yield* library.importFile('/in/take.MOV', asTake('why'));
        expect(entry.ext).toBe('.mov');
      }).pipe(Effect.provide(world(files, emptyCalls(), [])));
    },
  );

  it.effect(
    "knows a name only as the lock's own: `constructor`, a name every object answers to, is unknown, and never imported (a Segment never is one)",
    () => {
      const files = new Map([
        ['/in/take.mov', text('a phone take')],
        ['/in/other.mov', text('another phone take')],
      ]);
      return Effect.gen(function* () {
        const library = yield* FootageLibrary;
        yield* library.importFile('/in/take.mov', asTake('why'));
        const tagOf = (exit: Exit.Exit<unknown, { readonly _tag: string }>) =>
          Option.map(failureOf(exit), (e) => e._tag);
        expect(tagOf(yield* Effect.exit(library.entry('constructor')))).toEqual(
          Option.some('FootageUnknown'),
        );
        expect(
          tagOf(yield* Effect.exit(library.make('constructor', { hearAgain: false }))),
        ).toEqual(Option.some('FootageUnknown'));
        expect(
          tagOf(yield* Effect.exit(library.importFile('/in/other.mov', asTake('constructor')))),
        ).toEqual(Option.some('FootageNameInvalid'));
      }).pipe(Effect.provide(world(files, emptyCalls(), [])));
    },
  );

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
