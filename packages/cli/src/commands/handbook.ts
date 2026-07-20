/**
 * Handbook CLI Commands
 *
 * Assemble a finished Bible-handbook study from its per-section markdown files in
 * one deterministic call — the job the handbook-factory workflow's aggregator/save
 * agents do, but as a single fast CLI step (no LLM, no flakiness).
 *
 *   bible handbook save <dir>            - assemble <dir>/handbook.json + sections → outPath
 *   bible handbook save <dir> --out X    - write to X instead of the manifest's outPath
 *   bible handbook save <dir> --dry-run  - print the assembled handbook, write nothing
 *
 * The sections directory must contain:
 *   - the per-section files (e.g. 01-foo.md, 02-bar.md), each starting with "## Title"
 *   - a handbook.json manifest describing the front matter and the ordered section→part map
 *
 * handbook.json shape (the factory writes this straight from the spec):
 *   {
 *     "title":   "X — A Bible Handbook Study",
 *     "topic":   "X — A Bible Handbook Study",        // optional; defaults to title
 *     "createdAt": "2026-06-26T12:00:00Z",            // optional; defaults to now
 *     "thesis":  "…paragraph…",
 *     "method":  "…paragraph…",
 *     "outPath": "/abs/path/to/final.md",             // optional; --out overrides
 *     "sections": [ { "file": "01-foo.md", "part": "I — The Method" }, … ]
 *   }
 */

import { Argument, Command, Flag } from 'effect/unstable/cli';
import { BunServices } from '@effect/platform-bun';
import { Console, DateTime, Effect, FileSystem, Option, Schema } from 'effect';

import { CliProcess } from '../services/process.js';

// ============================================================================
// Manifest shape (parsed from handbook.json)
// ============================================================================

const ManifestSection = Schema.Struct({
  file: Schema.String,
  part: Schema.String,
});

const HandbookManifest = Schema.Struct({
  title: Schema.String,
  topic: Schema.optional(Schema.String),
  createdAt: Schema.optional(Schema.String),
  thesis: Schema.String,
  method: Schema.String,
  outPath: Schema.optional(Schema.String),
  sections: Schema.Array(ManifestSection),
});

type HandbookManifest = typeof HandbookManifest.Type;

const decodeHandbookManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(HandbookManifest));

// ============================================================================
// Parsing helpers (pure)
// ============================================================================

/**
 * A parsed section: its title (from the first "## " line), the body verbatim
 * from that heading onward, and the symbols it defines (from the
 * "**Symbols defined here:**" block) for the appendix.
 */
interface ParsedSection {
  readonly title: string;
  readonly body: string; // begins at "## Title"
  readonly definedSymbols: ReadonlyArray<string>; // raw bullet text, "- " stripped
}

/**
 * Strip any leaked agent narration before the first "## " heading, then split
 * title from body. Returns null (rather than throwing) when no heading is found,
 * so the caller can report the offending file and exit cleanly.
 */
function parseSection(raw: string): ParsedSection | null {
  const lines = raw.split('\n');
  const headingIdx = lines.findIndex((l) => /^##\s+\S/.test(l));
  if (headingIdx === -1) {
    return null;
  }

  const headingLine = lines[headingIdx] ?? '';
  // Drop an existing numeric prefix ("## 3. Foo" → "Foo") so we can renumber cleanly.
  const title = headingLine
    .replace(/^##\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .trim();

  const body = lines.slice(headingIdx).join('\n').trim();
  const definedSymbols = extractDefinedSymbols(lines.slice(headingIdx));

  return { title, body, definedSymbols };
}

/**
 * Pull the bullets under "**Symbols defined here:**" up to the next bold label
 * or blank-line break. Each returned string is the bullet text without "- ".
 */
function extractDefinedSymbols(bodyLines: ReadonlyArray<string>): ReadonlyArray<string> {
  const startIdx = bodyLines.findIndex((l) => /\*\*Symbols defined here:\*\*/i.test(l));
  if (startIdx === -1) return [];

  const out: string[] = [];
  for (let i = startIdx + 1; i < bodyLines.length; i++) {
    const line = bodyLines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      // A blank line ends the block only once we've started collecting bullets.
      if (out.length > 0) break;
      continue;
    }
    // A new bold label ("**Symbols carried:**", "**For discussion:**", …) ends it.
    if (/^\*\*/.test(trimmed) && !/^- /.test(trimmed)) break;
    if (/^- /.test(trimmed)) {
      out.push(trimmed.replace(/^- /, '').trim());
    } else if (out.length > 0) {
      // A continuation line of the previous bullet (wrapped) — append.
      out[out.length - 1] = `${out[out.length - 1] ?? ''} ${trimmed}`;
    }
  }
  return out;
}

/** Renumber a section body's heading from "## Title" to "## N. Title". */
function numberHeading(body: string, n: number, title: string): string {
  const firstNl = body.indexOf('\n');
  let rest = '';
  if (firstNl !== -1) rest = body.slice(firstNl);
  return `## ${n}. ${title}${rest}`;
}

function partHeading(part: string): string {
  if (part.startsWith('Part')) return part;
  return `Part ${part}`;
}

/** A leading article ("the", "a", "an") ignored for alphabetizing the appendix. */
function appendixSortKey(symbolBullet: string): string {
  // Bullet form: "**symbol** = meaning (receipts)." — sort on the bold symbol name.
  const m = symbolBullet.match(/\*\*([^*]+)\*\*/);
  const name = (m?.[1] ?? symbolBullet).toLowerCase().trim();
  return name.replace(/^(the|a|an)\s+/, '');
}

/** Build the YAML frontmatter block. */
function frontmatter(topic: string, createdAt: string): string {
  return ['---', `created_at: '${createdAt}'`, `topic: ${topic}`, '---'].join('\n');
}

/**
 * Assemble the whole handbook markdown from the manifest + parsed sections.
 * Pure: takes the parsed inputs, returns the final document string.
 */
function assemble(
  manifest: HandbookManifest,
  sections: ReadonlyArray<{ parsed: ParsedSection; part: string }>,
  defaultCreatedAt: string,
): string {
  const topic = manifest.topic ?? manifest.title;
  const createdAt = manifest.createdAt ?? defaultCreatedAt;

  // Group sections into parts, preserving first-appearance order of parts.
  const partOrder: string[] = [];
  const byPart = new Map<string, Array<{ n: number; title: string; body: string }>>();
  sections.forEach((s, idx) => {
    const n = idx + 1;
    if (!byPart.has(s.part)) {
      byPart.set(s.part, []);
      partOrder.push(s.part);
    }
    byPart.get(s.part)?.push({
      n,
      title: s.parsed.title,
      body: numberHeading(s.parsed.body, n, s.parsed.title),
    });
  });

  // --- Table of Contents ---
  const tocLines: string[] = ['## Table of Contents', ''];
  for (const part of partOrder) {
    tocLines.push(`**${partHeading(part)}**`, '');
    for (const sec of byPart.get(part) ?? []) {
      tocLines.push(`${sec.n}. ${sec.title}`);
    }
    tocLines.push('');
  }

  // --- Body: Part dividers + section bodies ---
  const bodyLines: string[] = [];
  for (const part of partOrder) {
    bodyLines.push(`# ${partHeading(part)}`, '');
    for (const sec of byPart.get(part) ?? []) {
      bodyLines.push(sec.body.trim(), '');
    }
  }

  // --- Appendix — Symbol Dictionary ---
  const appendixEntries: Array<{ key: string; line: string }> = [];
  for (const s of sections) {
    for (const sym of s.parsed.definedSymbols) {
      // Tag each entry with its owning section title.
      let punctuation = '.';
      if (/\.\s*$/.test(sym)) punctuation = '';
      const line = `- ${sym}${punctuation} — defined in "${s.parsed.title}".`;
      appendixEntries.push({ key: appendixSortKey(sym), line });
    }
  }
  appendixEntries.sort((a, b) => a.key.localeCompare(b.key));

  const appendixLines: string[] = [
    '## Appendix — Symbol Dictionary',
    '',
    'Every symbol defined in this handbook, alphabetically (leading articles ignored), with its receipts and owning section.',
    '',
    ...appendixEntries.map((e) => e.line),
  ];

  return [
    frontmatter(topic, createdAt),
    '',
    `# ${manifest.title}`,
    '',
    `**Thesis.** ${manifest.thesis}`,
    '',
    `**Method.** ${manifest.method}`,
    '',
    '---',
    '',
    tocLines.join('\n').trim(),
    '',
    '---',
    '',
    bodyLines.join('\n').trim(),
    '',
    '---',
    '',
    appendixLines.join('\n').trim(),
    '',
  ].join('\n');
}

// ============================================================================
// save — the one-call assembler
// ============================================================================

const saveDir = Argument.directory('dir', { mustExist: true }).pipe(
  Argument.withDescription('Directory containing handbook.json and the per-section .md files'),
);
const saveOut = Flag.string('out').pipe(
  Flag.withAlias('o'),
  Flag.withDescription('Output path (overrides the manifest outPath)'),
  Flag.optional,
);
const saveManifest = Flag.string('manifest').pipe(
  Flag.withDescription('Path to the manifest JSON (default: <dir>/handbook.json)'),
  Flag.optional,
);
const saveDryRun = Flag.boolean('dry-run').pipe(
  Flag.withDescription('Print the assembled handbook to stdout; write nothing'),
  Flag.withDefault(false),
);

export const handbookSave = Command.make(
  'save',
  { dir: saveDir, out: saveOut, manifest: saveManifest, dryRun: saveDryRun },
  (args) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cliProcess = yield* CliProcess;

      const manifestPath = Option.match(args.manifest, {
        onSome: (m) => m,
        onNone: () => `${args.dir}/handbook.json`,
      });

      const manifestExists = yield* fs.exists(manifestPath);
      if (!manifestExists) {
        yield* Console.error(`No manifest found at ${manifestPath}.`);
        yield* Console.error(
          'Pass --manifest <path>, or drop a handbook.json in the sections dir. Shape:',
        );
        yield* Console.error(
          '  { "title", "thesis", "method", "outPath", "sections": [ { "file", "part" } ] }',
        );
        return yield* cliProcess.exitFailure;
      }

      const manifestRaw = yield* fs.readFileString(manifestPath);
      const manifest = yield* decodeHandbookManifest(manifestRaw).pipe(
        Effect.catch((error) =>
          Effect.gen(function* () {
            yield* Console.error(`Could not parse handbook manifest: ${String(error)}`);
            return yield* cliProcess.exitFailure;
          }),
        ),
      );

      if (!Array.isArray(manifest.sections) || manifest.sections.length === 0) {
        yield* Console.error('Manifest has no sections[].');
        return yield* cliProcess.exitFailure;
      }

      // Read + parse each section in manifest order.
      const parsed: Array<{ parsed: ParsedSection; part: string }> = [];
      for (const s of manifest.sections) {
        let path = `${args.dir}/${s.file}`;
        if (s.file.startsWith('/')) path = s.file;
        const exists = yield* fs.exists(path);
        if (!exists) {
          yield* Console.error(`Section file missing: ${path}`);
          return yield* cliProcess.exitFailure;
        }
        const raw = yield* fs.readFileString(path);
        const parsedSection = parseSection(raw);
        if (parsedSection === null) {
          yield* Console.error(`Section "${s.file}" has no "## Title" heading.`);
          return yield* cliProcess.exitFailure;
        }
        parsed.push({ parsed: parsedSection, part: s.part });
      }

      const now = yield* DateTime.now;
      const document = assemble(manifest, parsed, DateTime.formatIso(now));

      // Count symbols for the summary line.
      const symbolCount = parsed.reduce((acc, p) => acc + p.parsed.definedSymbols.length, 0);

      if (args.dryRun) {
        yield* Console.log(document);
        yield* Console.error(
          `\n[dry-run] ${parsed.length} sections, ${symbolCount} symbols — not written.`,
        );
        return;
      }

      const outPath = Option.match(args.out, {
        onSome: (o) => o,
        onNone: () => manifest.outPath,
      });
      if (outPath === undefined) {
        yield* Console.error('No output path: set "outPath" in the manifest or pass --out.');
        return yield* cliProcess.exitFailure;
      }

      yield* fs.writeFileString(outPath, document);
      yield* Console.log(
        `✓ Assembled "${manifest.title}" — ${parsed.length} sections, ${symbolCount} symbols.`,
      );
      yield* Console.log(`  → ${outPath}`);
    }).pipe(Effect.provide(BunServices.layer)),
);

// ============================================================================
// Root handbook command
// ============================================================================

export const handbook = Command.make('handbook', {}, () =>
  Effect.gen(function* () {
    yield* Console.log('Usage: bible handbook save <dir> [--out PATH] [--dry-run]');
    yield* Console.log('');
    yield* Console.log(
      'Assemble a finished handbook from <dir>/handbook.json + its per-section .md files',
    );
    yield* Console.log('in one deterministic call (frontmatter, TOC, Part dividers, renumbered');
    yield* Console.log('sections, and the Symbol Dictionary appendix).');
    yield* Console.log('');
    yield* Console.log('Examples:');
    yield* Console.log('  bible handbook save outputs/studies/why-he-tarries/sections');
    yield* Console.log('  bible handbook save ./sections --out /tmp/draft.md --dry-run');
  }),
).pipe(Command.withSubcommands([handbookSave]));
