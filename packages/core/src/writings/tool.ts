/**
 * EGW Writings Tool for AI Integration
 *
 * Provides an ai-sdk compatible tool for querying EGW writings.
 * Allows AI models to look up real EGW quotes instead of relying on training data.
 */

import { tool } from 'ai';
import type { ManagedRuntime } from 'effect';
import { Effect, Option } from 'effect';

import { z } from 'zod';

import { EGWCommentaryService } from '../egw-commentary/service.js';
import { nodesToText } from '../egw/ast.js';
import {
  type Heading,
  type Page,
  type Paragraph,
  type Publication,
  Reference,
  type SearchHit,
} from './index.js';
import { WritingsService } from './service.js';

// ============================================================================
// Tool Input Schema
// ============================================================================

const EGWToolSchema = z.object({
  action: z
    .enum(['search', 'getByRef', 'listBooks', 'getChapters', 'getPage', 'commentaryForVerse'])
    .describe('The action to perform'),
  query: z.string().optional().describe('Search query for the search action'),
  bookCode: z
    .string()
    .optional()
    .describe('Book code (e.g., "GC", "DA", "PP") for scoping search or browsing chapters/pages'),
  ref: z
    .string()
    .optional()
    .describe('EGW reference code (e.g., "GC 414.1", "DA 25") for getByRef action'),
  page: z.number().int().positive().optional().describe('Page number for getPage action'),
  book: z
    .number()
    .int()
    .min(1)
    .max(66)
    .optional()
    .describe('Bible book number (1-66) for commentary lookup'),
  chapter: z.number().int().positive().optional().describe('Bible chapter for commentary lookup'),
  verse: z.number().int().positive().optional().describe('Bible verse for commentary lookup'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum results to return (default 10)'),
});

type EGWToolInput = z.infer<typeof EGWToolSchema>;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Creates an ai-sdk tool for EGW writings queries.
 *
 * @param runtime - ManagedRuntime with WritingsService and EGWCommentaryService available
 * @returns ai-sdk tool definition
 *
 * @example
 * ```ts
 * import * as EGWDbBun from '../egw-db/book-database-bun.js';
 *
 * const egwLayer = WritingsService.Live.pipe(
 *   Layer.provideMerge(EGWCommentaryService.Live),
 *   Layer.provide(EGWDbBun.Live),
 * );
 * const runtime = ManagedRuntime.make(egwLayer);
 *
 * const tools = {
 *   egw: createEGWTool(runtime),
 * };
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEGWTool(
  runtime: ManagedRuntime.ManagedRuntime<WritingsService | EGWCommentaryService, unknown>,
) {
  return tool({
    description: `Query the Ellen G. White writings database.
Use this tool to find real EGW quotes instead of relying on memory.

Actions:
- search: Full-text search across all EGW writings. Optionally scope to a book with bookCode.
- getByRef: Get a specific paragraph by reference code (e.g., "GC 414.1", "DA 25.3")
- listBooks: List all available EGW books with their codes
- getChapters: Get the table of contents for a specific book
- getPage: Get all paragraphs on a specific page of a book
- commentaryForVerse: Get EGW Bible Commentary entries for a specific Bible verse (book/chapter/verse)

Always use this tool when citing EGW. Never guess or fabricate reference codes or quotes.`,
    inputSchema: EGWToolSchema,
    execute: async (input: EGWToolInput) => {
      const effect = executeEGWTool(input);
      return runtime.runPromise(effect);
    },
  });
}

// ============================================================================
// Tool Execution
// ============================================================================

function executeEGWTool(
  input: EGWToolInput,
): Effect.Effect<string, never, WritingsService | EGWCommentaryService> {
  return Effect.gen(function* () {
    switch (input.action) {
      case 'search': {
        if (input.query === undefined || input.query.length === 0) {
          return 'Error: query is required for search action';
        }
        const service = yield* WritingsService;
        const results = yield* service
          .search(input.query, {
            limit: input.limit ?? 10,
            publication:
              input.bookCode === undefined ? undefined : Reference.publication(input.bookCode),
          })
          .pipe(Effect.catch(() => Effect.succeed([] as const)));
        if (results.length === 0) {
          return `No results found for "${input.query}"${input.bookCode !== undefined ? ` in ${input.bookCode}` : ''}`;
        }
        return formatSearchResults(results, input.query, input.bookCode);
      }

      case 'getByRef': {
        if (input.ref === undefined || input.ref.length === 0) {
          return 'Error: ref is required for getByRef action (e.g., "GC 414.1")';
        }
        const service = yield* WritingsService;
        const parsed = parseRef(input.ref);
        if (parsed === null) {
          return `Error: could not parse reference "${input.ref}". Expected format: "GC 414.1" or "DA 25"`;
        }
        if (parsed.paragraph !== null) {
          const targetRef = `${parsed.bookCode} ${parsed.page}.${parsed.paragraph}`;
          const match = yield* service
            .paragraphByRefcode(Reference.publication(parsed.bookCode), targetRef)
            .pipe(Effect.catch(() => Effect.succeed(Option.none<Paragraph>())));
          if (Option.isSome(match)) {
            const publication = yield* Effect.option(
              service.publication(Reference.publication(parsed.bookCode)),
            );
            return formatParagraph(
              Option.getOrElse(match.value.reference.refcode, () => targetRef),
              nodesToText(match.value.nodes),
              Option.match(publication, {
                onNone: () => parsed.bookCode,
                onSome: (value) => value.title,
              }),
            );
          }
        }
        const pageResponse = yield* Effect.option(
          service.page(Reference.page(parsed.bookCode, parsed.page)),
        );
        if (Option.isNone(pageResponse)) return `No content found for reference "${input.ref}"`;
        return formatPage(pageResponse.value);
      }

      case 'listBooks': {
        const service = yield* WritingsService;
        const books = yield* service
          .catalog()
          .pipe(Effect.catch(() => Effect.succeed([] as const)));
        if (books.length === 0) {
          return 'No books available. The EGW database may need to be synced.';
        }
        return formatBooks(books);
      }

      case 'getChapters': {
        if (input.bookCode === undefined || input.bookCode.length === 0) {
          return 'Error: bookCode is required for getChapters action';
        }
        const service = yield* WritingsService;
        const chapters = yield* service
          .headings(Reference.publication(input.bookCode))
          .pipe(Effect.catch(() => Effect.succeed([] as const)));
        if (chapters.length === 0) {
          return `No chapters found for book "${input.bookCode}"`;
        }
        return formatChapters(chapters, input.bookCode);
      }

      case 'getPage': {
        if (input.bookCode === undefined || input.bookCode.length === 0) {
          return 'Error: bookCode is required for getPage action';
        }
        if (input.page === undefined) {
          return 'Error: page number is required for getPage action';
        }
        const service = yield* WritingsService;
        const pageResponse = yield* Effect.option(
          service.page(Reference.page(input.bookCode, input.page)),
        );
        if (Option.isNone(pageResponse)) {
          return `No content found for ${input.bookCode} page ${input.page}`;
        }
        return formatPage(pageResponse.value);
      }

      case 'commentaryForVerse': {
        if (input.book === undefined || input.chapter === undefined || input.verse === undefined) {
          return 'Error: book, chapter, and verse are required for commentaryForVerse action';
        }
        const { book, chapter, verse } = input;
        const commentary = yield* EGWCommentaryService;
        const result = yield* commentary.getCommentary({ book, chapter, verse }).pipe(
          Effect.catch(() =>
            Effect.succeed({
              verse: { book, chapter, verse },
              entries: [] as const,
            }),
          ),
        );
        if (result.entries.length === 0) {
          return `No EGW commentary found for Bible book ${input.book}, chapter ${input.chapter}, verse ${input.verse}`;
        }
        return formatCommentary(result.verse, result.entries);
      }

      default:
        return `Unknown action`;
    }
  });
}

// ============================================================================
// Reference Parser
// ============================================================================

function parseRef(
  ref: string,
): { bookCode: string; page: number; paragraph: number | null } | null {
  // Match patterns like "GC 414.1", "DA 25", "PP 351.2"
  const match = ref.match(/^([A-Za-z0-9]+)\s+(\d+)(?:\.(\d+))?$/);
  if (match === null || match[1] === undefined || match[2] === undefined) return null;
  return {
    bookCode: match[1],
    page: parseInt(match[2], 10),
    paragraph: match[3] !== undefined ? parseInt(match[3], 10) : null,
  };
}

// ============================================================================
// Formatting Helpers
// ============================================================================

interface CommentaryEntryLike {
  readonly refcode: string;
  readonly bookTitle: string;
  readonly content: string;
}

interface VerseRefLike {
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
}

function formatSearchResults(
  results: readonly SearchHit[],
  query: string,
  bookCode?: string,
): string {
  const header =
    bookCode !== undefined
      ? `Search results for "${query}" in ${bookCode}`
      : `Search results for "${query}"`;
  const lines = [
    header,
    '',
    ...results.map((r) => {
      const ref = Option.getOrElse(r.paragraph.reference.refcode, () => 'unknown');
      const content = truncate(nodesToText(r.paragraph.nodes), 200);
      return `[${ref}] (${r.publication.title})\n${content}`;
    }),
  ];
  return lines.join('\n');
}

function formatParagraph(ref: string, content: string, bookTitle: string): string {
  return `${ref} (${bookTitle})\n\n${content}`;
}

function formatPage(page: Page): string {
  const lines = [`${page.publication.title} — Page ${page.reference.page}`];
  Option.map(page.heading, (heading) => lines.push(`Chapter: ${heading}`));
  lines.push('');
  for (const p of page.paragraphs) {
    const ref = Option.getOrElse(p.reference.refcode, () => '');
    const content = nodesToText(p.nodes);
    if (ref.length > 0) {
      lines.push(`[${ref}] ${content}`);
    } else {
      lines.push(content);
    }
  }
  return lines.join('\n');
}

function formatBooks(books: readonly Publication[]): string {
  const lines = [
    `Available EGW Books (${books.length}):`,
    '',
    ...books.map((b) => `${b.code} — ${b.title}`),
  ];
  return lines.join('\n');
}

function formatChapters(chapters: readonly Heading[], bookCode: string): string {
  const lines = [
    `Table of Contents — ${bookCode}`,
    '',
    ...chapters.map((c) => {
      const title = c.title;
      const ref = Option.getOrElse(c.reference.refcode, () => '');
      return ref.length > 0 ? `[${ref}] ${title}` : title;
    }),
  ];
  return lines.join('\n');
}

function formatCommentary(verse: VerseRefLike, entries: readonly CommentaryEntryLike[]): string {
  const lines = [
    `EGW Commentary — Bible book ${verse.book}, chapter ${verse.chapter}:${verse.verse}`,
    `${entries.length} entries found`,
    '',
    ...entries.map((e) => {
      const content = truncate(e.content, 300);
      return `[${e.refcode}] (${e.bookTitle})\n${content}`;
    }),
  ];
  return lines.join('\n');
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
