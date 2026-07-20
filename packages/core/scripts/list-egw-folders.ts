/**
 * List EGW Folders Script
 *
 * This script lists all folders available in the EGW API for a given language.
 * Use this to find the folder ID for filtering books (e.g., published writings).
 *
 * Usage:
 *   bun run list-egw-folders.ts [languageCode]
 *
 * Environment Variables Required:
 *   - EGW_CLIENT_ID: EGW API client ID
 *   - EGW_CLIENT_SECRET: EGW API client secret
 *   - EGW_AUTH_BASE_URL: (optional) Defaults to https://cpanel.egwwritings.org
 *   - EGW_API_BASE_URL: (optional) Defaults to https://a.egwwritings.org
 *   - EGW_SCOPE: (optional) Defaults to "writings search studycenter subscriptions user_info"
 */

import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import * as BunServices from '@effect/platform-bun/BunServices';
import { Effect, Layer } from 'effect';
import { Argument, Command } from 'effect/unstable/cli';
import { FetchHttpClient } from 'effect/unstable/http';

import { EGWAuth } from '../src/egw/auth.js';
import { EGWApiClient } from '../src/egw/client.js';
import type * as EGWSchemas from '../src/egw/schemas.js';

const languageCodeArgument = Argument.string('languageCode').pipe(Argument.withDefault('en'));

const listFolders = Effect.fn('listEgwFolders')(function* (languageCode: string) {
  const egwClient = yield* EGWApiClient;

  yield* Effect.log(`Fetching folders for language: ${languageCode}...`);

  const folders = yield* egwClient.getFoldersByLanguage(languageCode);

  // Recursive function to display folder hierarchy
  const displayFolders = (
    folders: ReadonlyArray<EGWSchemas.Folder>,
    indent = '',
  ): Effect.Effect<void> =>
    Effect.forEach(
      folders,
      (folder) =>
        Effect.gen(function* () {
          yield* Effect.log(
            `${indent}📁 ${folder.name} (ID: ${folder.folder_id}) - ${folder.nbooks} books, ${folder.naudiobooks} audiobooks`,
          );
          if (folder.children !== undefined && folder.children.length > 0) {
            yield* displayFolders(folder.children, `${indent}  `);
          }
        }),
      { concurrency: 1, discard: true },
    );

  yield* Effect.log(`\nFound ${folders.length} top-level folders:\n`);
  yield* displayFolders(folders);

  yield* Effect.log(`\n✅ Folder listing complete!`);
  yield* Effect.log(
    `💡 Tip: Use the folder ID in upload-egw.ts or sync-egw-books.ts to filter books by folder.`,
  );
});

const cli = Command.make(
  'list-egw-folders',
  { languageCode: languageCodeArgument },
  ({ languageCode }) => listFolders(languageCode).pipe(Effect.provide(LiveEgwApi)),
);

// Compose all layers - EGWApiClient needs EGWAuth and HttpClient
const AuthLayer = Layer.provide(EGWAuth.layerLiveFs(), FetchHttpClient.layer);
const ApiClientLayer = EGWApiClient.Live.pipe(
  Layer.provide(AuthLayer),
  Layer.provide(FetchHttpClient.layer),
);

const LiveEgwApi = ApiClientLayer.pipe(Layer.provide(BunServices.layer));

// Run the program with all required dependencies
Command.run(cli, { version: '1.0.0' }).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
