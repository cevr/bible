/**
 * Query EGW Store Script
 *
 * This script queries a Gemini File Search store containing EGW (Ellen G. White) writings
 * using natural language queries.
 *
 * Usage:
 *   bun run query-egw.ts [query] [options]
 *
 * Examples:
 *   bun run query-egw.ts "What does the Bible say about prayer?"
 *   bun run query-egw.ts "What is the Sabbath?" --store egw-writings
 *   bun run query-egw.ts "Tell me about salvation" --metadata-filter 'book_title="The Desire of Ages"'
 *
 * Environment Variables Required:
 *   - GOOGLE_AI_API_KEY: Your Google AI API key
 *   - EGW_CLIENT_ID: EGW API client ID (optional, only needed if querying requires auth)
 *   - EGW_CLIENT_SECRET: EGW API client secret (optional, only needed if querying requires auth)
 */

import { Argument, Command } from 'effect/unstable/cli';
import { text } from 'effect/unstable/cli/Prompt';
import { FetchHttpClient } from 'effect/unstable/http';
import { BunServices, BunFileSystem, BunPath, BunRuntime } from '@effect/platform-bun';
import { Console, Effect, Layer, Option } from 'effect';

import * as EGWDbBun from '../src/egw-db/book-database-bun.js';
import { EGWGeminiService } from '../src/egw-gemini/index.js';
import { EGWUploadStatus } from '../src/egw-gemini/upload-status.js';
import { EGWAuth } from '../src/egw/auth.js';
import { EGWApiClient } from '../src/egw/client.js';
import { GeminiFileSearchClient } from '../src/gemini/index.js';

const queryArg = Argument.string('query').pipe(Argument.optional);

const storeOption = Argument.string('store').pipe(
  Argument.withDefault('egw-writings'),
  Argument.withDescription('The display name of the Gemini File Search store'),
);

const metadataFilterOption = Argument.string('metadata-filter').pipe(
  Argument.optional,
  Argument.withDescription(
    'Optional metadata filter to narrow search results (e.g., book_title="The Desire of Ages")',
  ),
);

// Response type for display purposes
interface GenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    groundingMetadata?: {
      searchEntryPoint?: string;
      retrievalMetadata?: {
        score?: number;
        chunk?: string;
      };
    };
  }>;
}

const cli = Command.make(
  'query-egw',
  {
    query: queryArg,
    store: storeOption,
    metadataFilter: metadataFilterOption,
  },
  (args) =>
    Effect.gen(function* () {
      const service = yield* EGWGeminiService;

      // Get query from args or prompt user
      const query: string = Option.isSome(args.query)
        ? args.query.value
        : yield* text({
            message: 'What would you like to query from the EGW store?',
          });

      yield* Console.log(`Querying store: ${args.store}`);
      yield* Console.log(`Query: ${query}`);

      const metadataFilter = Option.isSome(args.metadataFilter)
        ? args.metadataFilter.value
        : undefined;

      if (metadataFilter) {
        yield* Console.log(`Metadata filter: ${metadataFilter}`);
      }

      // Query the store
      const result = yield* service.queryStore(
        metadataFilter
          ? {
              storeDisplayName: args.store,
              query,
              metadataFilter,
            }
          : {
              storeDisplayName: args.store,
              query,
            },
      );

      // Type the response for display
      const response = result.response as GenerateContentResponse;

      // Display query information
      yield* Console.log('\n═══════════════════════════════════════════════════════');
      yield* Console.log('QUERY RESULTS');
      yield* Console.log('═══════════════════════════════════════════════════════');
      yield* Console.log(`Store: ${result.store.displayName} (${result.store.name})`);
      yield* Console.log(`Query: ${result.query}`);
      yield* Console.log(`Candidates: ${response.candidates?.length || 0}`);
      yield* Console.log('');

      // Display all candidates
      const candidates = response.candidates || [];
      if (candidates.length === 0) {
        yield* Console.log('No candidates found in response');
      } else {
        for (let i = 0; i < candidates.length; i++) {
          const candidate = candidates[i];
          if (!candidate) continue;

          yield* Console.log(
            `\n${'─'.repeat(55)}\nCANDIDATE ${i + 1} of ${candidates.length}\n${'─'.repeat(55)}`,
          );

          // Display content parts
          if (candidate.content?.parts) {
            yield* Console.log('\nContent:');
            for (let j = 0; j < candidate.content.parts.length; j++) {
              const part = candidate.content.parts[j];
              if (part?.text) {
                yield* Console.log(`\nPart ${j + 1}:`);
                yield* Console.log(part.text);
              } else {
                yield* Console.log(`\nPart ${j + 1}: (non-text content)`);
              }
            }
          } else {
            yield* Console.log('\nContent: (no content parts)');
          }

          // Display grounding metadata
          if (candidate.groundingMetadata) {
            yield* Console.log('\nGrounding Metadata:');
            const metadata = candidate.groundingMetadata;

            if (metadata.searchEntryPoint) {
              yield* Console.log(`  Search Entry Point: ${metadata.searchEntryPoint}`);
            }

            if (metadata.retrievalMetadata) {
              yield* Console.log('  Retrieval Metadata:');
              const retrieval = metadata.retrievalMetadata;

              if (retrieval.score !== undefined) {
                yield* Console.log(`    Relevance Score: ${retrieval.score}`);
              }

              if (retrieval.chunk) {
                const chunkPreview =
                  retrieval.chunk.length > 300
                    ? `${retrieval.chunk.substring(0, 300)}...`
                    : retrieval.chunk;
                yield* Console.log(`    Retrieved Chunk (${retrieval.chunk.length} chars):`);
                yield* Console.log(`    ${chunkPreview.split('\n').join('\n    ')}`);
              }
            } else {
              yield* Console.log('  (no retrieval metadata)');
            }
          } else {
            yield* Console.log('\nGrounding Metadata: (none)');
          }
        }
      }

      // Display any additional response data
      yield* Console.log(`\n${'═'.repeat(55)}`);
      yield* Console.log('RESPONSE SUMMARY');
      yield* Console.log(`${'═'.repeat(55)}`);
      yield* Console.log(`Total candidates: ${candidates.length}`);
      yield* Console.log(`Store: ${result.store.displayName}`);
      yield* Console.log(`${'═'.repeat(55)}\n`);
    }),
);

const program = Command.run(cli, {
  version: '1.0.0',
});

// Compose layers with explicit dependencies
// EGWAuth needs: HttpClient, FileSystem, Path
const AuthLayer = EGWAuth.layerLiveFs().pipe(Layer.provide(FetchHttpClient.layer));

// EGWApiClient needs: EGWAuth, HttpClient
const ApiClientLayer = EGWApiClient.Live.pipe(
  Layer.provide(AuthLayer),
  Layer.provide(FetchHttpClient.layer),
);

// GeminiFileSearchClient needs: HttpClient
const GeminiClientLayer = GeminiFileSearchClient.Live.pipe(Layer.provide(FetchHttpClient.layer));

// EGWParagraphDatabase needs: FileSystem, Path
const ParagraphDbLayer = EGWDbBun.Live;

// EGWUploadStatus needs: FileSystem, Path
const UploadStatusLayer = EGWUploadStatus.Live;

// EGWGeminiService needs: EGWApiClient, GeminiFileSearchClient, EGWUploadStatus, EGWParagraphDatabase, FileSystem
const EGWGeminiLayer = EGWGeminiService.Live.pipe(
  Layer.provide(ApiClientLayer),
  Layer.provide(GeminiClientLayer),
  Layer.provide(UploadStatusLayer),
  Layer.provide(ParagraphDbLayer),
  Layer.provide(BunFileSystem.layer),
  Layer.provide(BunPath.layer),
);

// App layer with all services
const AppLayer = Layer.mergeAll(EGWGeminiLayer, BunServices.layer);

program.pipe(Effect.provide(AppLayer), Effect.scoped, BunRuntime.runMain);
