#!/usr/bin/env bun
/**
 * Clean Bible Assets
 *
 * One-time cleanup of encoding issues in JSON source files.
 * Run: bun run packages/core/scripts/clean-assets.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ASSETS_DIR = path.resolve(import.meta.dir, '../assets');

function decodeHtmlEntities(text: string): string {
  return text.replace(/&#(\d+)/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

// Clean strongs.json — HTML entities in definitions
const strongsPath = path.join(ASSETS_DIR, 'strongs.json');
console.log('Cleaning strongs.json...');
const strongs = JSON.parse(fs.readFileSync(strongsPath, 'utf-8'));

let strongsFixed = 0;
for (const [, entry] of Object.entries<{ lemma: string; xlit?: string; def: string }>(strongs)) {
  const cleaned = decodeHtmlEntities(entry.def);
  if (cleaned !== entry.def) {
    entry.def = cleaned;
    strongsFixed++;
  }
}

fs.writeFileSync(strongsPath, JSON.stringify(strongs, null, 2) + '\n');
console.log(`  Fixed ${strongsFixed} definitions`);

console.log('Done');
