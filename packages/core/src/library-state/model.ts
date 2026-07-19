import { Schema } from 'effect';

export const LibraryEntityId = Schema.NonEmptyString.pipe(Schema.brand('LibraryState/EntityId'));
export type LibraryEntityId = typeof LibraryEntityId.Type;

export const ReaderSource = Schema.Literals(['bible', 'egw']);
export type ReaderSource = typeof ReaderSource.Type;

export const ReaderLocation = Schema.Struct({
  source: ReaderSource,
  resourceId: Schema.NonEmptyString,
  location: Schema.NonEmptyString,
});
export type ReaderLocation = typeof ReaderLocation.Type;

const nullableString = Schema.NullOr(Schema.String);
const timestamp = Schema.NonEmptyString;

export const Bookmark = Schema.Struct({
  id: LibraryEntityId,
  source: ReaderSource,
  resourceId: Schema.NonEmptyString,
  location: Schema.NonEmptyString,
  label: nullableString,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Bookmark = typeof Bookmark.Type;

export const ReaderNote = Schema.Struct({
  id: LibraryEntityId,
  source: ReaderSource,
  resourceId: Schema.NonEmptyString,
  location: Schema.NonEmptyString,
  content: Schema.String,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type ReaderNote = typeof ReaderNote.Type;

export const Marker = Schema.Struct({
  id: LibraryEntityId,
  source: ReaderSource,
  resourceId: Schema.NonEmptyString,
  location: Schema.NonEmptyString,
  style: Schema.NonEmptyString,
  color: nullableString,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type Marker = typeof Marker.Type;

export const UserCrossReference = Schema.Struct({
  id: LibraryEntityId,
  fromSource: ReaderSource,
  fromResourceId: Schema.NonEmptyString,
  fromLocation: Schema.NonEmptyString,
  toSource: ReaderSource,
  toResourceId: Schema.NonEmptyString,
  toLocation: Schema.NonEmptyString,
  toEndSource: Schema.NullOr(ReaderSource),
  toEndResourceId: nullableString,
  toEndLocation: nullableString,
  kind: nullableString,
  note: nullableString,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type UserCrossReference = typeof UserCrossReference.Type;

export const LocationAnnotations = Schema.Struct({
  bookmarks: Schema.Array(Bookmark),
  notes: Schema.Array(ReaderNote),
  markers: Schema.Array(Marker),
  crossReferences: Schema.Array(UserCrossReference),
});
export type LocationAnnotations = typeof LocationAnnotations.Type;

export const CollectionMemberType = Schema.Literals(['bookmark', 'note', 'marker', 'reference']);
export type CollectionMemberType = typeof CollectionMemberType.Type;

export const CollectionMember = Schema.Struct({
  collectionId: LibraryEntityId,
  memberId: LibraryEntityId,
  memberType: CollectionMemberType,
  position: Schema.Int,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type CollectionMember = typeof CollectionMember.Type;

export const LibraryCollection = Schema.Struct({
  id: LibraryEntityId,
  name: Schema.NonEmptyString,
  description: nullableString,
  createdAt: timestamp,
  updatedAt: timestamp,
  members: Schema.Array(CollectionMember),
});
export type LibraryCollection = typeof LibraryCollection.Type;

export const ReadingPlanStep = Schema.Struct({
  id: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  route: Schema.NonEmptyString,
});
export type ReadingPlanStep = typeof ReadingPlanStep.Type;

export const ReadingPlanProgress = Schema.Struct({
  stepId: Schema.NonEmptyString,
  completedAt: Schema.NullOr(timestamp),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type ReadingPlanProgress = typeof ReadingPlanProgress.Type;

export const ReadingPlan = Schema.Struct({
  id: LibraryEntityId,
  title: Schema.NonEmptyString,
  description: nullableString,
  steps: Schema.Array(ReadingPlanStep),
  progress: Schema.Array(ReadingPlanProgress),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type ReadingPlan = typeof ReadingPlan.Type;

export const MemoryVerse = Schema.Struct({
  id: LibraryEntityId,
  resourceId: Schema.NonEmptyString,
  location: Schema.NonEmptyString,
  prompt: nullableString,
  nextPracticeAt: Schema.NullOr(timestamp),
  intervalDays: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type MemoryVerse = typeof MemoryVerse.Type;

export const PracticeRating = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
);
export type PracticeRating = typeof PracticeRating.Type;

export const PracticeRecord = Schema.Struct({
  id: LibraryEntityId,
  memoryVerseId: LibraryEntityId,
  rating: PracticeRating,
  practicedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export type PracticeRecord = typeof PracticeRecord.Type;

export const MemoryPractice = Schema.Struct({
  verses: Schema.Array(MemoryVerse),
  history: Schema.Array(PracticeRecord),
});
export type MemoryPractice = typeof MemoryPractice.Type;

export const SaveBookmark = Schema.TaggedStruct('SaveBookmark', {
  id: LibraryEntityId,
  location: ReaderLocation,
  label: nullableString,
});
export type SaveBookmark = typeof SaveBookmark.Type;

export const DeleteBookmark = Schema.TaggedStruct('DeleteBookmark', { id: LibraryEntityId });
export type DeleteBookmark = typeof DeleteBookmark.Type;

export const SaveMarker = Schema.TaggedStruct('SaveMarker', {
  id: LibraryEntityId,
  location: ReaderLocation,
  style: Schema.NonEmptyString,
  color: nullableString,
});
export type SaveMarker = typeof SaveMarker.Type;

export const DeleteMarker = Schema.TaggedStruct('DeleteMarker', { id: LibraryEntityId });
export type DeleteMarker = typeof DeleteMarker.Type;

export const SaveUserCrossReference = Schema.TaggedStruct('SaveUserCrossReference', {
  id: LibraryEntityId,
  from: ReaderLocation,
  to: ReaderLocation,
  toEnd: Schema.NullOr(ReaderLocation),
  kind: nullableString,
  note: nullableString,
});
export type SaveUserCrossReference = typeof SaveUserCrossReference.Type;

export const DeleteUserCrossReference = Schema.TaggedStruct('DeleteUserCrossReference', {
  id: LibraryEntityId,
});
export type DeleteUserCrossReference = typeof DeleteUserCrossReference.Type;

export const SaveCollection = Schema.TaggedStruct('SaveCollection', {
  id: LibraryEntityId,
  name: Schema.NonEmptyString,
  description: nullableString,
});
export type SaveCollection = typeof SaveCollection.Type;

export const DeleteCollection = Schema.TaggedStruct('DeleteCollection', { id: LibraryEntityId });
export type DeleteCollection = typeof DeleteCollection.Type;

export const AddCollectionMember = Schema.TaggedStruct('AddCollectionMember', {
  collectionId: LibraryEntityId,
  memberId: LibraryEntityId,
  memberType: CollectionMemberType,
  position: Schema.Int,
});
export type AddCollectionMember = typeof AddCollectionMember.Type;

export const RemoveCollectionMember = Schema.TaggedStruct('RemoveCollectionMember', {
  collectionId: LibraryEntityId,
  memberId: LibraryEntityId,
});
export type RemoveCollectionMember = typeof RemoveCollectionMember.Type;

export const SaveReadingPlan = Schema.TaggedStruct('SaveReadingPlan', {
  id: LibraryEntityId,
  title: Schema.NonEmptyString,
  description: nullableString,
  steps: Schema.Array(ReadingPlanStep),
});
export type SaveReadingPlan = typeof SaveReadingPlan.Type;

export const DeleteReadingPlan = Schema.TaggedStruct('DeleteReadingPlan', {
  id: LibraryEntityId,
});
export type DeleteReadingPlan = typeof DeleteReadingPlan.Type;

export const SetReadingPlanProgress = Schema.TaggedStruct('SetReadingPlanProgress', {
  planId: LibraryEntityId,
  stepId: Schema.NonEmptyString,
  completedAt: Schema.NullOr(timestamp),
});
export type SetReadingPlanProgress = typeof SetReadingPlanProgress.Type;

export const SaveMemoryVerse = Schema.TaggedStruct('SaveMemoryVerse', {
  id: LibraryEntityId,
  resourceId: Schema.NonEmptyString,
  location: Schema.NonEmptyString,
  prompt: nullableString,
  nextPracticeAt: Schema.NullOr(timestamp),
  intervalDays: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
});
export type SaveMemoryVerse = typeof SaveMemoryVerse.Type;

export const DeleteMemoryVerse = Schema.TaggedStruct('DeleteMemoryVerse', {
  id: LibraryEntityId,
});
export type DeleteMemoryVerse = typeof DeleteMemoryVerse.Type;

export const RecordMemoryPractice = Schema.TaggedStruct('RecordMemoryPractice', {
  id: LibraryEntityId,
  memoryVerseId: LibraryEntityId,
  rating: PracticeRating,
  practicedAt: timestamp,
  nextPracticeAt: Schema.NullOr(timestamp),
  intervalDays: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
});
export type RecordMemoryPractice = typeof RecordMemoryPractice.Type;

export const LibraryStateCommand = Schema.Union([
  SaveBookmark,
  DeleteBookmark,
  SaveMarker,
  DeleteMarker,
  SaveUserCrossReference,
  DeleteUserCrossReference,
  SaveCollection,
  DeleteCollection,
  AddCollectionMember,
  RemoveCollectionMember,
  SaveReadingPlan,
  DeleteReadingPlan,
  SetReadingPlanProgress,
  SaveMemoryVerse,
  DeleteMemoryVerse,
  RecordMemoryPractice,
]);
export type LibraryStateCommand = typeof LibraryStateCommand.Type;

export const LibraryStateArea = Schema.Literals([
  'annotations',
  'collections',
  'plans',
  'practice',
]);
export type LibraryStateArea = typeof LibraryStateArea.Type;

export const LibraryStateScope = Schema.TaggedStruct('LibraryState', {
  area: LibraryStateArea,
  id: Schema.optional(LibraryEntityId),
  location: Schema.optional(ReaderLocation),
});
export type LibraryStateScope = typeof LibraryStateScope.Type;

export const scopeForLibraryCommand = (command: LibraryStateCommand): LibraryStateScope => {
  switch (command._tag) {
    case 'SaveBookmark':
    case 'SaveMarker':
      return {
        _tag: 'LibraryState',
        area: 'annotations',
        id: command.id,
        location: command.location,
      };
    case 'SaveUserCrossReference':
      return { _tag: 'LibraryState', area: 'annotations', id: command.id, location: command.from };
    case 'DeleteBookmark':
    case 'DeleteMarker':
    case 'DeleteUserCrossReference':
      return { _tag: 'LibraryState', area: 'annotations', id: command.id };
    case 'SaveCollection':
    case 'DeleteCollection':
      return { _tag: 'LibraryState', area: 'collections', id: command.id };
    case 'AddCollectionMember':
    case 'RemoveCollectionMember':
      return { _tag: 'LibraryState', area: 'collections', id: command.collectionId };
    case 'SaveReadingPlan':
    case 'DeleteReadingPlan':
      return { _tag: 'LibraryState', area: 'plans', id: command.id };
    case 'SetReadingPlanProgress':
      return { _tag: 'LibraryState', area: 'plans', id: command.planId };
    case 'SaveMemoryVerse':
    case 'DeleteMemoryVerse':
      return { _tag: 'LibraryState', area: 'practice', id: command.id };
    case 'RecordMemoryPractice':
      return { _tag: 'LibraryState', area: 'practice', id: command.memoryVerseId };
  }
};
