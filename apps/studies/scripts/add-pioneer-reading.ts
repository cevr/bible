#!/usr/bin/env bun
// Append (or upsert) a pioneerReading entry on a specific verse in a chapter JSON.
//
// Usage:
//   bun scripts/add-pioneer-reading.ts \
//     --chapter rev-13 \
//     --verse "Rev 13:1" \
//     --source litch \
//     --citation "PREX1 156.3" \
//     --html "Litch identifies the sea-beast as papal Rome ..."
//
// Reads citation+html from stdin if --html is omitted; useful for long bodies:
//   echo "<long html...>" | bun scripts/add-pioneer-reading.ts --chapter rev-13 ...
//
// If a reading already exists for the given source on that verse, it is
// REPLACED (idempotent re-runs).

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PioneerSource, type Chapter } from './schema.ts';

const __filename = fileURLToPath(import.meta.url);
const HERE = resolve(__filename, '..', '..');
const CHAPTERS_DIR = join(HERE, 'content', 'series', 'bohr-vs-millers-rules', 'chapters');

type Args = {
  chapter?: string;
  verse?: string;
  source?: string;
  citation?: string;
  html?: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag?.startsWith('--')) continue;
    const key = flag.slice(2) as keyof Args;
    const value = argv[i + 1];
    if (value === undefined) continue;
    out[key] = value;
    i++;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.chapter || !args.verse || !args.source) {
  console.error('Missing required args: --chapter <slug> --verse "<ref>" --source <enum>');
  process.exit(1);
}

const sourceParse = PioneerSource.safeParse(args.source);
if (!sourceParse.success) {
  console.error(`Invalid source '${args.source}'. Allowed: ${PioneerSource.options.join(', ')}`);
  process.exit(1);
}

let html = args.html;
if (html === undefined) {
  html = readFileSync(0, 'utf8').trim();
}
if (!html) {
  console.error('Missing html body (provide via --html or stdin).');
  process.exit(1);
}

const chapterPath = join(CHAPTERS_DIR, `${args.chapter}.json`);
const chapter = JSON.parse(readFileSync(chapterPath, 'utf8')) as Chapter;

const verse = chapter.verses.find((v) => v.ref === args.verse);
if (!verse) {
  console.error(`Verse '${args.verse}' not found in ${args.chapter}.json`);
  console.error(`Available refs: ${chapter.verses.map((v) => v.ref).join(', ')}`);
  process.exit(1);
}

const citation = args.citation ?? null;
const entry = { source: sourceParse.data, citation, html };

const existingIdx = verse.pioneerReadings.findIndex((r) => r.source === sourceParse.data);
let action: 'added' | 'replaced';
if (existingIdx >= 0) {
  verse.pioneerReadings[existingIdx] = entry;
  action = 'replaced';
} else {
  verse.pioneerReadings.push(entry);
  action = 'added';
}

writeFileSync(chapterPath, JSON.stringify(chapter, null, 2) + '\n');
console.log(
  `${action} ${sourceParse.data} reading on ${args.verse} (citation: ${citation ?? '—'})`,
);
