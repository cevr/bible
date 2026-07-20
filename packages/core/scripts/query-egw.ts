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

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Layer, Option, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import { text } from 'effect/unstable/cli/Prompt';
import { FetchHttpClient } from 'effect/unstable/http';

import * as EGWDbBun from '../src/egw-db/book-database-bun.js';
import { EGWGeminiService } from '../src/egw-gemini/index.js';
import { EGWUploadStatus } from '../src/egw-gemini/upload-status.js';
import { EGWAuth } from '../src/egw/auth.js';
import { EGWApiClient } from '../src/egw/client.js';
import { GeminiFileSearchClient } from '../src/gemini/index.js';

const queryArg = Argument.string('query').pipe(Argument.optional);

const storeOption = Flag.string('store').pipe(
  Flag.withDefault('egw-writings'),
  Flag.withDescription('The display name of the Gemini File Search store'),
);

const metadataFilterOption = Flag.string('metadata-filter').pipe(
  Flag.optional,
  Flag.withDescription(
    'Optional metadata filter to narrow search results (e.g., book_title="The Desire of Ages")',
  ),
);

const GenerateContentResponse = Schema.Struct({
  candidates: Schema.optional(
    Schema.Array(
      Schema.Struct({
        content: Schema.optional(
          Schema.Struct({
            parts: Schema.optional(
              Schema.Array(Schema.Struct({ text: Schema.optional(Schema.String) })),
            ),
          }),
        ),
        groundingMetadata: Schema.optional(
          Schema.Struct({
            searchEntryPoint: Schema.optional(Schema.String),
            retrievalMetadata: Schema.optional(
              Schema.Struct({
                score: Schema.optional(Schema.Number),
                chunk: Schema.optional(Schema.String),
              }),
            ),
          }),
        ),
      }),
    ),
  ),
});

const decodeGenerateContentResponse = Schema.decodeUnknownEffect(GenerateContentResponse);

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
      const query = yield* Option.match(args.query, {
        onNone: () => text({ message: 'What would you like to query from the EGW store?' }),
        onSome: Effect.succeed,
      });

      yield* Console.log(`Querying store: ${args.store}`);
      yield* Console.log(`Query: ${query}`);

      const metadataFilter = Option.getOrUndefined(args.metadataFilter);

      if (metadataFilter) {
        yield* Console.log(`Metadata filter: ${metadataFilter}`);
      }

      // Query the store
      const queryOptions: {
        storeDisplayName: string;
        query: string;
        metadataFilter?: string;
      } = { storeDisplayName: args.store, query };
      if (metadataFilter !== undefined) queryOptions.metadataFilter = metadataFilter;
      const result = yield* service.queryStore(queryOptions);

      // Type the response for display
      const response = yield* decodeGenerateContentResponse(result.response);

      // Display query information
      yield* Console.log('\n═══════════════════════════════════════════════════════');
      yield* Console.log('QUERY RESULTS');
      yield* Console.log('═══════════════════════════════════════════════════════');
      yield* Console.log(`Store: ${result.store.displayName} (${result.store.name})`);
      yield* Console.log(`Query: ${result.query}`);
      yield* Console.log(`Candidates: ${response.candidates?.length ?? 0}`);
      yield* Console.log('');

      // Display all candidates
      const candidates = response.candidates ?? [];
      if (candidates.length === 0) {
        yield* Console.log('No candidates found in response');
      } else {
        yield* Effect.forEach(
          candidates,
          (candidate, index) =>
            Effect.gen(function* () {
              yield* Console.log(
                `\n${'─'.repeat(55)}\nCANDIDATE ${index + 1} of ${candidates.length}\n${'─'.repeat(55)}`,
              );

              // Display content parts
              if (candidate.content?.parts) {
                yield* Console.log('\nContent:');
                yield* Effect.forEach(
                  candidate.content.parts,
                  (part, partIndex) =>
                    Effect.gen(function* () {
                      if (part.text) {
                        yield* Console.log(`\nPart ${partIndex + 1}:`);
                        yield* Console.log(part.text);
                      } else {
                        yield* Console.log(`\nPart ${partIndex + 1}: (non-text content)`);
                      }
                    }),
                  { concurrency: 1, discard: true },
                );
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
                    let chunkPreview = retrieval.chunk;
                    if (retrieval.chunk.length > 300) {
                      chunkPreview = `${retrieval.chunk.substring(0, 300)}...`;
                    }
                    yield* Console.log(`    Retrieved Chunk (${retrieval.chunk.length} chars):`);
                    yield* Console.log(`    ${chunkPreview.split('\n').join('\n    ')}`);
                  }
                } else {
                  yield* Console.log('  (no retrieval metadata)');
                }
              } else {
                yield* Console.log('\nGrounding Metadata: (none)');
              }
            }),
          { concurrency: 1, discard: true },
        );
      }

      // Display any additional response data
      yield* Console.log(`\n${'═'.repeat(55)}`);
      yield* Console.log('RESPONSE SUMMARY');
      yield* Console.log('═'.repeat(55));
      yield* Console.log(`Total candidates: ${candidates.length}`);
      yield* Console.log(`Store: ${result.store.displayName}`);
      yield* Console.log('═'.repeat(55) + '\n');
    }).pipe(Effect.provide(EGWGeminiLayer)),
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
  Layer.provide(BunServices.layer),
);

// App layer with all services
program.pipe(Effect.provide(BunServices.layer), Effect.scoped, BunRuntime.runMain);
