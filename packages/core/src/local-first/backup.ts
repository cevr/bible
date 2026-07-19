import { Schema } from 'effect';

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
      if (orphan === undefined) return undefined;
      return `practice record ${orphan.id} references a missing memory verse`;
    }),
  ),
);
export type LibraryBackupDocument = typeof LibraryBackupDocument.Type;
export const LibraryBackupDocumentFromJson = Schema.fromJsonString(LibraryBackupDocument);

export const commandsForLibraryBackup = (
  backup: LibraryBackupDocument,
): ReadonlyArray<typeof DomainMutationCommand.Type> =>
  Schema.decodeUnknownSync(Schema.Array(DomainMutationCommand))([
    { _tag: 'SetReadingPreferences', preferences: backup.preferences },
    ...backup.bookmarks.map((bookmark) => ({
      _tag: 'SaveBookmark' as const,
      id: bookmark.id,
      location: {
        source: bookmark.source,
        resourceId: bookmark.resourceId,
        location: bookmark.location,
      },
      label: bookmark.label,
    })),
    ...backup.notes.map((note) => ({
      _tag: 'SaveNote' as const,
      noteId: note.id,
      source: note.source,
      resourceId: note.resourceId,
      location: note.location,
      content: note.content,
    })),
    ...backup.markers.map((marker) => ({
      _tag: 'SaveMarker' as const,
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
      _tag: 'SaveUserCrossReference' as const,
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
    })),
    ...backup.collections.flatMap((collection) => [
      {
        _tag: 'SaveCollection' as const,
        id: collection.id,
        name: collection.name,
        description: collection.description,
      },
      ...collection.members.map((member) => ({
        _tag: 'AddCollectionMember' as const,
        collectionId: member.collectionId,
        memberId: member.memberId,
        memberType: member.memberType,
        position: member.position,
      })),
    ]),
    ...backup.readingPlans.flatMap((plan) => [
      {
        _tag: 'SaveReadingPlan' as const,
        id: plan.id,
        title: plan.title,
        description: plan.description,
        steps: plan.steps,
      },
      ...plan.progress.map((progress) => ({
        _tag: 'SetReadingPlanProgress' as const,
        planId: plan.id,
        stepId: progress.stepId,
        completedAt: progress.completedAt,
      })),
    ]),
    ...backup.memoryPractice.verses.map((verse) => ({
      _tag: 'SaveMemoryVerse' as const,
      id: verse.id,
      resourceId: verse.resourceId,
      location: verse.location,
      prompt: verse.prompt,
      nextPracticeAt: verse.nextPracticeAt,
      intervalDays: verse.intervalDays,
    })),
    ...backup.memoryPractice.history.map((record) => {
      const verse = backup.memoryPractice.verses.find(
        (candidate) => candidate.id === record.memoryVerseId,
      );
      return {
        _tag: 'RecordMemoryPractice' as const,
        id: record.id,
        memoryVerseId: record.memoryVerseId,
        rating: record.rating,
        practicedAt: record.practicedAt,
        nextPracticeAt: verse?.nextPracticeAt ?? null,
        intervalDays: verse?.intervalDays ?? 0,
      };
    }),
  ]);
