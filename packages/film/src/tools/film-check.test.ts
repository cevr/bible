// The static leg is the lab's check after every write: it reads the film's
// files and the master's length and stamp, and never mixes. Its type says so
// (FileSystem and Media, no Mixer), and the master it reads is judged by the
// stamp `mix` left beside it.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, type FileSystem, Layer, Option, Predicate, Result, Schema } from 'effect';
import { layout } from '../core/layout.ts';
import { mixKey } from '../core/mix.ts';
import { voiceKey } from '../core/narration.ts';
import type { Timed, Timings } from '../core/schema.ts';
import { filmEnd } from '../core/sound.ts';
import { staticLeg } from './film-check.ts';
import type { StaticFinding } from './findings.ts';
import type { Media } from './media.ts';
import { MasterStampJson, masterFile, planOf, stampFile } from './mixer.ts';
import { fakeMedia, memoryFileSystem, spokenTake, testFilm, testVoice, text } from './testing.ts';

const scenes: ReadonlyArray<Timed> = [
  { id: 'said', say: 'Hi there.' },
  { id: 'quiet', min: 3 },
];
const recorded: Timings = {
  voice: voiceKey(testVoice),
  scenes: { said: spokenTake('Hi there.') },
};
const film = testFilm(scenes, recorded);
const placed = Result.getOrThrow(layout(scenes, recorded));
const NOW = { score: Option.none<string>(), take: Option.none() };

/** The static leg over `files`: what it needs is all it is given. */
const run = (files: Map<string, Uint8Array>) => {
  const leg: Effect.Effect<
    ReadonlyArray<StaticFinding>,
    unknown,
    FileSystem.FileSystem | Media
  > = staticLeg(film, placed);
  return leg.pipe(Effect.provide(Layer.mergeAll(memoryFileSystem(files), fakeMedia(files))));
};

/** The master's findings: missing, or stale. */
const isMaster = Predicate.or(Predicate.isTagged('AudioMissing'), Predicate.isTagged('AudioStale'));
const masterTags = (found: ReadonlyArray<StaticFinding>) =>
  found.filter(isMaster).map((f) => f._tag);

describe('the static leg', () => {
  it.effect('with every take recorded and no track, the master is missing', () =>
    Effect.gen(function* () {
      expect(masterTags(yield* run(new Map()))).toEqual(['AudioMissing']);
    }),
  );

  it.effect('a track stamped for another plan is stale; one stamped for this plan is not', () =>
    Effect.gen(function* () {
      const key = mixKey(Result.getOrThrow(planOf(film, placed, NOW)));
      const stamped = (stamp: string) =>
        Effect.gen(function* () {
          const files = new Map<string, Uint8Array>();
          // A track exactly the film's length, as `mix` trims it.
          files.set(
            masterFile(film.paths),
            text(`flac ${Math.round(filmEnd(placed) * 1000)}/1000`),
          );
          const json = yield* Schema.encodeEffect(MasterStampJson)({ key: stamp });
          files.set(stampFile(film.paths), text(json));
          return files;
        });
      const current = yield* run(yield* stamped(key));
      const other = yield* run(yield* stamped('another plan'));
      expect(masterTags(other)).toEqual(['AudioStale']);
      expect(masterTags(current)).toEqual([]);
    }),
  );
});
