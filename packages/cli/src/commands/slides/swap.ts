import { Console, Effect, Option, Path } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { AppleScript } from '../../services/apple-script.js';
import { CliProcess } from '../../services/process.js';
import { asText, basename, isPathDeck } from './apple-script.js';

const swapDeck = Argument.string('deck').pipe(
  Argument.withDescription('Open document name substring OR a .key path'),
);
const swapCaption = Argument.string('caption').pipe(
  Argument.withDescription('Unique substring of the target slide caption'),
);
const swapImage = Argument.string('image').pipe(
  Argument.withDescription('New image: absolute path, or relative to CWD/--image-dir'),
);
const swapImageDir = Flag.string('image-dir').pipe(
  Flag.withDescription('Resolve <image> relative to this dir instead of CWD'),
  Flag.optional,
);

export const slidesSwap = Command.make(
  'swap',
  { deck: swapDeck, caption: swapCaption, image: swapImage, imageDir: swapImageDir },
  (args) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const svc = yield* AppleScript;
      const cliProcess = yield* CliProcess;

      const baseDir = Option.getOrElse(args.imageDir, () => process.cwd());
      let imgPath = path.resolve(baseDir, args.image);
      if (path.isAbsolute(args.image)) imgPath = args.image;

      const deckIsPath = isPathDeck(args.deck);
      let deckPath = '';
      if (deckIsPath) deckPath = path.resolve(args.deck);

      let findDoc =
        `\tif (count of (documents whose name contains ${asText(args.deck)})) = 0 then return "ERROR: deck not open — " & ${asText(args.deck)}\n` +
        `\tset theDoc to item 1 of (documents whose name contains ${asText(args.deck)})`;
      if (deckIsPath) {
        findDoc =
          `\topen POSIX file ${asText(deckPath)}\n` +
          `\tif (count of (documents whose name is ${asText(basename(deckPath))})) = 0 then return "ERROR: could not open deck — " & ${asText(deckPath)}\n` +
          `\tset theDoc to first document whose name is ${asText(basename(deckPath))}`;
      }

      const script = `tell application "System Events"
\tif not (exists disk item ${asText(imgPath)}) then return "ERROR: image not found — " & ${asText(imgPath)}
end tell
tell application "Keynote"
\tactivate
${findDoc}
\tset hitIdx to 0
\trepeat with i from 1 to (count of slides of theDoc)
\t\tset s to slide i of theDoc
\t\tset capText to ""
\t\trepeat with t in (text items of s)
\t\t\tset capText to capText & (object text of t)
\t\tend repeat
\t\tif capText contains ${asText(args.caption)} then
\t\t\tset hitIdx to i
\t\t\texit repeat
\t\tend if
\tend repeat
\tif hitIdx = 0 then return "ERROR: no slide caption contains — " & ${asText(args.caption)}
\tset s to slide hitIdx of theDoc
\ttell s
\t\trepeat with k from (count of images of s) to 1 by -1
\t\t\tdelete image k of s
\t\tend repeat
\t\tmake new image with properties {file:(POSIX file ${asText(imgPath)}), position:{0, 0}, width:1920, height:1080}
\tend tell
\tsave theDoc
\treturn "SWAPPED slide " & hitIdx & " <- " & ${asText(basename(imgPath))}
end tell`;

      const out = (yield* svc.exec(script)).trim();
      if (out.startsWith('ERROR')) {
        yield* Console.error(out);
        return yield* cliProcess.exitFailure;
      }
      yield* Console.log(out);
    }),
);
