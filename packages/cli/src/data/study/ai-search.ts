import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import type { BibleRouteReference } from '@bible/core/app';
import { Data, Effect, Layer, Context } from 'effect';

import { AI } from '../../services/ai.js';
import { BibleState, type BibleStateService } from '../bible/state.js';
import { parseReaderReference } from '../../lib/parse-reader-reference.js';

// Tagged error for AI search failures
export class AISearchError extends Data.TaggedError(
  '@bible/cli/data/study/ai-search/AISearchError',
)<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

// AI Search service interface
export interface AISearchService {
  readonly searchByTopic: (
    query: string,
  ) => Effect.Effect<readonly BibleRouteReference[], AISearchError>;
}

// Effect service tag
export class AISearch extends Context.Service<AISearch, AISearchService>()(
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
function parseAIResponse(response: string): BibleRouteReference[] {
  try {
    // Extract JSON from response (in case there's extra text)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch === null) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      book: string;
      chapter: number;
      verse?: number;
    }>;

    const refs: BibleRouteReference[] = [];
    for (const item of parsed) {
      const refStr =
        item.verse !== undefined
          ? `${item.book} ${item.chapter}:${item.verse}`
          : `${item.book} ${item.chapter}`;
      const ref = parseReaderReference(refStr);
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
  state: BibleStateService,
): Promise<readonly BibleRouteReference[]> {
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
    const refs = parseAIResponse(result.text);

    // Cache results
    if (refs.length > 0) {
      state.setCachedAISearch(query, refs);
    }

    return refs;
  } catch (error) {
    process.stderr.write(`AI search failed: ${String(error)}\n`);
    return [];
  }
}

// Create a live layer (requires AI and BibleState)
export const AISearchLive = Layer.effect(
  AISearch,
  Effect.gen(function* () {
    const ai = yield* AI;
    const state = yield* BibleState;

    return {
      searchByTopic(query: string): Effect.Effect<readonly BibleRouteReference[], AISearchError> {
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
                    message: `AI search failed: ${error._tag}`,
                    cause: error,
                  }),
              ),
            );

          // Parse response
          const refs = parseAIResponse(result.text);

          // Cache results
          if (refs.length > 0) {
            state.setCachedAISearch(query, refs);
          }

          return refs;
        });
      },
    };
  }),
);
