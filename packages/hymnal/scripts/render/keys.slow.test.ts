/**
 * The sampled ranges against the instruments themselves, and every key set's
 * notes against the ranges. Slow: it reads the instrument cache
 * (`$HYMN_RENDER_CACHE`, default `~/.cache/manna-hymn-render`) that
 * `render` fetches, and the whole corpus at each of the 11 keys.
 */

import * as BunServices from '@effect/platform-bun/BunServices';
import { Config, Effect, FileSystem, Path } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import * as Midi from '../../src/midi.js';
import { KEY_TRANSPOSES } from '../../src/recordings.js';
import { voices } from '../../src/voices.js';
import { keyedStyle, SAMPLED } from './keys.js';
import { planOf } from './plan.js';
import { STYLE } from './style.js';

const instruments = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String('HOME');
  const cache = yield* Config.String('HYMN_RENDER_CACHE').pipe(
    Config.withDefault(path.join(home, '.cache', 'manna-hymn-render')),
  );
  return path.join(cache, 'instruments');
});

/** An SFZ file's text with each `#include` replaced by its file, read from the instrument's folder. */
const expanded = (
  dir: string,
  file: string,
): Effect.Effect<string, unknown, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const text = (yield* fs.readFileString(path.join(dir, file))).replace(/\/\/[^\n]*/g, '');
    const parts = text.split(/#include\s+"([^"]+)"/);
    let out = '';
    for (const [i, part] of parts.entries())
      out += i % 2 === 0 ? part : yield* expanded(dir, part.replace(/\\/g, '/'));
    return out;
  });

const SCOPES = ['control', 'global', 'master', 'group', 'region'];

/**
 * The keys an SFZ's note-on regions sample: each `<region>` with its
 * `<global>`, `<master>` and `<group>` opcodes, release triggers left out.
 */
const sampledKeys = (sfz: string) => {
  const scopes = new Map<string, Map<string, string>>();
  const keys = new Set<number>();
  const close = () => {
    const region = scopes.get('region');
    if (region === undefined) return;
    const all = new Map(
      ['global', 'master', 'group', 'region'].flatMap((s) => [...(scopes.get(s) ?? [])]),
    );
    if ((all.get('trigger') ?? 'attack') === 'release') return;
    const key = all.get('key');
    const low = Number(all.get('lokey') ?? key ?? 0);
    const high = Number(all.get('hikey') ?? key ?? 127);
    if (!Number.isInteger(low) || !Number.isInteger(high)) throw new Error(`key ${low} ${high}`);
    for (let k = low; k <= high; k++) keys.add(k);
  };
  for (const match of sfz.matchAll(/<(\w+)>|(?:^|\s)(\w+)=(\S+)/g)) {
    const [, header, opcode, value] = match;
    if (header !== undefined) {
      close();
      const at = SCOPES.indexOf(header);
      if (at < 0) {
        scopes.delete('region');
        continue;
      }
      for (const inner of SCOPES.slice(at)) scopes.delete(inner);
      scopes.set(header, new Map());
    } else if (opcode !== undefined && value !== undefined) {
      const scope = SCOPES.findLast((s) => scopes.has(s));
      if (scope !== undefined) scopes.get(scope)?.set(opcode, value);
    }
  }
  close();
  return keys;
};

/** The run of sampled keys around middle C: its lowest and highest key. */
const runAround = (keys: Set<number>, from = 60) => {
  let low = from;
  let high = from;
  while (keys.has(low - 1)) low--;
  while (keys.has(high + 1)) high++;
  return keys.has(from) ? { low, high } : undefined;
};

describe('the sampled ranges', () => {
  it.scopedLive.layer(BunServices.layer)(
    "are each instrument's own: every key in the range has a note-on sample, the keys either side none",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const root = yield* instruments;
        const sfzs = [...new Set(STYLE.stems.map((s) => s.sfz))];
        for (const sfz of sfzs) {
          const keys = sampledKeys(
            yield* expanded(path.join(root, path.dirname(sfz)), path.basename(sfz)),
          );
          expect({ sfz, range: runAround(keys) }).toEqual({ sfz, range: SAMPLED.get(sfz) });
        }
        expect([...SAMPLED.keys()].sort()).toEqual(sfzs.sort());
      }),
  );

  it.scopedLive.layer(BunServices.layer)(
    'hold every note of every hymn at each of the 11 keys',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = path.resolve(import.meta.dir, '../../data/midi');
        const files = (yield* fs.readDirectory(dir)).filter((f) => f.endsWith('.mid')).sort();
        expect(files.length).toBe(695);
        let notes = 0;
        const outside: Array<string> = [];
        for (const file of files) {
          const hymn = Number(file.slice(0, 3));
          const parts = voices(yield* Midi.parse(yield* fs.readFile(path.join(dir, file))));
          for (const t of KEY_TRANSPOSES) {
            for (const { stem, notes: played } of planOf(
              parts,
              keyedStyle(STYLE, parts, t).style,
              hymn,
            )) {
              const range = SAMPLED.get(stem.sfz);
              for (const n of played) {
                notes++;
                if (range === undefined || n.key < range.low || n.key > range.high)
                  outside.push(`${hymn} ${t} ${stem.name} ${n.key}`);
              }
            }
          }
        }
        expect(outside).toEqual([]);
        expect(notes).toBeGreaterThan(1_000_000);
      }),
  );
});
