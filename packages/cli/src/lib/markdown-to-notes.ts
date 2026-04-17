import { Data, Effect, Option, pipe } from 'effect';

import { AppleScript } from '~/src/services/apple-script';
import {
  escapeAppleScriptString,
  extractTitleFromMarkdown,
  wrapWithAppleNotesStyle,
  prepareMarkdownForAppleNotes,
} from './apple-notes-utils.js';

export class MarkdownParseError extends Data.TaggedError(
  '@bible/cli/lib/markdown-to-notes/MarkdownParseError',
)<{
  message: string;
  cause: unknown;
  content: string;
}> {}

/**
 * Options for creating the Apple Note.
 */
export interface CreateSimpleNoteOptions {
  /** Override the title automatically extracted from Markdown H1. Defaults to 'Untitled Note' if no H1 found. */
  title?: string;
  /** Set to true to bring the Notes application to the foreground after creation. Defaults to false. */
  activateNotesApp?: boolean;
  /** Target folder name in Apple Notes. If the folder doesn't exist, it will be created. */
  folder?: string;
}

const parseMarkdown = Effect.fn('parseMarkdown')(function* (content: string) {
  return yield* Effect.try({
    try: () => Bun.markdown.html(content),
    catch: (cause: unknown) =>
      new MarkdownParseError({
        message: `Markdown parsing failed`,
        cause,
        content,
      }),
  });
});

/**
 * Converts Markdown content to HTML and creates a new note in the default
 * account and folder of Apple Notes.
 * Requires macOS and potentially Automation permissions for Notes.
 *
 * @param markdownContent The raw Markdown string to convert.
 * @param options Optional configuration for the note title and activation behavior.
 * @returns An Effect that resolves with the final title used for the note upon successful creation.
 * @throws An error if the AppleScript execution fails (e.g., permissions issues).
 */
export const makeAppleNoteFromMarkdown = Effect.fn('makeAppleNoteFromMarkdown')(function* (
  markdownContent: string,
  options: CreateSimpleNoteOptions = {},
) {
  yield* Effect.log('🔄 Converting Markdown to HTML...');

  // Determine the note title
  const finalNoteTitle =
    options.title ??
    pipe(
      extractTitleFromMarkdown(markdownContent),
      Option.getOrElse(() => 'Untitled Note'),
    );
  yield* Effect.log(`ℹ️  Using note title: "${finalNoteTitle}"`);

  // Prepare markdown content (keep H1 in body so Apple Notes displays title correctly in sidebar)
  const contentWithBreaks = prepareMarkdownForAppleNotes(markdownContent, true);

  const htmlContent = yield* parseMarkdown(contentWithBreaks);

  // Prepare HTML for AppleScript (basic structure and styling)
  const styledHtmlContent = wrapWithAppleNotesStyle(htmlContent);

  // Escape content for AppleScript embedding
  const escapedHtmlBody = escapeAppleScriptString(styledHtmlContent);
  const escapedNoteTitle = escapeAppleScriptString(finalNoteTitle);

  // Construct the AppleScript command (always targets the main Notes application)
  yield* Effect.log('🔨 Constructing AppleScript command for default location...');
  const activateCommand = options.activateNotesApp === true ? 'activate' : '';

  const appleScriptCommand =
    options.folder !== undefined
      ? `
      tell application "Notes"
        set targetFolder to missing value
        repeat with f in folders
          if name of f is "${escapeAppleScriptString(options.folder)}" then
            set targetFolder to f
            exit repeat
          end if
        end repeat
        if targetFolder is missing value then
          make new folder with properties {name:"${escapeAppleScriptString(options.folder)}"}
          set targetFolder to folder "${escapeAppleScriptString(options.folder)}"
        end if
        set newNote to make new note at targetFolder with properties {name:"${escapedNoteTitle}", body:"${escapedHtmlBody.trim()}"}
        ${activateCommand}
        return id of newNote
      end tell
    `
      : `
      tell application "Notes"
        set newNote to make new note with properties {name:"${escapedNoteTitle}", body:"${escapedHtmlBody.trim()}"}
        ${activateCommand}
        return id of newNote
      end tell
    `;

  // Execute the AppleScript
  const locationInfo =
    options.folder !== undefined ? `folder "${options.folder}"` : 'default location';
  yield* Effect.log(`🚀 Executing AppleScript to create note in ${locationInfo}...`);

  const appleScript = yield* AppleScript;
  const res = yield* appleScript.exec(appleScriptCommand);
  yield* Effect.log(res);

  // Success - res contains the note ID (e.g., "note id x-coredata://...")
  const noteId = res.trim();
  yield* Effect.log(
    `✅ Success! Note "${finalNoteTitle}" created in Apple Notes (${locationInfo}).`,
  );
  return { title: finalNoteTitle, noteId };
});

/**
 * Options for updating an existing Apple Note.
 */
export interface UpdateNoteOptions {
  /** Override the title. If not provided, uses the H1 from markdown or keeps existing title. */
  title?: string;
  /** Set to true to bring the Notes application to the foreground after update. Defaults to false. */
  activateNotesApp?: boolean;
}

/**
 * Converts Markdown content to HTML and updates an existing note in Apple Notes.
 * Requires macOS and potentially Automation permissions for Notes.
 *
 * @param noteId The ID of the note to update.
 * @param markdownContent The raw Markdown string to convert.
 * @param options Optional configuration for the note title and activation behavior.
 * @returns An Effect that resolves with the final title used for the note upon successful update.
 * @throws An error if the AppleScript execution fails (e.g., permissions issues, note not found).
 */
export const updateAppleNoteFromMarkdown = Effect.fn('updateAppleNoteFromMarkdown')(function* (
  noteId: string,
  markdownContent: string,
  options: UpdateNoteOptions = {},
) {
  yield* Effect.log('🔄 Converting Markdown to HTML for update...');

  // Determine the note title
  const finalNoteTitle =
    options.title ??
    pipe(
      extractTitleFromMarkdown(markdownContent),
      Option.getOrElse(() => 'Untitled Note'),
    );
  yield* Effect.log(`ℹ️  Using note title: "${finalNoteTitle}"`);

  // Prepare markdown content (keep H1 in body so Apple Notes displays title correctly in sidebar)
  const contentWithBreaks = prepareMarkdownForAppleNotes(markdownContent, true);

  const htmlContent = yield* parseMarkdown(contentWithBreaks);

  // Prepare HTML for AppleScript (basic structure and styling)
  const styledHtmlContent = wrapWithAppleNotesStyle(htmlContent);

  // Escape content for AppleScript embedding
  const escapedHtmlBody = escapeAppleScriptString(styledHtmlContent);
  const escapedNoteTitle = escapeAppleScriptString(finalNoteTitle);
  const escapedNoteId = escapeAppleScriptString(noteId);

  // Construct the AppleScript command to update existing note
  yield* Effect.log(`🔨 Constructing AppleScript command to update note ID: ${noteId}...`);
  const activateCommand = options.activateNotesApp === true ? 'activate' : '';

  const appleScriptCommand = `
      tell application "Notes"
        try
          set theNote to note id "${escapedNoteId}"
          set name of theNote to "${escapedNoteTitle}"
          set body of theNote to "${escapedHtmlBody.trim()}"
          ${activateCommand}
          return "Success"
        on error errMsg number errNum
          return "Error: " & errMsg & " (" & errNum & ")"
        end try
      end tell
    `;

  // Execute the AppleScript
  yield* Effect.log(`🚀 Executing AppleScript to update note...`);

  const appleScript = yield* AppleScript;
  const res = yield* appleScript.exec(appleScriptCommand);

  if (res.startsWith('Error:')) {
    return yield* new MarkdownParseError({
      message: `Failed to update note: ${res}`,
      cause: res,
      content: markdownContent,
    });
  }

  // Success
  yield* Effect.log(`✅ Success! Note "${finalNoteTitle}" updated in Apple Notes.`);
  return finalNoteTitle; // Resolve with the title used
});

/**
 * Move an existing Apple Note into a target folder.
 * If the folder doesn't exist, it will be created at the root level
 * (Apple Notes AppleScript does not support nested folder creation).
 *
 * @param noteId The ID of the note to move.
 * @param folder Target folder name.
 */
export const moveAppleNoteToFolder = Effect.fn('moveAppleNoteToFolder')(function* (
  noteId: string,
  folder: string,
) {
  const escapedNoteId = escapeAppleScriptString(noteId);
  const escapedFolder = escapeAppleScriptString(folder);

  const appleScriptCommand = `
      tell application "Notes"
        set targetFolder to missing value
        repeat with f in folders
          if name of f is "${escapedFolder}" then
            set targetFolder to f
            exit repeat
          end if
        end repeat
        if targetFolder is missing value then
          make new folder with properties {name:"${escapedFolder}"}
          set targetFolder to folder "${escapedFolder}"
        end if
        try
          move note id "${escapedNoteId}" to targetFolder
          return "Success"
        on error errMsg number errNum
          return "Error: " & errMsg & " (" & errNum & ")"
        end try
      end tell
    `;

  const appleScript = yield* AppleScript;
  const res = yield* appleScript.exec(appleScriptCommand);

  if (res.trim().startsWith('Error:')) {
    return yield* new MarkdownParseError({
      message: `Failed to move note ${noteId} to "${folder}": ${res.trim()}`,
      cause: res,
      content: '',
    });
  }

  return { noteId, folder };
});
