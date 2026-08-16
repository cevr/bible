import {
  corpusStorageIdentity,
  encodeRevision,
  makeCorpusStorageIdentity,
  type CorpusStorageIdentity,
} from '@bible/core/corpus-supply';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option } from 'effect';

import { makeCorpusGenerationStore } from './corpus-generation-store.js';
import type { GenerationRegistry, GenerationRegistryStore } from './generation-marker.js';
import type { SqliteDatabase, SqliteDatabaseFamily } from './sqlite-database.js';

const database: SqliteDatabase = {
  isOpen: true,
  open: () => Effect.void,
  close: Effect.void,
  query: () => Effect.succeed([]),
  values: () => Effect.succeed([]),
  write: () => Effect.succeed(0),
  exec: () => Effect.void,
};

const registryWriteFailure = { _tag: 'RegistryWriteFailure' } as const;

const bibleStorage = corpusStorageIdentity('bible');
const fixtureStorage = makeCorpusStorageIdentity('fixture-corpus');

const harness = (
  initial: GenerationRegistry,
  identity: CorpusStorageIdentity<string> = bibleStorage,
) => {
  const events: string[] = [];
  let state = initial;
  let activeFilename: Option.Option<string> = Option.none();
  let failNextWrite = false;
  const databases: SqliteDatabaseFamily = {
    active: database,
    candidate: () => database,
    activate: (filename) =>
      Effect.sync(() => {
        events.push(`activate:${filename}`);
        activeFilename = Option.some(filename);
      }),
    deactivate: Effect.sync(() => {
      events.push('deactivate');
      activeFilename = Option.none();
    }),
    get activeFilename() {
      return activeFilename;
    },
  };
  const registry: GenerationRegistryStore = {
    read: Effect.sync(() => state),
    write: (next) =>
      Effect.gen(function* () {
        if (failNextWrite) {
          failNextWrite = false;
          return yield* Effect.fail(registryWriteFailure);
        }
        events.push(
          `registry:${Option.getOrElse(next.active, () => 'none')}:${next.managed.join(',')}`,
        );
        state = next;
      }),
  };
  const store = makeCorpusGenerationStore({
    identity,
    databases,
    registry,
    discard: (filename) =>
      Effect.sync(() => {
        events.push(`discard:${filename}`);
      }),
  });
  return {
    events,
    store,
    state: () => state,
    failRegistryWrite: () => {
      failNextWrite = true;
    },
  };
};

describe('browser Bible generation store', () => {
  it.effect('reconciles every registered inactive generation on startup', () =>
    Effect.gen(function* () {
      const active = 'bible-db-v2-e72244f576be.db';
      const interrupted = 'bible-db-v3-aaaaaaaaaaaa.db';
      const stale = 'bible-db-v1-111111111111.db';
      const fixture = harness({
        active: Option.some(active),
        managed: [stale, active, interrupted],
      });

      expect(yield* fixture.store.openActive).toBe(true);
      expect(fixture.events).toContain(`activate:${active}`);
      expect(fixture.events).toContain(`discard:${stale}`);
      expect(fixture.events).toContain(`discard:${interrupted}`);
      expect(fixture.state()).toEqual({ active: Option.some(active), managed: [active] });
    }),
  );

  it.effect('rolls the reader back when durable activation cannot commit', () =>
    Effect.gen(function* () {
      const previous = 'bible-db-v1-111111111111.db';
      const candidate = 'bible-db-v2-e72244f576be.db';
      const fixture = harness({ active: Option.some(previous), managed: [previous] });
      yield* fixture.store.openActive;
      yield* fixture.store.reserve(candidate);
      fixture.failRegistryWrite();

      const failure = yield* Effect.flip(fixture.store.activateVerified(candidate));

      expect(failure).toEqual(registryWriteFailure);
      expect(fixture.events.slice(-3)).toEqual([
        `activate:${previous}`,
        `discard:${candidate}`,
        `registry:${previous}:${previous}`,
      ]);
      expect(fixture.state()).toEqual({ active: Option.some(previous), managed: [previous] });
    }),
  );

  it.effect('records a candidate before acquisition so a restarted store can retire it', () =>
    Effect.gen(function* () {
      const active = 'bible-db-v1-111111111111.db';
      const candidate = 'bible-db-v2-e72244f576be.db';
      const fixture = harness({ active: Option.some(active), managed: [active] });

      yield* fixture.store.reserve(candidate);
      expect(fixture.state().managed).toContain(candidate);
      expect(yield* fixture.store.openActive).toBe(true);
      expect(fixture.events).toContain(`discard:${candidate}`);
      expect(fixture.state()).toEqual({ active: Option.some(active), managed: [active] });
    }),
  );

  it.effect('allocates an inactive slot when refresh requests the active identity', () =>
    Effect.gen(function* () {
      const active = 'bible-db-v2-e72244f576be.db';
      const fixture = harness({ active: Option.some(active), managed: [active] });

      const reserved = yield* fixture.store.reserve(active);

      expect(reserved.filename).toBe('bible-db-v2-e72244f576be-next.db');
      expect(reserved.filename).not.toBe(active);
      expect(fixture.state()).toEqual({
        active: Option.some(active),
        managed: [active, reserved.filename],
      });
    }),
  );
});

describe('browser generation store for a synthetic File Corpus', () => {
  const active = fixtureStorage.generationFilename('v2', 'e72244f576be');
  const interrupted = fixtureStorage.generationFilename('v3', 'aaaaaaaaaaaa');

  it.effect('retires orphaned candidates registered under its own storage identity', () =>
    Effect.gen(function* () {
      const fixture = harness(
        { active: Option.some(active), managed: [active, interrupted] },
        fixtureStorage,
      );

      expect(yield* fixture.store.openActive).toBe(true);
      expect(fixture.events).toContain(`activate:${active}`);
      expect(fixture.events).toContain(`discard:${interrupted}`);
      expect(fixture.state()).toEqual({ active: Option.some(active), managed: [active] });
    }),
  );

  it.effect('leaves generations belonging to another File Corpus registered', () =>
    Effect.gen(function* () {
      const foreign = 'bible-db-v1-111111111111.db';
      const fixture = harness(
        { active: Option.some(active), managed: [active, foreign] },
        fixtureStorage,
      );

      expect(yield* fixture.store.openActive).toBe(true);
      expect(fixture.events).not.toContain(`discard:${foreign}`);
      expect(fixture.state()).toEqual({
        active: Option.some(active),
        managed: [active, foreign],
      });
    }),
  );

  it.effect('allocates an inactive slot for a non-bible identity on refresh', () =>
    Effect.gen(function* () {
      const fixture = harness({ active: Option.some(active), managed: [active] }, fixtureStorage);

      const reserved = yield* fixture.store.reserve(active);

      expect(reserved.filename).toBe(active.replace(/\.db$/u, '-next.db'));
      expect(fixture.state().managed).toContain(reserved.filename);
    }),
  );
});

describe('browser Topics generation store', () => {
  const topicsStorage = corpusStorageIdentity('topics');
  const active = topicsStorage.generationFilename('topics-e3b0c44298fc', 'aaaaaaaaaaaa');

  it.effect('derives a second generation namespace that never collides with Bible', () =>
    Effect.sync(() => {
      // The whole point of a second OPFS generation: nothing is shared, so a
      // topics install can never touch a Bible generation.
      expect(topicsStorage.generationPrefix).toBe('topics');
      expect(topicsStorage.metadataDatabaseName).toBe('topics-corpus-metadata');
      expect(topicsStorage.activeGenerationKey).toBe('active-topics-generation');
      expect(topicsStorage.assetPath).toBe('/api/assets/topics');
      expect(topicsStorage.metadataDatabaseName).not.toBe(bibleStorage.metadataDatabaseName);
      expect(topicsStorage.activeGenerationKey).not.toBe(bibleStorage.activeGenerationKey);
      expect(topicsStorage.ownsGeneration('bible-db-v2-e72244f576be.db')).toBe(false);
      expect(bibleStorage.ownsGeneration(active)).toBe(false);
    }),
  );

  it.effect('rolls back a failed candidate and keeps the active generation', () =>
    Effect.gen(function* () {
      const fixture = harness({ active: Option.some(active), managed: [active] }, topicsStorage);
      expect(yield* fixture.store.openActive).toBe(true);

      // Reserve a candidate the way an install does, then abandon it.
      const candidate = yield* fixture.store.reserve(
        topicsStorage.generationFilename('topics-ffffffffffff', 'bbbbbbbbbbbb'),
      );
      expect(fixture.state().managed).toContain(candidate.filename);

      yield* fixture.store.discardCandidate(candidate.filename);

      expect(fixture.events).toContain(`discard:${candidate.filename}`);
      // The active generation survives the failed candidate untouched.
      expect(fixture.state()).toEqual({ active: Option.some(active), managed: [active] });
    }),
  );

  it.effect('leaves a Bible generation alone while reconciling its own', () =>
    Effect.gen(function* () {
      const foreign = 'bible-db-v2-e72244f576be.db';
      const orphan = topicsStorage.generationFilename('topics-ffffffffffff', 'cccccccccccc');
      const fixture = harness(
        { active: Option.some(active), managed: [active, orphan, foreign] },
        topicsStorage,
      );

      expect(yield* fixture.store.openActive).toBe(true);
      expect(fixture.events).toContain(`discard:${orphan}`);
      expect(fixture.events).not.toContain(`discard:${foreign}`);
      expect(fixture.state().managed).toContain(foreign);
    }),
  );
});

describe('Corpus Storage Identity', () => {
  it.effect("keeps Bible's shipped on-disk and IndexedDB names byte-identical", () =>
    Effect.sync(() => {
      expect(bibleStorage.generationPrefix).toBe('bible');
      expect(bibleStorage.metadataDatabaseName).toBe('bible-corpus-metadata');
      expect(bibleStorage.activeGenerationKey).toBe('active-bible-generation');
      expect(bibleStorage.assetPath).toBe('/api/assets/bible');
      expect(bibleStorage.generationFilename('db-v2', 'e72244f576be')).toBe(
        'bible-db-v2-e72244f576be.db',
      );
      expect(bibleStorage.ownsGeneration('bible-db-v2-e72244f576be.db')).toBe(true);
      expect(bibleStorage.ownsGeneration('bible-db-v2-e72244f576be-next.db')).toBe(true);
    }),
  );

  it.effect('encodes every strict corpus injectively in corpus, revision, and digest', () =>
    Effect.sync(() => {
      // The pair that collides under Bible's legacy `-` encoding: corpus
      // `topics-db` + revision `v2` versus corpus `topics` + revision `db-v2`.
      const outer = makeCorpusStorageIdentity('topics-db');
      const inner = makeCorpusStorageIdentity('topics');

      expect(outer.generationFilename('v2', 'e72244f576be')).not.toBe(
        inner.generationFilename('db-v2', 'e72244f576be'),
      );
      expect(outer.ownsGeneration(inner.generationFilename('db-v2', 'e72244f576be'))).toBe(false);
      expect(inner.ownsGeneration(outer.generationFilename('v2', 'e72244f576be'))).toBe(false);
    }),
  );

  it.effect('encodes distinct revisions into distinct generation filenames', () =>
    Effect.sync(() => {
      const identity = makeCorpusStorageIdentity('topics');
      const digest12 = 'e72244f576be';

      // The counterexample a lossy `[^a-zA-Z0-9._-] -> '-'` replacement folds:
      // both revisions became `v-1` and claimed one generation.
      expect(encodeRevision('v/1')).not.toBe(encodeRevision('v?1'));
      expect(identity.generationFilename('v/1', digest12)).not.toBe(
        identity.generationFilename('v?1', digest12),
      );
      // Every escape stays inside the filename charset and the store still
      // recognizes the generation as its own.
      expect(identity.generationFilename('v/1', digest12)).toBe('topics~v_2f1~e72244f576be.db');
      expect(identity.ownsGeneration(identity.generationFilename('v/1', digest12))).toBe(true);
      expect(identity.ownsGeneration(identity.generationFilename('v?1', digest12))).toBe(true);
      // `_` escapes itself, so an escape sequence a revision spells literally
      // cannot impersonate one the encoder produced.
      expect(encodeRevision('v_2f1')).toBe('v_5f2f1');
      expect(encodeRevision('v_2f1')).not.toBe(encodeRevision('v/1'));
      // Bible's shipped revision is drawn entirely from the literal set, so
      // its legacy filename is unchanged.
      expect(encodeRevision('db-v2')).toBe('db-v2');
    }),
  );

  it.effect('never treats a regex metacharacter in a corpus name as a pattern', () =>
    Effect.sync(() => {
      const identity = makeCorpusStorageIdentity('a.c');

      expect(identity.ownsGeneration(identity.generationFilename('v1', 'e72244f576be'))).toBe(true);
      // `.` would match any character if the prefix were interpolated into a
      // RegExp; matching on the literal prefix rejects `abc`.
      expect(identity.ownsGeneration('abc~v1~e72244f576be.db')).toBe(false);
    }),
  );
});
