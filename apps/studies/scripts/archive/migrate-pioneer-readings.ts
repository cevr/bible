#!/usr/bin/env bun
// One-shot migration: pioneerReading (single, Smith only) -> pioneerReadings (array, multi-source).
//   { pioneerReading: { citation, html } }   ->  { pioneerReadings: [{ source: 'smith', citation, html }] }
//   { pioneerReading: null }                 ->  { pioneerReadings: [] }
// Rewrites JSON in place, preserving key order so the migration diff is reviewable.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
// scripts/archive/<file>.ts → up to apps/studies/
const HERE = resolve(__filename, '..', '..', '..');
const CHAPTERS_DIR = resolve(HERE, 'content', 'series', 'bohr-vs-millers-rules', 'chapters');

type RawVerse = Record<string, unknown> & {
  pioneerReading?: { citation: string | null; html: string } | null;
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
    const pioneer = verse.pioneerReading;
    const migrated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(verse)) {
      if (key === 'pioneerReading') {
        if (pioneer) {
          migrated.pioneerReadings = [
            { source: 'smith', citation: pioneer.citation, html: pioneer.html },
          ];
          totalMigrated += 1;
        } else {
          migrated.pioneerReadings = [];
          totalEmpty += 1;
        }
        continue;
      }
      migrated[key] = value;
    }
    for (const k of Object.keys(verse)) delete (verse as Record<string, unknown>)[k];
    Object.assign(verse, migrated);
  }
  writeFileSync(path, JSON.stringify(chapter, null, 2) + '\n');
  console.log(`migrated ${file} (${chapter.verses.length} verses)`);
}

console.log(
  `\ndone — ${totalVerses} verses, ${totalMigrated} with Smith readings, ${totalEmpty} empty`,
);
