#!/usr/bin/env bun
/* Mark Violations rows in SOLID_AUDIT.md as resolved.

   Usage:
     bun scripts/mark-audit.ts <commit-sha> <id...>

   For each ID:
     - wraps the ID cell in ~~strikethrough~~
     - replaces the trailing ☐ with ✓ <short-sha>

   Idempotent — re-running on an already-resolved ID is a no-op. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , sha, ...ids] = process.argv;
if (!sha || ids.length === 0) {
  console.error('usage: bun scripts/mark-audit.ts <sha> <id...>');
  process.exit(1);
}
const shortSha = sha.slice(0, 8);

const file = resolve(import.meta.dir, '../SOLID_AUDIT.md');
let text = readFileSync(file, 'utf8');

let changed = 0;
for (const id of ids) {
  if (text.includes(`~~${id}~~`)) continue;
  const idCell = new RegExp(`(\\|)( *)${id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}( *)(\\|)`);
  const match = text.match(idCell);
  if (!match) {
    console.error(`mark-audit: ${id} not found`);
    process.exit(2);
  }
  text = text.replace(idCell, `$1$2~~${id}~~$3$4`);
  // Replace the row's trailing ☐ — find the row containing the id, swap the
  // last ☐ on that line for ✓ <sha>.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.includes(`~~${id}~~`) && lines[i]?.includes('☐')) {
      lines[i] = lines[i]!.replace(/☐/, `✓ ${shortSha}`);
      break;
    }
  }
  text = lines.join('\n');
  changed++;
}

writeFileSync(file, text);
console.log(`marked ${changed} row${changed === 1 ? '' : 's'} as resolved (sha=${shortSha})`);
