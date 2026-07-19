import type { ClientId } from './model.js';
import type { SyncStore } from './sync-store.js';
import type { BunUserDatabase } from './database-bun.js';
import { makeDrizzleSyncStore } from './sync-store-drizzle.js';

export const makeBunSyncStore = (database: BunUserDatabase, localClientId: ClientId): SyncStore =>
  makeDrizzleSyncStore(database, localClientId);
