import { Context, Effect, Layer, Option, Schema } from 'effect';
import * as SqlClient from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';

import {
  TopicDetail,
  TopicId,
  type TopicListInput,
  TopicReference,
  TopicSection,
  TopicSummary,
} from './model.js';

export class TopicUnavailableError extends Schema.TaggedError<TopicUnavailableError>()(
  'TopicUnavailableError',
  { operation: Schema.NonEmptyString, cause: Schema.Unknown },
) {}

export class TopicNotFoundError extends Schema.TaggedError<TopicNotFoundError>()(
  'TopicNotFoundError',
  { id: TopicId },
) {}

export type TopicError = TopicUnavailableError | TopicNotFoundError;

interface TopicRow {
  readonly id: string;
  readonly name: string;
  readonly alternative_names: string;
}

interface TopicSectionRow {
  readonly id: number;
  readonly label: string;
}

interface TopicReferenceRow {
  readonly section_id: number;
  readonly raw: string;
  readonly osis: string;
}

/** Catalog rows are untrusted input crossing a boundary, so they are decoded
 *  into the error channel rather than with a `*Sync` decoder.
 *
 *  A `*Sync` decoder throws, and a throw inside these handlers becomes a defect
 *  that walks straight past the `mapError` below — so a `bible.db` whose
 *  `alternative_names` column holds something other than a JSON string array
 *  would kill the fiber instead of reporting a corrupt catalog. The column type
 *  is `TEXT NOT NULL`, so the *type* is known; what is untrusted is the value,
 *  which is exactly what the schema establishes. */
const StringArrayJson = Schema.fromJsonString(Schema.Array(Schema.NonEmptyString));

const decodeCatalog = <A>(
  operation: string,
  decode: (input: string) => Effect.Effect<A, Schema.SchemaError>,
): ((input: string) => Effect.Effect<A, TopicUnavailableError>) =>
  Effect.fnUntraced(function* (input: string) {
    return yield* decode(input).pipe(
      Effect.mapError((cause) => TopicUnavailableError.make({ operation, cause })),
    );
  });

const decodeStrings = decodeCatalog(
  'decode-alternative-names',
  Schema.decodeEffect(StringArrayJson),
);
const decodeOsis = decodeCatalog('decode-osis', Schema.decodeEffect(StringArrayJson));
const decodeId = decodeCatalog('decode-topic-id', Schema.decodeEffect(TopicId));

const summary = (row: TopicRow): Effect.Effect<TopicSummary, TopicUnavailableError> =>
  Effect.gen(function* () {
    return TopicSummary.make({
      id: yield* decodeId(row.id),
      name: row.name,
      alternativeNames: yield* decodeStrings(row.alternative_names),
    });
  });

export interface TopicServiceApi {
  readonly list: (input: TopicListInput) => Effect.Effect<readonly TopicSummary[], TopicError>;
  readonly topic: (id: TopicId) => Effect.Effect<TopicDetail, TopicError>;
}

const unavailable =
  (operation: string) =>
  (cause: SqlError): TopicUnavailableError =>
    TopicUnavailableError.make({ operation, cause });

export class TopicService extends Context.Service<TopicService, TopicServiceApi>()(
  '@bible/core/topics/TopicService',
) {
  static Live: Layer.Layer<TopicService, never, SqlClient.SqlClient> = Layer.effect(
    TopicService,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      const list = Effect.fn('TopicService.list')((input: TopicListInput) => {
        const query = input.query?.replace(/[%_]/g, '').trim();
        const letter = input.letter?.replace(/[%_]/g, '').trim().slice(0, 1);
        let rows: Effect.Effect<readonly TopicRow[], SqlError>;
        if (query && query.length > 0) {
          rows = sql<TopicRow>`
            SELECT id, name, alternative_names
            FROM topics
            WHERE name LIKE ${`%${query}%`} OR alternative_names LIKE ${`%${query}%`}
            ORDER BY name
            LIMIT 100
          `;
        } else if (letter && letter.length > 0) {
          rows = sql<TopicRow>`
            SELECT id, name, alternative_names
            FROM topics
            WHERE name LIKE ${`${letter}%`}
            ORDER BY name
            LIMIT 250
          `;
        } else {
          rows = sql<TopicRow>`
            SELECT id, name, alternative_names
            FROM topics
            ORDER BY name
            LIMIT 250
          `;
        }
        return rows.pipe(
          Effect.mapError(unavailable('list')),
          Effect.flatMap((found) => Effect.forEach(found, summary)),
        );
      });

      const topic = Effect.fn('TopicService.topic')((id: TopicId) =>
        Effect.gen(function* () {
          const rows = yield* sql<TopicRow>`
            SELECT id, name, alternative_names FROM topics WHERE id = ${id} LIMIT 1
          `;
          const found = Option.fromNullishOr(rows[0]);
          if (Option.isNone(found)) return yield* TopicNotFoundError.make({ id });
          const sections = yield* sql<TopicSectionRow>`
            SELECT id, label FROM topic_sections WHERE topic_id = ${id} ORDER BY position
          `;
          const references = yield* sql<TopicReferenceRow>`
            SELECT r.section_id, r.raw, r.osis
            FROM topic_references r
            INNER JOIN topic_sections s ON s.id = r.section_id
            WHERE s.topic_id = ${id}
            ORDER BY s.position, r.position
          `;
          const referencesBySection = new Map<number, TopicReference[]>();
          for (const reference of references) {
            const values = referencesBySection.get(reference.section_id) ?? [];
            values.push(
              TopicReference.make({
                raw: reference.raw,
                osis: yield* decodeOsis(reference.osis),
              }),
            );
            referencesBySection.set(reference.section_id, values);
          }
          return TopicDetail.make({
            id: yield* decodeId(found.value.id),
            name: found.value.name,
            alternativeNames: yield* decodeStrings(found.value.alternative_names),
            sections: sections.map((section) =>
              TopicSection.make({
                label: section.label,
                references: referencesBySection.get(section.id) ?? [],
              }),
            ),
          });
        }).pipe(
          Effect.mapError((cause) => {
            // A row that failed to decode already carries its own operation;
            // relabelling it as `topic` would hide which column was corrupt.
            if (Schema.is(TopicNotFoundError)(cause)) return cause;
            if (Schema.is(TopicUnavailableError)(cause)) return cause;
            return unavailable('topic')(cause);
          }),
        ),
      );

      return TopicService.of({ list, topic });
    }),
  );

  static Test = (topics: readonly TopicDetail[]): Layer.Layer<TopicService> =>
    Layer.succeed(
      TopicService,
      TopicService.of({
        list: (input) => {
          const query = input.query?.toLowerCase();
          const letter = input.letter?.toLowerCase();
          return Effect.succeed(
            topics
              .filter((topic) => {
                if (query) return topic.name.toLowerCase().includes(query);
                if (letter) return topic.name.toLowerCase().startsWith(letter);
                return true;
              })
              .map((topic) =>
                TopicSummary.make({
                  id: topic.id,
                  name: topic.name,
                  alternativeNames: topic.alternativeNames,
                }),
              ),
          );
        },
        topic: (id) => {
          const found = topics.find((candidate) => candidate.id === id);
          if (found) return Effect.succeed(found);
          return Effect.fail(TopicNotFoundError.make({ id }));
        },
      }),
    );
}
