// The app's series drafts (`series/<series>/scripts/<draft>.md`) as the lab
// reads them beside its films: every series and its drafts, a draft's beats
// read with the reader's codec (`core/draft.ts`), each spoken beat as a take
// is kept against it in the staging voice (`stagingVoice`, so the fill and
// the reader voice a draft as they voice a film), and a beat's delivery
// marks written into the draft's Markdown.
//
// A mark write is the films' (`script-source.ts` through `SourceWriter`) in
// small: the file read, its beat's line marked and not another byte changed
// (`draftMarked`), read back (`draftMissed`), and written only over the very
// text it was made from, under the file's store lock. Nothing formats a
// draft (oxfmt ignores them: Markdown reads two `{*}` on a line as emphasis),
// so a marked table cell widens its row and the columns stand as they were.
// A draft is the owner's text, kept in git: no Undo of the lab's own is kept
// for it.
//
// A name is only ever one the folder lists, so no request reaches a path the
// series do not hold. An app with no series folder lists none.

import {
  Array as Arr,
  Boolean as Bool,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import type { DraftRead, MarksPost, SeriesList } from '../core/api.ts';
import { type Draft, DraftMarkdown, draftMarked, draftMissed, unreadText } from '../core/draft.ts';
import { DraftUnknown, DraftUnread, SourceChanged, SourceRefused } from '../core/refusals.ts';
import type { HeardAs, Voice } from '../core/schema.ts';
import { stagingVoice } from '../core/staging-voice.ts';
import type { ReadBeat } from '../core/studio.ts';
import { ContentStore, type StoreError } from './content-store.ts';
import { WriteUnverified } from './errors.ts';
import { readBeat } from './narrator.ts';

/** Where a series keeps its drafts, under its folder. */
const SCRIPTS = 'scripts';

/** Where a series keeps its plan, whose title names it. */
const PLAN = 'series.md';

/** A draft by its series and its file's name: `theology/01-milk-and-meat`. */
export const draftKey = (series: string, draft: string) => `${series}/${draft}`;

/** A draft as a take is kept against it: the staging voice, no spellings of its own, its spoken beats. */
interface DraftReading {
  readonly voice: Voice;
  readonly heardAs: HeardAs;
  readonly beats: ReadonlyArray<ReadBeat>;
}

/** A Markdown file's title: its first `# ` heading, up to a colon (`# Taught of the Lord: plan`). */
const titleOf = (markdown: string, fallback: string): string =>
  Option.getOrElse(
    Option.map(
      Option.fromNullishOr(/^# (.+)$/m.exec(markdown)),
      ([, heading = '']) => heading.split(':')[0]?.trim() ?? heading,
    ),
    () => fallback,
  );

/** A draft as the reader is answered it: each beat's line, brief and sources, no place in the Markdown. */
export const draftRead = (series: string, draft: string, read: Draft): DraftRead => ({
  series,
  draft,
  title: read.title,
  beats: read.beats.map((b) => ({
    id: b.id,
    label: b.label,
    ...Option.match(b.say, { onNone: () => ({}), onSome: (s) => ({ say: s.text }) }),
    ...Option.match(b.brief, { onNone: () => ({}), onSome: (brief) => ({ brief }) }),
    cite: b.cite,
  })),
});

type DraftError = DraftUnknown | DraftUnread | PlatformError;

interface SeriesDraftsService {
  /** Every series with drafts, and its drafts, in name order. */
  readonly list: Effect.Effect<SeriesList, PlatformError>;
  /** Every draft's key (`draftKey`), in the list's order. */
  readonly keys: Effect.Effect<ReadonlyArray<readonly [string, string]>, PlatformError>;
  /** Draft `draft` of `series`, read as its Markdown stands now. */
  readonly read: (series: string, draft: string) => Effect.Effect<Draft, DraftError>;
  /** Draft `draft` of `series` as a take is kept against it. */
  readonly reading: (series: string, draft: string) => Effect.Effect<DraftReading, DraftError>;
  /** The marks `post` asks for written on its beat, made on the words it read: the draft as the write leaves it. */
  readonly mark: (
    series: string,
    draft: string,
    post: MarksPost,
  ) => Effect.Effect<
    Draft,
    DraftError | SourceRefused | WriteUnverified | SourceChanged | StoreError
  >;
}

export class SeriesDrafts extends Context.Service<SeriesDrafts, SeriesDraftsService>()(
  '@bible/film/tools/SeriesDrafts',
) {
  /** The drafts under `root` (the app's `series` folder); none when the app has no series. */
  static readonly layer = (root: Option.Option<string>) =>
    Layer.effect(
      SeriesDrafts,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* ContentStore;
        const writer = yield* Semaphore.make(1);

        // Only absence reads as nothing: a folder or plan the box cannot read is said, not hidden.
        const entries = (dir: string) =>
          Effect.flatMap(fs.exists(dir), (there) =>
            Bool.match(there, {
              onTrue: () => fs.readDirectory(dir),
              onFalse: () => Effect.succeed<ReadonlyArray<string>>([]),
            }),
          );
        const text = (file: string) =>
          Effect.flatMap(fs.exists(file), (there) =>
            Bool.match(there, {
              onTrue: () => fs.readFileString(file),
              onFalse: () => Effect.succeed(''),
            }),
          );

        const list: Effect.Effect<SeriesList, PlatformError> = Effect.gen(function* () {
          if (Option.isNone(root)) return { series: [] };
          const dir = root.value;
          const series = yield* Effect.forEach(
            (yield* entries(dir)).toSorted(),
            Effect.fn('SeriesDrafts.series')(function* (name) {
              const scripts = path.join(dir, name, SCRIPTS);
              // A file beside the series (`README.md`, `delivery.md`) is no series.
              // A link to nothing is no series either; a folder the box may not read is said.
              const folder = yield* fs.stat(path.join(dir, name)).pipe(
                Effect.map((info): string => info.type),
                Effect.catchIf(
                  (e) => e.reason._tag === 'NotFound',
                  () => Effect.succeed('Missing'),
                ),
              );
              if (folder !== 'Directory') return Option.none();
              const drafts = yield* Effect.forEach(
                (yield* entries(scripts)).filter((f) => f.endsWith('.md')).toSorted(),
                (file) =>
                  Effect.map(text(path.join(scripts, file)), (md) => {
                    const draft = file.slice(0, -'.md'.length);
                    return { name: draft, title: titleOf(md, draft) };
                  }),
              );
              const title = titleOf(yield* text(path.join(dir, name, PLAN)), name);
              return Option.some({ name, title, drafts });
            }),
          );
          return { series: Arr.getSomes(series).filter((s) => s.drafts.length > 0) };
        });

        const keys = Effect.map(list, (l) =>
          l.series.flatMap((s) => s.drafts.map((d) => [s.name, d.name] as const)),
        );

        /** The file of a draft the folder lists: never a path it does not hold. */
        const fileOf = Effect.fn('SeriesDrafts.fileOf')(function* (series: string, draft: string) {
          const known = yield* keys;
          const listed = known.some(([s, d]) => s === series && d === draft);
          if (!listed || Option.isNone(root))
            return yield* DraftUnknown.make({
              series,
              draft,
              known: known.map(([s, d]) => draftKey(s, d)),
            });
          return path.join(root.value, series, SCRIPTS, `${draft}.md`);
        });

        /** A draft's Markdown decoded with the reader's codec, or why it does not read. */
        const readText = (series: string, draft: string, markdown: string) =>
          Effect.mapError(Schema.decodeEffect(DraftMarkdown)(markdown), (e) =>
            DraftUnread.make({ draft: draftKey(series, draft), reason: e.message }),
          );

        const read = Effect.fn('SeriesDrafts.read')(function* (series: string, draft: string) {
          const file = yield* fileOf(series, draft);
          return yield* readText(series, draft, yield* fs.readFileString(file));
        });

        const reading = Effect.fn('SeriesDrafts.reading')(function* (
          series: string,
          draft: string,
        ) {
          const read_ = yield* read(series, draft);
          const voice: Voice = stagingVoice;
          const beats = yield* Effect.forEach(
            read_.beats.flatMap((b) =>
              Option.toArray(Option.map(b.say, (s) => [b.id, s.text] as const)),
            ),
            ([id, say]) =>
              Effect.mapError(Effect.fromResult(readBeat(voice, id, say)), (e) =>
                DraftUnread.make({ draft: draftKey(series, draft), reason: e.message }),
              ),
          );
          return { voice, heardAs: {}, beats } satisfies DraftReading;
        });

        const mark = Effect.fn('SeriesDrafts.mark')(
          (series: string, draft: string, { beat, marks, spoken }: MarksPost) =>
            writer.withPermits(1)(
              Effect.gen(function* () {
                const file = yield* fileOf(series, draft);
                const shown = path.join(series, SCRIPTS, `${draft}.md`);
                const target = `marks:${beat}`;
                const before = yield* fs.readFileString(file);
                const after = yield* Effect.mapError(
                  Effect.fromResult(draftMarked(before, beat, marks, spoken)),
                  (u) => SourceRefused.make({ file: shown, target, reason: unreadText(u) }),
                );
                const missed = draftMissed(after, before, beat, marks);
                if (missed.length > 0)
                  return yield* WriteUnverified.make({
                    file: shown,
                    target,
                    reason: missed.join(', '),
                  });
                if (after !== before) {
                  // Only over the very text the edit was made from: a save in an editor since wins.
                  yield* store.modify({ file, codec: Schema.String, empty: '' }, (now) =>
                    Bool.match(now === before, {
                      onTrue: () => Result.succeed(after),
                      onFalse: () => Result.fail(SourceChanged.make({ file: shown, target })),
                    }),
                  );
                  yield* Effect.log(
                    `lab.write draft=${draftKey(series, draft)} target="${target}"`,
                  );
                }
                return yield* readText(series, draft, after);
              }),
            ),
        );

        return SeriesDrafts.of({ list, keys, read, reading, mark });
      }),
    );
}
