// The productions' ledgers on disk (`core/production.ts`): one small JSON
// file each, `<productions>/<production>.json` under `FILMS_PRODUCTIONS` (the
// app's `productions/`, committed: the owner's word, which no render can make
// again, kept with the code and alike in every checkout; it names sets by
// their folder and never holds an image or a render). Each is a `ContentStore` manifest, written whole by one
// writer at a time across processes, so the lab's Move forward and an
// agent's `film production` in a terminal never lose each other's write.
// A ledger that does not decode is left out of the list with a warning,
// never rewritten: the front door still opens. A ledger decodes from, and is
// written to, only the file named for its production: a caller addresses a
// ledger by the production it names, so one kept in another file would be
// read from one file and written to another.
//
// The store is the timeline's one write path: the lab's Move forward (the
// `productions` HTTP group), `film production` and `film publish` in a
// terminal, and any other caller (an MCP tool) use its verbs (`start`,
// `forward`, `say`, `file`, `publish`), each decided on the ledger as read
// under its lock, so every caller gets the same refusals.

import {
  Array as Arr,
  Config,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Result,
  Schema,
} from 'effect';
import {
  type MoveForward,
  type OwnerWord,
  type ProductionFile,
  type ProductionId,
  aimedWord,
  currentVersion,
  moveForward,
  newProduction,
  ProductionFile as ProductionFileSchema,
  withFiled,
  withSaid,
} from '../core/production.ts';
import type { VersionMoved, WordUnaimed } from '../core/refusals.ts';
import { ReviewManifest } from '../core/review.ts';
import { repoJson } from '../core/schema.ts';
import { FileInvalid } from './errors.ts';
import { ContentStore, type Manifest, type StoreError, writeWhole } from './content-store.ts';

const ProductionFileJson = repoJson(ProductionFileSchema);

/** Words in one line, quoted: a newline in them would split the line. */
const quoted = Schema.encodeSync(Schema.fromJsonString(Schema.String));

/** The codec of the file named for `production`: a ledger of another production does not decode from it, nor is written to it. */
const ledgerOf = (production: ProductionId) =>
  ProductionFileJson.check(
    Schema.makeFilter(
      (file) =>
        file.production === production ||
        `it holds the production ${file.production}, not ${production}, the one its file is named for`,
    ),
  );

/** `start` on a production that already has a ledger. */
class ProductionKept extends Schema.TaggedError<ProductionKept>()('ProductionKept', {
  production: Schema.String,
}) {
  override get message() {
    return `${this.production} already has a ledger: film production show ${this.production}`;
  }
}

/** A version the production does not have. */
class VersionUnknown extends Schema.TaggedError<VersionUnknown>()('VersionUnknown', {
  production: Schema.String,
  version: Schema.Int,
  current: Schema.Int,
}) {
  override get message() {
    return `${this.production} has no v${this.version} (v1 to v${this.current})`;
  }
}

/** A production's first ledger as `start` takes it. */
interface Start {
  readonly title: string;
  readonly film: Option.Option<string>;
  readonly blurb: Option.Option<string>;
  /** What its first version is for. */
  readonly first: string;
  readonly at: number;
}

interface ProductionStoreService {
  /**
   * Every ledger there is, by name; one that does not decode, as one kept in
   * a file not named for its production does not, is left out with a warning.
   */
  readonly list: Effect.Effect<ReadonlyArray<ProductionFile>, StoreError>;
  /** The production's ledger, when one is kept. */
  readonly read: (
    production: ProductionId,
  ) => Effect.Effect<Option.Option<ProductionFile>, StoreError>;
  /**
   * One change to the ledger, decided on it as read under its lock; a
   * production with no ledger yet starts from one version opened at the
   * epoch (`newProduction`).
   */
  readonly modify: <E>(
    production: ProductionId,
    change: (current: ProductionFile) => Result.Result<ProductionFile, E>,
  ) => Effect.Effect<ProductionFile, E | StoreError>;
  /**
   * `modify` that answers `A` beside the ledger it leaves, both decided on
   * the ledger as read under its lock; a change that fails writes nothing
   * and fails the call.
   */
  readonly attempt: <A, E>(
    production: ProductionId,
    change: (current: ProductionFile) => Result.Result<readonly [A, ProductionFile], E>,
  ) => Effect.Effect<A, E | StoreError>;
  /** Start a production's ledger: one version, opened at `at`; refused when one is kept. */
  readonly start: (
    production: ProductionId,
    start: Start,
  ) => Effect.Effect<ProductionFile, ProductionKept | StoreError>;
  /** Move forward: version `after + 1` opens at `at`; refused when the production is past `after`. */
  readonly forward: (
    production: ProductionId,
    move: MoveForward,
    at: number,
  ) => Effect.Effect<ProductionFile, VersionMoved | StoreError>;
  /** Record the owner's word given outside the lab, aimed (`aimedWord`) (a question asked of them is a lab ask's, filed by it). */
  readonly say: (
    production: ProductionId,
    said: OwnerWord,
  ) => Effect.Effect<ProductionFile, WordUnaimed | StoreError>;
  /** File a set published before sets named their production in version `version`. */
  readonly file: (
    production: ProductionId,
    set: string,
    version: number,
  ) => Effect.Effect<ProductionFile, VersionUnknown | StoreError>;
  /**
   * Publish the set in `folder` (absolute) onto `production`'s timeline:
   * its `review.json` stamped with the production, the version it was made
   * for (the one open at `at` without) and `at`, written whole.
   */
  readonly publish: (
    folder: string,
    production: ProductionId,
    version: Option.Option<number>,
    at: number,
  ) => Effect.Effect<void, FileInvalid | StoreError>;
}

export class ProductionStore extends Context.Service<ProductionStore, ProductionStoreService>()(
  '@bible/film/tools/ProductionStore',
) {
  static readonly layer = Layer.effect(
    ProductionStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const dir = yield* Config.String('FILMS_PRODUCTIONS').pipe(
        Config.withDefault(path.resolve('productions')),
      );

      const manifest = (production: ProductionId): Manifest<ProductionFile> => ({
        file: path.join(dir, `${production}.json`),
        codec: ledgerOf(production),
        empty: newProduction(production, production, 0),
      });

      const kept = (production: ProductionId) => fs.exists(manifest(production).file);

      const read = (production: ProductionId) =>
        Effect.flatMap(kept(production), (is) =>
          Effect.when(store.read(manifest(production)), Effect.succeed(is)),
        );

      const list = Effect.gen(function* () {
        if (!(yield* fs.exists(dir))) return [];
        const names = (yield* fs.readDirectory(dir)).filter((n) => n.endsWith('.json')).toSorted();
        const files = yield* Effect.forEach(names, (name) =>
          store.read(manifest(name.slice(0, -'.json'.length))).pipe(
            Effect.asSome,
            Effect.catchTag('FileInvalid', (invalid) =>
              Effect.as(
                Effect.logWarning(
                  `production.ledger.invalid file=${name} reason=${quoted(invalid.message)}`,
                ),
                Option.none<ProductionFile>(),
              ),
            ),
          ),
        );
        return Arr.getSomes(files);
      });

      const modify = <E>(
        production: ProductionId,
        change: (current: ProductionFile) => Result.Result<ProductionFile, E>,
      ) => store.modify(manifest(production), change);

      return ProductionStore.of({
        list,
        read,
        modify,
        attempt: (production, change) =>
          store.transact(manifest(production), (current) => Effect.fromResult(change(current))),
        start: (production, start) =>
          Effect.gen(function* () {
            if (Option.isSome(yield* read(production)))
              return yield* ProductionKept.make({ production });
            return yield* modify(production, () =>
              Result.succeed({
                ...newProduction(production, start.title, start.at, start.film),
                blurb: start.blurb,
                versions: [{ at: start.at, title: start.first, because: Option.none() }],
              }),
            );
          }),
        forward: (production, move, at) =>
          modify(production, (current) => moveForward(current, move, at)),
        say: (production, said) =>
          modify(production, (current) =>
            Result.map(aimedWord(said), (word) => withSaid(current, word)),
          ),
        file: (production, set, version) =>
          modify(production, (current) => {
            const n = currentVersion(current);
            if (version < 1 || version > n)
              return Result.fail(VersionUnknown.make({ production, version, current: n }));
            return Result.succeed(withFiled(current, { set, version }));
          }),
        publish: (folder, production, version, at) =>
          Effect.gen(function* () {
            const file = path.join(folder, 'review.json');
            const text = yield* stampManifest(file, yield* fs.readFileString(file), {
              production,
              version,
              published: at,
            });
            yield* writeWhole(fs, file, (partial) => fs.writeFileString(partial, text));
          }),
      });
    }),
  );
}

/** A manifest as JSON, every field kept: `publish` stamps three and leaves the rest as written. */
const ManifestJson = repoJson(Schema.JsonObject);

/** What a publish writes on a set: the production it lands on, the version it names (if any), when. */
export interface Stamp {
  readonly production: ProductionId;
  readonly version: Option.Option<number>;
  readonly published: number;
}

/**
 * A manifest's keys stamped with `stamp`, every other key as given; a
 * version stamped before and none now is dropped, so the set falls in the
 * version open when it was published. `film publish` and the lab's
 * `publish_set` stamp a set by it alike.
 */
export const stampedManifest = <J extends Readonly<Record<string, Schema.Json>>>(
  json: J,
  stamp: Stamp,
) => {
  const { version: _was, ...rest } = json;
  return {
    ...rest,
    production: stamp.production,
    ...Option.match(stamp.version, { onNone: () => ({}), onSome: (version) => ({ version }) }),
    published: stamp.published,
  };
};

/**
 * A manifest's text (`review.json` at `file`) stamped with `stamp`
 * (`stampedManifest`). Refused (FileInvalid) when the text is no manifest,
 * or the stamp would make it none.
 */
const stampManifest = (file: string, text: string, stamp: Stamp) =>
  Effect.gen(function* () {
    const invalid = (issue: Schema.SchemaError) =>
      FileInvalid.make({ file, reason: issue.message });
    const json = yield* Schema.decodeEffect(ManifestJson)(text).pipe(Effect.mapError(invalid));
    const stamped = stampedManifest(json, stamp);
    yield* Schema.decodeEffect(ReviewManifest)(stamped).pipe(Effect.mapError(invalid));
    return yield* Schema.encodeEffect(ManifestJson)(stamped).pipe(Effect.mapError(invalid));
  });
