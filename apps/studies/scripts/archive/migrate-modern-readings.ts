#!/usr/bin/env bun
// One-shot migration: bohrReading -> modernReadings array.
//   { bohrReading: { citation, html } }     ->  { modernReadings: [{ source: 'bohr', citation, html }] }
//   { bohrReading: null }                   ->  { modernReadings: [] }
// Rewrites JSON in place, preserving key order so the migration diff is reviewable.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// scripts/archive/<file>.ts → up to apps/studies/
const HERE = resolve(__filename, '..', '..', '..');
const CHAPTERS_DIR = resolve(HERE, 'content', 'series', 'bohr-vs-millers-rules', 'chapters');

type RawVerse = Record<string, unknown> & {
  bohrReading?: { citation: string | null; html: string } | null;
};

type RawChapter = {
  slug: string;
  verses: RawVerse[];
  [k: string]: unknown;
};

const files = readdirSync(CHAPTERS_DIR).filter((f) => f.endsWith('.json'));
let totalVerses = 0;
let totalMigrated = 0;
let totalEmpty = 0;

for (const file of files) {
  const path = join(CHAPTERS_DIR, file);
  const chapter = JSON.parse(readFileSync(path, 'utf8')) as RawChapter;
  for (const verse of chapter.verses) {
    totalVerses += 1;
    const bohr = verse.bohrReading;
    const migrated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(verse)) {
      if (key === 'bohrReading') {
        // Insert modernReadings in the same slot to keep JSON ordering intuitive.
        if (bohr) {
          migrated.modernReadings = [{ source: 'bohr', citation: bohr.citation, html: bohr.html }];
          totalMigrated += 1;
        } else {
          migrated.modernReadings = [];
          totalEmpty += 1;
        }
        continue;
      }
      migrated[key] = value;
    }
    // Mutate the verse in place (replace its keys with migrated set).
    for (const k of Object.keys(verse)) delete (verse as Record<string, unknown>)[k];
    Object.assign(verse, migrated);
  }
  writeFileSync(path, JSON.stringify(chapter, null, 2) + '\n');
  console.log(`migrated ${file} (${chapter.verses.length} verses)`);
}

console.log(
  `\ndone — ${totalVerses} verses, ${totalMigrated} with bohr readings, ${totalEmpty} empty`,
);
