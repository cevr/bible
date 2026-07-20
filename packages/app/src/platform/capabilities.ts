import { Schema, type Effect } from 'effect';

export class CapabilityError extends Schema.TaggedErrorClass<CapabilityError>()('CapabilityError', {
  capability: Schema.NonEmptyString,
  operation: Schema.NonEmptyString,
  message: Schema.NonEmptyString,
}) {}

export interface ExternalLinks {
  readonly open: (input: { readonly url: string }) => Effect.Effect<void, CapabilityError>;
}

export interface FileImport {
  readonly select: (options: {
    readonly accept: readonly string[];
  }) => Effect.Effect<readonly ImportedFile[], CapabilityError>;
}

export interface ImportedFile {
  readonly name: string;
  readonly contents: Uint8Array;
}

export interface FileExport {
  readonly save: (options: {
    readonly suggestedName: string;
    readonly contents: Uint8Array;
  }) => Effect.Effect<void, CapabilityError>;
}

export interface Notifications {
  readonly show: (options: {
    readonly title: string;
    readonly body?: string;
  }) => Effect.Effect<void, CapabilityError>;
}

export interface Identity {
  readonly randomUuid: () => string;
}

export interface WindowControls {
  readonly minimize: (input: {}) => Effect.Effect<void, CapabilityError>;
  readonly toggleMaximized: (input: {}) => Effect.Effect<void, CapabilityError>;
  readonly close: (input: {}) => Effect.Effect<void, CapabilityError>;
}

export interface AppCapabilities {
  readonly externalLinks?: ExternalLinks;
  readonly fileImport?: FileImport;
  readonly fileExport?: FileExport;
  readonly notifications?: Notifications;
  readonly identity?: Identity;
  readonly windowControls?: WindowControls;
}
