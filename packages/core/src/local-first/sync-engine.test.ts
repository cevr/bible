import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect, Schema } from 'effect';

import {
  DEFAULT_READING_PREFERENCES,
  applyReadingPreferencesPatch,
} from '../reading-preferences/model.js';

import { makeBunUserDatabase, makeBunSyncStore } from './database-bun.js';
import {
  ClientId,
  INITIAL_SERVER_REVISION,
  MutationId,
  MutationSequence,
  NoteId,
  SchemaVersion,
  ServerRevision,
  Timestamp,
  type ChangeSet,
  type MutationEnvelope,
} from './model.js';
import { makeSimulatedTransport, type SimulatedTransport } from './simulated-transport.js';
import { makeSyncEngine } from './sync-engine.js';

const migrationSql = await Bun.file(
  new URL('./migrations/0001_user_state.sql', import.meta.url),
).text();
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'bible-local-first-'));

afterAll(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

const clientId = Schema.decodeSync(ClientId);
const mutationId = Schema.decodeSync(MutationId);
const noteId = Schema.decodeSync(NoteId);
const timestamp = Schema.decodeSync(Timestamp);
const sequence = Schema.decodeSync(MutationSequence);
const revision = Schema.decodeSync(ServerRevision);
const schemaVersion = Schema.decodeSync(SchemaVersion);

const saveNote = (id: string, content: string) => ({
  _tag: 'SaveNote' as const,
  noteId: noteId(id),
  source: 'bible' as const,
  resourceId: 'KJV',
  location: 'John.3.16',
  content,
});

const darkReadingPreferences = applyReadingPreferencesPatch(DEFAULT_READING_PREFERENCES, {
  colorMode: 'dark',
  fontSizePx: 22,
});

interface Harness {
  readonly database: ReturnType<typeof makeBunUserDatabase>;
  readonly store: ReturnType<typeof makeBunSyncStore>;
  readonly engine: ReturnType<typeof makeSyncEngine>;
  readonly published: Array<ChangeSet>;
}

let harnessIndex = 0;

const makeHarness = async (
  name: string,
  transport: SimulatedTransport,
  filename = ':memory:',
  firstMutation = 1,
): Promise<Harness> => {
  const database = makeBunUserDatabase(filename);
  await Effect.runPromise(database.migrate(migrationSql));
  const id = clientId(name);
  const store = makeBunSyncStore(database, id);
  const published: Array<ChangeSet> = [];
  let mutationIndex = firstMutation;
  let timeIndex = firstMutation;
  const engine = makeSyncEngine({
    clientId: id,
    store,
    transport,
    nextMutationId: () => mutationId(`${name}-mutation-${mutationIndex++}`),
    now: () => timestamp(`2026-07-19T00:00:${String(timeIndex++).padStart(2, '0')}.000Z`),
    publish: (changes) => Effect.sync(() => published.push(changes)).pipe(Effect.asVoid),
  });
  harnessIndex += 1;
  return { database, store, engine, published };
};

const closeHarness = (harness: Harness) => Effect.runPromise(harness.database.close);

describe('local-first sync protocol', () => {
  test('keeps offline writes durable and retries the same envelope exactly once', async () => {
    const transport = makeSimulatedTransport();
    const client = await makeHarness('offline-client', transport);
    transport.setOnline(false);

    const envelope = await Effect.runPromise(
      client.engine.mutate(saveNote('note-offline', 'local')),
    );
    const offline = await Effect.runPromiseExit(client.engine.synchronize());

    expect(offline._tag).toBe('Failure');
    expect((await Effect.runPromise(client.store.note('note-offline')))?.content).toBe('local');
    expect(await Effect.runPromise(client.store.pending)).toEqual([envelope]);

    transport.setOnline(true);
    await Effect.runPromise(client.engine.synchronize());
    const duplicate = await Effect.runPromise(transport.push(envelope));

    expect(duplicate.duplicate).toBe(true);
    expect(transport.acceptedCount()).toBe(1);
    expect(await Effect.runPromise(client.store.pending)).toEqual([]);
    expect(await Effect.runPromise(client.store.revision)).toBe(revision(1));
    await closeHarness(client);
  });

  test('rejects sequence gaps and stale out-of-order pull responses', async () => {
    const transport = makeSimulatedTransport();
    const client = await makeHarness('ordered-client', transport);
    const gapEnvelope: MutationEnvelope = {
      clientId: clientId('gap-client'),
      sequence: sequence(2),
      mutationId: mutationId('gap-mutation'),
      schemaVersion: schemaVersion(1),
      command: saveNote('gap-note', 'gap'),
      createdAt: timestamp('2026-07-19T00:00:01.000Z'),
    };

    const gap = await Effect.runPromiseExit(transport.push(gapEnvelope));
    const stale = await Effect.runPromiseExit(
      client.store.applyPatch({
        baseRevision: revision(1),
        revision: revision(1),
        mutations: [],
      }),
    );

    expect(gap._tag).toBe('Failure');
    expect(stale._tag).toBe('Failure');
    expect(await Effect.runPromise(client.store.revision)).toBe(INITIAL_SERVER_REVISION);
    await closeHarness(client);
  });

  test('rebases pending local edits over pulled state and converges by server order', async () => {
    const transport = makeSimulatedTransport();
    const alpha = await makeHarness('alpha', transport);
    const beta = await makeHarness('beta', transport);

    await Effect.runPromise(beta.engine.mutate(saveNote('shared-note', 'from beta')));
    await Effect.runPromise(beta.engine.synchronize());
    await Effect.runPromise(alpha.engine.mutate(saveNote('shared-note', 'from alpha')));
    await Effect.runPromise(alpha.engine.synchronize());

    expect((await Effect.runPromise(alpha.store.note('shared-note')))?.content).toBe('from alpha');

    await Effect.runPromise(beta.engine.synchronize());

    expect((await Effect.runPromise(beta.store.note('shared-note')))?.content).toBe('from alpha');
    expect(await Effect.runPromise(alpha.store.revision)).toBe(revision(2));
    expect(await Effect.runPromise(beta.store.revision)).toBe(revision(2));
    await closeHarness(alpha);
    await closeHarness(beta);
  });

  test('replicates tombstone deletion and allows a later accepted save to restore the note', async () => {
    const transport = makeSimulatedTransport();
    const alpha = await makeHarness('delete-alpha', transport);
    const beta = await makeHarness('delete-beta', transport);

    await Effect.runPromise(alpha.engine.mutate(saveNote('deleted-note', 'first')));
    await Effect.runPromise(alpha.engine.synchronize());
    await Effect.runPromise(beta.engine.synchronize());
    await Effect.runPromise(
      beta.engine.mutate({
        _tag: 'DeleteNote',
        noteId: noteId('deleted-note'),
      }),
    );
    await Effect.runPromise(beta.engine.synchronize());
    await Effect.runPromise(alpha.engine.synchronize());

    expect((await Effect.runPromise(alpha.store.note('deleted-note')))?.deletedAt).not.toBeNull();

    await Effect.runPromise(alpha.engine.mutate(saveNote('deleted-note', 'restored')));
    await Effect.runPromise(alpha.engine.synchronize());
    await Effect.runPromise(beta.engine.synchronize());

    expect(await Effect.runPromise(alpha.store.note('deleted-note'))).toMatchObject({
      content: 'restored',
      deletedAt: null,
    });
    expect(await Effect.runPromise(beta.store.note('deleted-note'))).toMatchObject({
      content: 'restored',
      deletedAt: null,
    });
    await closeHarness(alpha);
    await closeHarness(beta);
  });

  test('persists reading preferences locally and converges them across clients', async () => {
    const transport = makeSimulatedTransport();
    const alpha = await makeHarness('preferences-alpha', transport);
    const beta = await makeHarness('preferences-beta', transport);

    await Effect.runPromise(
      alpha.engine.mutate({
        _tag: 'SetReadingPreferences',
        preferences: darkReadingPreferences,
      }),
    );

    expect(await Effect.runPromise(alpha.store.readingPreferences)).toEqual(darkReadingPreferences);
    expect(alpha.published.at(-1)).toEqual({ scopes: [{ _tag: 'ReadingPreferences' }] });

    await Effect.runPromise(alpha.engine.synchronize());
    await Effect.runPromise(beta.engine.synchronize());

    expect(await Effect.runPromise(beta.store.readingPreferences)).toEqual(darkReadingPreferences);
    await closeHarness(alpha);
    await closeHarness(beta);
  });

  test('lists active annotations and converges bookmark deletion', async () => {
    const transport = makeSimulatedTransport();
    const alpha = await makeHarness('bookmark-alpha', transport);
    const beta = await makeHarness('bookmark-beta', transport);
    const location = { source: 'bible' as const, resourceId: 'KJV', location: 'John.3.16' };

    await Effect.runPromise(
      alpha.engine.mutate({
        _tag: 'SaveBookmark',
        id: 'bookmark-john-3-16',
        location,
        label: 'The gospel in miniature',
      }),
    );

    expect(await Effect.runPromise(alpha.store.annotations(location))).toMatchObject({
      bookmarks: [
        {
          id: 'bookmark-john-3-16',
          source: 'bible',
          resourceId: 'KJV',
          location: 'John.3.16',
          label: 'The gospel in miniature',
        },
      ],
      notes: [],
      markers: [],
      crossReferences: [],
    });

    await Effect.runPromise(alpha.engine.synchronize());
    await Effect.runPromise(beta.engine.synchronize());
    expect((await Effect.runPromise(beta.store.annotations(location))).bookmarks).toHaveLength(1);

    await Effect.runPromise(
      alpha.engine.mutate({ _tag: 'DeleteBookmark', id: 'bookmark-john-3-16' }),
    );
    await Effect.runPromise(alpha.engine.synchronize());
    await Effect.runPromise(beta.engine.synchronize());

    expect((await Effect.runPromise(alpha.store.annotations(location))).bookmarks).toEqual([]);
    expect((await Effect.runPromise(beta.store.annotations(location))).bookmarks).toEqual([]);
    await closeHarness(alpha);
    await closeHarness(beta);
  });

  test('persists reading-plan progress and converges its structural definition', async () => {
    const transport = makeSimulatedTransport();
    const alpha = await makeHarness('plan-alpha', transport);
    const beta = await makeHarness('plan-beta', transport);

    await Effect.runPromise(
      alpha.engine.mutate({
        _tag: 'SaveReadingPlan',
        id: 'plan-gospel-of-john',
        title: 'The Gospel of John',
        description: null,
        steps: [{ id: 'john-1', title: 'The Word', route: '/bible/KJV/John.1' }],
      }),
    );
    await Effect.runPromise(
      alpha.engine.mutate({
        _tag: 'SetReadingPlanProgress',
        planId: 'plan-gospel-of-john',
        stepId: 'john-1',
        completedAt: '2026-07-19T00:05:00.000Z',
      }),
    );

    expect(await Effect.runPromise(alpha.store.readingPlans)).toMatchObject([
      {
        id: 'plan-gospel-of-john',
        steps: [{ id: 'john-1', route: '/bible/KJV/John.1' }],
        progress: [{ stepId: 'john-1', completedAt: '2026-07-19T00:05:00.000Z' }],
      },
    ]);

    await Effect.runPromise(alpha.engine.synchronize());
    await Effect.runPromise(beta.engine.synchronize());
    expect(await Effect.runPromise(beta.store.readingPlans)).toEqual(
      await Effect.runPromise(alpha.store.readingPlans),
    );
    await closeHarness(alpha);
    await closeHarness(beta);
  });

  test('recovers the journal and next device sequence after a database restart', async () => {
    const transport = makeSimulatedTransport();
    const filename = join(temporaryDirectory, `restart-${harnessIndex}.sqlite`);
    const first = await makeHarness('restart-client', transport, filename);
    const firstEnvelope = await Effect.runPromise(
      first.engine.mutate(saveNote('restart-note-1', 'one')),
    );
    await closeHarness(first);

    const reopened = await makeHarness('restart-client', transport, filename, 2);
    const recovered = await Effect.runPromise(reopened.store.pending);
    const secondEnvelope = await Effect.runPromise(
      reopened.engine.mutate(saveNote('restart-note-2', 'two')),
    );

    expect(recovered).toEqual([firstEnvelope]);
    expect(secondEnvelope.sequence).toBe(sequence(2));
    await Effect.runPromise(reopened.engine.synchronize());
    expect(transport.acceptedCount()).toBe(2);
    await closeHarness(reopened);
  });

  test('validates commands before opening a mutation transaction', async () => {
    const transport = makeSimulatedTransport();
    const client = await makeHarness('decode-client', transport);

    const invalid = await Effect.runPromiseExit(
      client.engine.mutate({ _tag: 'SaveNote', noteId: '', content: 42 }),
    );

    expect(invalid._tag).toBe('Failure');
    expect(await Effect.runPromise(client.store.pending)).toEqual([]);
    await closeHarness(client);
  });

  test('commits materialized state and its journal envelope atomically', async () => {
    const transport = makeSimulatedTransport();
    const client = await makeHarness('atomic-client', transport);
    const id = mutationId('atomic-mutation');

    await Effect.runPromise(
      client.store.mutate({
        clientId: clientId('atomic-client'),
        mutationId: id,
        command: saveNote('atomic-note', 'committed'),
        createdAt: timestamp('2026-07-19T00:00:01.000Z'),
      }),
    );
    const duplicate = await Effect.runPromiseExit(
      client.store.mutate({
        clientId: clientId('atomic-client'),
        mutationId: id,
        command: saveNote('atomic-note', 'must roll back'),
        createdAt: timestamp('2026-07-19T00:00:02.000Z'),
      }),
    );

    expect(duplicate._tag).toBe('Failure');
    expect((await Effect.runPromise(client.store.note('atomic-note')))?.content).toBe('committed');
    expect(await Effect.runPromise(client.store.pending)).toHaveLength(1);
    await closeHarness(client);
  });
});
