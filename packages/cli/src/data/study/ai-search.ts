import { Effect, Option, Schema } from 'effect';

import type { ReaderReference } from '../../app/reader-reference.js';
import { parseReaderReference } from '../../lib/parse-reader-reference.js';
import { AI } from '../../services/ai.js';
import { BibleState } from '../bible/state.js';

const AIReferenceResponse = Schema.Struct({
  book: Schema.String,
  chapter: Schema.Number,
  verse: Schema.optional(Schema.Number),
});
const AIReferenceResponseJson = Schema.fromJsonString(Schema.Array(AIReferenceResponse));
const decodeAIReferences = Schema.decodeUnknownOption(AIReferenceResponseJson);

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

export function parseAISearchResponse(response: string): readonly ReaderReference[] {
  const json = response.match(/\[[\s\S]*\]/)?.[0];
  if (json === undefined) return [];

  return Option.match(decodeAIReferences(json), {
    onNone: () => [],
    onSome: (items) =>
      items.flatMap((item) => {
        const reference = parseReaderReference(
          item.verse === undefined
            ? `${item.book} ${item.chapter}`
            : `${item.book} ${item.chapter}:${item.verse}`,
        );
        return reference === undefined ? [] : [reference];
      }),
  });
}

/** Search by topic using the app-owned AI and persisted search cache modules. */
export const searchBibleByTopic = Effect.fn('AISearch.searchBibleByTopic')(function* (
  query: string,
) {
  const ai = yield* AI;
  const state = yield* BibleState;
  const cached = state.aiSearch.getCached(query);
  if (cached !== undefined) return cached;

  const result = yield* ai.generateText({
    model: 'low',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Find Bible verses about: ${query}` }],
    maxOutputTokens: 500,
  });
  const references = parseAISearchResponse(result.text);
  if (references.length > 0) state.aiSearch.saveCached(query, references);
  return references;
});
