import { CapabilityError, type AppCapabilities } from '@bible/app/platform';
import { Effect } from 'effect';

const failure = (capability: string, operation: string, cause: unknown) =>
  new CapabilityError({
    capability,
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
  });

export const desktopCapabilities: AppCapabilities = {
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
