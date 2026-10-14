// The productions' ledgers on disk (`core/production.ts`): one file each,
// `<lab>/productions/<production>.json` under `FILMS_LAB` (the app's `lab/`,
// git-ignored beside the lab's notes: the owner's word, which no render can
// make again). Each is a `ContentStore` manifest, written whole by one
// writer at a time across processes, so the lab's Move forward and an
// agent's `film production` in a terminal never lose each other's write.
// A ledger that does not decode is left out of the list with a warning,
// never rewritten: the front door still opens.
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
  type ProductionFile,
  type ProductionId,
  type Said,
  currentVersion,
  moveForward,
  newProduction,
  ProductionFile as ProductionFileSchema,
  withFiled,
  withSaid,
} from '../core/production.ts';
import type { VersionMoved } from '../core/refusals.ts';
import { ReviewManifest } from '../core/review.ts';
import { repoJson } from '../core/schema.ts';
import { FileInvalid } from './errors.ts';
import { ContentStore, type Manifest, type StoreError, writeWhole } from './content-store.ts';

const ProductionFileJson = repoJson(ProductionFileSchema);

/** `start` on a production that already has a ledger. */
class ProductionKept extends Schema.TaggedError<ProductionKept>()('ProductionKept', {
  production: Schema.String,
}) {
  override get message() {
    return `${this.production} already has a ledger: film production show ${this.production}`;
  }
}

/** A question asked of the owner that names no set: nothing could ever answer it. */
class AskUnplaced extends Schema.TaggedError<AskUnplaced>()('AskUnplaced', {
  text: Schema.String,
}) {
  override get message() {
    return `"${this.text}" names no set: give --set <folder> (and --point <id> for one choice)`;
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

/** The folder the ledgers sit in, under the lab's own. */
const PRODUCTIONS_DIR = 'productions';

interface ProductionStoreService {
  /** Every ledger there is, by name. */
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
  /** Record the owner's word, or a question asked of them (which must name its set). */
  readonly say: (
    production: ProductionId,
    said: Said,
  ) => Effect.Effect<ProductionFile, AskUnplaced | StoreError>;
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
      const lab = yield* Config.String('FILMS_LAB').pipe(Config.withDefault(path.resolve('lab')));
      const dir = path.join(lab, PRODUCTIONS_DIR);

      const manifest = (production: ProductionId): Manifest<ProductionFile> => ({
        file: path.join(dir, `${production}.json`),
        codec: ProductionFileJson,
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
                Effect.logWarning('production.ledger.invalid', {
                  file: name,
                  reason: invalid.message,
                }),
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
          Effect.gen(function* () {
            if (said._tag === 'Asked' && Option.isNone(said.set))
              return yield* AskUnplaced.make({ text: said.text });
            return yield* modify(production, (current) => Result.succeed(withSaid(current, said)));
          }),
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

/** What `publish` writes on a set: the production it lands on, the version it names (if any), when. */
interface Stamp {
  readonly production: ProductionId;
  readonly version: Option.Option<number>;
  readonly published: number;
}

/**
 * A manifest's text (`review.json` at `file`) stamped with `stamp`, every
 * other field as written; a version stamped before and none now is dropped.
 * Refused (FileInvalid) when the text is no manifest, or the stamp would
 * make it none.
 */
const stampManifest = (file: string, text: string, stamp: Stamp) =>
  Effect.gen(function* () {
    const invalid = (issue: Schema.SchemaError) =>
      FileInvalid.make({ file, reason: issue.message });
    const json = yield* Schema.decodeEffect(ManifestJson)(text).pipe(Effect.mapError(invalid));
    const { version: _was, ...rest } = json;
    const stamped = {
      ...rest,
      production: stamp.production,
      ...Option.match(stamp.version, { onNone: () => ({}), onSome: (version) => ({ version }) }),
      published: stamp.published,
    };
    yield* Schema.decodeEffect(ReviewManifest)(stamped).pipe(Effect.mapError(invalid));
    return yield* Schema.encodeEffect(ManifestJson)(stamped).pipe(Effect.mapError(invalid));
  });
