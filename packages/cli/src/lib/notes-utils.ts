import { Data, Effect, Option } from 'effect';

import { AppleScript } from '~/src/services/apple-script';

// --- Helper Function: Execute AppleScript Command ---
class AppleScriptExecError extends Data.TaggedError(
  '@bible/cli/lib/notes-utils/AppleScriptExecError',
)<{
  message: string;
  cause?: unknown;
}> {}

const execCommand = Effect.fn('execCommand')(function* (script: string) {
  const appleScript = yield* AppleScript;
  return yield* appleScript.exec(script).pipe(
    Effect.map((text) => text.trim()),
    Effect.mapError(
      (cause) =>
        new AppleScriptExecError({
          message: 'AppleScript execution failed',
          cause,
        }),
    ),
  );
});

// --- Types ---
interface NoteListItem {
  id: string;
  name: string;
  creationDate: string; // Dates are returned as strings by AppleScript
  modificationDate: string;
}

export class NoteOperationError extends Data.TaggedError(
  '@bible/cli/lib/notes-utils/NoteOperationError',
)<{
  message: string;
  cause?: unknown;
  script?: string;
  scriptOutput?: string;
}> {}

// --- Utility Functions ---

/**
 * Lists all notes in the default Notes account.
 * @returns An Effect that resolves with an array of NoteListItem objects.
 * @throws NoteOperationError if the AppleScript execution or parsing fails.
 */
export const listNotes = Effect.fn('listNotes')(function* () {
  yield* Effect.log('🔄 Fetching list of notes...');
  const script = `
    set noteList to {}
    tell application "Notes"
      set allNotes to every note
      set noteCount to count of allNotes -- Get total count
      set counter to 0
      repeat with i from 1 to noteCount
        if counter is 20 then exit repeat -- Stop after 20
        set aNote to item i of allNotes

        set noteId to id of aNote
        set noteName to name of aNote
        set noteCreationDate to creation date of aNote as string
        set noteModificationDate to modification date of aNote as string
        set end of noteList to {noteId:noteId, noteName:noteName, creationDate:noteCreationDate, modificationDate:noteModificationDate}
        set counter to counter + 1 -- Increment counter
      end repeat
    end tell

    -- Format the output as a simple, parseable string (e.g., ID|Name|Created|Modified newline)
    set output to ""
    repeat with noteProps in noteList
      set output to output & noteProps's noteId & "|" & noteProps's noteName & "|" & noteProps's creationDate & "|" & noteProps's modificationDate & "\n"
    end repeat
    return output
  `;

  const rawOutput = yield* execCommand(script).pipe(
    Effect.mapError(
      (error) =>
        new NoteOperationError({
          message: 'Failed to execute listNotes AppleScript',
          cause: error,
          script,
        }),
    ),
  );

  yield* Effect.log('📊 Parsing note list...');
  const malformed: string[] = [];
  const notes: NoteListItem[] = [];
  for (const line of rawOutput.split('\n')) {
    if (line.trim() === '') continue; // Remove empty lines
    const parts = line.split('|'); // Split by the delimiter
    if (parts.length !== 4) {
      // Handle potential parsing errors or unexpected format
      malformed.push(line);
      continue;
    }
    notes.push({
      id: parts[0] ?? '',
      name: parts[1] ?? '', // Names might contain special characters, handled by script?
      creationDate: parts[2] ?? '',
      modificationDate: parts[3] ?? '',
    });
  }

  if (malformed.length > 0) {
    yield* Effect.logWarning(
      `Skipped ${malformed.length} malformed lines: ${malformed.join('; ')}`,
    );
  }

  yield* Effect.log(`✅ Found ${notes.length} notes.`);
  return notes;
});

/**
 * Deletes a specific note.
 * @param noteId The ID of the note to delete.
 * @returns An Effect that resolves when the deletion is complete.
 * @throws NoteOperationError if the note is not found or the script fails.
 */
export const deleteNote = Effect.fn('deleteNote')(function* (noteId: string) {
  yield* Effect.log(`🔄 Deleting note ID: ${noteId}...`);
  const script = `
    tell application "Notes"
      try
        delete note id "${noteId}"
        return "Success"
      on error errMsg number errNum
         return "Error: Note not found or deletion failed. " & errMsg & " (" & errNum & ")"
      end try
    end tell
  `;

  const result = yield* execCommand(script).pipe(
    Effect.mapError(
      (error) =>
        new NoteOperationError({
          message: `Failed to execute deleteNote AppleScript for ID ${noteId}`,
          cause: error,
          script,
        }),
    ),
  );

  if (!result.startsWith('Success')) {
    return yield* new NoteOperationError({
      message: `Failed to delete note ID ${noteId}: ${result}`,
      script,
      scriptOutput: result,
    });
  }

  yield* Effect.log(`✅ Note deleted: ${noteId}.`);
});

/**
 * Finds a note by its exact title in a specific folder.
 * @param title The exact title to search for.
 * @param folder The folder name to search in.
 * @returns An Effect that resolves with Option<NoteListItem>.
 */
export const findNoteByTitle = Effect.fn('findNoteByTitle')(function* (
  title: string,
  folder: string,
) {
  yield* Effect.log(`🔍 Searching for note "${title}" in folder "${folder}"...`);

  // Escape quotes in title for AppleScript
  const escapedTitle = title.replace(/"/g, '\\"');
  const escapedFolder = folder.replace(/"/g, '\\"');

  const script = `
    tell application "Notes"
      try
        set targetFolder to missing value
        repeat with f in folders
          if name of f is "${escapedFolder}" then
            set targetFolder to f
            exit repeat
          end if
        end repeat
        if targetFolder is missing value then
          return "NOT_FOUND"
        end if
        set matchingNotes to (notes of targetFolder whose name is "${escapedTitle}")
        if (count of matchingNotes) is 0 then
          return "NOT_FOUND"
        end if
        set theNote to item 1 of matchingNotes
        return id of theNote
      on error errMsg number errNum
        return "Error: " & errMsg & " (" & errNum & ")"
      end try
    end tell
  `;

  const result = yield* execCommand(script).pipe(
    Effect.mapError(
      (error) =>
        new NoteOperationError({
          message: `Failed to execute findNoteByTitle AppleScript for "${title}"`,
          cause: error,
          script,
        }),
    ),
  );

  if (result === 'NOT_FOUND') {
    yield* Effect.log(`📭 Note "${title}" not found in folder "${folder}".`);
    return Option.none<string>();
  }

  if (result.startsWith('Error:')) {
    return yield* new NoteOperationError({
      message: `Failed to find note "${title}": ${result}`,
      script,
      scriptOutput: result,
    });
  }

  yield* Effect.log(`✅ Found note "${title}" with ID: ${result}`);
  return Option.some(result);
});
