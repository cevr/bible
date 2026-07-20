import { Console, Effect, Option, Path } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { AppleScript } from '../../services/apple-script.js';
import { CliProcess } from '../../services/process.js';
import { asText, basename, findDocAS, findSlideByCaptionAS, isPathDeck } from './apple-script.js';

const insertDeck = Argument.string('deck').pipe(
  Argument.withDescription('Open document name substring OR a .key path'),
);
const insertAfter = Argument.string('after').pipe(
  Argument.withDescription('Caption substring of the slide to insert AFTER'),
);
const insertImage = Argument.string('image').pipe(
  Argument.withDescription('Image: absolute path, or relative to CWD/--image-dir'),
);
const insertCaption = Flag.string('caption').pipe(
  Flag.withDescription('On-slide caption for the new slide'),
  Flag.withDefault(''),
);
const insertNote = Flag.string('note').pipe(
  Flag.withDescription('Presenter note for the new slide'),
  Flag.withDefault(''),
);
const insertImageDir = Flag.string('image-dir').pipe(
  Flag.withDescription('Resolve <image> relative to this dir instead of CWD'),
  Flag.optional,
);
const insertMaster = Flag.string('master').pipe(
  Flag.withDescription('Master slide for the new slide'),
  Flag.withDefault('Blank'),
);

export const slidesInsert = Command.make(
  'insert',
  {
    deck: insertDeck,
    after: insertAfter,
    image: insertImage,
    caption: insertCaption,
    note: insertNote,
    imageDir: insertImageDir,
    master: insertMaster,
  },
  (args) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const svc = yield* AppleScript;
      const cliProcess = yield* CliProcess;

      const baseDir = Option.getOrElse(args.imageDir, () => process.cwd());
      let imgPath = path.resolve(baseDir, args.image);
      if (path.isAbsolute(args.image)) imgPath = args.image;

      const deckIsPath = isPathDeck(args.deck);
      let deckResolved = args.deck;
      if (deckIsPath) deckResolved = path.resolve(args.deck);

      let captionLine = '';
      if (args.caption) {
        captionLine = `\t\t\tmake new text item with properties {object text:${asText(args.caption)}, position:{160, 870}, width:1600, height:150}\n`;
      }
      let noteLine = '';
      if (args.note) noteLine = `\t\tset presenter notes of newSlide to ${asText(args.note)}\n`;

      const script = `tell application "System Events"
\tif not (exists disk item ${asText(imgPath)}) then return "ERROR: image not found — " & ${asText(imgPath)}
end tell
tell application "Keynote"
\tactivate
${findDocAS(deckIsPath, deckResolved)}
\ttell theDoc
${findSlideByCaptionAS(asText(args.after), 'hitIdx')}
\t\tif hitIdx = 0 then return "ERROR: no slide caption contains — " & ${asText(args.after)}
\t\tset newSlide to make new slide at after slide hitIdx with properties {base slide:(master slide ${asText(args.master)} of theDoc)}
\t\ttell newSlide
\t\t\tmake new image with properties {file:(POSIX file ${asText(imgPath)}), position:{0, 0}, width:1920, height:1080}
${captionLine}\t\tend tell
${noteLine}\tend tell
\tsave theDoc
\treturn "INSERTED after slide " & hitIdx & " <- " & ${asText(basename(imgPath))}
end tell`;

      const out = (yield* svc.exec(script)).trim();
      if (out.startsWith('ERROR')) {
        yield* Console.error(out);
        return yield* cliProcess.exitFailure;
      }
      yield* Console.log(out);
    }),
);
