import { Console, Effect, FileSystem, Path, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { AppleScript } from '../../services/apple-script.js';
import { CliProcess } from '../../services/process.js';
import { asText, basename } from './apple-script.js';

const Beat = Schema.Struct({
  id: Schema.optional(Schema.String),
  section: Schema.optional(Schema.String),
  line: Schema.String,
  scene: Schema.optional(Schema.String),
  note: Schema.optional(Schema.String),
  image: Schema.optional(Schema.NullOr(Schema.String)),
  subject: Schema.optional(Schema.NullOr(Schema.String)),
});

const BeatSheet = Schema.Struct({
  deck: Schema.optional(Schema.String),
  beats: Schema.Array(Beat),
});

const decodeBeatSheet = Schema.decodeUnknownEffect(Schema.fromJsonString(BeatSheet));
interface BuildRecord {
  line: string;
  note: string;
  imgPath: string;
  hasImg: boolean;
  file: string;
}

const buildBeatSheet = Argument.file('beat-sheet', { mustExist: true }).pipe(
  Argument.withDescription(
    "beat-sheet.json — { deck, beats:[{ line, image, scene, note? }] }. Image paths resolve relative to this file's directory.",
  ),
);
const buildOut = Flag.string('out').pipe(
  Flag.withDescription(
    'Output .key path (required). A bare name is written as <name>.key next to the beat-sheet.',
  ),
);
const buildTheme = Flag.string('theme').pipe(
  Flag.withDescription('Keynote document theme'),
  Flag.withDefault('Basic Black'),
);
const buildMaster = Flag.string('master').pipe(
  Flag.withDescription('Master slide name per beat'),
  Flag.withDefault('Blank'),
);
const buildOpen = Flag.boolean('open').pipe(
  Flag.withDescription('Leave the deck open in Keynote after build'),
  Flag.withDefault(false),
);

export const slidesBuild = Command.make(
  'build',
  {
    beatSheet: buildBeatSheet,
    out: buildOut,
    theme: buildTheme,
    master: buildMaster,
    open: buildOpen,
  },
  (args) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const svc = yield* AppleScript;
      const cliProcess = yield* CliProcess;

      const sheetPath = path.resolve(args.beatSheet);
      const raw = yield* fs.readFileString(sheetPath);

      const sheet = yield* decodeBeatSheet(raw).pipe(
        Effect.catch((error) =>
          Effect.gen(function* () {
            yield* Console.error(`Could not parse beat-sheet JSON: ${String(error)}`);
            return yield* cliProcess.exitFailure;
          }),
        ),
      );

      if (!Array.isArray(sheet.beats) || sheet.beats.length === 0) {
        yield* Console.error('beat-sheet has no beats.');
        return yield* cliProcess.exitFailure;
      }

      const dir = path.dirname(sheetPath);

      const records: BuildRecord[] = [];
      let missing = 0;
      let noteless = 0;
      for (const b of sheet.beats) {
        let file = '';
        if (typeof b.image === 'string') file = b.image;
        const isNew = file === '' || file.toUpperCase() === 'NEW';
        let abs = '';
        if (!isNew) abs = path.resolve(dir, file);
        let exists = false;
        if (abs !== '') exists = yield* fs.exists(abs);
        if (!exists) missing++;
        const note = b.note ?? '';
        if ((b.note ?? '') === '') noteless++;
        let imgPath = '';
        if (exists) imgPath = abs;
        records.push({
          line: b.line ?? '',
          note,
          imgPath,
          hasImg: exists,
          file: file || '(none)',
        });
      }

      let outPath = path.resolve(dir, args.out + '.key');
      if (args.out.endsWith('.key')) outPath = path.resolve(args.out);

      yield* fs
        .makeDirectory(path.dirname(outPath), { recursive: true })
        .pipe(Effect.catch(() => Effect.void));

      const beatList = records
        .map(
          (r) =>
            `{imgPath:${asText(r.imgPath)}, hasImg:${r.hasImg}, theLine:${asText(r.line)}, theNote:${asText(r.note)}, theFile:${asText(r.file)}}`,
        )
        .join(', ¬\n\t\t');

      // When !open, close the just-saved deck by basename after the build so we
      // don't leave it open. (The Untitled sweep can't catch it — Keynote renames
      // the doc in place on save-as.)
      let closeNamed = `\tclose (every document whose name is ${asText(basename(outPath))}) saving no\n`;
      if (args.open) closeNamed = '';

      const script = `tell application "Keynote"
\tactivate
\tset theDoc to make new document with properties {document theme:theme ${asText(args.theme)}, width:1920, height:1080}
\tset beats to {${beatList}}
\ttell theDoc
\t\tset isFirst to true
\t\trepeat with b in beats
\t\t\tif isFirst then
\t\t\t\tset theSlide to slide 1
\t\t\t\tset base slide of theSlide to master slide ${asText(args.master)}
\t\t\t\tset isFirst to false
\t\t\telse
\t\t\t\tset theSlide to make new slide at end with properties {base slide:master slide ${asText(args.master)}}
\t\t\tend if
\t\t\tset imgP to imgPath of b
\t\t\tset showImg to (hasImg of b)
\t\t\tif showImg then
\t\t\t\ttell application "System Events" to set showImg to (exists disk item imgP)
\t\t\tend if
\t\t\ttell theSlide
\t\t\t\tif showImg then
\t\t\t\t\tmake new image with properties {file:(POSIX file imgP), position:{0, 0}, width:1920, height:1080}
\t\t\t\telse
\t\t\t\t\tmake new text item with properties {object text:("[MISSING IMAGE: " & (theFile of b) & "]"), position:{160, 480}, width:1600, height:120}
\t\t\t\tend if
\t\t\t\tmake new text item with properties {object text:(theLine of b), position:{160, 870}, width:1600, height:150}
\t\t\t\tset presenter notes to (theNote of b)
\t\t\tend tell
\t\tend repeat
\tend tell
\tset slideCount to (count of slides of theDoc)
\tsave theDoc in POSIX file ${asText(outPath)}
\trepeat with d in (every document whose name starts with "Untitled")
\t\tclose d saving no
\tend repeat
${closeNamed}\treturn "BUILD DONE — slides: " & slideCount
end tell`;

      const out = (yield* svc.exec(script)).trim();
      yield* Console.log(out);
      yield* Console.log(`  beats: ${records.length}, missing-image markers: ${missing}`);
      if (missing > 0) {
        yield* Console.error(
          `  WARNING: ${missing} slide(s) rendered a [MISSING IMAGE] marker (image was "NEW" or not found).`,
        );
      }
      if (noteless > 0) {
        yield* Console.error(
          `  NOTE: ${noteless} beat(s) had no "note" field — presenter notes left blank. The beat-sheet's "scene" is a label, not narration; add a "note" field per beat for speaker notes.`,
        );
      }
    }),
);
