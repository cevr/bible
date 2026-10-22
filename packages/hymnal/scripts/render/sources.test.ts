import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { AUDIO_SOURCES } from './run.js';

const ROOT = resolve(import.meta.dir, '../../../..');
const FILM_MEASURE = join(ROOT, 'packages/film/src/measure.ts');

const IMPORT = /^import\s+(type\s+)?([\s\S]*?)\s+from\s+'([^']+)';/gm;
const EXPORT_FROM = /^export\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)';/gm;

/** The names a clause brings in at run time: none for `type` ones, `*` for a namespace. */
const valueNames = (clause: string) => {
  if (clause.startsWith('* as')) return ['*'];
  const braces = /\{([^}]*)\}/.exec(clause)?.[1] ?? '';
  const named = braces
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '' && !s.startsWith('type '))
    .map((s) => s.split(/\s+as\s+/)[0] ?? s);
  const bare = clause
    .replace(/\{[^}]*\}/, '')
    .replace(/,/g, '')
    .trim();
  return bare === '' ? named : [...named, 'default'];
};

/** A relative specifier as the file it names, `.js` read as the `.ts` beside it. */
const fileOf = (from: string, spec: string) => {
  const file = resolve(dirname(from), spec);
  return existsSync(file) ? file : file.replace(/\.js$/, '.ts');
};

/** The film's measure entry, by each name it re-exports at run time, as the file it comes from. */
const measureExports = () => {
  const text = readFileSync(FILM_MEASURE, 'utf8');
  const map = new Map<string, string>();
  for (const [, type, names, spec] of text.matchAll(EXPORT_FROM)) {
    if (type !== undefined || names === undefined || spec === undefined) continue;
    for (const name of names.split(',').map((s) => s.trim()))
      if (name !== '' && !name.startsWith('type ')) map.set(name, fileOf(FILM_MEASURE, spec));
  }
  return map;
};

/** Every repository file `entry` reaches by its run-time imports, itself included. */
const reached = (entry: string) => {
  const film = measureExports();
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const [, type, clause, spec] of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      if (type !== undefined || clause === undefined || spec === undefined) continue;
      const names = valueNames(clause);
      if (names.length === 0) continue;
      if (spec.startsWith('.')) walk(fileOf(file, spec));
      else if (spec === '@bible/film/measure')
        for (const name of names) {
          const target = film.get(name);
          if (target === undefined)
            throw new Error(`${name} is not re-exported by the measure entry`);
          walk(target);
        }
      else if (spec.startsWith('@bible/')) throw new Error(`${file} imports ${spec}: name it here`);
    }
  };
  walk(entry);
  return [...seen].map((file) => relative(ROOT, file)).sort();
};

describe('the sound sources the resume key hashes', () => {
  it.effect("are every file the sound's module reaches at run time, and the room", () =>
    Effect.sync(() => {
      const files = reached(join(ROOT, 'packages/hymnal/scripts/render/audio.ts'));
      expect([...files, 'packages/hymnal/scripts/render/room-C.wav'].sort()).toEqual(
        [...AUDIO_SOURCES].sort(),
      );
    }),
  );

  it.effect('leave out the checks, the record, the resume and the run', () =>
    Effect.sync(() => {
      for (const name of ['checks.ts', 'record.ts', 'resume.ts', 'run.ts', 'render.ts'])
        expect(AUDIO_SOURCES).not.toContain(`packages/hymnal/scripts/render/${name}`);
    }),
  );
});
