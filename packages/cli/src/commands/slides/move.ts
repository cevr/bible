import { Console, Effect, Path } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { AppleScript } from '../../services/apple-script.js';
import { asText, findDocAS, findSlideByCaptionAS, isPathDeck } from './apple-script.js';

const moveDeck = Argument.string('deck').pipe(
  Argument.withDescription('Open document name substring OR a .key path'),
);
const moveCaption = Argument.string('caption').pipe(
  Argument.withDescription('Caption substring of the slide to MOVE'),
);
const moveAnchor = Argument.string('anchor').pipe(
  Argument.withDescription('Caption substring of the slide to move it relative to'),
);
const moveBefore = Flag.boolean('before').pipe(
  Flag.withDescription('Place the moved slide BEFORE the anchor (default: after)'),
  Flag.withDefault(false),
);

export const slidesMove = Command.make(
  'move',
  { deck: moveDeck, caption: moveCaption, anchor: moveAnchor, before: moveBefore },
  (args) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const svc = yield* AppleScript;

      const deckIsPath = isPathDeck(args.deck);
      const deckResolved = deckIsPath ? path.resolve(args.deck) : args.deck;
      const rel = args.before ? 'before' : 'after';

      const script = `tell application "Keynote"
\tactivate
${findDocAS(deckIsPath, deckResolved)}
\ttell theDoc
${findSlideByCaptionAS(asText(args.caption), 'fromIdx')}
\t\tif fromIdx = 0 then return "ERROR: no slide caption contains — " & ${asText(args.caption)}
${findSlideByCaptionAS(asText(args.anchor), 'anchorIdx')}
\t\tif anchorIdx = 0 then return "ERROR: no anchor caption contains — " & ${asText(args.anchor)}
\t\tif fromIdx = anchorIdx then return "ERROR: move source and anchor are the same slide"
\t\tmove slide fromIdx to ${rel} slide anchorIdx
\tend tell
\tsave theDoc
\treturn "MOVED slide from " & fromIdx & " to ${rel} " & anchorIdx
end tell`;

      const out = (yield* svc.exec(script)).trim();
      if (out.startsWith('ERROR')) {
        yield* Console.error(out);
        return yield* Effect.sync(() => process.exit(1));
      }
      yield* Console.log(out);
    }),
);
