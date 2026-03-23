// @effect-diagnostics strictEffectProvide:off
import { BunServices } from '@effect/platform-bun';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { BibleDatabase } from '@bible/core/bible-db';
import { StructuralAnalysis, type PassageContext } from '@bible/core/structural-analysis';
import { Effect, FileSystem, Layer, Option } from 'effect';
import { format } from 'date-fns';
import { join } from 'path';

import { AnalyzeFrontmatter } from '~/src/lib/content/schemas';
import { stringifyFrontmatter, updateFrontmatter } from '~/src/lib/frontmatter';
import { msToMinutes, spin } from '~/src/lib/general';
import { generate } from '~/src/lib/generate';
import { makeAppleNoteFromMarkdown } from '~/src/lib/markdown-to-notes';
import { getOutputsPath, getPromptPath } from '~/src/lib/paths';
import { AI } from '~/src/services/ai';
import { requiredModel } from '~/src/services/model';

import { BibleData, BibleDataLive } from '~/src/data/bible/data';
import { BibleState, BibleStateLive } from '~/src/data/bible/state';
import { parseVerseQuery, getVersesForQuery } from '~/src/data/bible/parse';
import type { BibleDataSyncService } from '~/src/data/bible/types';
import { createCrossRefService, type ClassifiedCrossReference } from '~/src/data/study/cross-refs';

const passage = Argument.string('passage').pipe(Argument.variadic());

const depth = Flag.choice('depth', ['shallow', 'deep']).pipe(
  Flag.withAlias('d'),
  Flag.withDefault('shallow' as const),
  Flag.withDescription('Analysis depth: shallow (AI-only) or deep (with Bible data context)'),
);

// Layer for deep mode: StructuralAnalysis depends on BibleDatabase
const DeepModeLive = StructuralAnalysis.Live.pipe(
  Layer.provideMerge(BibleDatabase.Default),
  Layer.provideMerge(BunServices.layer),
);

/** Short type labels for cross-ref classifications */
const TYPE_LABELS: Record<string, string> = {
  quotation: 'QUO',
  allusion: 'ALL',
  parallel: 'PAR',
  typological: 'TYP',
  prophecy: 'PRO',
  sanctuary: 'SAN',
  recapitulation: 'REC',
  thematic: 'THM',
};

/**
 * Format PassageContext into a structured text block for the AI prompt.
 */
function formatPassageContext(
  passageStr: string,
  ctx: PassageContext,
  enrichedCrossRefs?: Map<number, ClassifiedCrossReference[]>,
): string {
  const sections: string[] = [];

  // 1. Verse text
  if (ctx.verses.length > 0) {
    const verseLines = ctx.verses.map((v) => `${v.verse}. ${v.text}`);
    sections.push(`## Verse Text\n${verseLines.join('\n')}`);
  }

  // 2. Verse words with Strong's numbers
  const wordSections: string[] = [];
  for (let v = ctx.verseStart; v <= ctx.verseEnd; v++) {
    const words = ctx.words.get(v);
    if (words !== undefined && words.length > 0) {
      const wordEntries = words.map((w) => {
        if (w.strongsNumbers !== null && w.strongsNumbers.length > 0) {
          return `${w.text} [${w.strongsNumbers.join(', ')}]`;
        }
        return w.text;
      });
      wordSections.push(`v${v}: ${wordEntries.join(' ')}`);
    }
  }
  if (wordSections.length > 0) {
    sections.push(`## Verse Words (with Strong's)\n${wordSections.join('\n')}`);
  }

  // 3. Strong's entries
  if (ctx.strongsEntries.size > 0) {
    const entries = [...ctx.strongsEntries.values()].map((e) => {
      const lang = e.number.startsWith('H') ? 'Hebrew' : 'Greek';
      return `${e.number} (${lang}) — ${e.lemma} (${e.transliteration ?? e.lemma}): ${e.definition}`;
    });
    sections.push(`## Strong's Entries\n${entries.join('\n')}`);
  }

  // 4. Cross-references (enriched with types when available)
  const crossRefLines: string[] = [];
  if (enrichedCrossRefs !== undefined && enrichedCrossRefs.size > 0) {
    for (const [v, refs] of enrichedCrossRefs) {
      if (refs.length > 0) {
        const refStrs = refs.map((r) => {
          const typeTag =
            r.classification !== null
              ? `[${TYPE_LABELS[r.classification] ?? r.classification}] `
              : '';
          const userTag = r.isUserAdded ? '(user) ' : '';
          const preview = r.previewText !== null ? ` — ${r.previewText}` : '';
          return `${typeTag}${userTag}${r.book}:${r.chapter}:${r.verse ?? ''}${preview}`;
        });
        crossRefLines.push(`v${v}: ${refStrs.join('; ')}`);
      }
    }
  } else {
    for (const [v, refs] of ctx.crossRefs) {
      if (refs.length > 0) {
        const refStrs = refs.map(
          (r) =>
            `${r.book}:${r.chapter}:${r.verse ?? ''}${r.previewText !== null ? ` — ${r.previewText}` : ''}`,
        );
        crossRefLines.push(`v${v}: ${refStrs.join('; ')}`);
      }
    }
  }
  if (crossRefLines.length > 0) {
    sections.push(`## Cross-References\n${crossRefLines.join('\n')}`);
  }

  // 5. Margin notes
  const marginNoteLines: string[] = [];
  for (const [v, notes] of ctx.marginNotes) {
    if (notes.length > 0) {
      const noteStrs = notes.map((n) => `[${n.type}] ${n.phrase}: ${n.text}`);
      marginNoteLines.push(`v${v}: ${noteStrs.join('; ')}`);
    }
  }
  if (marginNoteLines.length > 0) {
    sections.push(`## Margin Notes\n${marginNoteLines.join('\n')}`);
  }

  // 6. Word frequency highlights
  if (ctx.wordFrequency.symbolicEntries.length > 0) {
    const freqLines = ctx.wordFrequency.symbolicEntries.map(
      (e) => `"${e.word}" appears ${e.count}x (symbolic: ${e.symbolicCount})`,
    );
    sections.push(`## Symbolic Word Counts\n${freqLines.join('\n')}`);
  }

  if (sections.length === 0) return '';
  return `# Contextual Data for ${passageStr}\n\n${sections.join('\n\n')}`;
}

export const analyze = Command.make('analyze', { passage, depth, model: requiredModel }, (args) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const startTime = Date.now();

    const passageStr = args.passage.join(' ').trim();

    if (passageStr.length === 0) {
      yield* Effect.log('Usage: bible analyze <passage> [--depth shallow|deep]');
      yield* Effect.log('');
      yield* Effect.log('Examples:');
      yield* Effect.log('  bible analyze daniel 3:15-30');
      yield* Effect.log('  bible analyze revelation 1:1-8 --depth deep');
      yield* Effect.log('  bible analyze "daniel 9:24-27" --depth deep --model gemini');
      return;
    }

    yield* Effect.logDebug(`passage: ${passageStr}, depth: ${args.depth}`);

    // Read system prompt
    const systemPrompt = yield* fs
      .readFile(getPromptPath('analyze', 'system.md'))
      .pipe(Effect.map((i) => new TextDecoder().decode(i)));

    // Build user prompt
    let userPrompt = `Analyze the structural and literary architecture of: ${passageStr}`;

    // Deep mode: gather contextual data via StructuralAnalysis service
    if (args.depth === 'deep') {
      const data = yield* BibleData;
      const services = yield* Effect.services();
      const runSync = Effect.runSyncWith(services);

      const syncData: BibleDataSyncService = {
        getBooks: () => runSync(data.getBooks()),
        getBook: (n) => runSync(data.getBook(n)),
        getChapter: (b, c) => runSync(data.getChapter(b, c)),
        getVerse: (b, c, v) => runSync(data.getVerse(b, c, v)),
        searchVerses: (q, l) => runSync(data.searchVerses(q, l)),
        parseReference: data.parseReference,
        getNextChapter: data.getNextChapter,
        getPrevChapter: data.getPrevChapter,
      };

      const parsed = parseVerseQuery(passageStr);

      if (parsed._tag !== 'search') {
        const verses = getVersesForQuery(parsed, syncData);
        const firstVerse = verses[0];
        const lastVerse = verses[verses.length - 1];
        if (firstVerse !== undefined && lastVerse !== undefined) {
          const book = firstVerse.book;
          const chapter = firstVerse.chapter;
          const verseStart = firstVerse.verse;
          const verseEnd = lastVerse.verse;

          const passageContext = yield* spin(
            'Gathering Bible data context',
            Effect.gen(function* () {
              const service = yield* StructuralAnalysis;
              return yield* service.getPassageContext(book, chapter, verseStart, verseEnd);
            }).pipe(Effect.provide(DeepModeLive), Effect.scoped),
          );

          // Enrich cross-refs with cached classifications + user refs
          const state = yield* BibleState;
          const crossRefSvc = createCrossRefService(state);
          const enrichedCrossRefs = new Map<number, ClassifiedCrossReference[]>();
          for (let v = verseStart; v <= verseEnd; v++) {
            const enriched = crossRefSvc.getCrossRefs(book, chapter, v);
            if (enriched.length > 0) {
              enrichedCrossRefs.set(v, enriched);
            }
          }

          const contextStr = formatPassageContext(passageStr, passageContext, enrichedCrossRefs);
          if (contextStr.length > 0) {
            userPrompt = `${contextStr}\n\n---\n\n${userPrompt}`;
          }
        }
      }
    }

    const { filename, response } = yield* generate(systemPrompt, userPrompt);

    const analyzeDir = getOutputsPath('analyze');
    const fileName = `${format(new Date(), 'yyyy-MM-dd')}-${filename}.md`;
    const filePath = join(analyzeDir, fileName);

    const frontmatter = new AnalyzeFrontmatter({
      created_at: new Date().toISOString(),
      passage: passageStr,
      depth: args.depth as 'shallow' | 'deep',
      apple_note_id: Option.none(),
    });

    yield* spin(
      'Ensuring analyze directory exists',
      fs.makeDirectory(analyzeDir).pipe(Effect.ignore),
    );

    const contentWithFrontmatter = stringifyFrontmatter(
      {
        created_at: frontmatter.created_at,
        passage: frontmatter.passage,
        depth: frontmatter.depth,
      },
      response,
    );
    yield* spin(
      'Writing analysis to file: ' + fileName,
      fs.writeFile(filePath, new TextEncoder().encode(contentWithFrontmatter)),
    );

    const { noteId } = yield* spin(
      'Adding analysis to notes',
      makeAppleNoteFromMarkdown(response, { folder: 'analysis' }),
    );

    const finalContent = updateFrontmatter(contentWithFrontmatter, {
      apple_note_id: noteId,
    });
    yield* fs.writeFile(filePath, new TextEncoder().encode(finalContent));

    const totalTime = msToMinutes(Date.now() - startTime);
    yield* Effect.log(`Analysis generated successfully! (Total time: ${totalTime})`);
    yield* Effect.log(`Output: ${filePath}`);
  }).pipe(Effect.provide(Layer.mergeAll(BibleDataLive, BibleStateLive))),
).pipe(Command.provide((args) => AI.fromModel(args.model)));
