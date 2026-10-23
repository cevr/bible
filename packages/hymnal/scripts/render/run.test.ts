import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Path, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { RECORD_168 } from './record-168.fixture.js';
import { HymnRecordJson, RecordObjectJson } from './record.js';
import { keyOf, SAME_SOUND } from './resume.js';
import { renderHymn, type Setup, sourceOf, standingOf, writeManifest } from './run.js';
import { sha256Hex } from './sfizz.js';
import { STYLE } from './style.js';

const test = it.scopedLive.layer(BunServices.layer);

/** An MP3's stand-in: the run only hashes it when the record stands. */
const MP3 = new TextEncoder().encode('not audio');

/** A set in a fresh folder under `config`, whose sampler is not there: a hymn that renders fails. */
const setOf = (config: string, transpose = 0) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const out = yield* fs.makeTempDirectoryScoped();
    const setup: Setup = {
      style: STYLE,
      transpose,
      instruments: path.join(out, 'instruments'),
      sampler: path.join(out, 'no-sampler'),
      ir: path.join(out, 'no-room.wav'),
      comment: 'test',
      load: 12,
      set: 'test',
      out,
      work: path.join(out, 'work'),
      sfizzSha256: 's',
      nodeAv: '0',
      configHash: config,
    };
    return setup;
  });

const midiSha = (hymn: number) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.resolve(
      import.meta.dir,
      '../../data/midi',
      `${String(hymn).padStart(3, '0')}.mid`,
    );
    return sha256Hex(yield* fs.readFile(file));
  });

/** Hymn 168's record and stand-in MP3 in `setup.out`, under `config`, changed by `change`. */
const put = (
  setup: Setup,
  config: string,
  change: { readonly sha256?: string; readonly render?: number; readonly limit?: number } = {},
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const record = {
      ...RECORD_168,
      key: keyOf(config, yield* midiSha(168)),
      sha256: change.sha256 ?? sha256Hex(MP3),
      rss: { ...RECORD_168.rss, render: change.render ?? RECORD_168.rss.render },
    };
    // The memory check as a run under another cap recorded it.
    if (change.limit !== undefined)
      record.checks = {
        ...record.checks,
        memory: { ok: record.rss.render <= change.limit, value: 0, limit: 1 },
      };
    yield* fs.writeFile(path.join(setup.out, '168.mp3'), MP3);
    yield* fs.writeFileString(path.join(setup.out, '168.json'), JSON.stringify(record));
    yield* fs.writeFileString(path.join(setup.out, '168.png'), 'sheet');
  });

const readBack = (setup: Setup) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const text = yield* fs.readFileString(path.join(setup.out, '168.json'));
    return {
      typed: yield* Schema.decodeEffect(HymnRecordJson)(text),
      whole: yield* Schema.decodeEffect(RecordObjectJson)(text),
      sheet: yield* fs.exists(path.join(setup.out, '168.png')),
    };
  });

describe('a hymn whose record stands', () => {
  test('is kept with no render when it failed only a check that was wrong, its record passed and its sheet gone', () =>
    Effect.gen(function* () {
      const setup = yield* setOf('c');
      yield* put(setup, 'c');
      const outcome = yield* renderHymn(setup, 168);
      expect(outcome).toEqual({
        hymn: 168,
        status: 'kept',
        line: '168 kept: checked again, passed',
      });
      const after = yield* readBack(setup);
      expect([after.typed.passed, after.typed.checks.stems.ok, after.sheet]).toEqual([
        true,
        true,
        false,
      ]);
      expect(after.whole['times']).toEqual(RECORD_168.times);
      expect(after.typed.sha256).toBe(sha256Hex(MP3));
      expect(yield* renderHymn(setup, 168)).toEqual({
        hymn: 168,
        status: 'kept',
        line: '168 kept',
      });
    }));

  test("stands under a config that sounds the same as the record's", () =>
    Effect.gen(function* () {
      const same = SAME_SOUND.find((s) => s.config.startsWith('681f4a71'));
      expect(same).toBeDefined();
      if (same === undefined) return;
      const setup = yield* setOf(same.sounds);
      yield* put(setup, same.config);
      expect((yield* standingOf(setup, 168, yield* sourceOf(STYLE, 168))).kind).toBe('stands');
    }));

  test('fails when a check that measured its run fails: the memory', () =>
    Effect.gen(function* () {
      const setup = yield* setOf('c');
      yield* put(setup, 'c', { render: 1.6e9 });
      expect((yield* standingOf(setup, 168, yield* sourceOf(STYLE, 168))).kind).toBe('fails');
    }));

  test("is kept with no render when its render's recorded peak failed a lower cap and is under today's", () =>
    Effect.gen(function* () {
      const setup = yield* setOf('c');
      yield* put(setup, 'c', { render: 1.17e9, limit: 1.0e9 });
      expect((yield* renderHymn(setup, 168)).line).toBe('168 kept: checked again, passed');
      const after = yield* readBack(setup);
      expect([after.typed.passed, after.typed.checks.memory.ok]).toEqual([true, true]);
    }));

  test('does not stand under another config, or when its MP3 is not the recorded one', () =>
    Effect.gen(function* () {
      const other = yield* setOf('c');
      yield* put(other, 'old');
      expect((yield* standingOf(other, 168, yield* sourceOf(STYLE, 168))).kind).toBe('render');
      const changed = yield* setOf('c');
      yield* put(changed, 'c', { sha256: 'f'.repeat(64) });
      expect((yield* standingOf(changed, 168, yield* sourceOf(STYLE, 168))).kind).toBe('render');
    }));
});

describe('the manifest', () => {
  test('lists the records that stand, by their verdict today, and leaves out one of another config', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const setup = yield* setOf('c');
      yield* put(setup, 'c');
      const stale = {
        ...RECORD_168,
        hymn: 663,
        file: '663.mp3',
        key: keyOf('old', yield* midiSha(663)),
      };
      yield* fs.writeFile(path.join(setup.out, '663.mp3'), MP3);
      yield* fs.writeFileString(path.join(setup.out, '663.json'), JSON.stringify(stale));
      const { manifest, left } = yield* writeManifest(setup);
      expect(manifest.hymns.map((h) => [h.hymn, h.passed])).toEqual([[168, true]]);
      expect(left).toEqual([663]);
      expect(manifest.configHash).toBe('c');
      expect(yield* fs.readFileString(path.join(setup.out, 'manifest.json'))).not.toContain(
        'transpose',
      );
    }));

  test("records a key set's transpose, and lists a hymn whose MP3 the stream deleted only from an uploaded set", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const setup = yield* setOf('c', 2);
      yield* put(setup, 'c');
      yield* fs.remove(path.join(setup.out, '168.mp3'));
      const local = yield* writeManifest(setup);
      expect([local.manifest.hymns.length, local.left]).toEqual([0, [168]]);
      const { manifest, left } = yield* writeManifest(setup, true);
      expect(manifest.transpose).toBe(2);
      expect(manifest.hymns.map((h) => [h.hymn, h.passed])).toEqual([[168, true]]);
      expect(left).toEqual([]);
    }));
});
