import { Schema } from 'effect';

export const ClientId = Schema.NonEmptyString.pipe(Schema.brand('LocalFirst/ClientId'));
export type ClientId = typeof ClientId.Type;

export const MutationId = Schema.NonEmptyString.pipe(Schema.brand('LocalFirst/MutationId'));
export type MutationId = typeof MutationId.Type;

export const NoteId = Schema.NonEmptyString.pipe(Schema.brand('LocalFirst/NoteId'));
export type NoteId = typeof NoteId.Type;

export const Timestamp = Schema.NonEmptyString.pipe(Schema.brand('LocalFirst/Timestamp'));
export type Timestamp = typeof Timestamp.Type;

export const MutationSequence = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('LocalFirst/MutationSequence'),
);
export type MutationSequence = typeof MutationSequence.Type;

export const SchemaVersion = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0)),
  Schema.brand('LocalFirst/SchemaVersion'),
);
export type SchemaVersion = typeof SchemaVersion.Type;

export const ServerRevision = Schema.Number.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  Schema.brand('LocalFirst/ServerRevision'),
);
export type ServerRevision = typeof ServerRevision.Type;

export const SaveNote = Schema.TaggedStruct('SaveNote', {
  noteId: NoteId,
  source: Schema.Literals(['bible', 'egw']),
  resourceId: Schema.NonEmptyString,
  location: Schema.NonEmptyString,
  content: Schema.String,
});
export type SaveNote = typeof SaveNote.Type;

export const DeleteNote = Schema.TaggedStruct('DeleteNote', { noteId: NoteId });
export type DeleteNote = typeof DeleteNote.Type;

export const DomainMutationCommand = Schema.Union([SaveNote, DeleteNote]);
export type DomainMutationCommand = typeof DomainMutationCommand.Type;

export const MutationEnvelope = Schema.Struct({
  clientId: ClientId,
  sequence: MutationSequence,
  mutationId: MutationId,
  schemaVersion: SchemaVersion,
  command: DomainMutationCommand,
  createdAt: Timestamp,
});
export type MutationEnvelope = typeof MutationEnvelope.Type;

export const NoteScope = Schema.TaggedStruct('Note', {
  noteId: NoteId,
  source: Schema.optional(Schema.Literals(['bible', 'egw'])),
  resourceId: Schema.optional(Schema.NonEmptyString),
  location: Schema.optional(Schema.NonEmptyString),
});
export type NoteScope = typeof NoteScope.Type;

export const ChangeScope = Schema.Union([NoteScope]);
export type ChangeScope = typeof ChangeScope.Type;

export const ChangeSet = Schema.Struct({ scopes: Schema.Array(ChangeScope) });
export type ChangeSet = typeof ChangeSet.Type;

export const RevisionPatch = Schema.Struct({
  baseRevision: ServerRevision,
  revision: ServerRevision,
  mutations: Schema.Array(MutationEnvelope),
});
export type RevisionPatch = typeof RevisionPatch.Type;

export const CURRENT_SCHEMA_VERSION = Schema.decodeSync(SchemaVersion)(1);
export const INITIAL_SERVER_REVISION = Schema.decodeSync(ServerRevision)(0);

export const changeSetFor = (command: DomainMutationCommand): ChangeSet => ({
  scopes: [
    command._tag === 'SaveNote'
      ? {
          _tag: 'Note',
          noteId: command.noteId,
          source: command.source,
          resourceId: command.resourceId,
          location: command.location,
        }
      : { _tag: 'Note', noteId: command.noteId },
  ],
});
