// `film script <film> --sheet`: the reading sheet (core/sheet.ts) written to
// `out/<film>/script-sheet.md` and a page to print beside it. The beats come
// from the film's script when it has one (`script.ts`, with its sources) and
// from its scenes when not; quotations are attributed from the film's
// `quotes.jsonl`, each line decoded, when it has one.

import { Effect, FileSystem, Option, Path, Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import {
  type Quote,
  type ScriptLine,
  sheetBeats,
  sheetHtml,
  sheetMarkdown,
} from '../core/sheet.ts';
import { FileInvalid } from './errors.ts';
import type { LoadedFilm } from './film-repo.ts';

/** One line of `quotes.jsonl`: the fields the sheet reads. */
const QuoteLine = Schema.fromJsonString(
  Schema.Struct({ ref: Schema.String, author: Schema.String, text: Schema.String }),
);

/** The film's verified quotations, none when it keeps no `quotes.jsonl`. */
export const quotesOf = Effect.fn('ScriptSheet.quotes')(function* (film: LoadedFilm) {
  const fs = yield* FileSystem.FileSystem;
  const file = (yield* Path.Path).join(film.paths.dir, 'quotes.jsonl');
  if (!(yield* fs.exists(file))) return [];
  const lines = (yield* fs.readFileString(file)).split('\n').filter((l) => l.trim().length > 0);
  return yield* Effect.forEach(lines, (line, i): Effect.Effect<Quote, FileInvalid> =>
    Schema.decodeEffect(QuoteLine)(line).pipe(
      Effect.mapError((error) =>
        FileInvalid.make({ file, reason: `line ${i + 1}: ${error.message}` }),
      ),
    ),
  );
});

/** Where the sheet was written, and how many beats it has. */
export interface SheetWritten {
  readonly markdown: string;
  readonly html: string;
  readonly beats: number;
}

/** Write the film's reading sheet: from `script` when the film has one, else its scenes. */
export const writeSheet = Effect.fn('ScriptSheet.write')(function* (
  film: LoadedFilm,
  script: Option.Option<ReadonlyArray<ScriptLine>>,
): Effect.fn.Return<SheetWritten, FileInvalid | PlatformError, FileSystem.FileSystem | Path.Path> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const lines = Option.getOrElse(script, () =>
    film.scenes.map((scene): ScriptLine => ({ ...scene, cite: [] })),
  );
  const beats = sheetBeats(lines, yield* quotesOf(film));
  const written: SheetWritten = {
    markdown: path.join(film.paths.out, 'script-sheet.md'),
    html: path.join(film.paths.out, 'script-sheet.html'),
    beats: beats.length,
  };
  yield* fs.makeDirectory(film.paths.out, { recursive: true });
  yield* fs.writeFileString(written.markdown, sheetMarkdown(film.paths.name, beats));
  yield* fs.writeFileString(written.html, sheetHtml(film.paths.name, beats));
  yield* Effect.log(`script.sheet film=${film.paths.name} beats=${beats.length}`);
  return written;
});
