import { Schema } from 'effect';

export const TopicId = Schema.NonEmptyString.pipe(Schema.brand('Topics/TopicId'));
export type TopicId = typeof TopicId.Type;

export class TopicSummary extends Schema.Class<TopicSummary>('TopicSummary')({
  id: TopicId,
  name: Schema.NonEmptyString,
  alternativeNames: Schema.Array(Schema.NonEmptyString),
}) {}

export class TopicReference extends Schema.Class<TopicReference>('TopicReference')({
  raw: Schema.NonEmptyString,
  osis: Schema.Array(Schema.NonEmptyString),
}) {}

export class TopicSection extends Schema.Class<TopicSection>('TopicSection')({
  label: Schema.NonEmptyString,
  references: Schema.Array(TopicReference),
}) {}

export class TopicDetail extends Schema.Class<TopicDetail>('TopicDetail')({
  id: TopicId,
  name: Schema.NonEmptyString,
  alternativeNames: Schema.Array(Schema.NonEmptyString),
  sections: Schema.Array(TopicSection),
}) {}

export const TopicListInput = Schema.Struct({
  query: Schema.optional(Schema.String),
  letter: Schema.optional(Schema.String),
});
export type TopicListInput = typeof TopicListInput.Type;
