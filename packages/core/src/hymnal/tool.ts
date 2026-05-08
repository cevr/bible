/**
 * Hymnal Tool for AI Integration
 *
 * Provides an ai-sdk compatible tool for querying the hymnal.
 * Allows AI models to look up real hymn data instead of guessing.
 */

import { tool } from 'ai';
import type { ManagedRuntime } from 'effect';
import { Effect } from 'effect';

import { z } from 'zod';

import type { CategoryId, HymnId } from '../types/ids.js';
import type { HymnalDatabase } from './database.js';
import { HymnalService } from './service.js';

// ============================================================================
// Tool Input Schema
// ============================================================================

const HymnalToolSchema = z.object({
  action: z
    .enum(['getByNumber', 'search', 'listCategories', 'byCategory', 'byTheme'])
    .describe('The action to perform'),
  hymnNumber: z
    .number()
    .int()
    .min(1)
    .max(920)
    .optional()
    .describe('Hymn number (1-920) for getByNumber action'),
  query: z.string().optional().describe('Search query for search/byTheme actions'),
  categoryId: z.number().int().positive().optional().describe('Category ID for byCategory action'),
  limit: z.number().int().min(1).max(50).optional().describe('Maximum results to return'),
});

type HymnalToolInput = z.infer<typeof HymnalToolSchema>;

// ============================================================================
// Tool Factory
// ============================================================================

/**
 * Creates an ai-sdk tool for hymnal queries.
 *
 * @param runtime - ManagedRuntime with HymnalService available
 * @returns ai-sdk tool definition
 *
 * @example
 * ```ts
 * const hymnalLayer = HymnalService.Live.pipe(Layer.provide(HymnalDatabase.Live));
 * const runtime = ManagedRuntime.make(hymnalLayer);
 *
 * const tools = {
 *   hymnal: createHymnalTool(runtime),
 * };
 *
 * const result = await generateText({
 *   model: ...,
 *   tools,
 *   prompt: "Suggest opening hymns for a sermon about faith",
 * });
 * ```
 */
export function createHymnalTool(
  runtime: ManagedRuntime.ManagedRuntime<HymnalService, HymnalDatabase>,
) {
  return tool({
    description: `Query the SDA Hymnal database (920 hymns, 68 categories).
Use this tool to find real hymn numbers instead of guessing.

Actions:
- getByNumber: Get a specific hymn by its number (1-920)
- search: Search hymns by text in title or lyrics
- listCategories: List all 68 hymn categories
- byCategory: Get hymns in a specific category
- byTheme: Find hymns matching a theme (maps to categories)

Always use this tool when suggesting hymns. Never guess hymn numbers.`,
    inputSchema: HymnalToolSchema,
    execute: async (input: HymnalToolInput) => {
      const effect = executeHymnalTool(input);
      return runtime.runPromise(effect);
    },
  });
}

// ============================================================================
// Tool Execution
// ============================================================================

function executeHymnalTool(input: HymnalToolInput): Effect.Effect<string, never, HymnalService> {
  return Effect.gen(function* () {
    const service = yield* HymnalService;

    switch (input.action) {
      case 'getByNumber': {
        if (input.hymnNumber === undefined) {
          return 'Error: hymnNumber is required for getByNumber action';
        }
        const hymn = yield* service
          .getHymn(input.hymnNumber as HymnId)
          .pipe(Effect.catch(() => Effect.succeed(null)));
        if (hymn === null) {
          return `No hymn found with number ${input.hymnNumber}`;
        }
        return formatHymnFull(hymn);
      }

      case 'search': {
        if (input.query === undefined || input.query.length === 0) {
          return 'Error: query is required for search action';
        }
        const results = yield* service
          .searchHymns(input.query, input.limit ?? 10)
          .pipe(Effect.catch(() => Effect.succeed([] as const)));
        if (results.length === 0) {
          return `No hymns found matching "${input.query}"`;
        }
        return formatHymnSummaries(results, `Search results for "${input.query}"`);
      }

      case 'listCategories': {
        const categories = yield* service
          .getCategories()
          .pipe(Effect.catch(() => Effect.succeed([] as const)));
        return formatCategories(categories);
      }

      case 'byCategory': {
        if (input.categoryId === undefined) {
          return 'Error: categoryId is required for byCategory action';
        }
        const results = yield* service
          .getHymnsByCategory(input.categoryId as CategoryId)
          .pipe(Effect.catch(() => Effect.succeed([] as const)));
        if (results.length === 0) {
          return `No hymns found in category ${input.categoryId}`;
        }
        // Limit results to avoid token bloat
        const limited = results.slice(0, input.limit ?? 20);
        return formatHymnSummaries(limited, `Hymns in category ${input.categoryId}`);
      }

      case 'byTheme': {
        if (input.query === undefined || input.query.length === 0) {
          return 'Error: query is required for byTheme action';
        }
        const results = yield* service
          .findHymnsByTheme(input.query, input.limit ?? 10)
          .pipe(Effect.catch(() => Effect.succeed([] as const)));
        if (results.length === 0) {
          return `No hymns found for theme "${input.query}"`;
        }
        return formatHymnSummaries(results, `Hymns for theme "${input.query}"`);
      }

      default:
        return `Unknown action`;
    }
  });
}

// ============================================================================
// Formatting Helpers
// ============================================================================

interface HymnFull {
  readonly id: number;
  readonly name: string;
  readonly category: string;
  readonly verses: readonly { readonly id: number; readonly text: string }[];
}

interface HymnSummaryType {
  readonly id: number;
  readonly name: string;
  readonly category: string;
  readonly firstLine: string;
}

interface CategoryType {
  readonly id: number;
  readonly name: string;
}

function formatHymnFull(hymn: HymnFull): string {
  const lines = [
    `Hymn #${hymn.id}: ${hymn.name}`,
    `Category: ${hymn.category}`,
    '',
    ...hymn.verses.map((v, i) => `Verse ${i + 1}:\n${v.text}`),
  ];
  return lines.join('\n');
}

function formatHymnSummaries(hymns: readonly HymnSummaryType[], header: string): string {
  const lines = [
    header,
    '',
    ...hymns.map((h) => `#${h.id} - ${h.name} (${h.category}) - "${h.firstLine}"`),
  ];
  return lines.join('\n');
}

function formatCategories(categories: readonly CategoryType[]): string {
  const lines = ['Hymnal Categories:', '', ...categories.map((c) => `${c.id}. ${c.name}`)];
  return lines.join('\n');
}
