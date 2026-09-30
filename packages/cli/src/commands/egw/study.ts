import { EGWApiClient, nodesToText, type Schemas as EGWSchemas } from '@bible/core/egw';
import { CorpusSupply, Target } from '@bible/core/corpus-supply';
import { publicationId, type SearchHit } from '@bible/core/writings';
import { WritingsService } from '@bible/core/writings/service';
import { Console, Effect, FileSystem, Option, Result, Stream } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';

import { paragraphRefcode } from './format.js';
import { FullLayer } from './layers.js';

const studySubject = Argument.String('subject').pipe(Argument.variadic());
const studyLimit = Flag.Int('limit').pipe(
  Flag.withDescription('Max books to download, ranked by hit count (default: 15)'),
  Flag.withDefault(15),
);
const studyMinHits = Flag.Int('min-hits').pipe(
  Flag.withDescription('Only download books with at least this many remote hits (default: 2)'),
  Flag.withDefault(2),
);
const studyScan = Flag.Int('scan').pipe(
  Flag.withDescription('Remote hits to scan when ranking (paged in 100s; default: 200)'),
  Flag.withDefault(200),
);
const studyAuthor = Flag.String('author').pipe(
  Flag.withDescription(
    'Only rank/download books whose author matches (case-insensitive substring). Repeatable.',
  ),
  Flag.atLeast(0),
);
const studyPioneers = Flag.Boolean('pioneers').pipe(
  Flag.withDescription('Preset --author filter for the nine SDA pioneers'),
  Flag.withDefault(false),
);
const studyLang = Flag.String('lang').pipe(
  Flag.withDescription('Language code (default: en)'),
  Flag.withDefault('en'),
);
const studyDryRun = Flag.Boolean('dry-run').pipe(
  Flag.withDescription('Rank and list the books that WOULD be downloaded; download nothing'),
  Flag.withDefault(false),
);
const studyResults = Flag.Int('results').pipe(
  Flag.withDescription('Local result snippets to print after downloading (default: 30)'),
  Flag.withDefault(30),
);
const studyExport = Flag.String('export').pipe(
  Flag.withDescription('Write the local hits to a refcode-tagged markdown corpus at this path'),
  Flag.optional,
);
const studyFull = Flag.Boolean('full').pipe(
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

/** The flag values every phase reads, with the author filter already resolved. */
interface StudyPlan {
  subject: string;
  lang: string;
  limit: number;
  minHits: number;
  scan: number;
  dryRun: boolean;
  results: number;
  full: boolean;
  authorFilters: string[];
  scoped: boolean;
}

/** What happened to one ranked candidate book in phase 2. */
type CandidateOutcome =
  | 'ignored'
  | 'unresolved'
  | 'off-author'
  | 'listed'
  | 'downloaded'
  | 'failed';

interface DownloadTally {
  selected: number;
  downloaded: number;
  failed: number;
  skippedByAuthor: number;
}

/** How each candidate outcome moves the phase-2 counters. */
const OUTCOME_COUNTS = {
  ignored: { selected: 0, downloaded: 0, failed: 0, skippedByAuthor: 0 },
  unresolved: { selected: 0, downloaded: 0, failed: 1, skippedByAuthor: 0 },
  'off-author': { selected: 0, downloaded: 0, failed: 0, skippedByAuthor: 1 },
  listed: { selected: 1, downloaded: 0, failed: 0, skippedByAuthor: 0 },
  downloaded: { selected: 1, downloaded: 1, failed: 0, skippedByAuthor: 0 },
  failed: { selected: 1, downloaded: 0, failed: 1, skippedByAuthor: 0 },
} satisfies Record<CandidateOutcome, DownloadTally>;

const SNIPPET_LENGTH = 220;

/** `text` when `enabled`, else nothing — for the optional clauses in summary lines. */
const when = (enabled: boolean, text: string) => {
  if (enabled) return text;
  return '';
};

/** A local hit's paragraph text, collapsed onto one line. */
const flatText = (hit: SearchHit) => nodesToText(hit.paragraph.nodes).replace(/\s+/g, ' ').trim();

/** Cut a paragraph down to the console snippet length. */
const clip = (text: string) => {
  if (text.length > SNIPPET_LENGTH) return `${text.slice(0, SNIPPET_LENGTH)}…`;
  return text;
};

const hitAuthor = (authorByCode: ReadonlyMap<string, string>, hit: SearchHit) =>
  authorByCode.get(hit.publication.code.toUpperCase()) ?? hit.publication.title;

const printUsage = Effect.gen(function* () {
  yield* Console.log('Usage: bible egw study <subject> [flags]');
  yield* Console.log('');
  yield* Console.log('Remote-searches a subject, downloads the books that cover it best into the');
  yield* Console.log('local DB, then prints (and optionally exports) the local hits.');
  yield* Console.log('');
  yield* Console.log('Examples:');
  yield* Console.log('  bible egw study "seven last plagues"');
  yield* Console.log('  bible egw study "the day of the Lord" --pioneers --limit 8');
  yield* Console.log('  bible egw study "wrath" --scan 500 --author "Smith" --author "Litch"');
  yield* Console.log('  bible egw study "armageddon" --dry-run');
  yield* Console.log('  bible egw study "loud cry" --export corpus/loud-cry.md');
});

// --- Phase 1: remote-search the subject (paged) and rank books by hits ------

const scanRemoteHits = (plan: StudyPlan) =>
  Effect.gen(function* () {
    const client = yield* EGWApiClient;
    const hits: EGWSchemas.SearchHit[] = [];
    let scanOffset = 0;
    while (hits.length < plan.scan) {
      const page = yield* client.search({
        query: plan.subject,
        lang: plan.lang,
        limit: Math.min(REMOTE_PAGE_SIZE, plan.scan - hits.length),
        offset: scanOffset,
      });
      if (page.results.length === 0) break;
      hits.push(...page.results);
      scanOffset += page.results.length;
      // Stop when the server has no more (short page, or we've seen the lot).
      if (page.results.length < REMOTE_PAGE_SIZE || scanOffset >= page.total) break;
    }
    return hits;
  });

const rankBooks = (hits: ReadonlyArray<EGWSchemas.SearchHit>) => {
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
  return rankMap;
};

// --- Phase 2: resolve pub_code -> Book, apply author filter, download --------

/** Resolve pub_code -> Book (carries book_id + author) via title-search,
 *  matching exactly on code. Mirrors `bible egw download <code>`. */
const resolveCatalogBook = (plan: StudyPlan, book: RankedBook) =>
  Effect.gen(function* () {
    const client = yield* EGWApiClient;
    const candidates = yield* client
      .getBooks({ lang: plan.lang, search: book.pubName, limit: 50 })
      .pipe(Stream.take(50), Stream.runCollect);
    return Option.fromUndefinedOr(
      [...candidates].find((c) => c.code.toUpperCase() === book.pubCode.toUpperCase()),
    );
  });

const downloadBook = (exact: EGWSchemas.Book, ordinal: number) =>
  Effect.gen(function* () {
    const supply = yield* CorpusSupply;
    yield* Console.log(
      `  ${String(ordinal).padStart(2)}. ↓ ${exact.code} — ${exact.title} (${exact.author})...`,
    );
    const result = yield* Effect.result(
      supply.ensure({
        target: Target.writings([publicationId(exact.book_id)]),
        refresh: true,
      }),
    );
    if (Result.isFailure(result)) {
      yield* Console.log(`      ✗ failed: ${result.failure._tag}`);
      return 'failed' as const;
    }
    const activation = result.success.activated[0];
    yield* Console.log(`      ✓ ${activation?.installed ?? 0} paragraphs.`);
    return 'downloaded' as const;
  });

/** Take one ranked book through resolve → author filter → list or download.
 *  `ordinal` is the number it is listed under if it is selected. */
const studyCandidate = (
  plan: StudyPlan,
  installedCodes: ReadonlySet<string>,
  book: RankedBook,
  ordinal: number,
) =>
  Effect.gen(function* () {
    const resolved = yield* resolveCatalogBook(plan, book);
    if (Option.isNone(resolved)) {
      // Unresolvable (e.g. compound pub_code). Only note it when unscoped, to
      // avoid noise; it can't be author-checked anyway.
      if (plan.scoped) return 'ignored' as const;
      yield* Console.log(`  ✗ ${book.pubCode}: could not resolve to a catalog book; skipping.`);
      return 'unresolved' as const;
    }
    const exact = resolved.value;

    if (!authorMatches(exact.author, plan.authorFilters)) return 'off-author' as const;

    const listing = `  ${String(ordinal).padStart(2)}. ${exact.code.padEnd(10)} ${String(book.hits).padStart(4)} hits`;
    if (installedCodes.has(exact.code.toUpperCase())) {
      yield* Console.log(`${listing} [installed]  ${exact.title}`);
      return 'listed' as const;
    }
    if (plan.dryRun) {
      yield* Console.log(`${listing} [would download]  ${exact.title} (${exact.author})`);
      return 'listed' as const;
    }
    return yield* downloadBook(exact, ordinal);
  });

/** Resolve candidates in rank order until --limit books are selected (a
 *  selected book = passes author filter; installed ones count toward the
 *  limit but aren't re-downloaded). */
const selectAndDownload = (
  plan: StudyPlan,
  installedCodes: ReadonlySet<string>,
  candidatePool: ReadonlyArray<RankedBook>,
) =>
  Effect.gen(function* () {
    const tally: DownloadTally = { selected: 0, downloaded: 0, failed: 0, skippedByAuthor: 0 };
    for (const book of candidatePool) {
      if (tally.selected >= plan.limit) break;
      const outcome = yield* studyCandidate(plan, installedCodes, book, tally.selected + 1);
      const counts = OUTCOME_COUNTS[outcome];
      tally.selected += counts.selected;
      tally.downloaded += counts.downloaded;
      tally.failed += counts.failed;
      tally.skippedByAuthor += counts.skippedByAuthor;
    }
    return tally;
  });

// --- Phase 3: local FTS across everything now installed ---------------------

const searchLocal = (plan: StudyPlan) =>
  Effect.gen(function* () {
    const service = yield* WritingsService;
    const allBooks = yield* service.catalog();
    const authorByCode = new Map(allBooks.map((b) => [b.code.toUpperCase(), b.author]));
    let resultMultiplier = 1;
    if (plan.scoped) resultMultiplier = 4;
    const rawResults = yield* service.search(plan.subject, {
      limit: plan.results * resultMultiplier,
    });

    // When author-scoped, keep only hits whose book author matches.
    let filteredResults = rawResults;
    if (plan.scoped)
      filteredResults = rawResults.filter((r) =>
        authorMatches(authorByCode.get(r.publication.code.toUpperCase()) ?? '', plan.authorFilters),
      );
    return { authorByCode, localResults: filteredResults.slice(0, plan.results) };
  });

const printLocalHits = (
  plan: StudyPlan,
  authorByCode: ReadonlyMap<string, string>,
  localResults: ReadonlyArray<SearchHit>,
) =>
  Effect.gen(function* () {
    yield* Console.log(
      `Local hits for "${plan.subject}" (${localResults.length}` +
        when(plan.scoped, ', author-scoped') +
        ', across the installed corpus):\n',
    );
    for (const r of localResults) {
      yield* Console.log(`  ${paragraphRefcode(r.paragraph)} — ${hitAuthor(authorByCode, r)}`);
      yield* Console.log(`    ${clip(flatText(r))}\n`);
    }
  });

// --- Optional: export the local hits as a refcode-tagged markdown corpus ----

const renderCorpus = (
  plan: StudyPlan,
  authorByCode: ReadonlyMap<string, string>,
  localResults: ReadonlyArray<SearchHit>,
) => {
  const authorFilterDescription = when(
    plan.scoped,
    ` (author filter: ${plan.authorFilters.join(', ')})`,
  );
  let corpusDescription =
    'Leading-text snippets (run with --full for whole paragraphs) — verify against the refcode.';
  if (plan.full) corpusDescription = 'Full paragraph text — verify the refcode before quoting.';
  const lines: string[] = [];
  lines.push(`# EGW study corpus — "${plan.subject}"`);
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
    const author = hitAuthor(authorByCode, r);
    if (author !== lastAuthor) {
      lines.push(`\n## ${author}\n`);
      lastAuthor = author;
    }
    let body = flatText(r);
    if (!plan.full) body = clip(body);
    lines.push(`> ${body}`);
    lines.push(`> — **${paragraphRefcode(r.paragraph)}** (${r.publication.title})`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
};

const exportCorpus = (
  plan: StudyPlan,
  path: string,
  authorByCode: ReadonlyMap<string, string>,
  localResults: ReadonlyArray<SearchHit>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(path, renderCorpus(plan, authorByCode, localResults));
    yield* Console.log(
      `\nExported ${localResults.length} hit(s)${when(plan.full, ' (full text)')} → ${path}`,
    );
  });

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
      if (subject.length === 0) return yield* printUsage;

      const service = yield* WritingsService;

      let authorFilters = [...args.author];
      if (args.pioneers) authorFilters = PIONEER_AUTHORS;
      const plan: StudyPlan = {
        subject,
        lang: args.lang,
        limit: args.limit,
        minHits: args.minHits,
        scan: args.scan,
        dryRun: args.dryRun,
        results: args.results,
        full: args.full,
        authorFilters,
        scoped: authorFilters.length > 0,
      };

      yield* Console.log(`Searching the EGW catalog for "${subject}"...`);
      const hits = yield* scanRemoteHits(plan);
      if (hits.length === 0) {
        yield* Console.log(`No remote results for "${subject}".`);
        return;
      }

      // Rank by hits, threshold, take a generous slice (author filtering happens
      // at resolve time, since hits don't reliably carry the author).
      const rankMap = rankBooks(hits);
      const candidatePool = [...rankMap.values()]
        .filter((b) => b.hits >= plan.minHits)
        .sort((a, b) => b.hits - a.hits);

      const installed = yield* service.catalog();
      const installedCodes = new Set(installed.map((b) => b.code.toUpperCase()));

      yield* Console.log(
        `Scanned ${hits.length} hit(s) across ${rankMap.size} book(s); ` +
          `${candidatePool.length} clear --min-hits ${plan.minHits}` +
          when(plan.scoped, `; author filter: ${authorFilters.join(', ')}`) +
          '.\n',
      );

      const tally = yield* selectAndDownload(plan, installedCodes, candidatePool);

      yield* Console.log('');
      if (plan.dryRun) {
        yield* Console.log('--dry-run: nothing downloaded. Re-run without --dry-run to fetch.');
        return;
      }

      yield* Console.log(
        `Downloaded ${tally.downloaded} book(s)` +
          when(tally.failed > 0, `, ${tally.failed} failed/unresolved`) +
          when(tally.skippedByAuthor > 0, `, ${tally.skippedByAuthor} skipped by author filter`) +
          '.\n',
      );

      const { authorByCode, localResults } = yield* searchLocal(plan);
      if (localResults.length === 0) {
        yield* Console.log(
          `No local hits for "${subject}"` +
            when(plan.scoped, ' under the author filter') +
            `. Try \`bible egw search <subject>\` with simpler terms.`,
        );
        return;
      }

      yield* printLocalHits(plan, authorByCode, localResults);

      if (Option.isSome(args.export)) {
        yield* exportCorpus(plan, args.export.value, authorByCode, localResults);
      }
    }),
).pipe(Command.provide(() => FullLayer));
