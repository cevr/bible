/**
 * Keynote slide deck CLI commands
 *
 * Drives Keynote via the macOS scripting bridge to build, mutate, and inspect
 * image-driven decks from a beat-sheet. Three subcommands:
 *
 *   bible slides build <beat-sheet.json> --out <deck.key>  - build a whole deck
 *   bible slides swap  <deck> <caption> <image>            - swap one slide's image
 *   bible slides list  <deck> [--json]                     - introspect a deck
 *
 * WRITES (build, swap) generate AppleScript and run it through the existing
 * `exec` (osascript -e). JXA's text-item write path is broken on this machine
 * (a created text item reads back empty), so captions would silently vanish;
 * AppleScript's `make new text item with properties {object text:…}` is proven.
 *
 * READS (list) generate JXA (`osascript -l JavaScript`) via `execJxa`, which
 * returns clean JSON and captures stderr + exit code so deck-not-found /
 * automation-denied surface as a typed failure instead of an empty-string
 * success.
 *
 * The one correctness hazard — a literal newline inside an AppleScript "…"
 * literal is a syntax error — is solved by `asText()` (see below), which turns
 * any JS string (incl. embedded newlines) into a valid AppleScript string
 * EXPRESSION. JXA has no such hazard: JSON.stringify yields a valid JS literal.
 */

import { Argument, Command, Flag } from 'effect/unstable/cli';
import { Console, Effect, FileSystem, Option, Path } from 'effect';
import { escapeAppleScriptString } from '../lib/apple-notes-utils.js';
import { AppleScript } from '../services/apple-script.js';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert ANY JS string (including embedded newlines) into a VALID AppleScript
 * string EXPRESSION — never a bare "…" literal. A literal newline inside an
 * AppleScript "…" literal is a SYNTAX ERROR, so we split on \n, quote+escape
 * each segment with the existing escapeAppleScriptString (backslash + double-
 * quote), and concatenate the pieces with the AppleScript `linefeed` constant.
 * CRLF/CR are normalized first so Windows-authored notes don't leak a stray \r.
 * Empty input -> "" (a valid empty AppleScript literal).
 */
function asText(str: string): string {
  const normalized = str.replace(/\r\n?/g, '\n');
  return normalized
    .split('\n')
    .map((seg) => `"${escapeAppleScriptString(seg)}"`)
    .join(' & linefeed & ');
}

/** Embed a runtime string into generated JXA source safely (valid JS literal). */
function jxaStr(value: string): string {
  return JSON.stringify(value);
}

/** A deck arg is a path (vs an open-document name substring) if it looks file-y. */
function isPathDeck(deck: string): boolean {
  return deck.endsWith('.key') || deck.startsWith('/') || deck.startsWith('~') || deck.includes('/');
}

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

/**
 * AppleScript that binds `theDoc` to the target deck. Path mode opens the .key
 * and binds by exact basename (with an ERROR sentinel if the open didn't take);
 * name mode binds the first OPEN document whose name contains the substring.
 * `deckResolved` is the already-path.resolve()'d deck when isPath, else the raw
 * name substring.
 */
function findDocAS(isPath: boolean, deckResolved: string): string {
  return isPath
    ? `\topen POSIX file ${asText(deckResolved)}\n` +
        `\tif (count of (documents whose name is ${asText(basename(deckResolved))})) = 0 then return "ERROR: could not open deck — " & ${asText(deckResolved)}\n` +
        `\tset theDoc to first document whose name is ${asText(basename(deckResolved))}`
    : `\tif (count of (documents whose name contains ${asText(deckResolved)})) = 0 then return "ERROR: deck not open — " & ${asText(deckResolved)}\n` +
        `\tset theDoc to item 1 of (documents whose name contains ${asText(deckResolved)})`;
}

/**
 * AppleScript snippet (to run inside `tell theDoc`) that scans slides for the
 * first whose concatenated text items contain `captionExpr` (an AppleScript
 * string expression), leaving the 1-based index in the variable named `outVar`
 * (0 if not found).
 */
function findSlideByCaptionAS(captionExpr: string, outVar: string): string {
  return (
    `\tset ${outVar} to 0\n` +
    `\trepeat with i from 1 to (count of slides of theDoc)\n` +
    `\t\tset s to slide i of theDoc\n` +
    `\t\tset capText to ""\n` +
    `\t\trepeat with t in (text items of s)\n` +
    `\t\t\tset capText to capText & (object text of t)\n` +
    `\t\tend repeat\n` +
    `\t\tif capText contains ${captionExpr} then\n` +
    `\t\t\tset ${outVar} to i\n` +
    `\t\t\texit repeat\n` +
    `\t\tend if\n` +
    `\tend repeat`
  );
}

// ============================================================================
// Schema types
// ============================================================================

interface Beat {
  readonly id?: string;
  readonly section?: string;
  readonly line: string; // on-slide caption
  readonly scene?: string; // one-word art label — NOT narration, NOT used as note
  readonly note?: string; // optional explicit presenter narration (preferred when present)
  readonly image?: string | null; // filename rel to beat-sheet dir, or "NEW"/null
  readonly subject?: string | null;
}
interface BeatSheet {
  readonly deck?: string;
  readonly beats: ReadonlyArray<Beat>;
}
interface BuildRecord {
  line: string;
  note: string;
  imgPath: string;
  hasImg: boolean;
  file: string;
}
interface SlideRow {
  index: number;
  caption: string;
  image: string | null;
  notes: string;
}

// ============================================================================
// build — generate a whole deck from a beat-sheet (AppleScript via exec)
// ============================================================================

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

      const sheetPath = path.resolve(args.beatSheet);
      const raw = yield* fs.readFileString(sheetPath);

      let sheet: BeatSheet;
      try {
        sheet = JSON.parse(raw) as BeatSheet;
      } catch (e) {
        yield* Console.error(`Could not parse beat-sheet JSON: ${String(e)}`);
        return yield* Effect.sync(() => process.exit(1));
      }

      if (!Array.isArray(sheet.beats) || sheet.beats.length === 0) {
        yield* Console.error('beat-sheet has no beats.');
        return yield* Effect.sync(() => process.exit(1));
      }

      const dir = path.dirname(sheetPath);

      const records: BuildRecord[] = [];
      let missing = 0;
      let noteless = 0;
      for (const b of sheet.beats) {
        const file = (typeof b.image === 'string' ? b.image : '') ?? '';
        const isNew = file === '' || file.toUpperCase() === 'NEW';
        const abs = isNew ? '' : path.resolve(dir, file);
        const exists = abs !== '' ? yield* fs.exists(abs) : false;
        if (!exists) missing++;
        const note = b.note ?? '';
        if ((b.note ?? '') === '') noteless++;
        records.push({
          line: b.line ?? '',
          note,
          imgPath: exists ? abs : '',
          hasImg: exists,
          file: file || '(none)',
        });
      }

      const outPath = args.out.endsWith('.key')
        ? path.resolve(args.out)
        : path.resolve(dir, args.out + '.key');

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
      const closeNamed = args.open
        ? ''
        : `\tclose (every document whose name is ${asText(basename(outPath))}) saving no\n`;

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

// ============================================================================
// swap — in-place single-slide image swap (AppleScript via exec)
// ============================================================================

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

      const baseDir = Option.getOrElse(args.imageDir, () => process.cwd());
      const imgPath = path.isAbsolute(args.image)
        ? args.image
        : path.resolve(baseDir, args.image);

      const deckIsPath = isPathDeck(args.deck);
      const deckPath = deckIsPath ? path.resolve(args.deck) : '';

      const findDoc = deckIsPath
        ? `\topen POSIX file ${asText(deckPath)}\n` +
          `\tif (count of (documents whose name is ${asText(basename(deckPath))})) = 0 then return "ERROR: could not open deck — " & ${asText(deckPath)}\n` +
          `\tset theDoc to first document whose name is ${asText(basename(deckPath))}`
        : `\tif (count of (documents whose name contains ${asText(args.deck)})) = 0 then return "ERROR: deck not open — " & ${asText(args.deck)}\n` +
          `\tset theDoc to item 1 of (documents whose name contains ${asText(args.deck)})`;

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
        return yield* Effect.sync(() => process.exit(1));
      }
      yield* Console.log(out);
    }),
);

// ============================================================================
// list — introspect a deck (JXA via execJxa)
// ============================================================================

const listDeck = Argument.string('deck').pipe(
  Argument.withDescription('Open document name substring OR a .key path'),
);
const listJson = Flag.boolean('json').pipe(
  Flag.withDescription('Emit raw JSON instead of a table'),
  Flag.withDefault(false),
);

export const slidesList = Command.make(
  'list',
  { deck: listDeck, json: listJson },
  (args) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const svc = yield* AppleScript;

      const deckIsPath = isPathDeck(args.deck);
      const target = deckIsPath ? path.resolve(args.deck) : args.deck;
      const targetBase = deckIsPath ? basename(target) : '';

      const findDoc = deckIsPath
        ? `
  var existing = kn.documents.whose({ name: { _equals: ${jxaStr(targetBase)} } })();
  if (existing.length > 0) { doc = existing[0]; }
  else { doc = kn.open(Path(${jxaStr(target)})); openedByUs = true; if (!doc) { var after = kn.documents.whose({ name: { _equals: ${jxaStr(targetBase)} } })(); doc = after.length>0?after[0]:null; } }
  if (!doc) { return JSON.stringify({ error: 'could not open deck' }); }
  `
        : `
  var ds = kn.documents.whose({ name: { _contains: ${jxaStr(target)} } })();
  if (ds.length === 0) { return JSON.stringify({ error: 'deck not found' }); }
  doc = ds[0];
  `;

      const script = `(function(){
  var kn = Application('Keynote');
  var openedByUs = false;
  var doc;
  ${findDoc}
  var out = [];
  var slides = doc.slides();
  for (var i = 0; i < slides.length; i++) {
    var s = slides[i];
    var tis = s.textItems();
    var capParts = []; var marker = null;
    for (var j = 0; j < tis.length; j++) {
      var t = tis[j].objectText();
      if (t === null || t === undefined || t === '') continue;
      if (t.indexOf('[MISSING IMAGE:') === 0) { marker = t; continue; }
      capParts.push(t);
    }
    var imgs = s.images();
    var image = null;
    if (imgs.length > 0) { try { image = imgs[0].fileName(); } catch (e) { image = '(image)'; } }
    else if (marker) { image = marker; }
    var notes = '';
    try { notes = s.presenterNotes(); } catch (e) { notes = ''; }
    out.push({ index: i + 1, caption: capParts.join(' / '), image: image, notes: notes });
  }
  var deckName = doc.name();
  if (openedByUs) { try { doc.close({ saving: 'no' }); } catch (e) {} }
  return JSON.stringify({ ok: true, deck: deckName, slides: out });
})();`;

      const stdout = yield* svc.execJxa(script);

      let parsed: { ok: true; deck: string; slides: SlideRow[] } | { error: string };
      try {
        parsed = JSON.parse(stdout.trim()) as
          | { ok: true; deck: string; slides: SlideRow[] }
          | { error: string };
      } catch {
        yield* Console.error('Could not parse Keynote output.');
        return yield* Effect.sync(() => process.exit(1));
      }
      if (!('ok' in parsed)) {
        yield* Console.error(`ERROR: ${parsed.error}`);
        return yield* Effect.sync(() => process.exit(1));
      }
      if (args.json) {
        yield* Console.log(JSON.stringify(parsed.slides, null, 2));
        return;
      }
      const trunc = (str: string, n: number): string => {
        const first = str.split('\n')[0] ?? '';
        return first.length > n ? first.slice(0, n - 1) + '…' : first;
      };
      yield* Console.log(`idx  caption                                                       image`);
      for (const r of parsed.slides) {
        yield* Console.log(
          `${String(r.index).padStart(3)}  ${trunc(r.caption, 58).padEnd(58)}  ${r.image ? basename(r.image) : '∅'}`,
        );
      }
      yield* Console.log(`\n${parsed.slides.length} slide(s) in ${parsed.deck}`);
    }),
);

// ============================================================================
// interleave — insert text-only verse slides after matched scenes (AppleScript)
// ============================================================================

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

// ============================================================================
// insert — insert ONE full-bleed image slide after a matched caption
// ============================================================================

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

      const baseDir = Option.getOrElse(args.imageDir, () => process.cwd());
      const imgPath = path.isAbsolute(args.image)
        ? args.image
        : path.resolve(baseDir, args.image);

      const deckIsPath = isPathDeck(args.deck);
      const deckResolved = deckIsPath ? path.resolve(args.deck) : args.deck;

      const captionLine = args.caption
        ? `\t\t\tmake new text item with properties {object text:${asText(args.caption)}, position:{160, 870}, width:1600, height:150}\n`
        : '';
      const noteLine = args.note
        ? `\t\tset presenter notes of newSlide to ${asText(args.note)}\n`
        : '';

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
        return yield* Effect.sync(() => process.exit(1));
      }
      yield* Console.log(out);
    }),
);

// ============================================================================
// move — move a captioned slide to before/after another captioned slide
// ============================================================================

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

// ============================================================================
// Root slides command
// ============================================================================

export const slides = Command.make('slides', {}, () =>
  Effect.gen(function* () {
    yield* Console.log('Usage: bible slides <build|swap|list> [options]');
    yield* Console.log('');
    yield* Console.log('  build      <beat-sheet.json> --out <deck.key> [--theme] [--master] [--open]');
    yield* Console.log('  swap       <deck> <caption> <image> [--image-dir <dir>]');
    yield* Console.log('  list       <deck> [--json]');
    yield* Console.log('  interleave <deck> <verses.json> [--master]   insert text-only verse slides');
    yield* Console.log('  insert     <deck> <after> <image> [--caption] [--note] [--image-dir]');
    yield* Console.log('  move       <deck> <caption> <anchor> [--before]   reorder a slide');
  }),
).pipe(
  Command.withSubcommands([
    slidesBuild,
    slidesSwap,
    slidesList,
    slidesInterleave,
    slidesInsert,
    slidesMove,
  ]),
);
