#!/usr/bin/env bun
/** Mark selected SOLID_AUDIT.md violations as resolved. */
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Console, Effect, FileSystem, Path } from 'effect';

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const [sha, ...ids] = process.argv.slice(2);
  if (sha === undefined || ids.length === 0) {
    yield* Console.error('usage: bun scripts/mark-audit.ts <sha> <id...>');
    return yield* Effect.fail('invalid mark-audit arguments');
  }
  const shortSha = sha.slice(0, 8);
  const file = path.resolve(import.meta.dir, '../SOLID_AUDIT.md');
  let contents = yield* fs.readFileString(file);
  let changed = 0;

  for (const id of ids) {
    if (contents.includes(`~~${id}~~`)) continue;
    const idCell = new RegExp(`(\\|)( *)${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( *)(\\|)`);
    const match = contents.match(idCell);
    if (match === null) {
      yield* Console.error(`mark-audit: ${id} not found`);
      return yield* Effect.fail(`unknown audit id ${id}`);
    }
    contents = contents.replace(idCell, `$1$2~~${id}~~$3$4`);
    const lines = contents.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line?.includes(`~~${id}~~`) && line.includes('☐')) {
        lines[index] = line.replace(/☐/, `✓ ${shortSha}`);
        break;
      }
    }
    contents = lines.join('\n');
    changed += 1;
  }

  yield* fs.writeFileString(file, contents);
  let suffix = 's';
  if (changed === 1) suffix = '';
  yield* Console.log(`marked ${String(changed)} row${suffix} as resolved (sha=${shortSha})`);
}).pipe(Effect.provide(NodeServices.layer));

NodeRuntime.runMain(program);
