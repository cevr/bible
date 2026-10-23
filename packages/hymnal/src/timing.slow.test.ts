/**
 * The committed timing is the compiler's: every hymn compiled afresh from
 * hymnal.db and its MIDI file (by the compile script, into a scratch folder)
 * carries the timing its committed file carries.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, FileSystem, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { run } from '../scripts/render/proc.js';
import { Hymn } from './hymn.js';

const COMMITTED = new URL('../data/sdah-1985/', import.meta.url).pathname;
const SCRIPT = new URL('../scripts/compile.ts', import.meta.url).pathname;

const decodeHymn = Schema.decodeUnknownEffect(Schema.fromJsonString(Hymn));

describe('the committed timing', () => {
  it.effect(
    'is what the compiler gives each hymn from hymnal.db and its file',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const out = yield* fs.makeTempDirectoryScoped();
        const compiled = yield* run('bun', [SCRIPT, '--out', out]);
        expect(compiled.code).toBe(0);
        const names = (yield* fs.readDirectory(COMMITTED)).filter((name) =>
          /^\d{3}\.json$/.test(name),
        );
        expect(names).toHaveLength(695);
        for (const name of names) {
          const fresh = yield* decodeHymn(yield* fs.readFileString(`${out}/${name}`));
          const committed = yield* decodeHymn(yield* fs.readFileString(`${COMMITTED}${name}`));
          expect({ name, timing: committed.timing }).toEqual({ name, timing: fresh.timing });
        }
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
    // oxlint-disable-next-line film/tests-keep-their-strength -- the compile script runs as its own bun process, through proc.js's run (spawn budget).
    60_000,
  );
});
