// Every series draft reads in the lab's Script reader (`readDraft`): its
// beats found, every spoken line one the staging voice can read, its marks
// written as marks. A draft that stresses a word the Markdown way or writes
// a pause as a direction fails here, naming its beat, before the lab says so.

import { readDraft, unreadText } from '@bible/film/core';
import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path, Result } from 'effect';

describe('series drafts', () => {
  it.effect('every draft reads, every spoken beat with its marks', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const series = import.meta.dir;
      const drafts = (yield* fs.readDirectory(series, { recursive: true }))
        .filter((f) => /^[^/]+\/scripts\/[^/]+\.md$/.test(f))
        .toSorted();
      expect(drafts.length).toBeGreaterThan(0);
      const unread = yield* Effect.forEach(drafts, (draft) =>
        Effect.map(fs.readFileString(path.join(series, draft)), (markdown) =>
          Result.match(readDraft(markdown), {
            onFailure: (u) => [`${draft}: ${unreadText(u)}`],
            onSuccess: () => [],
          }),
        ),
      );
      expect(unread.flat()).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
