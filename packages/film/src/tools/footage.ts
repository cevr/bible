// The footage library as the tools see it (`core/footage.ts`): an app's
// `footage/` folder, shared by its talks. `import` keeps an original whole,
// by the hash of its bytes, under the name it is given, once it is probed
// and found one the render can conform; importing the same bytes again
// answers the name they already have and does nothing (an original is never
// overwritten: a second recording is a second name). `make` derives each
// original's copies, rebuilt only when their recipe changes, under
// `<FILMS_OUT>/footage/<name>/<sha12>/` (never committed, never pushed, made
// again whenever it is wanted): the mezzanine and the proxy (`FootageMedia`),
// and a take's voice, levelled by one gain and never trimmed, so its every
// moment stays where the picture has it. A take is heard once
// (`ElevenLabs.stt`, the one paid call): its words, each voiced, and its
// loudness every 10 ms are its transcript, a file of its own under
// `transcripts/`, pinned to its original. A second hearing is a second file,
// and the lock names which one is current: a transcript is never rewritten.
// A hearing's file is numbered, written whole and named in the lock while
// the lock is held, so two hearings at once keep two files. A name is a
// footage name (`FootageName`), checked before anything is written.
// `push` and `pull` keep the originals in the private store
// (`footage/<name>/<sha12><ext>`), each read back by its hash.

import { Console, Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { gain } from '../core/audio.ts';
import {
  FOOTAGE_COPIES,
  FOOTAGE_RECIPES,
  type FootageCopy,
  type FootageEntry,
  type FootageKind,
  type FootageLock,
  FootageName,
  type FootageStamp,
  FootageStampJson,
  FootageTranscriptJson,
  VOICE_RECIPE,
  derivedFile,
  envelopeOf,
  originalKey,
  originalPath,
  recipeKey,
  sourceOf,
  transcriptFile,
} from '../core/footage.ts';
import { MIX_RATE } from '../core/mix.ts';
import { takeLift } from '../core/recording.ts';
import type { ElevenLabsFailed, MediaFailed, SttUntimed } from '../core/refusals.ts';
import { voicedWords } from '../core/voiced.ts';
import { ContentStore, type StoreError, writeWhole } from './content-store.ts';
import { sha256OfFile } from './digest.ts';
import { ElevenLabs, heardWords } from './elevenlabs.ts';
import {
  FootageHdr,
  FootageNameInvalid,
  FootageNameTaken,
  FootageOriginalMissing,
  FootageSilent,
  FootageUnknown,
  StoreCopyFailed,
  StoreKeyTaken,
} from './errors.ts';
import { filmsOut, footageLockManifest } from './film-repo.ts';
import { FootageMedia } from './footage-media.ts';
import { Media } from './media.ts';
import { PrivateStore, type StoreUnavailable } from './private-store.ts';
import type { StoreFailed } from './errors.ts';

/** How an original is imported: its name, whether it is a take, and a clip's terms. */
interface FootageImport {
  readonly name: string;
  readonly kind: FootageKind;
  readonly licence: Option.Option<string>;
  readonly credit: Option.Option<string>;
  readonly source: Option.Option<string>;
  readonly tags: ReadonlyArray<string>;
}

/** What an import did: the name the bytes have, and whether they were new. */
interface FootageImported {
  readonly name: string;
  readonly entry: FootageEntry;
  readonly fresh: boolean;
}

/** Where one name's files are: its original, and what `make` derives from it. */
interface FootageFiles {
  readonly original: string;
  readonly dir: string;
  readonly mezzanine: string;
  readonly proxy: string;
  readonly voice: string;
  readonly stamp: string;
}

/** What a `make` did for a name: each part made afresh, or found current. */
interface FootageMade {
  readonly name: string;
  readonly made: ReadonlyArray<'mezzanine' | 'proxy' | 'voice' | 'transcript'>;
  readonly transcript: Option.Option<string>;
}

/** What a `push` or `pull` did with one original. */
interface FootageSynced {
  readonly name: string;
  readonly key: string;
  readonly did: 'sent' | 'had' | 'pulled' | 'absent';
}

/** Why an import fails. */
type FootageImportError =
  | FootageNameInvalid
  | FootageHdr
  | FootageSilent
  | FootageNameTaken
  | MediaFailed
  | StoreError
  | PlatformError;

/** Why a make fails. */
type FootageMakeError =
  | FootageUnknown
  | FootageOriginalMissing
  | MediaFailed
  | ElevenLabsFailed
  | SttUntimed
  | StoreError
  | PlatformError
  | Schema.SchemaError;

/** Why a push or pull fails. */
type FootageSyncError =
  | StoreUnavailable
  | StoreFailed
  | StoreKeyTaken
  | StoreCopyFailed
  | StoreError
  | PlatformError;

interface FootageLibraryService {
  /** The library's folder. */
  readonly dir: string;
  /** The lock as it stands. */
  readonly lock: Effect.Effect<FootageLock, StoreError>;
  /** One name's entry, or why there is none. */
  readonly entry: (name: string) => Effect.Effect<FootageEntry, FootageUnknown | StoreError>;
  /** Where one name's files are. */
  readonly files: (name: string, entry: FootageEntry) => Effect.Effect<FootageFiles>;
  /** The original at `file` kept under `options.name` (above). */
  readonly importFile: (
    file: string,
    options: FootageImport,
  ) => Effect.Effect<FootageImported, FootageImportError>;
  /** `name`'s copies and voice made where stale, and a take heard if it has no transcript (or `hearAgain`). */
  readonly make: (
    name: string,
    options: { readonly hearAgain: boolean },
  ) => Effect.Effect<FootageMade, FootageMakeError>;
  /** Every original on this machine sent to the private store, unless it holds them. */
  readonly push: Effect.Effect<ReadonlyArray<FootageSynced>, FootageSyncError>;
  /** Every original the lock names brought from the private store, unless it is here. */
  readonly pull: Effect.Effect<ReadonlyArray<FootageSynced>, FootageSyncError>;
}

/** A sound's codec that keeps every sample: anything else has already lost what it drops. */
const LOSSLESS = /^(pcm-|flac$|alac$)/;

/** `entry`'s terms, as the import gave them: only those given are kept. */
const termsOf = (options: FootageImport) => ({
  ...Option.match(options.licence, { onNone: () => ({}), onSome: (licence) => ({ licence }) }),
  ...Option.match(options.credit, { onNone: () => ({}), onSome: (credit) => ({ credit }) }),
  ...Option.match(options.source, { onNone: () => ({}), onSome: (source) => ({ source }) }),
  ...Option.match(
    Option.liftPredicate(options.tags, (tags) => tags.length > 0),
    {
      onNone: () => ({}),
      onSome: (tags) => ({ tags }),
    },
  ),
});

/** The name the lock gives bytes of `sha256`, if it gives them one. */
const nameOf = (lock: FootageLock, sha256: string): Option.Option<string> =>
  Option.map(
    Option.fromUndefinedOr(
      Object.entries(lock.footage).find(([, entry]) => entry.sha256 === sha256),
    ),
    ([name]) => name,
  );

export class FootageLibrary extends Context.Service<FootageLibrary, FootageLibraryService>()(
  '@bible/film/tools/FootageLibrary',
) {
  /** The library in `dir`. */
  static readonly layer = (dir: string) =>
    Layer.effect(
      FootageLibrary,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* ContentStore;
        const media = yield* Media;
        const footageMedia = yield* FootageMedia;
        const elevenLabs = yield* ElevenLabs;
        const privateStore = yield* PrivateStore;
        const manifest = footageLockManifest(dir);
        const lock = store.read(manifest);

        const entry = (name: string) =>
          Effect.flatMap(lock, (current) =>
            Effect.fromOption(Option.fromUndefinedOr(current.footage[name]), () =>
              FootageUnknown.make({ name, known: Object.keys(current.footage).toSorted() }),
            ),
          );

        const outputs = yield* Effect.orDie(filmsOut);
        const files = (name: string, of: FootageEntry) =>
          Effect.sync((): FootageFiles => ({
            original: path.join(dir, 'files', originalPath(name, of)),
            dir: path.dirname(derivedFile(outputs, name, of.sha256, 'stamp.json')),
            mezzanine: derivedFile(outputs, name, of.sha256, 'mezzanine.mp4'),
            proxy: derivedFile(outputs, name, of.sha256, 'proxy.mp4'),
            voice: derivedFile(outputs, name, of.sha256, 'voice.flac'),
            stamp: derivedFile(outputs, name, of.sha256, 'stamp.json'),
          }));

        const importFile = Effect.fn('FootageLibrary.import')(function* (
          file: string,
          options: FootageImport,
        ) {
          // The name first, before anything is read or written: a footage name, or nothing is kept.
          yield* Schema.decodeEffect(FootageName)(options.name).pipe(
            Effect.mapError((error) =>
              FootageNameInvalid.make({ name: options.name, file, reason: error.message }),
            ),
          );
          const sha256 = yield* sha256OfFile(fs, file);
          const before = yield* lock;
          // The same bytes again: the name they have, and nothing done.
          const had = nameOf(before, sha256);
          if (Option.isSome(had)) {
            const kept = yield* entry(had.value).pipe(Effect.orDie);
            yield* Effect.log(`footage.import.had name=${had.value} file=${file}`);
            return { name: had.value, entry: kept, fresh: false };
          }
          if (Object.hasOwn(before.footage, options.name))
            return yield* FootageNameTaken.make({ name: options.name, file });
          const { probe, hdr } = yield* footageMedia.probe(file);
          if (hdr) return yield* FootageHdr.make({ file });
          const sound = Option.fromUndefinedOr(probe.sound);
          if (options.kind === 'take' && Option.isNone(sound))
            return yield* FootageSilent.make({ file });
          const lossy = Option.filter(sound, (heard) => !LOSSLESS.test(heard.codec));
          if (options.kind === 'take' && Option.isSome(lossy))
            yield* Effect.logWarning(
              `footage.lossy file=${file} (its sound is ${lossy.value.codec}: the voice is lossless from here, but this recording already lost what its codec drops; a lav recorded to WAV beside the camera keeps it whole)`,
            );
          const bytes = Number((yield* fs.stat(file)).size);
          const made: FootageEntry = {
            kind: options.kind,
            sha256,
            bytes,
            ext: path.extname(file).toLowerCase(),
            probe,
            ...termsOf(options),
          };
          const kept = yield* files(options.name, made);
          yield* fs.makeDirectory(path.dirname(kept.original), { recursive: true });
          yield* writeWhole(fs, kept.original, (partial) => fs.copyFile(file, partial));
          // Named under the lock: a name taken meanwhile is refused, the original kept by its hash.
          yield* store.transact(manifest, (current) => {
            if (Object.hasOwn(current.footage, options.name))
              return Effect.fail(FootageNameTaken.make({ name: options.name, file }));
            return Effect.succeed([
              options.name,
              { ...current, footage: { ...current.footage, [options.name]: made } },
            ] as const);
          });
          yield* Effect.log(
            `footage.import.kept name=${options.name} sha=${sha256.slice(0, 12)} kind=${options.kind}`,
          );
          return { name: options.name, entry: made, fresh: true };
        });

        /** The stamp of what was made for a name: nothing, before anything was. */
        const stampOf = (file: string) =>
          Effect.gen(function* () {
            if (!(yield* fs.exists(file))) return {};
            return yield* Schema.decodeEffect(FootageStampJson)(yield* fs.readFileString(file));
          });

        const writeStamp = (file: string, stamp: FootageStamp) =>
          Effect.flatMap(Schema.encodeEffect(FootageStampJson)(stamp), (text) =>
            store.writeFile(file, new TextEncoder().encode(text)),
          );

        /** The first hearing number with no transcript file yet. */
        const nextHearing = (name: string, sha256: string) =>
          Effect.gen(function* () {
            let hearing = 1;
            while (
              yield* fs.exists(path.join(dir, 'transcripts', transcriptFile(name, sha256, hearing)))
            )
              hearing += 1;
            return hearing;
          });

        const make = Effect.fn('FootageLibrary.make')(function* (
          name: string,
          options: { readonly hearAgain: boolean },
        ) {
          const of = yield* entry(name);
          const at = yield* files(name, of);
          if (!(yield* fs.exists(at.original)))
            return yield* FootageOriginalMissing.make({ name, file: at.original });
          yield* fs.makeDirectory(at.dir, { recursive: true });
          let stamp: FootageStamp = yield* stampOf(at.stamp);
          const made: Array<FootageMade['made'][number]> = [];
          for (const copy of FOOTAGE_COPIES) {
            const recipe = recipeKey(FOOTAGE_RECIPES[copy]);
            const out: Record<FootageCopy, string> = { mezzanine: at.mezzanine, proxy: at.proxy };
            if (stamp[copy] === recipe && (yield* fs.exists(out[copy]))) continue;
            yield* footageMedia.copy(at.original, of.probe.picture, copy, out[copy]);
            stamp = { ...stamp, [copy]: recipe };
            yield* writeStamp(at.stamp, stamp);
            made.push(copy);
            yield* Effect.log(`footage.make.copy name=${name} copy=${copy}`);
          }
          if (of.kind === 'clip') return { name, made, transcript: Option.none() };
          // The voice: levelled by one gain, never trimmed, on the picture's clock.
          const current = stamp.voice === VOICE_RECIPE && (yield* fs.exists(at.voice));
          let voice = yield* media
            .load(at.voice, MIX_RATE)
            .pipe(Effect.when(Effect.succeed(current)));
          if (Option.isNone(voice)) {
            const heard = yield* footageMedia.voice(at.original, of.probe.picture, MIX_RATE);
            const levelled = gain(heard, takeLift(heard));
            yield* store.writeFile(at.voice, yield* media.encodeFlac(levelled));
            stamp = { ...stamp, voice: VOICE_RECIPE };
            yield* writeStamp(at.stamp, stamp);
            made.push('voice');
            yield* Effect.log(
              `footage.make.voice name=${name} seconds=${(levelled.frames / levelled.rate).toFixed(2)}`,
            );
            voice = Option.some(levelled);
          }
          // The lock as it is now, not as it was before the copies were made: a
          // transcript another run named meanwhile is not heard again.
          const transcript = Option.filter(
            Option.fromUndefinedOr((yield* entry(name)).transcript),
            () => !options.hearAgain,
          );
          if (Option.isSome(transcript)) return { name, made, transcript };
          const levelled = Option.getOrThrow(voice);
          // Heard once (the one paid call), into a file of its own.
          const reply = yield* elevenLabs.stt(at.voice);
          const words = yield* Effect.fromResult(heardWords(reply, at.voice));
          const text = new TextEncoder().encode(
            yield* Schema.encodeEffect(FootageTranscriptJson)({
              source: sourceOf(name, of.sha256),
              text: reply.text,
              words: voicedWords(words, levelled),
              envelope: envelopeOf(levelled),
            }),
          );
          // Named, written whole and put in the lock under the lock: two
          // hearings at once take two numbers, and neither lands on the other.
          // A hearing that lands after another run named a transcript keeps its
          // file, and the lock keeps the one it names, unless asked to hear again.
          const [file, named] = yield* store.transact(manifest, (locked) =>
            Effect.gen(function* () {
              const kept = transcriptFile(name, of.sha256, yield* nextHearing(name, of.sha256));
              yield* store.writeFile(path.join(dir, 'transcripts', kept), text);
              const now = Option.fromUndefinedOr(locked.footage[name]);
              const heardMeanwhile = Option.filter(
                Option.flatMap(now, (e) => Option.fromUndefinedOr(e.transcript)),
                () => !options.hearAgain,
              );
              const names = Option.getOrElse(heardMeanwhile, () => kept);
              const next = Option.match(now, {
                onNone: () => locked,
                onSome: (was) => ({
                  ...locked,
                  footage: { ...locked.footage, [name]: { ...was, transcript: names } },
                }),
              });
              return [[kept, names] as const, next] as const;
            }),
          );
          made.push('transcript');
          yield* Effect.log(
            `footage.make.heard name=${name} words=${words.length} file=${file} named=${named}`,
          );
          return { name, made, transcript: Option.some(named) };
        });

        const everyOriginal = Effect.flatMap(lock, (current) =>
          Effect.forEach(Object.entries(current.footage), ([name, of]) =>
            Effect.map(files(name, of), (at) => ({ name, of, at, key: originalKey(name, of) })),
          ),
        );

        const push = Effect.gen(function* () {
          const target = yield* privateStore.store;
          return yield* Effect.forEach(yield* everyOriginal, ({ name, of, at, key }) =>
            Effect.gen(function* () {
              if (!(yield* fs.exists(at.original))) return { name, key, did: 'absent' as const };
              const held = yield* target.hashOf(key);
              if (Option.contains(held, of.sha256)) return { name, key, did: 'had' as const };
              if (Option.isSome(held))
                return yield* StoreKeyTaken.make({ key, file: at.original, store: target.where });
              yield* target.put(key, at.original);
              if (!Option.contains(yield* target.hashOf(key), of.sha256))
                return yield* StoreCopyFailed.make({ file: key, store: target.where });
              yield* Effect.log(`footage.push.sent key=${key}`);
              return { name, key, did: 'sent' as const };
            }),
          );
        });

        const pull = Effect.gen(function* () {
          const target = yield* privateStore.store;
          return yield* Effect.forEach(yield* everyOriginal, ({ name, of, at, key }) =>
            Effect.gen(function* () {
              if (
                (yield* fs.exists(at.original)) &&
                (yield* sha256OfFile(fs, at.original)) === of.sha256
              )
                return { name, key, did: 'had' as const };
              yield* target.get(key, at.original);
              if ((yield* sha256OfFile(fs, at.original)) !== of.sha256)
                return yield* StoreCopyFailed.make({ file: at.original, store: target.where });
              yield* Effect.log(`footage.pull.got key=${key}`);
              return { name, key, did: 'pulled' as const };
            }),
          );
        });

        return FootageLibrary.of({ dir, lock, entry, files, importFile, make, push, pull });
      }),
    );
}

/** A line of `footage list`: a name, what it is, how long, its picture and its transcript. */
export const footageLine = (name: string, of: FootageEntry): string => {
  const { picture } = of.probe;
  const heard = Option.match(Option.fromUndefinedOr(of.transcript), {
    onNone: () => ({ take: 'not heard', clip: '' })[of.kind],
    onSome: (file) => file,
  });
  const rate = `${picture.fps.toFixed(2)}${['', ' vfr'][Number(picture.variable)]}`;
  return [
    name.padEnd(24),
    of.kind.padEnd(5),
    `${of.probe.duration.toFixed(1)}s`.padStart(7),
    `${picture.width}x${picture.height}@${rate}`.padEnd(20),
    heard,
  ].join('  ');
};

/** A sync's lines, one an original: what was done, and its key. */
export const printSynced = (synced: ReadonlyArray<FootageSynced>) =>
  Effect.forEach(synced, (one) => Console.log(`${one.did.padEnd(7)} ${one.key}`), {
    discard: true,
  });
