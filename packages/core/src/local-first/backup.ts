import { Option, Predicate, Schema } from 'effect';

import {
  Bookmark,
  LibraryCollection,
  Marker,
  MemoryPractice,
  ReaderNote,
  ReadingPlan,
  UserCrossReference,
} from '../library-state/model.js';
import { ReadingPreferences } from '../reading-preferences/model.js';
import { DomainMutationCommand } from './model.js';

export const LibraryBackupFormat = Schema.Literal('bible-library-backup');
export const LibraryBackupVersion = Schema.Literal(1);

export const LibraryBackupDocument = Schema.Struct({
  format: LibraryBackupFormat,
  version: LibraryBackupVersion,
  exportedAt: Schema.NonEmptyString,
  preferences: ReadingPreferences,
  bookmarks: Schema.Array(Bookmark),
  notes: Schema.Array(ReaderNote),
  markers: Schema.Array(Marker),
  crossReferences: Schema.Array(UserCrossReference),
  collections: Schema.Array(LibraryCollection),
  readingPlans: Schema.Array(ReadingPlan),
  memoryPractice: MemoryPractice,
}).pipe(
  Schema.check(
    Schema.makeFilter((backup) => {
      const verseIds = new Set(backup.memoryPractice.verses.map((verse) => verse.id));
      const orphan = backup.memoryPractice.history.find(
        (record) => !verseIds.has(record.memoryVerseId),
      );
      if (Predicate.isUndefined(orphan)) return true;
      return `practice record ${orphan.id} references a missing memory verse`;
    }),
  ),
);
export type LibraryBackupDocument = typeof LibraryBackupDocument.Type;
export const LibraryBackupDocumentFromJson = Schema.fromJsonString(LibraryBackupDocument);

const crossReferenceEnd = (reference: UserCrossReference) => {
  if (
    Predicate.isNull(reference.toEndSource) ||
    Predicate.isNull(reference.toEndResourceId) ||
    Predicate.isNull(reference.toEndLocation)
  ) {
    return Option.none();
  }
  return Option.some({
    source: reference.toEndSource,
    resourceId: reference.toEndResourceId,
    location: reference.toEndLocation,
  });
};

export const commandsForLibraryBackup = (
  backup: LibraryBackupDocument,
): ReadonlyArray<DomainMutationCommand> =>
  Schema.decodeUnknownSync(Schema.Array(DomainMutationCommand))([
    { _tag: 'SetReadingPreferences', preferences: backup.preferences },
    ...backup.bookmarks.map((bookmark) => ({
      _tag: 'SaveBookmark',
      id: bookmark.id,
      location: {
        source: bookmark.source,
        resourceId: bookmark.resourceId,
        location: bookmark.location,
      },
      label: bookmark.label,
    })),
    ...backup.notes.map((note) => ({
      _tag: 'SaveNote',
      noteId: note.id,
      source: note.source,
      resourceId: note.resourceId,
      location: note.location,
      content: note.content,
    })),
    ...backup.markers.map((marker) => ({
      _tag: 'SaveMarker',
      id: marker.id,
      location: {
        source: marker.source,
        resourceId: marker.resourceId,
        location: marker.location,
      },
      style: marker.style,
      color: marker.color,
    })),
    ...backup.crossReferences.map((reference) => ({
      _tag: 'SaveUserCrossReference',
      id: reference.id,
      from: {
        source: reference.fromSource,
        resourceId: reference.fromResourceId,
        location: reference.fromLocation,
      },
      to: {
        source: reference.toSource,
        resourceId: reference.toResourceId,
        location: reference.toLocation,
      },
      toEnd: Option.getOrNull(crossReferenceEnd(reference)),
      kind: reference.kind,
      note: reference.note,
    })),
    ...backup.collections.flatMap((collection) => [
      {
        _tag: 'SaveCollection',
        id: collection.id,
        name: collection.name,
        description: collection.description,
      },
      ...collection.members.map((member) => ({
        _tag: 'AddCollectionMember',
        collectionId: member.collectionId,
        memberId: member.memberId,
        memberType: member.memberType,
        position: member.position,
      })),
    ]),
    ...backup.readingPlans.flatMap((plan) => [
      {
        _tag: 'SaveReadingPlan',
        id: plan.id,
        title: plan.title,
        description: plan.description,
        steps: plan.steps,
      },
      ...plan.progress.map((progress) => ({
        _tag: 'SetReadingPlanProgress',
        planId: plan.id,
        stepId: progress.stepId,
        completedAt: progress.completedAt,
      })),
    ]),
    ...backup.memoryPractice.verses.map((verse) => ({
      _tag: 'SaveMemoryVerse',
      id: verse.id,
      resourceId: verse.resourceId,
      location: verse.location,
      endLocation: verse.endLocation,
      prompt: verse.prompt,
      nextPracticeAt: verse.nextPracticeAt,
      intervalDays: verse.intervalDays,
    })),
    ...backup.memoryPractice.history.map((record) => {
      const verse = backup.memoryPractice.verses.find(
        (candidate) => candidate.id === record.memoryVerseId,
      );
      return {
        _tag: 'RecordMemoryPractice',
        id: record.id,
        memoryVerseId: record.memoryVerseId,
        rating: record.rating,
        practicedAt: record.practicedAt,
        nextPracticeAt: Option.getOrNull(Option.fromNullishOr(verse?.nextPracticeAt)),
        intervalDays: verse?.intervalDays ?? 0,
      };
    }),
  ]);
