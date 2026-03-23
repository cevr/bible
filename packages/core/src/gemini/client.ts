// @effect-diagnostics strictBooleanExpressions:off
/**
 * Gemini File Search API Client using Effect-TS
 * Based on https://www.philschmid.de/gemini-file-search-javascript
 * Adapted from Spotify client patterns with Effect-TS
 */

import { GoogleGenAI } from '@google/genai';
import type {
  CustomMetadata,
  Document,
  FileSearchStore,
  Pager,
  UploadToFileSearchStoreOperation,
} from '@google/genai';
import {
  Config,
  ServiceMap,
  Duration,
  Effect,
  Layer,
  Option,
  Redacted,
  Schedule,
  Schema,
  Stream,
} from 'effect';

import * as Schemas from './schemas.js';

// Type aliases for API types
type FileSearchStorePager = Pager<FileSearchStore>;
type DocumentPager = Pager<Document>;
type UploadOperation = UploadToFileSearchStoreOperation;

// Helper to check if pager has next page (handles incomplete type definitions)
function pagerHasNextPage(pager: unknown): boolean {
  if (typeof pager !== 'object' || pager === null) return false;
  const p = pager as { hasNextPage?: () => boolean; params?: { config?: { pageToken?: string } } };
  if (typeof p.hasNextPage === 'function') {
    try {
      return p.hasNextPage();
    } catch {
      // If hasNextPage throws, check params directly
      return p.params?.config?.pageToken !== undefined;
    }
  }
  // Fallback: check params directly
  return p.params?.config?.pageToken !== undefined;
}

/**
 * Gemini File Search Client Errors
 */
export class GeminiFileSearchError extends Schema.TaggedErrorClass<GeminiFileSearchError>()(
  'GeminiFileSearchError',
  {
    cause: Schema.Unknown,
    message: Schema.String,
  },
) {}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Gemini File Search Client service interface.
 */
export interface GeminiFileSearchClientService {
  readonly createStore: (
    displayName: string,
  ) => Effect.Effect<Schemas.FileSearchStore, GeminiFileSearchError>;
  readonly findStoreByDisplayName: (
    displayName: string,
    pageSize?: number,
  ) => Effect.Effect<Schemas.FileSearchStore, GeminiFileSearchError>;
  readonly uploadFile: (
    filePath: string,
    fileSearchStoreName: string,
    config: Schemas.UploadConfig,
  ) => Effect.Effect<Schemas.Operation, GeminiFileSearchError>;
  readonly uploadContent: (
    content: string | Uint8Array | Buffer,
    fileSearchStoreName: string,
    config: Schemas.UploadConfig,
  ) => Effect.Effect<Schemas.Operation, GeminiFileSearchError>;
  readonly uploadFiles: (
    filePaths: string[],
    fileSearchStoreName: string,
    getConfig: (filePath: string) => Schemas.UploadConfig,
  ) => Effect.Effect<Schemas.Operation[], GeminiFileSearchError>;
  readonly generateContent: (
    model: string,
    contents: string,
    fileSearchStoreNames: string[],
    metadataFilter?: string,
  ) => Effect.Effect<unknown, GeminiFileSearchError>;
  readonly listDocuments: (
    fileSearchStoreName: string,
    pageSize?: number,
  ) => Effect.Effect<Schemas.Document[], GeminiFileSearchError>;
  readonly findDocumentByDisplayName: (
    fileSearchStoreName: string,
    displayName: string,
  ) => Effect.Effect<Schemas.Document, GeminiFileSearchError>;
  readonly documentExists: (
    fileSearchStoreName: string,
    displayName: string,
  ) => Effect.Effect<boolean, GeminiFileSearchError>;
  readonly countDocumentsByBookId: (
    fileSearchStoreName: string,
    bookId: number,
  ) => Effect.Effect<number, GeminiFileSearchError>;
  readonly deleteDocument: (
    documentName: string,
    force?: boolean,
  ) => Effect.Effect<void, GeminiFileSearchError>;
  readonly updateDocument: (
    filePath: string,
    fileSearchStoreName: string,
    displayName: string,
    config?: Omit<Schemas.UploadConfig, 'displayName'>,
  ) => Effect.Effect<Schemas.Operation, GeminiFileSearchError>;
  readonly deleteStore: (
    storeName: string,
    force?: boolean,
  ) => Effect.Effect<void, GeminiFileSearchError>;
}

// ============================================================================
// Service Definition
// ============================================================================

/**
 * Gemini File Search Client Service
 */
export class GeminiFileSearchClient extends ServiceMap.Service<
  GeminiFileSearchClient,
  GeminiFileSearchClientService
>()('@bible/core/gemini/client/GeminiFileSearchClient') {
  /**
   * Live implementation using Google AI API.
   */
  static Live: Layer.Layer<GeminiFileSearchClient, Config.ConfigError> = Layer.effect(
    GeminiFileSearchClient,
    Effect.gen(function* () {
      const apiKey = yield* Config.redacted('GOOGLE_AI_API_KEY').pipe(
        Config.withDefault(
          process.env.GOOGLE_AI_API_KEY
            ? Redacted.make(process.env.GOOGLE_AI_API_KEY)
            : Redacted.make(''),
        ),
      );

      const ai = new GoogleGenAI({
        apiKey: Redacted.value(apiKey),
      });

      /**
       * Retry schedule with exponential backoff
       * Maximum 3 retries (1 initial attempt + 2 retries)
       * Exponential delays: 100ms, 200ms, 400ms
       */
      const retrySchedule = Schedule.exponential(Duration.millis(100)).pipe(
        Schedule.compose(Schedule.recurs(2)),
      );

      const pollOperation = (
        operation: UploadOperation,
        pollIntervalMs: number = 1000,
      ): Effect.Effect<Schemas.Operation, GeminiFileSearchError> =>
        Effect.gen(function* () {
          if (operation.done) {
            return {
              name: operation.name || '',
              done: true,
              error:
                operation.error &&
                typeof operation.error === 'object' &&
                'code' in operation.error &&
                'message' in operation.error
                  ? {
                      code: typeof operation.error.code === 'number' ? operation.error.code : 0,
                      message:
                        typeof operation.error.message === 'string'
                          ? operation.error.message
                          : 'Unknown error',
                    }
                  : undefined,
              response: operation.response,
            } as Schemas.Operation;
          }

          yield* Effect.sleep(Duration.millis(pollIntervalMs));
          const updatedOperation = yield* Effect.tryPromise({
            try: () => ai.operations.get({ operation }),
            catch: (error) =>
              new GeminiFileSearchError({
                message: 'Failed to get operation status',
                cause: error,
              }),
          }).pipe(Effect.retry(retrySchedule));
          return yield* pollOperation(updatedOperation as UploadOperation, pollIntervalMs);
        });

      const searchStoresRecursive = (
        pager: FileSearchStorePager,
        displayName: string,
      ): Effect.Effect<Schemas.FileSearchStore | null, GeminiFileSearchError> =>
        Effect.gen(function* () {
          const page = pager.page || [];

          // Search current page
          for (const store of page) {
            if (store.displayName === displayName) {
              return {
                name: store.name || '',
                displayName: store.displayName || '',
              } as Schemas.FileSearchStore;
            }
          }

          // Check next page
          if (!pager.hasNextPage()) {
            return null;
          }

          const nextPager = yield* Effect.tryPromise({
            try: () => pager.nextPage(),
            catch: (error) =>
              new GeminiFileSearchError({
                message: 'Failed to get next page of stores',
                cause: error,
              }),
          }).pipe(Effect.retry(retrySchedule));

          return yield* searchStoresRecursive(
            nextPager as unknown as FileSearchStorePager,
            displayName,
          );
        });

      const searchDocumentsRecursive = (
        pager: DocumentPager,
        displayName: string,
      ): Effect.Effect<Schemas.Document | null, GeminiFileSearchError> =>
        Effect.gen(function* () {
          const page = pager.page || [];

          // Search current page
          for (const doc of page) {
            if (doc.displayName === displayName) {
              return {
                name: doc.name || '',
                displayName: doc.displayName || '',
                createTime: doc.createTime,
                updateTime: doc.updateTime,
              } as Schemas.Document;
            }
          }

          // Check next page
          if (!pager.hasNextPage()) {
            return null;
          }

          const nextPager = yield* Effect.tryPromise({
            try: () => pager.nextPage(),
            catch: (error) =>
              new GeminiFileSearchError({
                message: 'Failed to get next page of documents',
                cause: error,
              }),
          }).pipe(Effect.retry(retrySchedule));

          return yield* searchDocumentsRecursive(
            nextPager as unknown as DocumentPager,
            displayName,
          );
        });

      // Define uploadFile as a named function for reuse
      const uploadFile = (
        filePath: string,
        fileSearchStoreName: string,
        config: Schemas.UploadConfig,
      ): Effect.Effect<Schemas.Operation, GeminiFileSearchError> =>
        Effect.gen(function* () {
          const apiMetadata = Schemas.toCustomMetadata(config.customMetadata);
          const uploadConfig: {
            displayName: string;
            customMetadata: CustomMetadata[];
            chunkingConfig?: {
              whiteSpaceConfig: {
                maxTokensPerChunk: number;
                maxOverlapTokens: number;
              };
            };
          } = {
            displayName: config.displayName,
            customMetadata: apiMetadata as CustomMetadata[],
          };
          if (config.chunkingConfig?.whiteSpaceConfig !== undefined) {
            uploadConfig.chunkingConfig = {
              whiteSpaceConfig: config.chunkingConfig.whiteSpaceConfig,
            };
          }

          const operation = yield* Effect.tryPromise({
            try: () =>
              ai.fileSearchStores.uploadToFileSearchStore({
                file: filePath,
                fileSearchStoreName,
                config: uploadConfig,
              }),
            catch: (error) =>
              new GeminiFileSearchError({
                message: `Failed to upload file: ${filePath}`,
                cause: error,
              }),
          });
          return yield* pollOperation(operation);
        }).pipe(Effect.retry(retrySchedule));

      return {
        createStore: (displayName: string) =>
          Effect.gen(function* () {
            const store = yield* Effect.tryPromise({
              try: () =>
                ai.fileSearchStores.create({
                  config: { displayName },
                }),
              catch: (error) =>
                new GeminiFileSearchError({
                  message: `Failed to create file search store: ${displayName}`,
                  cause: error,
                }),
            });
            return {
              name: store.name || '',
              displayName: store.displayName || displayName,
            } as Schemas.FileSearchStore;
          }).pipe(Effect.retry(retrySchedule)),

        findStoreByDisplayName: (displayName: string, pageSize: number = 10) =>
          Effect.gen(function* () {
            const pager = yield* Effect.tryPromise({
              try: () => ai.fileSearchStores.list({ config: { pageSize } }),
              catch: (error) =>
                new GeminiFileSearchError({
                  message: 'Failed to list file search stores',
                  cause: error,
                }),
            });
            const store = yield* searchStoresRecursive(pager, displayName);
            if (!store) {
              return yield* new GeminiFileSearchError({
                message: `Store with display name '${displayName}' not found`,
                cause: undefined,
              });
            }
            return store;
          }).pipe(Effect.retry(retrySchedule)),

        uploadFile,

        uploadContent: (
          content: string | Uint8Array | Buffer,
          fileSearchStoreName: string,
          config: Schemas.UploadConfig,
        ) =>
          Effect.gen(function* () {
            // Convert metadata to API format using the helper
            const apiMetadata = Schemas.toCustomMetadata(config.customMetadata);

            // Convert content to a File object (Bun supports File API)
            // Handle different content types properly for File constructor
            // Type assertion needed due to strict TypeScript types, but runtime works correctly
            const fileParts =
              typeof content === 'string'
                ? [content]
                : Buffer.isBuffer(content)
                  ? [
                      new Uint8Array(
                        content.buffer,
                        content.byteOffset,
                        content.byteLength,
                      ) as BlobPart,
                    ]
                  : [content as BlobPart];

            const file = new File(fileParts as BlobPart[], config.displayName || 'document.txt', {
              type: 'text/plain',
            });

            const contentLength =
              typeof content === 'string' ? content.length : content.byteLength || content.length;

            yield* Effect.log(
              `Uploading content (${contentLength} bytes) to store: ${fileSearchStoreName} with displayName: ${config.displayName}`,
            );

            // Build config object, only including chunkingConfig if it has whiteSpaceConfig
            const uploadConfig: {
              displayName: string;
              customMetadata: CustomMetadata[];
              chunkingConfig?: {
                whiteSpaceConfig: {
                  maxTokensPerChunk: number;
                  maxOverlapTokens: number;
                };
              };
            } = {
              displayName: config.displayName,
              customMetadata: apiMetadata as CustomMetadata[],
            };
            if (config.chunkingConfig?.whiteSpaceConfig !== undefined) {
              uploadConfig.chunkingConfig = {
                whiteSpaceConfig: config.chunkingConfig.whiteSpaceConfig,
              };
            }

            const operation = yield* Effect.tryPromise({
              try: () =>
                ai.fileSearchStores.uploadToFileSearchStore({
                  file: file,
                  fileSearchStoreName,
                  config: uploadConfig,
                }),
              catch: (error) =>
                new GeminiFileSearchError({
                  message: `Failed to upload content to store: ${fileSearchStoreName}`,
                  cause: error,
                }),
            });
            return yield* pollOperation(operation);
          }).pipe(Effect.retry(retrySchedule)),

        uploadFiles: (
          filePaths: string[],
          fileSearchStoreName: string,
          getConfig: (filePath: string) => Schemas.UploadConfig,
        ) =>
          Stream.fromIterable(filePaths).pipe(
            Stream.flatMap((filePath) =>
              Stream.fromEffect(uploadFile(filePath, fileSearchStoreName, getConfig(filePath))),
            ),
            Stream.runCollect,
          ),

        generateContent: (
          model: string,
          contents: string,
          fileSearchStoreNames: string[],
          metadataFilter?: string,
        ) =>
          Effect.gen(function* () {
            const response = yield* Effect.tryPromise({
              try: () =>
                ai.models.generateContent({
                  model,
                  contents,
                  config: {
                    tools: [
                      {
                        fileSearch: {
                          fileSearchStoreNames,
                          ...(metadataFilter && { metadataFilter }),
                        },
                      },
                    ],
                  },
                }),
              catch: (error) =>
                new GeminiFileSearchError({
                  message: 'Failed to generate content',
                  cause: error,
                }),
            });
            return {
              candidates: (response.candidates || []).map((candidate) => ({
                content: {
                  parts: (candidate.content?.parts || []).map((part) => ({
                    text: 'text' in part ? part.text : undefined,
                  })),
                },
                groundingMetadata: candidate.groundingMetadata
                  ? {
                      searchEntryPoint: candidate.groundingMetadata.searchEntryPoint,
                      retrievalMetadata: candidate.groundingMetadata.retrievalMetadata
                        ? {
                            score: (
                              candidate.groundingMetadata.retrievalMetadata as Record<
                                string,
                                unknown
                              >
                            ).score as number | undefined,
                            chunk: (
                              candidate.groundingMetadata.retrievalMetadata as Record<
                                string,
                                unknown
                              >
                            ).chunk as string | undefined,
                          }
                        : undefined,
                    }
                  : undefined,
              })),
            };
          }).pipe(Effect.retry(retrySchedule)),

        listDocuments: (fileSearchStoreName: string, pageSize: number = 20) =>
          Effect.gen(function* () {
            const stream = Stream.paginate(
              undefined as DocumentPager | undefined,
              (currentPager: DocumentPager | undefined) =>
                Effect.gen(function* () {
                  let pager: DocumentPager;
                  if (currentPager) {
                    yield* Effect.tryPromise({
                      try: () => currentPager.nextPage(),
                      catch: (error) =>
                        new GeminiFileSearchError({
                          message: `Failed to get next page of documents`,
                          cause: error,
                        }),
                    }).pipe(Effect.retry(retrySchedule));
                    pager = currentPager;
                  } else {
                    const pagerResult = yield* Effect.tryPromise({
                      try: () =>
                        ai.fileSearchStores.documents.list({
                          parent: fileSearchStoreName,
                          config: { pageSize },
                        }),
                      catch: (error) =>
                        new GeminiFileSearchError({
                          message: `Failed to list documents in store: ${fileSearchStoreName}`,
                          cause: error,
                        }),
                    }).pipe(Effect.retry(retrySchedule));
                    pager = pagerResult as unknown as DocumentPager;
                  }

                  const page = pager.page || [];

                  const documents: Schemas.Document[] = page.map((doc: Document) => ({
                    name: doc.name || '',
                    displayName: doc.displayName || '',
                    customMetadata: (doc.customMetadata || []) as Schemas.CustomMetadata[],
                  }));

                  const hasNext = pagerHasNextPage(pager);

                  return [documents, hasNext ? Option.some(pager) : Option.none()] as const;
                }),
            );

            // Collect all documents from the stream
            return yield* Stream.runCollect(stream);
          }),

        findDocumentByDisplayName: (fileSearchStoreName: string, displayName: string) =>
          Effect.gen(function* () {
            const pager = yield* Effect.tryPromise({
              try: () =>
                ai.fileSearchStores.documents.list({
                  parent: fileSearchStoreName,
                }),
              catch: (error) =>
                new GeminiFileSearchError({
                  message: `Failed to list documents in store: ${fileSearchStoreName}`,
                  cause: error,
                }),
            });
            const document = yield* searchDocumentsRecursive(pager, displayName);
            if (!document) {
              return yield* new GeminiFileSearchError({
                message: `Document '${displayName}' not found in store`,
                cause: undefined,
              });
            }
            return document;
          }).pipe(Effect.retry(retrySchedule)),

        documentExists: (fileSearchStoreName: string, displayName: string) =>
          Effect.gen(function* () {
            const pager = yield* Effect.tryPromise({
              try: () =>
                ai.fileSearchStores.documents.list({
                  parent: fileSearchStoreName,
                }),
              catch: (error) =>
                new GeminiFileSearchError({
                  message: `Failed to list documents in store: ${fileSearchStoreName}`,
                  cause: error,
                }),
            });
            const document = yield* searchDocumentsRecursive(pager, displayName);
            return document !== null;
          }).pipe(Effect.retry(retrySchedule)),

        countDocumentsByBookId: (fileSearchStoreName: string, bookId: number) =>
          Effect.gen(function* () {
            // Inline listDocuments logic to avoid self-reference
            const stream = Stream.paginate(
              undefined as DocumentPager | undefined,
              (currentPager: DocumentPager | undefined) =>
                Effect.gen(function* () {
                  let pager: DocumentPager;
                  if (currentPager) {
                    yield* Effect.tryPromise({
                      try: () => currentPager.nextPage(),
                      catch: (error) =>
                        new GeminiFileSearchError({
                          message: `Failed to get next page of documents`,
                          cause: error,
                        }),
                    }).pipe(Effect.retry(retrySchedule));
                    pager = currentPager;
                  } else {
                    const pagerResult = yield* Effect.tryPromise({
                      try: () =>
                        ai.fileSearchStores.documents.list({
                          parent: fileSearchStoreName,
                          config: { pageSize: 100 },
                        }),
                      catch: (error) =>
                        new GeminiFileSearchError({
                          message: `Failed to list documents in store: ${fileSearchStoreName}`,
                          cause: error,
                        }),
                    }).pipe(Effect.retry(retrySchedule));
                    pager = pagerResult as unknown as DocumentPager;
                  }

                  const page = pager.page || [];
                  const documents: Schemas.Document[] = page.map((doc: Document) => ({
                    name: doc.name || '',
                    displayName: doc.displayName || '',
                    customMetadata: (doc.customMetadata || []) as Schemas.CustomMetadata[],
                  }));

                  const hasNext = pagerHasNextPage(pager);

                  return [documents, hasNext ? Option.some(pager) : Option.none()] as const;
                }),
            );

            // Count documents with matching bookId
            const count = yield* stream.pipe(
              Stream.filter((doc: Schemas.Document) => {
                const bookIdMetadata = doc.customMetadata?.find(
                  (meta: Schemas.CustomMetadata) => meta.key === 'book_id',
                );
                return (
                  bookIdMetadata?.stringValue !== undefined &&
                  bookIdMetadata.stringValue === String(bookId)
                );
              }),
              Stream.runCount,
            );
            return count;
          }),

        deleteDocument: (documentName: string, force: boolean = true) =>
          Effect.tryPromise({
            try: () =>
              ai.fileSearchStores.documents.delete({
                name: documentName,
                config: { force },
              }),
            catch: (error) =>
              new GeminiFileSearchError({
                message: `Failed to delete document: ${documentName}`,
                cause: error,
              }),
          }).pipe(Effect.retry(retrySchedule)),

        updateDocument: (
          filePath: string,
          fileSearchStoreName: string,
          displayName: string,
          config?: Omit<Schemas.UploadConfig, 'displayName'>,
        ) =>
          Effect.gen(function* () {
            // Try to find and delete existing document
            yield* Effect.gen(function* () {
              const pager = yield* Effect.tryPromise({
                try: () =>
                  ai.fileSearchStores.documents.list({
                    parent: fileSearchStoreName,
                  }),
                catch: (error) =>
                  new GeminiFileSearchError({
                    message: `Failed to list documents in store: ${fileSearchStoreName}`,
                    cause: error,
                  }),
              });
              const existingDoc = yield* searchDocumentsRecursive(pager, displayName);
              if (existingDoc !== null) {
                yield* Effect.tryPromise({
                  try: () =>
                    ai.fileSearchStores.documents.delete({
                      name: existingDoc.name,
                      config: { force: true },
                    }),
                  catch: (error) =>
                    new GeminiFileSearchError({
                      message: `Failed to delete document: ${existingDoc.name}`,
                      cause: error,
                    }),
                });
              }
            }).pipe(
              Effect.catchTag('GeminiFileSearchError', (error) => {
                if (error.message.includes('not found')) {
                  return Effect.void;
                }
                return Effect.fail(error);
              }),
            );

            // Upload new file
            const apiMetadata = Schemas.toCustomMetadata(config?.customMetadata);
            const uploadConfig: {
              displayName: string;
              customMetadata: CustomMetadata[];
              chunkingConfig?: {
                whiteSpaceConfig: {
                  maxTokensPerChunk: number;
                  maxOverlapTokens: number;
                };
              };
            } = {
              displayName,
              customMetadata: apiMetadata as CustomMetadata[],
            };
            if (config?.chunkingConfig?.whiteSpaceConfig !== undefined) {
              uploadConfig.chunkingConfig = {
                whiteSpaceConfig: config.chunkingConfig.whiteSpaceConfig,
              };
            }

            const operation = yield* Effect.tryPromise({
              try: () =>
                ai.fileSearchStores.uploadToFileSearchStore({
                  file: filePath,
                  fileSearchStoreName,
                  config: uploadConfig,
                }),
              catch: (error) =>
                new GeminiFileSearchError({
                  message: `Failed to upload file: ${filePath}`,
                  cause: error,
                }),
            });
            return yield* pollOperation(operation);
          }),

        deleteStore: (storeName: string, force: boolean = true) =>
          Effect.tryPromise({
            try: () =>
              ai.fileSearchStores.delete({
                name: storeName,
                config: { force },
              }),
            catch: (error) =>
              new GeminiFileSearchError({
                message: `Failed to delete store: ${storeName}`,
                cause: error,
              }),
          }).pipe(Effect.retry(retrySchedule)),
      } as GeminiFileSearchClientService;
    }),
  );

  /**
   * Default layer - alias for Live (backwards compatibility).
   */
  static Default = GeminiFileSearchClient.Live;

  /**
   * Test implementation with no-op operations.
   */
  static Test = (): Layer.Layer<GeminiFileSearchClient> =>
    Layer.succeed(GeminiFileSearchClient, {
      createStore: (displayName) => Effect.succeed({ name: 'test-store', displayName }),
      findStoreByDisplayName: (displayName) => Effect.succeed({ name: 'test-store', displayName }),
      uploadFile: () => Effect.succeed({ name: 'test-op', done: true, response: {} }),
      uploadContent: () => Effect.succeed({ name: 'test-op', done: true, response: {} }),
      uploadFiles: () => Effect.succeed([]),
      generateContent: () => Effect.succeed({ candidates: [] }),
      listDocuments: () => Effect.succeed([]),
      findDocumentByDisplayName: (_, displayName) =>
        Effect.succeed({ name: 'test-doc', displayName }),
      documentExists: () => Effect.succeed(false),
      countDocumentsByBookId: () => Effect.succeed(0),
      deleteDocument: () => Effect.void,
      updateDocument: () => Effect.succeed({ name: 'test-op', done: true, response: {} }),
      deleteStore: () => Effect.void,
    });
}
