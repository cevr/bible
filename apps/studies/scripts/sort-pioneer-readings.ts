#!/usr/bin/env bun
// Re-sort verse.pioneerReadings in every chapter JSON to match the canonical
// PioneerSource enum order. Idempotent.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PioneerSource, type Chapter } from './schema.ts';

const __filename = fileURLToPath(import.meta.url);
const HERE = resolve(__filename, '..', '..');
const CHAPTERS_DIR = join(HERE, 'content', 'series', 'bohr-vs-millers-rules', 'chapters');

const ORDER = new Map(PioneerSource.options.map((src, i) => [src, i]));

const files = readdirSync(CHAPTERS_DIR).filter((f) => f.endsWith('.json'));

for (const file of files) {
  const path = join(CHAPTERS_DIR, file);
  const chapter = JSON.parse(readFileSync(path, 'utf8')) as Chapter;
  let moved = 0;
  for (const verse of chapter.verses) {
    const before = verse.pioneerReadings.map((r) => r.source).join(',');
    verse.pioneerReadings.sort((a, b) => (ORDER.get(a.source) ?? 99) - (ORDER.get(b.source) ?? 99));
    const after = verse.pioneerReadings.map((r) => r.source).join(',');
    if (before !== after) moved++;
  }
  writeFileSync(path, JSON.stringify(chapter, null, 2) + '\n');
  console.log(`${file}: ${moved} verses re-sorted`);
}
