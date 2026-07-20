import { CapabilityError, type AppCapabilities } from '@bible/app/platform';
import { Effect } from 'effect';

const failure = (capability: string, operation: string, cause: unknown) => {
  let message = String(cause);
  if (cause instanceof Error) message = cause.message;
  return new CapabilityError({
    capability,
    operation,
    message,
  });
};

export const desktopCapabilities: AppCapabilities = {
  identity: {
    randomUuid: () => globalThis.crypto.randomUUID(),
  },
  fileImport: {
    select: ({ accept }) =>
      Effect.tryPromise({
        try: () => window.api.files.select(accept),
        catch: (cause) => failure('file-import', 'select', cause),
      }),
  },
  fileExport: {
    save: (options) =>
      Effect.tryPromise({
        try: () => window.api.files.save(options),
        catch: (cause) => failure('file-export', 'save', cause),
      }),
  },
};
