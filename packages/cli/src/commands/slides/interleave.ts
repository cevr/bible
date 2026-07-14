import { Console, Effect, FileSystem, Path } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { AppleScript } from '../../services/apple-script.js';
import { asText, basename, isPathDeck } from './apple-script.js';

interface VerseSlide {
  readonly after: string; // caption substring of the scene to insert AFTER
  readonly ref: string; // e.g. "Psalm 85:10"
  readonly text: string; // full verse text
}

const interleaveDeck = Argument.string('deck').pipe(
  Argument.withDescription('Open document name substring OR a .key path'),
);
const interleaveVerses = Argument.file('verses', { mustExist: true }).pipe(
  Argument.withDescription('JSON: [{ after: <caption substring>, ref, text }]'),
);
const interleaveMaster = Flag.string('master').pipe(
  Flag.withDescription('Master slide for the inserted text slides (must be black)'),
  Flag.withDefault('Blank'),
);

export const slidesInterleave = Command.make(
  'interleave',
  { deck: interleaveDeck, verses: interleaveVerses, master: interleaveMaster },
  (args) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const svc = yield* AppleScript;

      const raw = yield* fs.readFileString(path.resolve(args.verses));
      let verses: VerseSlide[];
      try {
        verses = JSON.parse(raw) as VerseSlide[];
      } catch (e) {
        yield* Console.error(`Could not parse verses JSON: ${String(e)}`);
        return yield* Effect.sync(() => process.exit(1));
      }
      if (!Array.isArray(verses) || verses.length === 0) {
        yield* Console.error('verses file has no entries.');
        return yield* Effect.sync(() => process.exit(1));
      }

      const deckIsPath = isPathDeck(args.deck);
      const deckPath = deckIsPath ? path.resolve(args.deck) : '';
      const findDoc = deckIsPath
        ? `\topen POSIX file ${asText(deckPath)}\n` +
          `\tif (count of (documents whose name is ${asText(basename(deckPath))})) = 0 then return "ERROR: could not open deck — " & ${asText(deckPath)}\n` +
          `\tset theDoc to first document whose name is ${asText(basename(deckPath))}`
        : `\tif (count of (documents whose name contains ${asText(args.deck)})) = 0 then return "ERROR: deck not open — " & ${asText(args.deck)}\n` +
          `\tset theDoc to item 1 of (documents whose name contains ${asText(args.deck)})`;

      // Build the AppleScript `verses` list. Each entry carries the match
      // substring, the verse text, and the reference. The script resolves the
      // target index for each at run time and inserts bottom-up so earlier
      // insertions never shift a later target's index.
      const verseList = verses
        .map(
          (v) =>
            `{matchText:${asText(v.after)}, verseText:${asText(v.text)}, refText:${asText(v.ref.toUpperCase())}}`,
        )
        .join(', ¬\n\t\t');

      // White verse + dimmed-grey reference on the (black) Blank master.
      // Geometry: verse block in the vertical middle, reference below it.
      const script = `tell application "Keynote"
\tactivate
${findDoc}
\tset verses to {${verseList}}
\t-- Resolve every target index first (by caption substring), then insert from
\t-- the BOTTOM up so earlier inserts don't renumber later targets.
\tset hits to {}
\trepeat with v in verses
\t\tset hitIdx to 0
\t\trepeat with i from 1 to (count of slides of theDoc)
\t\t\tset s to slide i of theDoc
\t\t\tset capText to ""
\t\t\trepeat with t in (text items of s)
\t\t\t\tset capText to capText & (object text of t)
\t\t\tend repeat
\t\t\tif capText contains (matchText of v) then
\t\t\t\tset hitIdx to i
\t\t\t\texit repeat
\t\t\tend if
\t\tend repeat
\t\tset end of hits to {idx:hitIdx, vt:(verseText of v), rt:(refText of v)}
\tend repeat
\t-- sort descending by idx (simple insertion: process larger indices first)
\tset n to count of hits
\trepeat with a from 1 to n
\t\trepeat with b from 1 to (n - a)
\t\t\tif (idx of (item b of hits)) < (idx of (item (b + 1) of hits)) then
\t\t\t\tset tmp to item b of hits
\t\t\t\tset item b of hits to item (b + 1) of hits
\t\t\t\tset item (b + 1) of hits to tmp
\t\t\tend if
\t\tend repeat
\tend repeat
\tset inserted to 0
\tset missed to ""
\trepeat with h in hits
\t\tif (idx of h) = 0 then
\t\t\tset missed to missed & " | " & (vt of h)
\t\telse
\t\t\tset newSlide to make new slide at after slide (idx of h) of theDoc with properties {base slide:(master slide ${asText(args.master)} of theDoc)}
\t\t\ttell newSlide
\t\t\t\tset vti to make new text item with properties {object text:(vt of h), position:{160, 360}, width:1600, height:380}
\t\t\t\tset color of object text of vti to {65535, 65535, 65535}
\t\t\t\tset size of object text of vti to 60
\t\t\t\tset rti to make new text item with properties {object text:(rt of h), position:{160, 800}, width:1600, height:90}
\t\t\t\tset color of object text of rti to {44000, 44000, 44000}
\t\t\t\tset size of object text of rti to 32
\t\t\tend tell
\t\t\tset inserted to inserted + 1
\t\tend if
\tend repeat
\tsave theDoc
\treturn "INTERLEAVED " & inserted & " verse slide(s); slides now: " & (count of slides of theDoc) & missed
end tell`;

      const out = (yield* svc.exec(script)).trim();
      if (out.startsWith('ERROR')) {
        yield* Console.error(out);
        return yield* Effect.sync(() => process.exit(1));
      }
      yield* Console.log(out);
    }),
);
