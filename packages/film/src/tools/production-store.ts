// The productions' ledgers on disk (`core/production.ts`): one file each,
// `<lab>/productions/<production>.json` under `FILMS_LAB` (the app's `lab/`,
// git-ignored beside the lab's notes: the owner's word, which no render can
// make again). Each is a `ContentStore` manifest, written whole by one
// writer at a time across processes, so the lab's Move forward and an
// agent's `film production` in a terminal never lose each other's write.
// A ledger that does not decode is left out of the list with a warning,
// never rewritten: the front door still opens.

import {
  Array as Arr,
  Config,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import type { Result } from 'effect';
import {
  type ProductionFile,
  type ProductionId,
  newProduction,
  ProductionFile as ProductionFileSchema,
} from '../core/production.ts';
import { ReviewManifest } from '../core/review.ts';
import { repoJson } from '../core/schema.ts';
import { FileInvalid } from './errors.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';

const ProductionFileJson = repoJson(ProductionFileSchema);

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

      return ProductionStore.of({
        list,
        read,
        modify: (production, change) => store.modify(manifest(production), change),
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
export const stampManifest = (file: string, text: string, stamp: Stamp) =>
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
