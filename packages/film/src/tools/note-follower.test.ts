// The note follower the docs give an agent hears every note the owner makes:
// each `lab events --follow` command a doc names for notes, read with its
// `--name`s, matches every event the old `film notes --watch` printed (a
// note made, a tweak asked of a panel among them, and the owner's reply).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path } from 'effect';
import { namesMatch, noteChanges } from '../core/lab-events.ts';
import { addNote, emptyNotes, eventsSince, replyToNote } from '../core/notes.ts';
import type { NoteEvent } from '../core/schema.ts';

/** The docs that teach an agent to follow the owner's notes, from the repo root. */
const DOCS = [
  '.claude/skills/film/SKILL.md',
  'packages/film/README.md',
  'apps/animations/plans/lab.md',
];

/** What the old watch printed of a change: a note made, and a reply of the owner's. */
const watchPrinted = (event: NoteEvent) =>
  event._tag === 'NoteAdded' || (event._tag === 'NoteReplied' && event.reply.by === 'user');

/** The kinds of every change the old watch printed, over a log with a note, a tweak and the owner's reply. */
const printedKinds = () => {
  const at = '2026-10-18T10:00:00.000Z';
  const draft = { scene: 'cold', T: 1, frame: 30 };
  const noted = addNote(emptyNotes('f'), { ...draft, text: 'hand lower' }, at);
  const tweaked = addNote(
    noted,
    { ...draft, text: 'warmer light', panel: { id: 'cold.judge', try: 1, ask: 'tweak' } },
    at,
  );
  const replied = replyToNote(
    replyToNote(tweaked, 'n1', { by: 'agent', text: 'done', still: Option.none() }, at),
    'n1',
    { by: 'user', text: 'and the other hand', still: Option.none() },
    at,
  );
  return noteChanges(eventsSince(replied, 0).events.filter(watchPrinted)).map((c) => c.kind);
};

/** Each `lab events --follow` command a doc's line about notes names, with its `--name`s. */
const followersIn = (doc: string) =>
  doc
    .split('\n')
    .filter((line) => /note/i.test(line))
    .flatMap((line) =>
      Array.from(line.matchAll(/`([^`]*lab events --follow[^`]*)`/g), ([, command = '']) => ({
        command,
        names: Array.from(
          command.matchAll(/--name\s+(?:'([^']*)'|"([^"]*)"|(\S+))/g),
          ([, single, double, bare]) => single ?? double ?? bare ?? '',
        ),
      })),
    );

describe('the note follower the docs give', () => {
  it.effect.layer(BunServices.layer)(
    'hears every event the old notes --watch printed, a tweak asked among them',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = path.join(import.meta.dir, '..', '..', '..', '..');
        const kinds = printedKinds();
        expect(kinds).toEqual(['note.added', 'tweak.requested', 'note.replied']);
        for (const file of DOCS) {
          const followers = followersIn(yield* fs.readFileString(path.join(root, file)));
          expect({ file, followers: followers.length > 0 }).toEqual({ file, followers: true });
          for (const follower of followers)
            expect({
              file,
              command: follower.command,
              deaf: kinds.filter((kind) => !namesMatch(follower.names, kind)),
            }).toEqual({ file, command: follower.command, deaf: [] });
        }
      }),
  );
});
