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

export class TopicUnavailableError extends Schema.TaggedErrorClass<TopicUnavailableError>()(
  'TopicUnavailableError',
  { operation: Schema.NonEmptyString, cause: Schema.Unknown },
) {}

export class TopicNotFoundError extends Schema.TaggedErrorClass<TopicNotFoundError>()(
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

const StringArrayJson = Schema.fromJsonString(Schema.Array(Schema.NonEmptyString));
const decodeStrings = Schema.decodeUnknownSync(StringArrayJson);

const summary = (row: TopicRow) =>
  new TopicSummary({
    id: Schema.decodeUnknownSync(TopicId)(row.id),
    name: row.name,
    alternativeNames: decodeStrings(row.alternative_names),
  });

export interface TopicServiceShape {
  readonly list: (input: TopicListInput) => Effect.Effect<readonly TopicSummary[], TopicError>;
  readonly topic: (id: TopicId) => Effect.Effect<TopicDetail, TopicError>;
}

const unavailable =
  (operation: string) =>
  (cause: SqlError): TopicUnavailableError =>
    new TopicUnavailableError({ operation, cause });

export class TopicService extends Context.Service<TopicService, TopicServiceShape>()(
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
          Effect.map((found) => found.map(summary)),
          Effect.mapError(unavailable('list')),
        );
      });

      const topic = Effect.fn('TopicService.topic')((id: TopicId) =>
        Effect.gen(function* () {
          const rows = yield* sql<TopicRow>`
            SELECT id, name, alternative_names FROM topics WHERE id = ${id} LIMIT 1
          `;
          const found = Option.fromNullishOr(rows[0]);
          if (Option.isNone(found)) return yield* new TopicNotFoundError({ id });
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
              new TopicReference({ raw: reference.raw, osis: decodeStrings(reference.osis) }),
            );
            referencesBySection.set(reference.section_id, values);
          }
          return new TopicDetail({
            id: Schema.decodeUnknownSync(TopicId)(found.value.id),
            name: found.value.name,
            alternativeNames: decodeStrings(found.value.alternative_names),
            sections: sections.map(
              (section) =>
                new TopicSection({
                  label: section.label,
                  references: referencesBySection.get(section.id) ?? [],
                }),
            ),
          });
        }).pipe(
          Effect.mapError((cause) => {
            if (cause instanceof TopicNotFoundError) return cause;
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
              .map(
                (topic) =>
                  new TopicSummary({
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
          return Effect.fail(new TopicNotFoundError({ id }));
        },
      }),
    );
}
