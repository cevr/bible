// @effect-diagnostics strictBooleanExpressions:off
import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { Data, Effect, Layer, ServiceMap } from 'effect';

import { AI } from '../../services/ai.js';
import { BibleData } from '../bible/data.js';
import { BibleState, type BibleStateService } from '../bible/state.js';
import type { BibleDataSyncService, Reference } from '../bible/types.js';

// Tagged error for AI search failures
export class AISearchError extends Data.TaggedError(
  '@bible/cli/data/study/ai-search/AISearchError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// AI Search service interface
export interface AISearchService {
  readonly searchByTopic: (query: string) => Effect.Effect<Reference[], AISearchError>;
}

// Effect service tag
export class AISearch extends ServiceMap.Service<AISearch, AISearchService>()(
  '@bible/cli/data/study/ai-search/AISearch',
) {}

// System prompt for Bible verse search
const SYSTEM_PROMPT = `You are a Bible verse search assistant. Given a topic or question, return the most relevant Bible verses.

Return your response as a JSON array of verse references in this exact format:
[
  { "book": "John", "chapter": 3, "verse": 16 },
  { "book": "Romans", "chapter": 8, "verse": 28 }
]

Rules:
- Return 3-5 most relevant verses
- Use full book names (e.g., "1 Corinthians" not "1 Cor")
- Only return valid KJV Bible references
- Return ONLY the JSON array, no other text`;

// Parse AI response to references
function parseAIResponse(response: string, dataService: BibleDataSyncService): Reference[] {
  try {
    // Extract JSON from response (in case there's extra text)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch === null) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      book: string;
      chapter: number;
      verse?: number;
    }>;

    const refs: Reference[] = [];
    for (const item of parsed) {
      // Use the data service to parse and validate
      const refStr =
        item.verse !== undefined
          ? `${item.book} ${item.chapter}:${item.verse}`
          : `${item.book} ${item.chapter}`;
      const ref = dataService.parseReference(refStr);
      if (ref !== undefined) {
        refs.push(ref);
      }
    }
    return refs;
  } catch {
    return [];
  }
}

// Standalone async function for TUI use (without Effect context)
// Takes the dependencies directly as parameters
export async function searchBibleByTopic(
  query: string,
  model: { models: { low: LanguageModel } },
  data: BibleDataSyncService,
  state: BibleStateService,
): Promise<Reference[]> {
  // Check cache first
  const cached = state.getCachedAISearch(query);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const result = await generateText({
      model: model.models.low,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Find Bible verses about: ${query}` }],
      maxOutputTokens: 500,
    });

    // Parse response
    const refs = parseAIResponse(result.text, data);

    // Cache results
    if (refs.length > 0) {
      state.setCachedAISearch(query, refs);
    }

    return refs;
  } catch (error) {
    console.error('AI search failed:', error);
    return [];
  }
}

// Create a live layer (requires AI, BibleData, and BibleState)
export const AISearchLive = Layer.effect(
  AISearch,
  Effect.gen(function* () {
    const ai = yield* AI;
    const data = yield* BibleData;
    const state = yield* BibleState;
    const services = yield* Effect.services();
    const runSync = Effect.runSyncWith(services);

    // Create sync wrapper for data service (only needs parseReference which is sync)
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

    return {
      searchByTopic(query: string): Effect.Effect<Reference[], AISearchError> {
        return Effect.gen(function* () {
          // Check cache first
          const cached = state.getCachedAISearch(query);
          if (cached !== undefined) {
            return cached;
          }

          // Call AI model
          const result = yield* ai
            .generateText({
              model: 'low',
              system: SYSTEM_PROMPT,
              messages: [{ role: 'user', content: `Find Bible verses about: ${query}` }],
              maxOutputTokens: 500,
            })
            .pipe(
              Effect.mapError(
                (error) =>
                  new AISearchError({
                    message: `AI search failed: ${error}`,
                    cause: error,
                  }),
              ),
            );

          // Parse response
          const refs = parseAIResponse(result.text, syncData);

          // Cache results
          if (refs !== undefined && refs.length > 0) {
            state.setCachedAISearch(query, refs);
          }

          return refs;
        });
      },
    };
  }),
);
