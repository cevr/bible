// The static leg is the lab's check after every write: it reads the film's
// files and the master's length and stamp, and never mixes. Its type says so
// (FileSystem and Media, no Mixer), and the master it reads is judged by the
// stamp `mix` left beside it.

import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import { BunPath } from '@effect/platform-bun';
import {
  Effect,
  type FileSystem,
  Layer,
  Match,
  Option,
  type Path,
  Predicate,
  Result,
  Schema,
} from 'effect';
import { filmEnd, layout } from '../core/layout.ts';
import { mixKey } from '../core/mix.ts';
import { voiceKey } from '../core/narration.ts';
import type { Timed, Timings } from '../core/schema.ts';
import { laidOut, staticLeg } from './film-check.ts';
import { type StaticFinding, lineOf, report } from './findings.ts';
import type { Media } from './media.ts';
import { type LoadedFilm, masterFile } from './film-repo.ts';
import { MasterStampJson, planOf, stampFile } from './mixer.ts';
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

/** The same film in a folder on Windows. */
const onWindows: LoadedFilm = {
  ...film,
  paths: {
    ...film.paths,
    dir: 'C:\\films\\test',
    narration: 'C:\\films\\test\\narration',
    sound: 'C:\\films\\test\\sound',
  },
};

/** The static leg over `files`, its paths `paths`: what it needs is all it is given. */
const run = (
  files: Map<string, Uint8Array>,
  of: LoadedFilm = film,
  paths: Layer.Layer<Path.Path> = BunPath.layerPosix,
) => {
  const leg: Effect.Effect<
    ReadonlyArray<StaticFinding>,
    unknown,
    FileSystem.FileSystem | Media | Path.Path
  > = staticLeg(of, placed);
  return leg.pipe(Effect.provide(Layer.mergeAll(memoryFileSystem(files), fakeMedia(files), paths)));
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

  it.effect("names the master by its place in the film's folder, on either path layer", () =>
    Effect.gen(function* () {
      const named = (found: ReadonlyArray<StaticFinding>) =>
        found.flatMap((f) =>
          Match.value(f).pipe(
            Match.tags({ AudioMissing: (m) => [[m.file, m.message]] }),
            Match.orElse(() => []),
          ),
        );
      const said = 'no audio master at narration/full.wav; run mix to build it (no API calls)';
      expect(named(yield* run(new Map()))).toEqual([['narration/full.wav', said]]);
      expect(named(yield* run(new Map(), onWindows, BunPath.layerWin32))).toEqual([
        ['narration/full.wav', said],
      ]);
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

describe('a film that does not lay out', () => {
  test('is the one finding the check reports, at the scene that stops it', () => {
    const typo = testFilm(
      [{ id: 'said', say: 'Hi {there}there.', timeline: { lift: { mark: 'nosuch', dur: 1 } } }],
      recorded,
    );
    const laid = laidOut(typo, { _tag: 'Film' });
    const lines = Result.match(laid, {
      onFailure: (error) => report([error], { allowStale: false }).findings.map(lineOf),
      onSuccess: () => [],
    });
    expect(lines).toMatchObject([
      { level: 'error', tag: 'UnknownMark', address: { part: { _tag: 'Scenes', ids: ['said'] } } },
    ]);
  });

  test('a part the film lacks is a finding too, and the film lays out otherwise', () => {
    const lost = laidOut(film, { _tag: 'Act', act: 'nowhere' });
    expect(Result.getFailure(lost).pipe(Option.map((e) => e._tag))).toEqual(
      Option.some('UnknownAct'),
    );
    expect(Result.isSuccess(laidOut(film, { _tag: 'Film' }))).toBe(true);
  });
});
