import { Schema } from 'effect';

import { VerseReference } from '../bible/model.js';
import { CrossRefType } from './types.js';

export const PersonalCrossReferenceId = Schema.NonEmptyString.pipe(
  Schema.brand('CrossReferences/PersonalCrossReferenceId'),
);
export type PersonalCrossReferenceId = typeof PersonalCrossReferenceId.Type;

export const CatalogCrossReferenceId = Schema.NonEmptyString.pipe(
  Schema.brand('CrossReferences/CatalogCrossReferenceId'),
);
export type CatalogCrossReferenceId = typeof CatalogCrossReferenceId.Type;

export class PersonalCrossReference extends Schema.Class<PersonalCrossReference>(
  'PersonalCrossReference',
)({
  id: PersonalCrossReferenceId,
  source: VerseReference,
  target: VerseReference,
  note: Schema.Option(Schema.NonEmptyString),
  classification: Schema.Option(CrossRefType),
}) {}

export class CatalogClassificationSuggestion extends Schema.Class<CatalogClassificationSuggestion>(
  'CatalogClassificationSuggestion',
)({
  catalogReferenceId: CatalogCrossReferenceId,
  classification: CrossRefType,
  confidence: Schema.Number.pipe(
    Schema.check(Schema.isFinite(), Schema.isBetween({ minimum: 0, maximum: 1 })),
  ),
  classifierVersion: Schema.NonEmptyString,
  modelVersion: Schema.NonEmptyString,
}) {}

export class CatalogClassificationOverride extends Schema.Class<CatalogClassificationOverride>(
  'CatalogClassificationOverride',
)({
  catalogReferenceId: CatalogCrossReferenceId,
  classification: CrossRefType,
}) {}

const personalFields = {
  id: PersonalCrossReferenceId,
  source: VerseReference,
  target: VerseReference,
  note: Schema.Option(Schema.NonEmptyString),
  classification: Schema.Option(CrossRefType),
} as const;

export const AddPersonalCrossReference = Schema.TaggedStruct(
  'AddPersonalCrossReference',
  personalFields,
);
export const UpdatePersonalCrossReference = Schema.TaggedStruct(
  'UpdatePersonalCrossReference',
  personalFields,
);
export const RemovePersonalCrossReference = Schema.TaggedStruct('RemovePersonalCrossReference', {
  id: PersonalCrossReferenceId,
  source: VerseReference,
});
export const SetCatalogCrossReferenceClassification = Schema.TaggedStruct(
  'SetCatalogCrossReferenceClassification',
  {
    catalogReferenceId: CatalogCrossReferenceId,
    source: VerseReference,
    classification: CrossRefType,
  },
);
export const ClearCatalogCrossReferenceClassification = Schema.TaggedStruct(
  'ClearCatalogCrossReferenceClassification',
  { catalogReferenceId: CatalogCrossReferenceId, source: VerseReference },
);

export const CrossReferenceMutationCommand = Schema.Union([
  AddPersonalCrossReference,
  UpdatePersonalCrossReference,
  RemovePersonalCrossReference,
  SetCatalogCrossReferenceClassification,
  ClearCatalogCrossReferenceClassification,
]);
export type CrossReferenceMutationCommand = typeof CrossReferenceMutationCommand.Type;
