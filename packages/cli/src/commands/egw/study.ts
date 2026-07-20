import { EGWApiClient, nodesToText, type Schemas as EGWSchemas } from '@bible/core/egw';
import { CorpusSupply, Target } from '@bible/core/corpus-supply';
import { publicationId } from '@bible/core/writings';
import { WritingsService } from '@bible/core/writings/service';
import { Console, Effect, FileSystem, Option, Result, Stream } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { paragraphRefcode } from './format.js';
import { FullLayer } from './layers.js';

const studySubject = Argument.string('subject').pipe(Argument.variadic());
const studyLimit = Flag.integer('limit').pipe(
  Flag.withDescription('Max books to download, ranked by hit count (default: 15)'),
  Flag.withDefault(15),
);
const studyMinHits = Flag.integer('min-hits').pipe(
  Flag.withDescription('Only download books with at least this many remote hits (default: 2)'),
  Flag.withDefault(2),
);
const studyScan = Flag.integer('scan').pipe(
  Flag.withDescription('Remote hits to scan when ranking (paged in 100s; default: 200)'),
  Flag.withDefault(200),
);
const studyAuthor = Flag.string('author').pipe(
  Flag.withDescription(
    'Only rank/download books whose author matches (case-insensitive substring). Repeatable.',
  ),
  Flag.atLeast(0),
);
const studyPioneers = Flag.boolean('pioneers').pipe(
  Flag.withDescription('Preset --author filter for the nine SDA pioneers'),
  Flag.withDefault(false),
);
const studyLang = Flag.string('lang').pipe(
  Flag.withDescription('Language code (default: en)'),
  Flag.withDefault('en'),
);
const studyDryRun = Flag.boolean('dry-run').pipe(
  Flag.withDescription('Rank and list the books that WOULD be downloaded; download nothing'),
  Flag.withDefault(false),
);
const studyResults = Flag.integer('results').pipe(
  Flag.withDescription('Local result snippets to print after downloading (default: 30)'),
  Flag.withDefault(30),
);
const studyExport = Flag.string('export').pipe(
  Flag.withDescription('Write the local hits to a refcode-tagged markdown corpus at this path'),
  Flag.optional,
);
const studyFull = Flag.boolean('full').pipe(
  Flag.withDescription('In --export, write the full paragraph text (not the console snippet)'),
  Flag.withDefault(false),
);

/** The nine historic SDA pioneers, for the --pioneers preset. */
const PIONEER_AUTHORS = [
  'James Springer White',
  'Uriah Smith',
  'Josiah Litch',
  'John Nevins Andrews',
  'Stephen Nelson Haskell',
  'William Miller',
  'Sylvester Bliss',
  'Apollos Hale',
  'Charles Fitch',
];

/** A book ranked by how many remote hits it had for the subject. */
interface RankedBook {
  pubCode: string;
  pubName: string;
  hits: number;
}

const REMOTE_PAGE_SIZE = 100; // the EGW /search endpoint caps results at 100 per call

/** Does a book author match any of the requested author filters (substring, case-insensitive)? */
const authorMatches = (author: string, filters: string[]): boolean =>
  filters.length === 0 || filters.some((f) => author.toLowerCase().includes(f.toLowerCase()));

export const egwStudy = Command.make(
  'study',
  {
    subject: studySubject,
    limit: studyLimit,
    minHits: studyMinHits,
    scan: studyScan,
    author: studyAuthor,
    pioneers: studyPioneers,
    lang: studyLang,
    dryRun: studyDryRun,
    results: studyResults,
    export: studyExport,
    full: studyFull,
  },
  (args) =>
    Effect.gen(function* () {
      const subject = args.subject.join(' ').trim();
      if (subject.length === 0) {
        yield* Console.log('Usage: bible egw study <subject> [flags]');
        yield* Console.log('');
        yield* Console.log(
          'Remote-searches a subject, downloads the books that cover it best into the',
        );
        yield* Console.log('local DB, then prints (and optionally exports) the local hits.');
        yield* Console.log('');
        yield* Console.log('Examples:');
        yield* Console.log('  bible egw study "seven last plagues"');
        yield* Console.log('  bible egw study "the day of the Lord" --pioneers --limit 8');
        yield* Console.log(
          '  bible egw study "wrath" --scan 500 --author "Smith" --author "Litch"',
        );
        yield* Console.log('  bible egw study "armageddon" --dry-run');
        yield* Console.log('  bible egw study "loud cry" --export corpus/loud-cry.md');
        return;
      }

      const client = yield* EGWApiClient;
      const supply = yield* CorpusSupply;
      const service = yield* WritingsService;
      const fs = yield* FileSystem.FileSystem;

      let authorFilters = [...args.author];
      if (args.pioneers) authorFilters = PIONEER_AUTHORS;
      const scoped = authorFilters.length > 0;

      // --- Phase 1: remote-search the subject (paged) and rank books by hits --
      yield* Console.log(`Searching the EGW catalog for "${subject}"...`);
      const hits: EGWSchemas.SearchHit[] = [];
      let scanOffset = 0;
      while (hits.length < args.scan) {
        const page = yield* client.search({
          query: subject,
          lang: args.lang,
          limit: Math.min(REMOTE_PAGE_SIZE, args.scan - hits.length),
          offset: scanOffset,
        });
        if (page.results.length === 0) break;
        hits.push(...page.results);
        scanOffset += page.results.length;
        // Stop when the server has no more (short page, or we've seen the lot).
        if (page.results.length < REMOTE_PAGE_SIZE || scanOffset >= page.total) break;
      }

      if (hits.length === 0) {
        yield* Console.log(`No remote results for "${subject}".`);
        return;
      }

      const rankMap = new Map<string, RankedBook>();
      for (const hit of hits) {
        const existing = rankMap.get(hit.pub_code);
        if (existing) {
          existing.hits += 1;
        } else {
          rankMap.set(hit.pub_code, {
            pubCode: hit.pub_code,
            pubName: hit.pub_name,
            hits: 1,
          });
        }
      }

      // Rank by hits, threshold, take a generous slice (author filtering happens
      // at resolve time below, since hits don't reliably carry the author).
      const candidatePool = [...rankMap.values()]
        .filter((b) => b.hits >= args.minHits)
        .sort((a, b) => b.hits - a.hits);

      const installed = yield* service.catalog();
      const installedCodes = new Set(installed.map((b) => b.code.toUpperCase()));

      let authorFilterSummary = '';
      if (scoped) authorFilterSummary = `; author filter: ${authorFilters.join(', ')}`;
      yield* Console.log(
        `Scanned ${hits.length} hit(s) across ${rankMap.size} book(s); ` +
          `${candidatePool.length} clear --min-hits ${args.minHits}` +
          authorFilterSummary +
          '.\n',
      );

      // --- Phase 2: resolve pub_code -> Book, apply author filter, download ----
      // We resolve in rank order and keep going until --limit books are selected
      // (a selected book = passes author filter; installed ones count toward the
      // limit but aren't re-downloaded).
      let selected = 0;
      let downloaded = 0;
      let failed = 0;
      let skippedByAuthor = 0;
      const selectedBooks: Array<{
        code: string;
        title: string;
        author: string;
        hits: number;
      }> = [];

      for (const b of candidatePool) {
        if (selected >= args.limit) break;

        // Resolve pub_code -> Book (carries book_id + author) via title-search,
        // matching exactly on code. Mirrors `bible egw download <code>`.
        const candidates = yield* client
          .getBooks({ lang: args.lang, search: b.pubName, limit: 50 })
          .pipe(Stream.take(50), Stream.runCollect);
        const exact = [...candidates].find((c) => c.code.toUpperCase() === b.pubCode.toUpperCase());

        if (!exact) {
          // Unresolvable (e.g. compound pub_code). Only note it when unscoped, to
          // avoid noise; it can't be author-checked anyway.
          if (!scoped) {
            yield* Console.log(`  ✗ ${b.pubCode}: could not resolve to a catalog book; skipping.`);
            failed += 1;
          }
          continue;
        }

        if (!authorMatches(exact.author, authorFilters)) {
          skippedByAuthor += 1;
          continue;
        }

        selected += 1;
        selectedBooks.push({
          code: exact.code,
          title: exact.title,
          author: exact.author,
          hits: b.hits,
        });

        if (installedCodes.has(exact.code.toUpperCase())) {
          yield* Console.log(
            `  ${String(selected).padStart(2)}. ${exact.code.padEnd(10)} ${String(b.hits).padStart(4)} hits [installed]  ${exact.title}`,
          );
          continue;
        }

        if (args.dryRun) {
          yield* Console.log(
            `  ${String(selected).padStart(2)}. ${exact.code.padEnd(10)} ${String(b.hits).padStart(4)} hits [would download]  ${exact.title} (${exact.author})`,
          );
          continue;
        }

        yield* Console.log(
          `  ${String(selected).padStart(2)}. ↓ ${exact.code} — ${exact.title} (${exact.author})...`,
        );
        const result = yield* Effect.result(
          supply.ensure({
            target: Target.writings([publicationId(exact.book_id)]),
            refresh: true,
          }),
        );
        if (Result.isFailure(result)) {
          yield* Console.log(`      ✗ failed: ${result.failure._tag}`);
          failed += 1;
        } else {
          const activation = result.success.activated[0];
          yield* Console.log(`      ✓ ${activation?.installed ?? 0} paragraphs.`);
          downloaded += 1;
        }
      }

      yield* Console.log('');
      if (args.dryRun) {
        yield* Console.log('--dry-run: nothing downloaded. Re-run without --dry-run to fetch.');
        return;
      }

      let failureSummary = '';
      if (failed > 0) failureSummary = `, ${failed} failed/unresolved`;
      let authorSkipSummary = '';
      if (skippedByAuthor > 0) authorSkipSummary = `, ${skippedByAuthor} skipped by author filter`;
      yield* Console.log(
        `Downloaded ${downloaded} book(s)` + failureSummary + authorSkipSummary + '.\n',
      );

      // --- Phase 3: local FTS across everything now installed -----------------
      const allBooks = yield* service.catalog();
      const authorByCode = new Map(allBooks.map((b) => [b.code.toUpperCase(), b.author]));
      let resultMultiplier = 1;
      if (scoped) resultMultiplier = 4;
      const rawResults = yield* service.search(subject, {
        limit: args.results * resultMultiplier,
      });

      // When author-scoped, keep only hits whose book author matches.
      let filteredResults = rawResults;
      if (scoped)
        filteredResults = rawResults.filter((r) =>
          authorMatches(authorByCode.get(r.publication.code.toUpperCase()) ?? '', authorFilters),
        );
      const localResults = filteredResults.slice(0, args.results);

      if (localResults.length === 0) {
        let authorFilterContext = '';
        if (scoped) authorFilterContext = ' under the author filter';
        yield* Console.log(
          `No local hits for "${subject}"` +
            authorFilterContext +
            `. Try \`bible egw search <subject>\` with simpler terms.`,
        );
        return;
      }

      let authorScopeSummary = '';
      if (scoped) authorScopeSummary = ', author-scoped';
      yield* Console.log(
        `Local hits for "${subject}" (${localResults.length}` +
          authorScopeSummary +
          ', across the installed corpus):\n',
      );
      for (const r of localResults) {
        const ref = paragraphRefcode(r.paragraph);
        const author = authorByCode.get(r.publication.code.toUpperCase()) ?? r.publication.title;
        const text = nodesToText(r.paragraph.nodes).replace(/\s+/g, ' ').trim();
        let snippet = text;
        if (text.length > 220) snippet = `${text.slice(0, 220)}…`;
        yield* Console.log(`  ${ref} — ${author}`);
        yield* Console.log(`    ${snippet}\n`);
      }

      // --- Optional: export the local hits as a refcode-tagged markdown corpus -
      if (Option.isSome(args.export)) {
        const path = args.export.value;
        const lines: string[] = [];
        let authorFilterDescription = '';
        if (scoped) authorFilterDescription = ` (author filter: ${authorFilters.join(', ')})`;
        let corpusDescription =
          'Leading-text snippets (run with --full for whole paragraphs) — verify against the refcode.';
        if (args.full)
          corpusDescription = 'Full paragraph text — verify the refcode before quoting.';
        lines.push(`# EGW study corpus — "${subject}"`);
        lines.push('');
        lines.push(
          `_Generated by \`bible egw study\`${authorFilterDescription}. ` +
            `${localResults.length} local hit(s) across the installed corpus. ` +
            corpusDescription +
            '_',
        );
        lines.push('');
        let lastAuthor = '';
        for (const r of localResults) {
          const ref = paragraphRefcode(r.paragraph);
          const author = authorByCode.get(r.publication.code.toUpperCase()) ?? r.publication.title;
          if (author !== lastAuthor) {
            lines.push(`\n## ${author}\n`);
            lastAuthor = author;
          }
          const text = nodesToText(r.paragraph.nodes).replace(/\s+/g, ' ').trim();
          let body = text;
          if (!args.full && text.length > 220) body = `${text.slice(0, 220)}…`;
          lines.push(`> ${body}`);
          lines.push(`> — **${ref}** (${r.publication.title})`);
          lines.push('');
        }
        yield* fs.writeFileString(path, `${lines.join('\n')}\n`);
        let fullTextSummary = '';
        if (args.full) fullTextSummary = ' (full text)';
        yield* Console.log(`\nExported ${localResults.length} hit(s)${fullTextSummary} → ${path}`);
      }
    }),
).pipe(Command.provide(() => FullLayer));
