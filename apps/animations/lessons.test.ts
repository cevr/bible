// The lessons ledger (docs/lessons.md) holds each owner correction to its
// guard: every entry carries its fields, every code guard names a file that
// holds the name it cites, and every "judgement only" quotes a line its
// carrying file holds word for word. A guard renamed or a skill line reworded
// fails here, naming the entry.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Option, Path } from 'effect';

const FIELDS = ['Date', 'Said', 'Source', 'Wrong', 'Cause', 'Guard'] as const;

/** One entry: its id and each field's words, as written. */
interface Entry {
  readonly id: string;
  readonly fields: ReadonlyMap<string, string>;
}

const entriesOf = (ledger: string): ReadonlyArray<Entry> =>
  ledger
    .split('\n### ')
    .slice(1)
    .map((chunk) => {
      const [id = '', ...lines] = chunk.split('\n');
      const fields = new Map(
        lines.flatMap((line): ReadonlyArray<readonly [string, string]> =>
          Array.from(line.matchAll(/^- \*\*(\w+):\*\* (.+)$/g), (m) => [m[1] ?? '', m[2] ?? '']),
        ),
      );
      return { id: id.trim(), fields };
    });

/** What a guard asks of the repository: files holding names, or a file holding a line. */
type Claim = readonly [file: string, holds: string];

const claimsOf = (guard: string): ReadonlyArray<Claim> => {
  const carried = /^judgement only: .+? Carried by `([^`]+)`: "(.+)"$/.exec(guard);
  if (carried) return [[carried[1] ?? '', carried[2] ?? '']];
  return Array.from(guard.matchAll(/`([^`\s]+\/[^`\s]+\.[a-z]+)` `([^`]+)`/g), (m): Claim => [
    m[1] ?? '',
    m[2] ?? '',
  ]);
};

describe('the lessons ledger', () => {
  it.effect('holds every entry to a guard, or to judgement and the line that carries it', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.join(import.meta.dir, '..', '..');
      const entries = entriesOf(
        yield* fs.readFileString(path.join(import.meta.dir, 'docs', 'lessons.md')),
      );
      const problems: Array<string> = [];
      for (const entry of entries) {
        for (const field of FIELDS)
          if (!entry.fields.has(field)) problems.push(`${entry.id}: no ${field}`);
        const date = entry.fields.get('Date') ?? '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`${entry.id}: date ${date}`);
        const said = entry.fields.get('Said') ?? '';
        if (!/^(".+"|chose: ".+".*)$/.test(said))
          problems.push(`${entry.id}: said is neither his words in quotes nor a choice`);
        const claims = claimsOf(entry.fields.get('Guard') ?? '');
        if (claims.length === 0) problems.push(`${entry.id}: the guard names nothing to hold`);
        for (const [file, holds] of claims) {
          const text = yield* fs.readFileString(path.join(root, file)).pipe(Effect.option);
          Option.match(text, {
            onNone: () => problems.push(`${entry.id}: no file ${file}`),
            onSome: (t) => {
              if (!t.includes(holds))
                problems.push(`${entry.id}: ${file} does not hold "${holds}"`);
            },
          });
        }
      }
      expect({ entries: entries.length > 40, problems }).toEqual({ entries: true, problems: [] });
    }).pipe(Effect.provide(BunServices.layer)),
  );
});
