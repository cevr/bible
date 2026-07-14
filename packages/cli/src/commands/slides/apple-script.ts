import { escapeAppleScriptString } from '../../lib/apple-notes-utils.js';

/**
 * Convert ANY JS string (including embedded newlines) into a VALID AppleScript
 * string EXPRESSION — never a bare "…" literal. A literal newline inside an
 * AppleScript "…" literal is a SYNTAX ERROR, so we split on \n, quote+escape
 * each segment with the existing escapeAppleScriptString (backslash + double-
 * quote), and concatenate the pieces with the AppleScript `linefeed` constant.
 * CRLF/CR are normalized first so Windows-authored notes don't leak a stray \r.
 * Empty input -> "" (a valid empty AppleScript literal).
 */
export function asText(str: string): string {
  const normalized = str.replace(/\r\n?/g, '\n');
  return normalized
    .split('\n')
    .map((seg) => `"${escapeAppleScriptString(seg)}"`)
    .join(' & linefeed & ');
}

/** Embed a runtime string into generated JXA source safely (valid JS literal). */
export function jxaStr(value: string): string {
  return JSON.stringify(value);
}

/** A deck arg is a path (vs an open-document name substring) if it looks file-y. */
export function isPathDeck(deck: string): boolean {
  return (
    deck.endsWith('.key') || deck.startsWith('/') || deck.startsWith('~') || deck.includes('/')
  );
}

export function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

/**
 * AppleScript that binds `theDoc` to the target deck. Path mode opens the .key
 * and binds by exact basename (with an ERROR sentinel if the open didn't take);
 * name mode binds the first OPEN document whose name contains the substring.
 * `deckResolved` is the already-path.resolve()'d deck when isPath, else the raw
 * name substring.
 */
export function findDocAS(isPath: boolean, deckResolved: string): string {
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
export function findSlideByCaptionAS(captionExpr: string, outVar: string): string {
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
